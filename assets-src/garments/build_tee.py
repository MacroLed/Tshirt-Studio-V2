"""Generator koszulki 3D: wykrój -> siatka -> symulacja tkaniny -> render i GLB.

Uruchomienie:
  blender --background --factory-startup --python build_tee.py -- \
      --pattern patterns/regular.json --out out/regular --frames 150 --samples 96

Założenia konstrukcyjne:
  - Koszulka powstaje z płaskiego układu "flat-lay": warstwa przednia i tylna są
    zespawane na szwach bocznych, barkach oraz wzdłuż górnej i dolnej linii rękawa.
    To unika niestabilnego szycia sprężynami w symulacji.
  - Współrzędne wykroju są w centymetrach (x w prawo, y w górę, początek układu
    na środku linii karku). Blender: X = x, Z = y, Y = -z (przód patrzy na -Y),
    co po eksporcie glTF daje przód skierowany na +Z.
  - UV0 to atlas z wykroju w jednolitej skali, UV1 ("print") to pole nadruku,
    gdzie [0,1] odpowiada dokładnie prostokątowi w milimetrach.
  - "sleeve_left" to lewy rękaw osoby noszącej koszulkę, czyli strona x > 0.
"""

import argparse
import json
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Vector, noise
from mathutils.geometry import delaunay_2d_cdt

PANELS = ["panel_front", "panel_back", "sleeve_left", "sleeve_right", "collar"]
CM = 0.01
ATLAS_CM = 190.0  # bok atlasu UV0 w centymetrach, wspólna skala dla wszystkich paneli


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--pattern", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--frames", type=int, default=240)
    parser.add_argument("--samples", type=int, default=96)
    parser.add_argument("--resolution", type=int, default=1000)
    parser.add_argument("--skip-sim", action="store_true")
    parser.add_argument("--no-render", action="store_true")
    return parser.parse_args(argv)


# ---------------------------------------------------------------------------
# Geometria 2D wykroju
# ---------------------------------------------------------------------------

def resample(points, spacing):
    """Próbkuje łamaną równomiernie; końce pozostają dokładnie w tych samych punktach."""
    pts = np.asarray(points, dtype=float)
    lengths = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cumulative = np.concatenate([[0.0], np.cumsum(lengths)])
    count = max(1, int(round(cumulative[-1] / spacing)))
    targets = np.linspace(0.0, cumulative[-1], count + 1)
    out = np.stack(
        [np.interp(targets, cumulative, pts[:, 0]), np.interp(targets, cumulative, pts[:, 1])],
        axis=1,
    )
    out[0], out[-1] = pts[0], pts[-1]
    return out


def bezier(p0, control, p1, steps=64):
    t = np.linspace(0.0, 1.0, steps)[:, None]
    p0, control, p1 = np.array(p0), np.array(control), np.array(p1)
    return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * control + t ** 2 * p1


def mirror(points):
    return np.asarray(points) * np.array([-1.0, 1.0])


def key_of(point):
    return (round(float(point[0]), 3), round(float(point[1]), 3))


def point_segment_distance(points, segments):
    """Najmniejsza odległość każdego punktu od zbioru odcinków (N x 2, M x 2 x 2)."""
    a, b = segments[:, 0], segments[:, 1]
    ab = b - a
    denom = np.maximum((ab * ab).sum(axis=1), 1e-12)
    result = np.full(len(points), np.inf)
    for start in range(0, len(points), 512):
        chunk = points[start:start + 512][:, None, :]
        t = np.clip(((chunk - a) * ab).sum(axis=2) / denom, 0.0, 1.0)
        nearest = a + t[..., None] * ab
        result[start:start + 512] = np.linalg.norm(chunk - nearest, axis=2).min(axis=1)
    return result


def points_in_polygon(points, polygon):
    x, y = points[:, 0], points[:, 1]
    inside = np.zeros(len(points), dtype=bool)
    px, py = polygon[:, 0], polygon[:, 1]
    qx, qy = np.roll(px, -1), np.roll(py, -1)
    for ax, ay, bx, by in zip(px, py, qx, qy):
        crossing = ((ay > y) != (by > y)) & (x < (bx - ax) * (y - ay) / (by - ay + 1e-12) + ax)
        inside ^= crossing
    return inside


def segments_of(polyline):
    pts = np.asarray(polyline)
    return np.stack([pts[:-1], pts[1:]], axis=1)


def triangulate(polygon, spacing):
    """Siatka trójkątna panelu: brzeg bez zmian, wnętrze na siatce heksagonalnej."""
    polygon = np.asarray(polygon)
    min_xy, max_xy = polygon.min(axis=0), polygon.max(axis=0)
    row_height = spacing * math.sqrt(3.0) / 2.0
    interior = []
    for row, y in enumerate(np.arange(min_xy[1], max_xy[1], row_height)):
        offset = spacing / 2.0 if row % 2 else 0.0
        interior.extend((x + offset, y) for x in np.arange(min_xy[0], max_xy[0], spacing))
    interior = np.array(interior)
    closed = np.vstack([polygon, polygon[:1]])
    boundary_segments = segments_of(closed)
    interior = interior[points_in_polygon(interior, polygon)]
    interior = interior[point_segment_distance(interior, boundary_segments) > spacing * 0.6]

    all_points = np.vstack([polygon, interior])
    count = len(polygon)
    edges = [(i, (i + 1) % count) for i in range(count)]
    coords, _, faces, orig_verts, _, _ = delaunay_2d_cdt(
        [Vector(p) for p in all_points], edges, [], 0, 1e-6
    )
    if len(coords) != len(all_points):
        raise RuntimeError("CDT zmieniła liczbę wierzchołków: sprawdź gęstość siatki")
    pts = np.array([(c.x, c.y) for c in coords])
    triangles = []
    for face in faces:
        if len(face) != 3:
            raise RuntimeError("CDT zwróciła ścianę inną niż trójkąt")
        centroid = pts[list(face)].mean(axis=0)[None]
        if points_in_polygon(centroid, polygon)[0]:
            a, b, c = face
            ab, ac = pts[b] - pts[a], pts[c] - pts[a]
            area = ab[0] * ac[1] - ab[1] * ac[0]
            # Punkty współliniowe na prostym szwie dają trójkąty o zerowym polu.
            if abs(area) < spacing * spacing * 1e-3:
                continue
            triangles.append((a, b, c) if area > 0 else (a, c, b))
    return pts, triangles


# ---------------------------------------------------------------------------
# Budowa koszulki w układzie flat-lay
# ---------------------------------------------------------------------------

class TeeBuilder:
    def __init__(self, pattern):
        self.p = pattern
        self.h = pattern["mesh_cm"]
        self.vertices = {}
        self.positions = []
        self.faces = []
        self.pin_keys = set()
        self._build_curves()

    def _build_curves(self):
        p, h = self.p, self.h
        hps = (p["neck_half_width"], 0.0)
        shoulder = (p["shoulder_x"], p["shoulder_y"])
        underarm = (p["chest_half"], p["underarm_y"])
        hem_corner = (p["chest_half"], p["hem_y"])
        hem_center = (0.0, p["hem_y"] - p["hem_curve"])

        def neck(drop):
            angles = np.linspace(math.pi / 2.0, 0.0, 64)
            curve = np.stack([hps[0] * np.cos(angles), -drop * np.sin(angles)], axis=1)
            curve[0], curve[-1] = (0.0, -drop), hps
            return resample(curve, h)

        self.neck_front = neck(p["neck_drop_front"])
        self.neck_back = neck(p["neck_drop_back"])
        self.shoulder = resample([hps, shoulder], h)
        arm_control = (
            (shoulder[0] + underarm[0]) / 2.0 - p["armhole_curve"],
            (shoulder[1] + underarm[1]) / 2.0,
        )
        self.armhole = resample(bezier(shoulder, arm_control, underarm), h)
        self.side = resample([underarm, hem_corner], h)
        self.hem = resample(bezier(hem_corner, (hem_corner[0] * 0.5, hem_center[1]), hem_center), h)

        angle = math.radians(p["sleeve_angle_deg"])
        self.sleeve_dir = np.array([math.cos(angle), -math.sin(angle)])
        self.sleeve_perp = np.array([-math.sin(angle), -math.cos(angle)])
        self.shoulder_point = np.array(shoulder, dtype=float)
        cuff_top = self.shoulder_point + self.sleeve_dir * p["sleeve_length"]
        cuff_bottom = cuff_top + self.sleeve_perp * p["cuff_width"]
        self.sleeve_top = resample([cuff_top, shoulder], h)
        self.sleeve_under = resample([underarm, cuff_bottom], h)
        self.cuff = resample([cuff_bottom, cuff_top], h)

        # Szwy łączące warstwę przednią z tylną. Dekolt, dół i mankiety pozostają otwarte.
        right = [self.shoulder, self.side, self.sleeve_top, self.sleeve_under]
        self.weld_keys = set()
        segments = []
        for line in right + [mirror(line) for line in right]:
            self.weld_keys.update(key_of(point) for point in line)
            segments.append(segments_of(line))
        self.weld_segments = np.vstack(segments)
        for line in (self.shoulder, mirror(self.shoulder)):
            self.pin_keys.update(
                key_of(point) for point in line if abs(point[0]) <= self.p["pin_max_x"]
            )

    def _vertex(self, xy, layer):
        key = key_of(xy)
        vertex_key = ("weld", key) if key in self.weld_keys else (layer, key)
        index = self.vertices.get(vertex_key)
        if index is None:
            index = len(self.positions)
            self.vertices[vertex_key] = index
            self.positions.append((float(xy[0]), float(xy[1]), layer, key in self.weld_keys))
        return index

    def _add_panel(self, polygon, layer, panel, uv0_fn, uv1_fn):
        points, triangles = triangulate(polygon, self.h)
        for triangle in triangles:
            order = triangle if layer > 0 else (triangle[0], triangle[2], triangle[1])
            indices = [self._vertex(points[i], layer) for i in order]
            uv0 = [uv0_fn(points[i]) for i in order]
            uv1 = [uv1_fn(points[i]) for i in order]
            self.faces.append((indices, panel, uv0, uv1))

    def _body_polygon(self, neck):
        right = np.vstack([neck, self.shoulder[1:], self.armhole[1:], self.side[1:], self.hem[1:]])
        left = mirror(right[::-1])[1:-1]
        return np.vstack([right, left])

    def _sleeve_polygon(self, sign):
        polygon = np.vstack([self.armhole, self.sleeve_under[1:], self.cuff[1:], self.sleeve_top[1:-1]])
        return polygon if sign > 0 else mirror(polygon)

    def _sleeve_coords(self, xy, sign, layer):
        """Współrzędne rękawa rozłożonego wokół górnej linii: a wzdłuż rękawa, b w poprzek."""
        point = np.array([xy[0] * sign, xy[1]]) - self.shoulder_point
        along = float(point @ self.sleeve_dir)
        across = float(point @ self.sleeve_perp) * layer
        return along, across

    def build(self):
        area = self.p["print_areas"]
        y_offset = 76.0

        def atlas(x, y):
            return (x / ATLAS_CM, y / ATLAS_CM)

        def front_uv1(xy):
            width, height = area["front"]["width_mm"] / 10.0, area["front"]["height_mm"] / 10.0
            top = area["front"]["top_cm"]
            return ((xy[0] + width / 2.0) / width, (xy[1] - (top - height)) / height)

        def back_uv1(xy):
            # Tył oglądany od tyłu: x jest odwrócone, żeby nadruk nie był lustrzany.
            width, height = area["back"]["width_mm"] / 10.0, area["back"]["height_mm"] / 10.0
            top = area["back"]["top_cm"]
            return ((width / 2.0 - xy[0]) / width, (xy[1] - (top - height)) / height)

        self._add_panel(
            self._body_polygon(self.neck_front), 1, "panel_front",
            lambda xy: atlas(xy[0] + 28.0, xy[1] + y_offset), front_uv1,
        )
        self._add_panel(
            self._body_polygon(self.neck_back), -1, "panel_back",
            lambda xy: atlas(xy[0] + 84.0, xy[1] + y_offset), back_uv1,
        )

        sleeve = area["sleeve"]
        size_w, size_h = sleeve["width_mm"] / 10.0, sleeve["height_mm"] / 10.0
        start = sleeve["start_cm"]
        for sign, panel, atlas_x in ((1, "sleeve_left", 131.0), (-1, "sleeve_right", 169.0)):
            for layer in (1, -1):
                def uv0(xy, sign=sign, layer=layer, atlas_x=atlas_x):
                    along, across = self._sleeve_coords(xy, sign, layer)
                    return atlas(atlas_x + across, 22.0 + along)

                def uv1(xy, sign=sign, layer=layer):
                    along, across = self._sleeve_coords(xy, sign, layer)
                    # Góra nadruku wskazuje bark, a prawa strona jest liczona od zewnątrz ramienia.
                    u = (size_w / 2.0 - across * sign) / size_w
                    v = (start + size_h - along) / size_h
                    return (u, v)

                self._add_panel(self._sleeve_polygon(sign), layer, panel, uv0, uv1)

        self._build_collar()
        return self

    def _build_collar(self):
        rib = self.p["rib_width"]
        center = np.array((0.0, 3.0))
        rows = 2
        for neck, layer, atlas_y in ((self.neck_front, 1, 90.0), (self.neck_back, -1, 110.0)):
            full = np.vstack([mirror(neck[::-1])[:-1], neck])
            directions = center - full
            directions /= np.linalg.norm(directions, axis=1, keepdims=True)
            lengths = np.concatenate(
                [[0.0], np.cumsum(np.linalg.norm(np.diff(full, axis=0), axis=1))]
            )
            grid = [full + directions * (rib * row / rows) for row in range(rows + 1)]
            for row in range(rows):
                for col in range(len(full) - 1):
                    a, b = grid[row][col], grid[row][col + 1]
                    c, d = grid[row + 1][col + 1], grid[row + 1][col]
                    uv = [
                        (lengths[col], rib * row / rows),
                        (lengths[col + 1], rib * row / rows),
                        (lengths[col + 1], rib * (row + 1) / rows),
                        (lengths[col], rib * (row + 1) / rows),
                    ]
                    corners = [a, b, c, d]
                    for tri in ((0, 1, 2), (0, 2, 3)):
                        pts = [corners[i] for i in tri]
                        order = list(tri)
                        ab, ac = pts[1] - pts[0], pts[2] - pts[0]
                        area = ab[0] * ac[1] - ab[1] * ac[0]
                        if (area > 0) != (layer > 0):
                            order = [order[0], order[2], order[1]]
                        indices = [self._vertex(corners[i], layer) for i in order]
                        uv0 = [
                            ((uv[i][0] + 2.0) / ATLAS_CM, (uv[i][1] + atlas_y) / ATLAS_CM)
                            for i in order
                        ]
                        self.faces.append((indices, "collar", uv0, [(-1.0, -1.0)] * 3))


def weld_collar_ends(builder):
    """Zespawanie końców pierścienia kołnierza przy barkach na wszystkich rzędach."""
    p = builder.p
    center = np.array((0.0, 3.0))
    hps = np.array((p["neck_half_width"], 0.0))
    direction = (center - hps) / np.linalg.norm(center - hps)
    remap = {}
    for row in (1, 2):
        point = hps + direction * (p["rib_width"] * row / 2.0)
        for sign in (1.0, -1.0):
            key = key_of(point * np.array([sign, 1.0]))
            front = builder.vertices.get((1, key))
            back = builder.vertices.get((-1, key))
            if front is not None and back is not None:
                remap[back] = front
    for face in builder.faces:
        face[0][:] = [remap.get(index, index) for index in face[0]]
    return len(remap)


def create_tee_object(builder):
    """Tworzy obiekt Blendera z warstw lekko rozchylonych wokół szwów."""
    used = sorted({index for face in builder.faces for index in face[0]})
    compact = {old: new for new, old in enumerate(used)}
    positions = [builder.positions[index] for index in used]
    xy = np.array([(v[0], v[1]) for v in positions])
    distances = point_segment_distance(xy, builder.weld_segments)
    builder.compact = compact
    builder.flat_xy = xy
    cuff_segments = np.vstack([segments_of(builder.cuff), segments_of(mirror(builder.cuff))])
    cuff_distances = point_segment_distance(xy, cuff_segments)
    coords = []
    for index, (x, y, layer, welded) in enumerate(positions):
        opening = 0.0 if welded else min(1.8, 1.2 * float(distances[index]))
        # Dół startuje prawie płasko: sztywniejsza krawędź nie zapamięta wtedy kształtu obręczy.
        opening *= 0.3 + 0.7 * max(0.0, min(1.0, (y - builder.p["hem_y"]) / 10.0))
        # Mankiety z tego samego powodu: rozchylony start kończył się zmiętą krawędzią.
        opening *= 0.3 + 0.7 * max(0.0, min(1.0, float(cuff_distances[index]) / 8.0))
        # Niewielka nierówność inicjuje naturalne, niesymetryczne fałdowanie.
        wobble = noise.noise(Vector((x * 0.11, y * 0.11, layer * 3.1))) * 0.25
        z = layer * opening + (0.0 if welded else wobble)
        coords.append((x * CM, -z * CM, y * CM))

    mesh = bpy.data.meshes.new("tee")
    mesh.from_pydata(coords, [], [tuple(compact[i] for i in face[0]) for face in builder.faces])
    mesh.update()
    # Sloty materiałów muszą istnieć przed ustawieniem material_index, inaczej Blender go zeruje.
    for panel in PANELS:
        # Tymczasowa nazwa: docelowe materiały muszą nazywać się dokładnie jak panele.
        mesh.materials.append(bpy.data.materials.new(f"slot_{panel}"))

    uv0 = mesh.uv_layers.new(name="UVMap")
    uv1 = mesh.uv_layers.new(name="print")
    for polygon, face in zip(mesh.polygons, builder.faces):
        polygon.material_index = PANELS.index(face[1])
        for loop, a, b in zip(polygon.loop_indices, face[2], face[3]):
            uv0.data[loop].uv = a
            uv1.data[loop].uv = b
    uv0.active = True
    mesh.shade_smooth()

    obj = bpy.data.objects.new("tee", mesh)
    bpy.context.scene.collection.objects.link(obj)

    pin_group = obj.vertex_groups.new(name="pin")
    pinned = [
        compact[builder.vertices[("weld", key)]]
        for key in builder.pin_keys
        if ("weld", key) in builder.vertices
    ]
    pin_group.add(pinned, 1.0, "REPLACE")

    # Mapa kurczenia: plamy lekko rozciągniętej i ściągniętej dzianiny wywołują naturalne fałdy.
    # Dół koszulki zostaje neutralny, bo podwinięty brzeg w rzeczywistości się nie marszczy.
    cloth = builder.p["cloth"]
    neutral = -cloth["shrink_min"] / (cloth["shrink_max"] - cloth["shrink_min"])
    hem_y = builder.p["hem_y"]
    shrink_group = obj.vertex_groups.new(name="shrink")
    for index, (x, y, layer, _welded) in enumerate(positions):
        value = noise.noise(Vector((x * 0.045, y * 0.045, layer * 1.7)))
        value += 0.5 * noise.noise(Vector((x * 0.14, y * 0.14, layer * 5.3)))
        fade = max(0.0, min(1.0, (y - hem_y) / 10.0))
        shrink_group.add([index], max(0.0, min(1.0, neutral + value * fade)), "REPLACE")

    # Podwinięty dół i mankiety są podwójną warstwą, więc mają większą sztywność.
    hem_lines = [builder.hem, mirror(builder.hem), builder.cuff, mirror(builder.cuff)]
    hem_segments = np.vstack([segments_of(line) for line in hem_lines])
    hem_distance = point_segment_distance(xy, hem_segments)
    # Szwy to także podwójny materiał: sztywniejsze w mniejszym stopniu, żeby nie falowały.
    seam_lines = [builder.armhole, mirror(builder.armhole)]
    seam_distance = np.minimum(
        distances, point_segment_distance(xy, np.vstack([segments_of(line) for line in seam_lines]))
    )
    hem_group = obj.vertex_groups.new(name="hem")
    for index, (hem, seam) in enumerate(zip(hem_distance, seam_distance)):
        hem_weight = max(0.0, min(1.0, (3.5 - float(hem)) / 1.5))
        seam_weight = 0.5 * max(0.0, min(1.0, (2.0 - float(seam)) / 1.0))
        weight = max(hem_weight, seam_weight)
        if weight > 0.0:
            hem_group.add([index], weight, "REPLACE")

    # Miękkie przyciągnięcie dołu do płaskiego położenia: zastępuje ciężar podwiniętej krawędzi
    # i powstrzymuje balon. Blender podnosi wagę do czwartej potęgi, więc małe wagi działają słabo.
    body_hem = np.vstack([segments_of(builder.hem), segments_of(mirror(builder.hem))])
    body_hem_distance = point_segment_distance(xy, body_hem)
    goal_weight = cloth["hem_goal_weight"]
    for index, distance in enumerate(body_hem_distance):
        fade = max(0.0, min(1.0, (8.0 - float(distance)) / 8.0))
        if fade > 0.0 and goal_weight > 0.0:
            pin_group.add([index], goal_weight * fade, "REPLACE")

    # Przy szwie warstwy są z założenia blisko siebie: kolizje własne tylko by je rozpychały.
    seam_group = obj.vertex_groups.new(name="no_self_collision")
    near_seam = [index for index, distance in enumerate(distances) if distance < 1.6]
    seam_group.add(near_seam, 1.0, "REPLACE")
    return obj


# ---------------------------------------------------------------------------
# Wieszak
# ---------------------------------------------------------------------------

def tube_object(name, points, radius, ellipse=1.0):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    curve.resolution_u = 12
    curve.use_fill_caps = True
    spline = curve.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for point, (x, y, z) in zip(spline.points, points):
        point.co = (x * CM, y * CM, z * CM, 1.0)
    spline.use_endpoint_u = True
    spline.order_u = min(4, len(points))
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_hanger():
    arm = [(-20.5, 0, -6.9), (-13.0, 0, -4.0), (-6.0, 0, -1.2), (0.0, 0, 1.0),
           (6.0, 0, -1.2), (13.0, 0, -4.0), (20.5, 0, -6.9)]
    body = tube_object("hanger_body", arm, 0.0085)
    hook = [(0.0, 0, 0.5), (0.0, 0, 5.0), (0.0, 0, 8.0), (2.2, 0, 10.5),
            (0.2, 0, 12.8), (-2.2, 0, 11.2)]
    wire = tube_object("hanger_hook", hook, 0.0022)

    depsgraph = bpy.context.evaluated_depsgraph_get()
    collider_mesh = bpy.data.meshes.new_from_object(body.evaluated_get(depsgraph))
    collider = bpy.data.objects.new("hanger_collider", collider_mesh)
    bpy.context.scene.collection.objects.link(collider)
    collider.hide_render = True
    collider.modifiers.new("collision", "COLLISION")
    collider.collision.thickness_outer = 0.005
    collider.collision.cloth_friction = 8.0
    return body, wire, collider


# ---------------------------------------------------------------------------
# Symulacja
# ---------------------------------------------------------------------------

def simulate(obj, frames, cloth):
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, frames
    modifier = obj.modifiers.new("cloth", "CLOTH")
    settings = modifier.settings
    settings.quality = 8
    settings.mass = cloth["mass"]
    settings.air_damping = cloth["air_damping"]
    settings.tension_stiffness = cloth["tension"]
    settings.compression_stiffness = cloth["compression"]
    settings.shear_stiffness = cloth["shear"]
    settings.bending_stiffness = cloth["bending"]
    settings.vertex_group_shrink = "shrink"
    settings.shrink_min = cloth["shrink_min"]
    settings.shrink_max = cloth["shrink_max"]
    settings.use_pressure = cloth["pressure"] > 0.0
    settings.uniform_pressure_force = cloth["pressure"]
    settings.tension_damping = 5.0
    settings.compression_damping = 5.0
    settings.shear_damping = 5.0
    settings.vertex_group_structural_stiffness = "hem"
    settings.tension_stiffness_max = cloth["hem_tension"]
    settings.compression_stiffness_max = cloth["hem_compression"]
    settings.vertex_group_bending = "hem"
    settings.bending_stiffness_max = cloth["hem_bending"]
    settings.vertex_group_mass = "pin"
    settings.pin_stiffness = 1.0
    collision = modifier.collision_settings
    collision.use_collision = True
    collision.collision_quality = 4
    collision.distance_min = 0.004
    collision.friction = 8.0
    collision.use_self_collision = True
    collision.self_distance_min = 0.004
    collision.self_friction = 5.0
    collision.vertex_group_self_collisions = "no_self_collision"
    modifier.point_cache.frame_start = 1
    modifier.point_cache.frame_end = frames

    started = time.time()
    for frame in range(1, frames + 1):
        scene.frame_set(frame)
        if frame % 10 == 0 or frame == 1:
            depsgraph = bpy.context.evaluated_depsgraph_get()
            evaluated = obj.evaluated_get(depsgraph).to_mesh()
            count = len(evaluated.vertices)
            buffer = np.empty(count * 3)
            evaluated.vertices.foreach_get("co", buffer)
            obj.evaluated_get(depsgraph).to_mesh_clear()
            points = buffer.reshape(-1, 3)
            if not np.isfinite(points).all():
                raise RuntimeError(f"Symulacja niestabilna na klatce {frame}: wartości NaN")
            print(
                f"[sim] klatka {frame}/{frames} czas={time.time() - started:.0f}s "
                f"zakres_z=({points[:, 2].min():.3f}, {points[:, 2].max():.3f}) "
                f"zakres_x=({points[:, 0].min():.3f}, {points[:, 0].max():.3f})",
                flush=True,
            )

    depsgraph = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    obj.modifiers.clear()
    old = obj.data
    obj.data = baked
    bpy.data.meshes.remove(old)

    # Delikatne wygładzenie usuwa szum symulacji, zachowując większe fałdy.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for _ in range(5):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.3, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.shade_smooth()
    obj.data.update()


def smooth_polyline(points, sigma):
    """Wygładzanie gaussowskie wzdłuż linii; końce zostają w miejscu dzięki odbiciu nieparzystemu."""
    count = len(points)
    radius = min(int(3 * sigma), count - 1)
    if radius < 1:
        return points.copy()
    axis = np.arange(-radius, radius + 1)
    kernel = np.exp(-(axis ** 2) / (2.0 * sigma ** 2))
    kernel /= kernel.sum()
    before = 2.0 * points[0] - points[radius:0:-1]
    after = 2.0 * points[-1] - points[-2:-radius - 2:-1]
    padded = np.vstack([before, points, after])
    result = np.stack(
        [np.convolve(padded[:, i], kernel, mode="valid") for i in range(3)], axis=1
    )
    result[0], result[-1] = points[0], points[-1]
    return result


def jaggedness_mm(co, lines):
    """Średnia wartość drugiej różnicy wzdłuż linii w milimetrach: miara ząbkowania."""
    values = [np.linalg.norm(np.diff(co[line], n=2, axis=0), axis=1) for line in lines if len(line) > 2]
    return float(np.concatenate(values).mean() * 1000.0)


def polish_seams(obj, builder, sigma=2.0, radius_cm=3.0, iterations=6):
    """Usuwa szum symulacji z szwów i brzegów, nie naruszając fałd na reszcie tkaniny."""
    mesh = obj.data
    count = len(mesh.vertices)
    buffer = np.empty(count * 3)
    mesh.vertices.foreach_get("co", buffer)
    co = buffer.reshape(-1, 3)

    def indices_of(points, layer):
        result = []
        for point in points:
            key = key_of(point)
            old = builder.vertices.get(("weld", key), builder.vertices.get((layer, key)))
            result.append(builder.compact[old])
        return np.array(result)

    lines = []
    for base in (builder.side, builder.sleeve_top, builder.sleeve_under, builder.shoulder):
        for variant in (base, mirror(base)):
            lines.append(indices_of(variant, 1))
    full_hem = np.vstack([builder.hem, mirror(builder.hem[::-1])[1:]])
    for layer in (1, -1):
        lines.append(indices_of(full_hem, layer))
        for variant in (builder.cuff, mirror(builder.cuff)):
            lines.append(indices_of(variant, layer))

    before = jaggedness_mm(co, lines)
    for line in lines:
        co[line] = smooth_polyline(co[line], sigma)
    after = jaggedness_mm(co, lines)

    # Rozluźnienie tkaniny tuż przy wygładzonej linii, żeby nie powstał schodek.
    fixed = np.zeros(count, dtype=bool)
    for line in lines:
        fixed[line] = True
    segments = np.vstack([
        builder.weld_segments,
        segments_of(full_hem),
        segments_of(builder.cuff),
        segments_of(mirror(builder.cuff)),
    ])
    distance = point_segment_distance(builder.flat_xy, segments)
    weight = np.clip(1.0 - distance / radius_cm, 0.0, 1.0) * (~fixed)
    edge_buffer = np.empty(len(mesh.edges) * 2, dtype=np.int32)
    mesh.edges.foreach_get("vertices", edge_buffer)
    edges = edge_buffer.reshape(-1, 2)
    degree = np.bincount(edges.ravel(), minlength=count).astype(float)
    degree[degree == 0.0] = 1.0
    for _ in range(iterations):
        total = np.zeros_like(co)
        np.add.at(total, edges[:, 0], co[edges[:, 1]])
        np.add.at(total, edges[:, 1], co[edges[:, 0]])
        co += 0.5 * weight[:, None] * (total / degree[:, None] - co)

    mesh.vertices.foreach_set("co", co.ravel())
    mesh.update()
    print(f"[polish] ząbkowanie szwów: {before:.3f} mm -> {after:.3f} mm", flush=True)


# ---------------------------------------------------------------------------
# Materiały testowe i render
# ---------------------------------------------------------------------------

GLYPHS = {
    "F": ["#####", "#....", "####.", "#....", "#....", "#....", "#...."],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
}


def calibration_image(name, glyph, width_mm, height_mm, color):
    """Plansza kontrolna: siatka co 50 mm i litera niesymetryczna, która ujawni odbicie."""
    px_per_mm = 2.0
    width, height = int(width_mm * px_per_mm), int(height_mm * px_per_mm)
    rgba = np.zeros((height, width, 4), dtype=np.float32)
    rgba[..., :3] = color
    for mm in range(0, int(width_mm) + 1, 50):
        col = min(int(mm * px_per_mm), width - 3)
        rgba[:, col:col + 3, 3] = 0.85
    for mm in range(0, int(height_mm) + 1, 50):
        row = min(int(mm * px_per_mm), height - 3)
        rgba[row:row + 3, :, 3] = 0.85
    rows = GLYPHS[glyph]
    cell = int(min(width / 7, height / 9))
    origin_x = (width - cell * 5) // 2
    origin_y = (height - cell * 7) // 2
    for r, line in enumerate(rows):
        for c, char in enumerate(line):
            if char == "#":
                rgba[origin_y + r * cell:origin_y + (r + 1) * cell,
                     origin_x + c * cell:origin_x + (c + 1) * cell, 3] = 1.0
    image = bpy.data.images.new(name, width, height, alpha=True)
    image.pixels.foreach_set(rgba[::-1].ravel())  # Blender przechowuje wiersze od dołu
    image.pack()
    return image


def socket(node, name, kind):
    return next(s for s in node.inputs if s.name == name and s.type == kind)


def fabric_material(name, image, detail, base=(0.82, 0.81, 0.78, 1.0)):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.88
    bsdf.inputs["Sheen Weight"].default_value = 0.15
    bsdf.inputs["Sheen Roughness"].default_value = 0.6
    bsdf.inputs["Specular IOR Level"].default_value = 0.25

    uv_fabric = nodes.new("ShaderNodeUVMap")
    uv_fabric.uv_map = "UVMap"
    weave = nodes.new("ShaderNodeTexNoise")
    weave.inputs["Scale"].default_value = 2600.0
    weave.inputs["Detail"].default_value = 2.0
    links.new(uv_fabric.outputs["UV"], weave.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.8
    bump.inputs["Distance"].default_value = 0.0012
    detail_node = nodes.new("ShaderNodeTexImage")
    detail_node.image = detail
    links.new(uv_fabric.outputs["UV"], detail_node.inputs["Vector"])
    height = nodes.new("ShaderNodeMath")
    height.operation = "ADD"
    height.use_clamp = False
    scaled = nodes.new("ShaderNodeMath")
    scaled.operation = "MULTIPLY"
    scaled.inputs[1].default_value = 0.08
    links.new(weave.outputs["Fac"], scaled.inputs[0])
    links.new(detail_node.outputs["Color"], height.inputs[0])
    links.new(scaled.outputs[0], height.inputs[1])
    links.new(height.outputs[0], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    if image is None:
        bsdf.inputs["Base Color"].default_value = base
        return material
    uv_print = nodes.new("ShaderNodeUVMap")
    uv_print.uv_map = "print"
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.extension = "CLIP"
    links.new(uv_print.outputs["UV"], texture.inputs["Vector"])
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    # Nadruk istnieje wyłącznie na zewnętrznej stronie tkaniny.
    geometry = nodes.new("ShaderNodeNewGeometry")
    outside = nodes.new("ShaderNodeMath")
    outside.operation = "SUBTRACT"
    outside.use_clamp = True
    links.new(texture.outputs["Alpha"], outside.inputs[0])
    links.new(geometry.outputs["Backfacing"], outside.inputs[1])
    links.new(outside.outputs[0], mix.inputs[0])
    socket(mix, "A", "RGBA").default_value = base
    links.new(texture.outputs["Color"], socket(mix, "B", "RGBA"))
    mix_output = next(s for s in mix.outputs if s.type == "RGBA")
    links.new(mix_output, bsdf.inputs["Base Color"])
    return material


def stamp_line(height, points, px_per_cm, width_px, depth, dash_cm=None):
    """Odciska linię ściegu w mapie wysokości; linia przerywana imituje pojedyncze ściegi."""
    pts = np.asarray(points) * px_per_cm
    lengths = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cumulative = np.concatenate([[0.0], np.cumsum(lengths)])
    count = int(cumulative[-1] * 1.5) + 2
    samples = np.linspace(0.0, cumulative[-1], count)
    xs, ys = np.interp(samples, cumulative, pts[:, 0]), np.interp(samples, cumulative, pts[:, 1])
    radius = int(math.ceil(width_px * 1.5))
    axis = np.arange(-radius, radius + 1)
    kernel = np.exp(-(axis[None, :] ** 2 + axis[:, None] ** 2) / (2.0 * (width_px / 2.0) ** 2))
    size = height.shape[0]
    for x, y, s in zip(xs, ys, samples):
        amount = depth
        if dash_cm:
            amount *= 1.0 if math.sin(2.0 * math.pi * s / (dash_cm * px_per_cm)) > -0.4 else 0.35
        ix, iy = int(round(x)), int(round(y))
        if radius <= ix < size - radius and radius <= iy < size - radius:
            region = height[iy - radius:iy + radius + 1, ix - radius:ix + radius + 1]
            np.minimum(region, 0.5 - amount * kernel, out=region)


def build_detail_map(builder, path, size=4096):
    """Mapa wysokości w UV0: ściegi przy dole, mankietach i szwach oraz prążki ściągacza."""
    height = np.full((size, size), 0.5, dtype=np.float32)
    px_per_cm = size / ATLAS_CM
    stitch = 0.25

    def body(line, offset_x):
        return np.asarray(line) + np.array([offset_x, 76.0])

    for offset_x, neck in ((28.0, builder.neck_front), (84.0, builder.neck_back)):
        for sign in (1.0, -1.0):
            scale = np.array([sign, 1.0])
            hem = builder.hem * scale
            for gap in (2.2, 2.8):
                stamp_line(height, body(hem + np.array([0.0, gap]), offset_x), px_per_cm, 1.6, 0.12, stitch)
            stamp_line(height, body(neck * scale + np.array([0.0, -0.5]), offset_x), px_per_cm, 1.6, 0.1, stitch)
            stamp_line(height, body(builder.armhole * scale, offset_x), px_per_cm, 3.0, 0.2)
            stamp_line(height, body(builder.shoulder * scale + np.array([0.0, -0.05]), offset_x), px_per_cm, 2.5, 0.14)
            stamp_line(height, body(builder.side * scale, offset_x), px_per_cm, 2.5, 0.14)

    length = builder.p["sleeve_length"]
    cuff = builder.p["cuff_width"]
    for atlas_x in (131.0, 169.0):
        for gap in (2.2, 2.8):
            line = [(atlas_x - cuff, 22.0 + length - gap), (atlas_x + cuff, 22.0 + length - gap)]
            stamp_line(height, line, px_per_cm, 1.6, 0.12, stitch)

    # Prążki ściągacza w regionach atlasu kołnierza.
    rib = builder.p["rib_width"]
    full_length = 60.0
    for atlas_y in (90.0, 110.0):
        y0, y1 = int(atlas_y * px_per_cm), int((atlas_y + rib) * px_per_cm) + 1
        x0, x1 = int(2.0 * px_per_cm), int((2.0 + full_length) * px_per_cm)
        columns = np.arange(x0, x1)
        height[y0:y1, x0:x1] = 0.5 + 0.1 * np.sin(2.0 * math.pi * columns / (0.22 * px_per_cm))[None, :]

    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = height
    image = bpy.data.images.new("detail_height", size, size, alpha=False, float_buffer=False)
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    return image


def assign_materials(obj, pattern, detail):
    area = pattern["print_areas"]
    specs = {
        "panel_front": ("F", area["front"], (0.75, 0.05, 0.05)),
        "panel_back": ("B", area["back"], (0.05, 0.15, 0.75)),
        "sleeve_left": ("L", area["sleeve"], (0.05, 0.5, 0.1)),
        "sleeve_right": ("R", area["sleeve"], (0.7, 0.3, 0.02)),
    }
    for slot, panel in enumerate(PANELS):
        placeholder = obj.data.materials[slot]
        if panel in specs:
            glyph, size, color = specs[panel]
            image = calibration_image(f"cal_{panel}", glyph, size["width_mm"], size["height_mm"], color)
            obj.data.materials[slot] = fabric_material(panel, image, detail)
        else:
            obj.data.materials[slot] = fabric_material(panel, None, detail)
        bpy.data.materials.remove(placeholder)


def enable_gpu():
    preferences = bpy.context.preferences.addons["cycles"].preferences
    for device_type in ("OPTIX", "CUDA"):
        try:
            preferences.compute_device_type = device_type
            preferences.get_devices()
            gpus = [d for d in preferences.devices if d.type == device_type]
            if gpus:
                for device in preferences.devices:
                    device.use = device.type == device_type
                print(f"[render] GPU: {device_type} {[d.name for d in gpus]}", flush=True)
                return "GPU"
        except TypeError:
            continue
    print("[render] brak GPU, renderuję na CPU", flush=True)
    return "CPU"


def area_light(name, location, target, size, energy, color=(1.0, 0.98, 0.95)):
    light = bpy.data.lights.new(name, "AREA")
    light.size = size
    light.energy = energy
    light.color = color
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    return obj


def setup_studio(args):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = enable_gpu()
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = int(args.resolution * 0.85)
    scene.render.resolution_y = args.resolution
    scene.render.image_settings.file_format = "PNG"

    world = bpy.data.worlds.new("studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.6, 0.6, 0.6, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.12
    scene.world = world

    target = (0.0, 0.0, -0.3)
    area_light("key", (-1.9, -1.1, 0.7), target, 0.9, 150.0)
    area_light("fill", (1.8, -1.4, -0.1), target, 2.0, 18.0)
    area_light("back", (1.2, 1.2, 0.8), target, 1.0, 60.0)

    bpy.ops.mesh.primitive_plane_add(size=12.0, location=(0.0, 1.3, -0.3), rotation=(math.pi / 2.0, 0.0, 0.0))
    wall = bpy.context.object
    wall.name = "backdrop"
    material = bpy.data.materials.new("backdrop")
    material.use_nodes = True
    material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.42, 0.41, 0.39, 1.0)
    material.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    wall.data.materials.append(material)

    hanger_material = bpy.data.materials.new("hanger_wood")
    hanger_material.use_nodes = True
    hanger_material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.2, 0.1, 1.0)
    hanger_material.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.45
    wire_material = bpy.data.materials.new("hanger_metal")
    wire_material.use_nodes = True
    bsdf = wire_material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.75, 0.73, 0.7, 1.0)
    bsdf.inputs["Metallic"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.3
    bpy.data.objects["hanger_body"].data.materials.append(hanger_material)
    bpy.data.objects["hanger_hook"].data.materials.append(wire_material)


def render_views(args):
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("camera")
    camera_data.lens = 70.0
    camera = bpy.data.objects.new("camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    views = {
        "front": ((0.0, -2.35, -0.28), (0.0, 0.0, -0.28), 70.0),
        "three_quarter": ((1.45, -1.85, -0.2), (0.0, 0.0, -0.28), 70.0),
        "side": ((2.35, 0.0, -0.28), (0.0, 0.0, -0.28), 70.0),
        "back": ((0.0, 1.25, -0.28), (0.0, 0.0, -0.28), 35.0),
        "detail": ((-0.25, -0.8, -0.05), (-0.08, 0.0, -0.2), 70.0),
        "sleeve_left": ((1.3, -0.25, -0.12), (0.26, 0.0, -0.14), 70.0),
    }
    folder = os.path.join(args.out, "renders")
    os.makedirs(folder, exist_ok=True)
    backdrop = bpy.data.objects["backdrop"]
    for name, (location, target, lens) in views.items():
        backdrop.hide_render = name in ("back", "side", "sleeve_left")
        camera.location = location
        camera.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
        camera_data.lens = lens
        scene.render.filepath = os.path.join(folder, f"{name}.png")
        started = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"[render] {name}: {time.time() - started:.0f}s", flush=True)


def export_glb(obj, path):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_tangents=False,
    )


def main():
    args = parse_args()
    # Blender rozwiązuje ścieżki względne inaczej niż powłoka, dlatego od razu je utwierdzamy.
    args.out = os.path.abspath(args.out)
    with open(args.pattern, encoding="utf-8") as handle:
        pattern = json.load(handle)
    os.makedirs(args.out, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    if not bpy.context.preferences.addons.get("cycles"):
        bpy.ops.preferences.addon_enable(module="cycles")

    builder = TeeBuilder(pattern).build()
    welded = weld_collar_ends(builder)
    print(
        f"[build] wierzchołki={len(builder.positions)} trójkąty={len(builder.faces)} "
        f"zespawane końce kołnierza={welded} piny={len(builder.pin_keys)}",
        flush=True,
    )
    tee = create_tee_object(builder)
    build_hanger()

    if not args.skip_sim:
        simulate(tee, args.frames, pattern["cloth"])
        polish_seams(tee, builder)

    detail = build_detail_map(builder, os.path.join(args.out, "detail_height.png"))
    assign_materials(tee, pattern, detail)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.out, "tee_hanging.blend"))
    export_glb(tee, os.path.join(args.out, "hanging.glb"))
    if not args.no_render:
        setup_studio(args)
        render_views(args)
    print("[done] gotowe", flush=True)


if __name__ == "__main__":
    main()

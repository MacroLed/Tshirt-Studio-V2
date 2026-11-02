"""Czyste rendery do oceny wizualnej, bez planszy kontrolnej i bez ponownej symulacji.

Uruchomienie:
  blender --background --factory-startup out/regular/tee_hanging.blend --python render_review.py -- \
      --out out/regular/review --samples 192 --resolution 1200
"""

import argparse
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_tee import setup_studio  # noqa: E402

COLORS = {
    "white": (0.82, 0.81, 0.78, 1.0),
    "charcoal": (0.035, 0.036, 0.04, 1.0),
    "forest": (0.03, 0.09, 0.06, 1.0),
}
VIEWS = {
    "front": ((0.0, -2.35, -0.28), (0.0, 0.0, -0.28), 70.0),
    "three_quarter": ((1.45, -1.85, -0.2), (0.0, 0.0, -0.28), 70.0),
    "detail": ((-0.25, -0.8, -0.05), (-0.08, 0.0, -0.2), 70.0),
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--samples", type=int, default=192)
    parser.add_argument("--resolution", type=int, default=1200)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def hide_calibration(material):
    """Odłącza planszę kontrolną, zostawiając materiał tkaniny bez zmian."""
    tree = material.node_tree
    for node in tree.nodes:
        if node.type == "MATH" and node.operation == "SUBTRACT":
            for link in list(node.inputs[0].links):
                tree.links.remove(link)
            node.inputs[0].default_value = 0.0


def set_color(material, color):
    for node in material.node_tree.nodes:
        if node.type == "MIX" and node.data_type == "RGBA":
            next(s for s in node.inputs if s.name == "A" and s.type == "RGBA").default_value = color
        if node.type == "BSDF_PRINCIPLED" and not node.inputs["Base Color"].links:
            node.inputs["Base Color"].default_value = color


def main():
    args = parse_args()
    args.out = os.path.abspath(args.out)
    os.makedirs(args.out, exist_ok=True)
    setup_studio(args)

    materials = bpy.data.objects["tee"].data.materials
    for material in materials:
        hide_calibration(material)

    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("camera")
    camera = bpy.data.objects.new("camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    for color_name, color in COLORS.items():
        for material in materials:
            set_color(material, color)
        for view_name, (location, target, lens) in VIEWS.items():
            camera.location = location
            camera.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
            camera_data.lens = lens
            scene.render.filepath = os.path.join(args.out, f"{color_name}_{view_name}.png")
            bpy.ops.render.render(write_still=True)
            print(f"[review] {color_name}_{view_name}", flush=True)
    print("[review] gotowe", flush=True)


if __name__ == "__main__":
    main()

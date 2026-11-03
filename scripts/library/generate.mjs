// Generuje startowe grafiki biblioteki: oryginalne, narysowane kodem, bez cudzych licencji i znaków towarowych.
// Kolor to currentColor, dzięki czemu edytor dobiera kolor czytelny na wybranej tkaninie.
// Uruchomienie: npm run library
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'public', 'library');
const C = 'currentColor';
const f = (value) => +value.toFixed(2);

const polar = (cx, cy, r, deg) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return `${f(cx + r * Math.cos(rad))},${f(cy + r * Math.sin(rad))}`;
};
const star = (cx, cy, outer, inner, points = 5) =>
  Array.from({ length: points * 2 }, (_, i) => polar(cx, cy, i % 2 ? inner : outer, (i * 180) / points)).join(' ');
const polygon = (points, extra = `fill="${C}"`) => `<polygon points="${points}" ${extra}/>`;
const circle = (cx, cy, r, extra = `fill="${C}"`) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${extra}/>`;
const ring = (cx, cy, r, width) => circle(cx, cy, r, `fill="none" stroke="${C}" stroke-width="${width}"`);
const path = (d, extra = `fill="${C}"`) => `<path d="${d}" ${extra}/>`;
const line = (d, width) => path(d, `fill="none" stroke="${C}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`);
const around = (count, draw) => Array.from({ length: count }, (_, i) => draw((i * 360) / count, i)).join('');

// Prosty krój z kresek na siatce 4 x 6: SVG rysowany jako obraz nie ma dostępu do fontów strony.
const STROKES = {
  S: ['4 1 3 0 1 0 0 1 0 2 1 3 3 3 4 4 4 5 3 6 1 6 0 5'],
  T: ['0 0 4 0', '2 0 2 6'],
  A: ['0 6 2 0 4 6', '0.8 4 3.2 4'],
  R: ['0 6 0 0 3 0 4 1 4 2 3 3 0 3', '2 3 4 6'],
  E: ['4 0 0 0 0 6 4 6', '0 3 3 3'],
  M: ['0 6 0 0 2 3 4 0 4 6'],
  N: ['0 6 0 0 4 6 4 0'],
  O: ['1 0 3 0 4 1 4 5 3 6 1 6 0 5 0 1 1 0'],
  1: ['1 1 2 0 2 6', '1 6 3 6'],
  0: ['1 0 3 0 4 1 4 5 3 6 1 6 0 5 0 1 1 0'],
};

function word(text, { unit = 20, gap = 1.6, width = 16, margin = 16 } = {}) {
  let x = margin;
  const parts = [];
  for (const char of text) {
    if (char === ' ') {
      x += unit * 2.4;
      continue;
    }
    for (const stroke of STROKES[char]) {
      const values = stroke.split(' ').map(Number);
      const points = [];
      for (let i = 0; i < values.length; i += 2) points.push(`${f(x + values[i] * unit)} ${f(margin + values[i + 1] * unit)}`);
      parts.push(line(`M${points.join(' L')}`, width));
    }
    x += (4 + gap) * unit;
  }
  return { body: parts.join(''), width: f(x - gap * unit + margin), height: margin * 2 + unit * 6 };
}

const SQUARE = (body) => ({ body, width: 400, height: 400 });

const GRAPHICS = {
  // Logo: znaki ogólne, które nie naśladują żadnej istniejącej marki.
  'logo-ring-star': SQUARE(ring(200, 200, 170, 22) + polygon(star(200, 205, 120, 50))),
  // Tarcza z wyciętymi krokwiami: bez białego wypełnienia, bo tkanina ma prześwitywać.
  'logo-shield': SQUARE(
    path(
      'M200 24 L350 76 V196 C350 290 284 350 200 380 C116 350 50 290 50 196 V76 Z ' +
        'M200 110 L110 170 V214 L200 154 L290 214 V170 Z M200 190 L110 250 V290 L200 230 L290 290 V250 Z',
      `fill="${C}" fill-rule="evenodd"`,
    ),
  ),
  'logo-hexagon': SQUARE(
    polygon(around(6, (deg) => polar(200, 200, 180, deg) + ' ').trim(), `fill="none" stroke="${C}" stroke-width="24" stroke-linejoin="round"`) +
      polygon(around(3, (deg) => polar(200, 200, 96, deg) + ' ').trim()),
  ),

  'symbol-star': SQUARE(polygon(star(200, 212, 190, 78))),
  'symbol-bolt': SQUARE(polygon('236,16 76,228 186,228 150,384 324,156 212,156')),
  'symbol-heart': SQUARE(path('M200 360 C60 260 20 190 20 128 C20 68 66 32 116 32 C152 32 184 52 200 88 C216 52 248 32 284 32 C334 32 380 68 380 128 C380 190 340 260 200 360 Z')),

  'type-start': word('START'),
  'type-team': word('TEAM'),
  'type-no-1': word('NO 1'),

  'decor-flower': SQUARE(
    around(8, (deg) => `<ellipse cx="200" cy="90" rx="46" ry="84" fill="${C}" transform="rotate(${deg} 200 200)"/>`) +
      circle(200, 200, 34, `fill="none" stroke="${C}" stroke-width="10"`),
  ),
  'decor-waves': SQUARE(
    [80, 160, 240, 320].map((y) => line(`M24 ${y} C74 ${y - 56} 124 ${y - 56} 174 ${y} S 276 ${y + 56} 376 ${y}`, 22)).join(''),
  ),
  'decor-diamond': SQUARE(
    polygon('200,20 380,200 200,380 20,200', `fill="none" stroke="${C}" stroke-width="16"`) +
      polygon('200,92 308,200 200,308 92,200') +
      around(4, (deg) => circle(polar(200, 200, 150, deg + 45).split(',')[0], polar(200, 200, 150, deg + 45).split(',')[1], 14)),
  ),

  'sport-stripes': SQUARE(
    [0, 1, 2].map((i) => polygon(`${64 + i * 96},350 ${132 + i * 96},350 ${268 + i * 96 - 64},50 ${200 + i * 96 - 64},50`)).join(''),
  ),
  'sport-number-10': word('10', { unit: 44, width: 40, margin: 30 }),
  'sport-ball': SQUARE(
    ring(200, 200, 176, 20) +
      polygon(around(5, (deg) => polar(200, 200, 66, deg) + ' ').trim()) +
      around(5, (deg) => line(`M${polar(200, 200, 66, deg)} L${polar(200, 200, 172, deg)}`, 14)),
  ),

  'minimal-circle': SQUARE(ring(200, 200, 170, 8)),
  'minimal-dots': { body: [60, 200, 340].map((x) => circle(x, 60, 44)).join(''), width: 400, height: 120 },
  'minimal-arches': SQUARE([60, 120, 180].map((r) => line(`M${200 - r} 330 V${330 - r * 0.6} A${r} ${r} 0 0 1 ${200 + r} ${330 - r * 0.6} V330`, 12)).join('')),

  'vintage-sunburst': SQUARE(
    around(24, (deg) => polygon(`${polar(200, 200, 100, deg - 4)} ${polar(200, 200, 190, deg)} ${polar(200, 200, 100, deg + 4)}`)) +
      ring(200, 200, 84, 12) +
      polygon(star(200, 204, 52, 22)),
  ),
  'vintage-sun-stripes': {
    body:
      `<clipPath id="half"><rect x="0" y="0" width="400" height="200"/></clipPath>` +
      `<g clip-path="url(#half)">${circle(200, 200, 180)}</g>` +
      [216, 244, 272].map((y, i) => `<rect x="${20 + i * 34}" y="${y}" width="${360 - i * 68}" height="${14 - i * 2}" fill="${C}"/>`).join(''),
    width: 400,
    height: 300,
  },
  'vintage-stamp': SQUARE(
    ring(200, 200, 176, 12) +
      ring(200, 200, 140, 4) +
      around(12, (deg) => {
        const [x, y] = polar(200, 200, 158, deg).split(',').map(Number);
        return polygon(star(x, y, 11, 4.5));
      }) +
      polygon(star(200, 206, 96, 38)),
  ),

  'abstract-circles': SQUARE(
    circle(150, 160, 120, `fill="${C}" fill-opacity="0.85"`) +
      ring(250, 160, 120, 14) +
      circle(200, 270, 96, `fill="${C}" fill-opacity="0.45"`),
  ),
  'abstract-blob': SQUARE(path('M210 30 C310 26 382 104 366 200 C352 286 306 372 204 370 C104 368 26 310 34 204 C40 110 116 34 210 30 Z M214 130 C164 124 128 160 134 208 C140 254 180 276 224 262 C266 248 282 208 268 172 C258 148 240 134 214 130 Z', `fill="${C}" fill-rule="evenodd"`)),
  'abstract-triangles': SQUARE(
    [0, 1, 2, 3].flatMap((row) =>
      Array.from({ length: row + 1 }, (_, i) => {
        const x = 200 - row * 45 + i * 90;
        const y = 40 + row * 84;
        return polygon(`${x},${y} ${x + 42},${y + 76} ${x - 42},${y + 76}`, row % 2 ? `fill="${C}" fill-opacity="0.55"` : `fill="${C}"`);
      }),
    ).join(''),
  ),
};

mkdirSync(OUT, { recursive: true });
for (const [id, { body, width, height }] of Object.entries(GRAPHICS)) {
  // Kolor bazowy obowiązuje, gdy plik jest pokazywany jako miniatura, bez podstawienia koloru.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" color="#1A1917">${body}</svg>\n`;
  writeFileSync(join(OUT, `${id}.svg`), svg);
}
console.log(`Zapisano grafik: ${Object.keys(GRAPHICS).length}`);

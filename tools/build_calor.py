#!/usr/bin/env python3
"""Mapa de calor «Por dónde pasa la gente» a partir de las trazas GPS públicas de OpenStreetMap.
Entrada: los GPX que devuelve la API de OSM (api/0.6/trackpoints?bbox=…&page=N), bajados en tools/datos/calor/<zona>_<página>.gpx.
Cada traza identificable se dibuja como línea entre puntos seguidos (si no están a más de 120 m: saltos del GPS) y cuenta una sola vez por píxel,
así el valor del píxel es «cuántas trazas pasan por aquí», no cuántos puntos. Las trazas privadas llegan como puntos sueltos sin orden: suman solo su punto.
Salida: data/calor/<zona>.png (gris de 8 bits, 10 m por píxel, norte arriba; valor = log de las trazas, 255 = el máximo de la zona) y data/calor/index.json
con el recuadro (lon/lat) de cada zona. Datos © colaboradores de OpenStreetMap.
Uso: python3 tools/build_calor.py aneto 0.55 42.58 0.76 42.72"""
import glob, json, math, os, sys, xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
zona, w, s, e, n = sys.argv[1], *map(float, sys.argv[2:6])
PX = 10.0   # metros por píxel
mLat, mLon = 111132, 111320 * math.cos(math.radians((s + n) / 2))
W, H = int((e - w) * mLon / PX), int((n - s) * mLat / PX)
cuenta = np.zeros((H, W), np.uint16)
NS = '{http://www.topografix.com/GPX/1/0}'

def px(lat, lon): return (lon - w) * mLon / PX, (n - lat) * mLat / PX

def linea(pts):
    """Píxeles que pisa la traza (cada uno una vez)."""
    vis = set()
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        d = math.hypot(x1 - x0, y1 - y0)
        if d * PX > 120: continue
        for k in range(int(d) + 1):
            t = k / max(d, 1e-9); vis.add((int(y0 + (y1 - y0) * t), int(x0 + (x1 - x0) * t)))
    for p in pts[-1:]: vis.add((int(p[1]), int(p[0])))
    return vis

trazas = puntos = 0
for f in sorted(glob.glob(os.path.join(ROOT, 'tools/datos/calor', f'{zona}_*.gpx')), key=lambda f: int(f.rsplit('_', 1)[1][:-4])):
    try: raiz = ET.parse(f).getroot()
    except ET.ParseError: print('  mal formado', f); continue
    for trk in raiz.iter(NS + 'trk'):
        ident = trk.find(NS + 'url') is not None
        for seg in trk.iter(NS + 'trkseg'):
            pts = [px(float(p.get('lat')), float(p.get('lon'))) for p in seg.iter(NS + 'trkpt')]
            puntos += len(pts)
            vis = linea(pts) if ident else {(int(y), int(x)) for x, y in pts}
            ys, xs = zip(*[(y, x) for y, x in vis if 0 <= y < H and 0 <= x < W]) if vis else ((), ())
            if ys: cuenta[list(ys), list(xs)] += 1
            trazas += ident
print(f'{zona}: {trazas} trazas identificables, {puntos} puntos, {W}×{H} px, máximo {cuenta.max()} trazas en un píxel')

# un poco de difuminado (el GPS tiene 5-15 m de error) y escala logarítmica: una traza ya se ve, cien se ven mucho más
v = gaussian_filter(cuenta.astype(np.float32), 1.2)
v = np.log1p(v * 2.2); v = np.clip(v / max(np.percentile(v[v > 0], 99.7), 1e-6), 0, 1)
os.makedirs(os.path.join(ROOT, 'data/calor'), exist_ok=True)
Image.fromarray((v * 255).astype(np.uint8), 'L').save(os.path.join(ROOT, 'data/calor', f'{zona}.png'), optimize=True)
I = os.path.join(ROOT, 'data/calor/index.json')
idx = json.load(open(I)) if os.path.exists(I) else {}
idx[zona] = {'caja': [w, s, e, n], 'trazas': trazas, 'png': f'data/calor/{zona}.png'}
json.dump(idx, open(I, 'w'), ensure_ascii=False, indent=1)

#!/usr/bin/env python3
"""Mapa de calor «Por dónde pasa la gente» a partir de las trazas GPS públicas de OpenStreetMap.
Entrada: los GPX que devuelve la API de OSM (api/0.6/trackpoints?bbox=…&page=N), bajados con tools/bajar_calor.sh en tools/datos/calor/<zona>_<página>.gpx.
Cada traza identificable se dibuja como línea entre puntos seguidos (si no están a más de 120 m: saltos del GPS) y cuenta una sola vez por píxel,
así el valor del píxel es «cuántas trazas pasan por aquí», no cuántos puntos. Las trazas privadas llegan como puntos sueltos sin orden: suman solo su punto.
Salida: data/calor/<zona>.png (RGB, 10 m por píxel, norte arriba) y data/calor/index.json (recuadro lon/lat y escala de cada zona).
  R: log de las trazas por píxel, normalizado (trazas ≈ expm1(R / 255 · escala) / 2,2).
  G: tipo de vía de OpenStreetMap: 255 carretera o calle, 128 pista, 0 sendero o monte (la capa lo dice con otro color: mucha gente graba el GPS en el coche).
Datos © colaboradores de OpenStreetMap.
Uso: python3 tools/build_calor.py [zona ...]   (sin zonas: todas las de ZONAS que tengan GPX)"""
import glob, json, math, os, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DATOS = os.path.join(ROOT, 'tools/datos/calor')
ZONAS = {'aneto': (0.55, 42.58, 0.76, 42.72), 'benasque': (0.40, 42.55, 0.55, 42.74), 'posets': (0.25, 42.55, 0.40, 42.75), 'perdido-e': (0.05, 42.60, 0.25, 42.76),
         'perdido-o': (-0.06, 42.60, 0.05, 42.76), 'vignemale': (-0.18, 42.64, -0.06, 42.82), 'balaitus': (-0.38, 42.72, -0.18, 42.88)}   # las mismas que tools/bajar_calor.sh
PX = 10.0   # metros por píxel
NS = '{http://www.topografix.com/GPX/1/0}'
CARRETERA = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
UA = {'User-Agent': 'tresmiles/1.0 (proyecto educativo)'}

def vias(zona, w, s, e, n):
    """Carreteras y pistas de OSM en el recuadro (se guardan en tools/datos/calor/<zona>_vias.json)."""
    f = os.path.join(DATOS, f'{zona}_vias.json')
    if not os.path.exists(f):
        q = f'[out:json][timeout:180];way["highway"~"^({"|".join(CARRETERA)}|track)$"]({s},{w},{n},{e});out geom tags;'
        for i in range(6):
            for h in ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'):
                try:
                    d = urllib.request.urlopen(urllib.request.Request(h, data=urllib.parse.urlencode({'data': q}).encode(), headers=UA), timeout=200).read()
                    open(f, 'wb').write(d); break
                except Exception as ex: print('  reintento', h.split('/')[2], ex, flush=True); time.sleep(8 * (i + 1))
            else: continue
            break
    return json.load(open(f))['elements']

def hacer(zona):
    w, s, e, n = ZONAS[zona]
    mLat, mLon = 111132, 111320 * math.cos(math.radians((s + n) / 2))
    W, H = int((e - w) * mLon / PX), int((n - s) * mLat / PX)
    px = lambda lat, lon: ((lon - w) * mLon / PX, (n - lat) * mLat / PX)
    cuenta = np.zeros((H, W), np.uint16)

    def linea(pts):
        vis = set()
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            d = math.hypot(x1 - x0, y1 - y0)
            if d * PX > 120: continue
            for k in range(int(d) + 1):
                t = k / max(d, 1e-9); vis.add((int(y0 + (y1 - y0) * t), int(x0 + (x1 - x0) * t)))
        for p in pts[-1:]: vis.add((int(p[1]), int(p[0])))
        return vis

    trazas = puntos = 0
    gpx = sorted(glob.glob(os.path.join(DATOS, f'{zona}_[0-9]*.gpx')), key=lambda f: int(f.rsplit('_', 1)[1][:-4]))
    if not gpx: print(zona, 'sin GPX'); return
    for f in gpx:
        try: raiz = ET.parse(f).getroot()
        except ET.ParseError: print('  mal formado', f); continue
        for trk in raiz.iter(NS + 'trk'):
            ident = trk.find(NS + 'url') is not None
            for seg in trk.iter(NS + 'trkseg'):
                pts = [px(float(p.get('lat')), float(p.get('lon'))) for p in seg.iter(NS + 'trkpt')]
                puntos += len(pts)
                vis = linea(pts) if ident else {(int(y), int(x)) for x, y in pts}
                den = [(y, x) for y, x in vis if 0 <= y < H and 0 <= x < W]   # una traza puede caer entera fuera del recuadro
                if den: ys, xs = zip(*den); cuenta[list(ys), list(xs)] += 1
                trazas += ident
    # un poco de difuminado (el GPS tiene 5-15 m de error) y escala logarítmica: una traza ya se ve, cien se ven mucho más
    v = gaussian_filter(cuenta.astype(np.float32), 1.2)
    v = np.log1p(v * 2.2); escala = float(max(np.percentile(v[v > 0], 99.7), 1e-6)); v = np.clip(v / escala, 0, 1)
    # carreteras (255) y pistas (128), con unos 50 m de ancho para cubrir el error del GPS
    via = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(via)
    for el in sorted(vias(zona, w, s, e, n), key=lambda el: el.get('tags', {}).get('highway') != 'track', reverse=False):
        g = el.get('geometry'); t = el.get('tags', {}).get('highway')
        if not g: continue
        dr.line([px(c['lat'], c['lon']) for c in g], fill=128 if t == 'track' else 255, width=5)
    rgb = np.dstack([(v * 255).astype(np.uint8), np.array(via), np.zeros((H, W), np.uint8)])
    os.makedirs(os.path.join(ROOT, 'data/calor'), exist_ok=True)
    Image.fromarray(rgb, 'RGB').save(os.path.join(ROOT, 'data/calor', f'{zona}.png'), optimize=True)
    I = os.path.join(ROOT, 'data/calor/index.json')
    idx = json.load(open(I)) if os.path.exists(I) else {}
    idx[zona] = {'caja': [w, s, e, n], 'trazas': trazas, 'escala': round(escala, 4), 'png': f'data/calor/{zona}.png'}
    json.dump(dict(sorted(idx.items())), open(I, 'w'), ensure_ascii=False, indent=1)
    print(f'{zona}: {trazas} trazas identificables, {puntos} puntos, {W}×{H} px, máximo {cuenta.max()} trazas en un píxel')

for z in sys.argv[1:] or ZONAS: hacer(z)

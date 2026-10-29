#!/usr/bin/env python3
"""Ruta por los senderos y pistas de OpenStreetMap entre dos puntos (y por los puntos de paso que se indiquen), para las cumbres sin track de Wikiloc.
Camino más corto por la red de OSM (las sendas pesan menos que pistas y carreteras), altitudes del Copernicus GLO-30 (~/Tresmiles/data/dem),
simplificación y cifras como tools/gpx2json.py. Escribe data/rutas/<id>.json (mismo formato que las de Wikiloc, con `gpx`) y data/rutas/<id>.gpx para descargar.
Datos © colaboradores de OpenStreetMap, licencia ODbL: el JSON lleva autor y enlace a OSM.
Uso: python3 tools/ruta_osm.py <id> "Nombre de la ruta" lat,lon lat,lon [lat,lon ...]   (inicio, puntos de paso..., final)"""
import heapq, json, math, os, sys, time, urllib.parse, urllib.request
import rasterio
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gpx2json import dp, local, EPS, UMBRAL

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
UA = {'User-Agent': 'tresmiles/1.0 (proyecto educativo)'}
HOSTS = ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter')
PESO = {'path': 1.0, 'footway': 1.0, 'track': 1.15, 'service': 1.4, 'unclassified': 1.6, 'residential': 1.3, 'living_street': 1.3, 'tertiary': 2.5}
DEMS = [rasterio.open(os.path.expanduser('~/Tresmiles/data/dem/' + f)) for f in ('Copernicus_DSM_COG_10_N42_00_E000_00_DEM.tif', 'Copernicus_DSM_COG_10_N42_00_W001_00_DEM.tif')]

def cota(lon, lat):
    for r in DEMS:
        b = r.bounds
        if b.left <= lon < b.right and b.bottom <= lat < b.top:
            row, col = r.index(lon, lat); return float(r.read(1, window=((row, row + 1), (col, col + 1)))[0, 0])

def overpass(bbox):
    q = f'[out:json][timeout:120];way["highway"~"^({"|".join(PESO)})$"]({bbox});out geom tags;'
    for i in range(6):
        for h in HOSTS:
            try: return json.loads(urllib.request.urlopen(urllib.request.Request(h, data=urllib.parse.urlencode({'data': q}).encode(), headers=UA), timeout=150).read())
            except Exception as e: print('  reintento', h.split('/')[2], e, flush=True); time.sleep(5 * (i + 1))
    sys.exit('Overpass no responde')

def dist(a, b):
    return math.hypot((a[0] - b[0]) * 111320 * math.cos(math.radians(a[1])), (a[1] - b[1]) * 111132)

rid, nombre, *pts = sys.argv[1:]
pts = [tuple(reversed([float(v) for v in p.split(',')])) for p in pts]   # (lon, lat)
lons, lats = [p[0] for p in pts], [p[1] for p in pts]
bbox = f'{min(lats) - 0.02},{min(lons) - 0.02},{max(lats) + 0.02},{max(lons) + 0.02}'
grafo, nodos = {}, set()
for w in overpass(bbox)['elements']:
    g = [(round(c['lon'], 7), round(c['lat'], 7)) for c in w['geometry']]; f = PESO[w['tags']['highway']]
    for a, b in zip(g, g[1:]):
        d = dist(a, b) * f; grafo.setdefault(a, []).append((b, d)); grafo.setdefault(b, []).append((a, d)); nodos |= {a, b}

def camino(a, b):
    na, nb = min(nodos, key=lambda n: dist(n, a)), min(nodos, key=lambda n: dist(n, b))
    print(f'  enganche a la red: {dist(na, a):.0f} m y {dist(nb, b):.0f} m', flush=True)
    prev, best, cola = {na: None}, {na: 0}, [(0, na)]
    while cola:
        d, n = heapq.heappop(cola)
        if n == nb: break
        if d > best[n]: continue
        for m, w in grafo[n]:
            if d + w < best.get(m, 1e18): best[m] = d + w; prev[m] = n; heapq.heappush(cola, (d + w, m))
    if nb not in prev: sys.exit('sin camino por la red de OSM')
    out, n = [], nb
    while n: out.append(n); n = prev[n]
    return [a] + out[::-1] + [b]

linea = []
for a, b in zip(pts, pts[1:]): linea += camino(a, b)[0 if not linea else 1:]
lat0 = sum(lats) / len(lats)
xy = [local(lon, lat, lat0) + (lon, lat) for lon, lat in linea]
# puntos cada ~10 m antes de simplificar, para que la altitud siga el relieve
dens = [xy[0]]
for p in xy[1:]:
    q = dens[-1]; n = int(math.hypot(p[0] - q[0], p[1] - q[1]) // 10)
    for k in range(1, n + 1): dens.append(tuple(q[i] + (p[i] - q[i]) * k / (n + 1) for i in range(4)))
    dens.append(p)
dens = dp(dens, EPS)
puntos, d, sube, ref = [], 0.0, 0.0, None
for i, (x, y, lon, lat) in enumerate(dens):
    if i: d += math.hypot(x - dens[i - 1][0], y - dens[i - 1][1])
    z = cota(lon, lat)
    if ref is None: ref = z
    elif z > ref + UMBRAL: sube += z - ref; ref = z
    elif z < ref - UMBRAL: ref = z
    puntos.append([round(lon, 5), round(lat, 5), round(z, 1), round(d)])
alts = [p[2] for p in puntos]
out = {'nombre': nombre, 'autor': 'colaboradores de OpenStreetMap', 'autorUrl': 'https://www.openstreetmap.org/copyright', 'fuenteUrl': f'https://www.openstreetmap.org/#map=14/{lat0:.4f}/{sum(lons) / len(lons):.4f}',
       'osm': True, 'gpx': f'data/rutas/{rid}.gpx', 'puntos': puntos, 'distancia': round(d), 'desnivel': round(sube), 'max': round(max(alts)), 'min': round(min(alts))}
json.dump(out, open(os.path.join(ROOT, 'data', 'rutas', f'{rid}.json'), 'w'), separators=(',', ':'))
trk = ''.join(f'<trkpt lat="{lat}" lon="{lon}"><ele>{z}</ele></trkpt>' for lon, lat, z, _ in puntos)
open(os.path.join(ROOT, 'data', 'rutas', f'{rid}.gpx'), 'w').write(f'<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Tresmiles" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>{nombre}</name><copyright author="OpenStreetMap contributors"><license>https://opendatacommons.org/licenses/odbl/</license></copyright></metadata><trk><name>{nombre}</name><trkseg>{trk}</trkseg></trk></gpx>\n')
print(f'{rid}: {len(puntos)} puntos, {d / 1000:.1f} km, +{sube:.0f} m, {min(alts):.0f}–{max(alts):.0f} m')

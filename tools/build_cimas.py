#!/usr/bin/env python3
"""Detalle local de las cimas emblemáticas (además del Aneto, que se genera con build_detalle.py).
Datos reales: MDT05 del IGN (5 m, LiDAR PNOA, CC BY 4.0) por el WCS de IDEE, interpolado con splines cúbicos a 1 m (200×200 m alrededor de la cima).
La posición de la cima sale del nodo natural=peak de OpenStreetMap (ODbL) y se contrasta con la reseña del vértice geodésico del IGN cuando existe.
Salida: data/terrain/cumbres/<id>-cima.bin.gz y entradas en detalles.json (conserva la del Aneto)."""
import json, os, math, gzip, subprocess, tempfile, sys
import numpy as np, rasterio
from rasterio.warp import transform
from scipy.ndimage import map_coordinates
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
meta = json.load(open(os.path.join(ROOT, 'data/terrain/meta.json'))); peaks = {p['id']: p for p in json.load(open(os.path.join(ROOT, 'data/peaks.json')))['picos']}
meta['nrows'] = meta.get('nrows0', meta['nrows'])   # el origen del mundo es la rejilla original: el mapa crece hacia el sur (ver js/geo.js y tools/build_terrain_sur.py)
OUT = os.path.join(ROOT, 'data/terrain/cumbres')
latC = meta['lat0'] - ((meta['nrows'] - 1) * meta['step']) / 2
mLat = 111132.0; mLon = 111320.0 * math.cos(math.radians(latC))
W = (meta['ncols'] - 1) * meta['step'] * mLon; D = (meta['nrows'] - 1) * meta['step'] * mLat
toXZ = lambda lon, lat: ((lon - meta['lon0']) * mLon - W / 2, (meta['lat0'] - lat) * mLat - D / 2)
fromXZ = lambda x, z: (meta['lon0'] + (x + W / 2) / mLon, meta['lat0'] - (z + D / 2) / mLat)
PASO, N = 1.0, 201
# id: (lat, lon de la cima en OSM, roca, fuentes). roca: granito | caliza | neutra
CIMAS = {
  'posets':    (42.654629, 0.435227, 'granito', 'OSM peak 42.654629,0.435227; IGN vértice 17999 (pilar 1,2 m, 1982) a 3 m; el IGN lo da por destruido el 21-12-2023. Macizo granítico Posets-Millares (DAMOCLES).'),
  'perdido':   (42.675548, 0.034357, 'caliza',  'OSM peak 42.675548,0.034357; IGN vértice 14660 (pilar 1,2 m, 1982) a 2 m, destruido el 26-12-2023; «El monte es muy pedregoso» (IGN). Macizo calcáreo (Ordesa-Monte Perdido).'),
  'maladeta':  (42.646432, 0.640276, 'granito', 'OSM peak 42.646432,0.640276 (CNIG). Macizo granítico de la Maladeta. Sin cruz ni vértice documentados.'),
  'balaitus':  (42.838917, -0.29025, 'neutra',  'Coordenada de la ficha (OSM/IGN). Pilar de hormigón en dos tramos sobre losa con placa de vértice geodésico, medallón y cartel «BALAITUS 3.145» según foto de la cima aportada por el usuario. Macizo de Balaitous (granodiorita); losas grises claras en la cima.'),
  'astorg':    (42.63945, 0.64261, 'granito', 'Coordenada de la ficha. Cresta granítica Maldito–Astorg–Medio. Cima: torre de dos lajas apiladas (la alta encima de una plana) sobre un montón de bloques, con una piedrita encima, según fotos de referencia del usuario (una con una persona de pie encima, para la escala).'),
  'garmo':     (42.771667, -0.264139, 'neutra',  'Coordenada de la ficha (OSM/IGN). Montón de bloques de roca pardo-rojiza con una laja grande pintada «PICO GARMO NEGRO 3051», según foto de la cima aportada por el usuario. Litología no verificada en esta sesión.'),
  'vignemale': (42.773943, -0.147344, 'neutra', 'OSM peak 42.773943,-0.147344 (Pique Longue). Bloque de hormigón con remache de hierro (IGN Francia, 1949, vu en place) sin confirmar hoy. Litología no verificada en esta sesión.'),
}
idx_path = os.path.join(OUT, 'detalles.json'); idx = json.load(open(idx_path))
SOLO = sys.argv[1:]   # opcional: ids a (re)generar; sin argumentos, todos
for pid, (lat0, lon0, roca, ref) in CIMAS.items():
    if SOLO and pid not in SOLO: continue
    web = peaks[pid]; dx = (web['lon'] - lon0) * mLon; dz = (web['lat'] - lat0) * mLat
    cx, cz = toXZ(lon0, lat0); x0 = round(cx - PASO * (N - 1) / 2, 2); z0 = round(cz - PASO * (N - 1) / 2, 2)
    xs = x0 + np.arange(N) * PASO; zs = z0 + np.arange(N) * PASO
    X, Z = np.meshgrid(xs, zs); lon, lat = fromXZ(X, Z)
    ux, uy = transform('EPSG:4326', 'EPSG:25830', lon.ravel().tolist(), lat.ravel().tolist()); ux = np.array(ux).reshape(N, N); uy = np.array(uy).reshape(N, N)
    a, b, c, d = ux.min() - 40, ux.max() + 40, uy.min() - 40, uy.max() + 40
    url = f'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=GetCoverage&CoverageId=Elevacion25830_5&subset=x({a:.0f},{b:.0f})&subset=y({c:.0f},{d:.0f})&format=image/tiff'
    tmp = tempfile.mktemp(suffix='.tif'); r = subprocess.run(['curl', '-s', '-m', '120', '-o', tmp, '-w', '%{http_code}', url], capture_output=True, text=True)
    if r.stdout != '200': print(pid, 'sin datos', r.stdout); continue
    with rasterio.open(tmp) as ds: h = ds.read(1).astype('f4'); t = ds.transform
    os.remove(tmp)
    bad = (h < 0) | (h > 5000); h[bad] = np.nan
    col = (ux - t.c) / t.a - 0.5; row = (uy - t.f) / t.e - 0.5
    v = map_coordinates(np.nan_to_num(h, nan=-1), [row, col], order=3, mode='nearest')
    sin = float((v < 0).mean()); v = np.where(v < 0, np.nanmean(h), v)
    out = np.round(v * 10).astype('<u2'); gzip.open(os.path.join(OUT, f'{pid}-cima.bin.gz'), 'wb', 9).write(out.tobytes())
    mx = np.unravel_index(np.argmax(v), v.shape); mxx, mxz = xs[mx[1]], zs[mx[0]]
    idx[pid] = dict(x0=x0, z0=z0, n=N, paso=PASO, archivo=f'{pid}-cima.bin.gz', roca=roca, ref=ref)
    print(f"{pid}: max MDT05 {v.max():.1f} m (web {web['altitud']} m), sin dato {sin*100:.0f} %, cima del MDT a {math.hypot(mxx - cx, mxz - cz):.0f} m del nodo OSM; web a {math.hypot(dx, dz):.0f} m del nodo OSM", flush=True)
idx['aneto']['roca'] = 'granito'
json.dump(idx, open(idx_path, 'w'), indent=1)

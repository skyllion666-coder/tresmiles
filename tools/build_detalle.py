#!/usr/bin/env python3
"""Detalle local del Paso de Mahoma (Aneto).
Datos reales: MDT05 del IGN (5 m, LiDAR PNOA, CC BY 4.0) vía WCS de IDEE; el eje de la arista («Paso de Mahoma», natural=arete), la cruz de cumbre
(summit:cross=yes) y las posiciones nombradas vienen de OpenStreetMap (ODbL, © colaboradores de OpenStreetMap).
Se interpola el MDT05 con splines cúbicos a una malla de 1 m (200×200 m centrados en la arista). Es la misma información que el MDT05, solo más suave:
los bloques de granito se añaden en el navegador como detalle procedural (aproximado). Salida: data/terrain/cumbres/aneto-mahoma.bin.gz y detalles.json."""
import json, os, math, gzip, subprocess, tempfile
import numpy as np, rasterio
from rasterio.warp import transform
from scipy.ndimage import map_coordinates
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
meta = json.load(open(os.path.join(ROOT, 'data/terrain/meta.json')))
meta['nrows'] = meta.get('nrows0', meta['nrows'])   # el origen del mundo es la rejilla original: el mapa crece hacia el sur (ver js/geo.js y tools/build_terrain_sur.py)
OUT = os.path.join(ROOT, 'data/terrain/cumbres')
latC = meta['lat0'] - ((meta['nrows'] - 1) * meta['step']) / 2
mLat = 111132.0; mLon = 111320.0 * math.cos(math.radians(latC))
W = (meta['ncols'] - 1) * meta['step'] * mLon; D = (meta['nrows'] - 1) * meta['step'] * mLat
toXZ = lambda lon, lat: ((lon - meta['lon0']) * mLon - W / 2, (meta['lat0'] - lat) * mLat - D / 2)
fromXZ = lambda x, z: (meta['lon0'] + (x + W / 2) / mLon, meta['lat0'] - (z + D / 2) / mLat)
# eje de la arista (OSM way 451568261, de la antecima hacia la cumbre) y cruz de cumbre (OSM node de la cumbre, summit:cross=yes)
CRESTA = [(42.63165, 0.656422), (42.631583, 0.65644), (42.631552, 0.656442), (42.631468, 0.656494), (42.631393, 0.656545), (42.6311462, 0.6566507)]
CENTRO = (42.63140, 0.65655); PASO, N = 1.0, 201
cx, cz = toXZ(CENTRO[1], CENTRO[0]); x0 = round(cx - PASO * (N - 1) / 2, 2); z0 = round(cz - PASO * (N - 1) / 2, 2)
xs = x0 + np.arange(N) * PASO; zs = z0 + np.arange(N) * PASO
X, Z = np.meshgrid(xs, zs); lon, lat = fromXZ(X, Z)
ux, uy = transform('EPSG:4326', 'EPSG:25830', lon.ravel().tolist(), lat.ravel().tolist()); ux = np.array(ux).reshape(N, N); uy = np.array(uy).reshape(N, N)
a, b, c, d = ux.min() - 40, ux.max() + 40, uy.min() - 40, uy.max() + 40
url = f'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=GetCoverage&CoverageId=Elevacion25830_5&subset=x({a:.0f},{b:.0f})&subset=y({c:.0f},{d:.0f})&format=image/tiff'
tmp = tempfile.mktemp(suffix='.tif'); r = subprocess.run(['curl', '-s', '-m', '120', '-o', tmp, '-w', '%{http_code}', url], capture_output=True, text=True); assert r.stdout == '200', r.stdout
with rasterio.open(tmp) as ds: h = ds.read(1).astype('f4'); t = ds.transform
os.remove(tmp)
col = (ux - t.c) / t.a - 0.5; row = (uy - t.f) / t.e - 0.5
v = map_coordinates(h, [row, col], order=3, mode='nearest')
out = np.round(v * 10).astype('<u2')
gzip.open(os.path.join(OUT, 'aneto-mahoma.bin.gz'), 'wb', 9).write(out.tobytes())
p = lambda ll: dict(zip('xz', [round(q, 2) for q in toXZ(ll[1], ll[0])]))
det = dict(aneto=dict(x0=x0, z0=z0, n=N, paso=PASO, archivo='aneto-mahoma.bin.gz', cresta=[p(q) for q in CRESTA], cruz=p(CRESTA[-1]),
    antecima=p(CRESTA[0]),
    tramo=dict(corredor=32, aproximacion=150, salida=60, central=[0.12, 0.56], nota='Eje: OSM way 451568261 (antecima→cruz). Sector estrecho (central) según el ancho del MDT05 a -3 m de la cresta (11-12 m, caídas de 10-20 m a 15 m del eje). corredor/aproximacion/salida en metros; central en fracción del eje.'),
    nota='Datos: MDT05 IGN (CC BY 4.0) y OpenStreetMap (ODbL). Los bloques son procedurales.'))
json.dump(det, open(os.path.join(OUT, 'detalles.json'), 'w'), indent=1)
print('ok', v.min(), v.max(), os.path.getsize(os.path.join(OUT, 'aneto-mahoma.bin.gz')) // 1024, 'KB', det['aneto']['cruz'], det['aneto']['antecima'])

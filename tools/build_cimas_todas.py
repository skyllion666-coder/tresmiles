#!/usr/bin/env python3
"""Relieve fino (1 m, 200 × 200 m) de la cima de TODOS los tresmiles de data/peaks.json, para que la web ponga encima las rocas con textura (js/rocas.js).
Misma fuente y método que tools/build_cimas.py (MDT05 del IGN por el WCS de IDEE, CC BY 4.0, interpolado con splines cúbicos a 1 m), pero:
- centra la malla en la coordenada de la ficha y no toca las entradas que ya existen en detalles.json (las que tienen modelo de Blender);
- `roca`: granito (Aneto–Maladeta, Posets–Eriste, Balaitús), caliza (Monte Perdido–Taillón e Infiernos), oscura (Garmo Negro, Posets), neutra (resto);
- `pieza`: la pieza de 6 m (data/terrain/cumbres/index.json) que contiene la cima (la web carga el detalle cuando esa pieza está cargada);
- descarta las cimas con más de un 25 % sin dato (lado francés: el MDT05 solo cubre España).
Uso: python3 tools/build_cimas_todas.py [id ...]   (sin ids: todas las que faltan)"""
import json, os, math, gzip, subprocess, tempfile, sys
from concurrent.futures import ThreadPoolExecutor
import numpy as np, rasterio
from rasterio.warp import transform
from scipy.ndimage import map_coordinates
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
meta = json.load(open(os.path.join(ROOT, 'data/terrain/meta.json'))); picos = json.load(open(os.path.join(ROOT, 'data/peaks.json')))['picos']
meta['nrows'] = meta.get('nrows0', meta['nrows'])   # el origen del mundo es la rejilla original: el mapa crece hacia el sur (ver js/geo.js y tools/build_terrain_sur.py)
OUT = os.path.join(ROOT, 'data/terrain/cumbres'); idx_path = os.path.join(OUT, 'detalles.json'); idx = json.load(open(idx_path)); piezas = json.load(open(os.path.join(OUT, 'index.json')))
latC = meta['lat0'] - ((meta['nrows'] - 1) * meta['step']) / 2
mLat = 111132.0; mLon = 111320.0 * math.cos(math.radians(latC))
W = (meta['ncols'] - 1) * meta['step'] * mLon; D = (meta['nrows'] - 1) * meta['step'] * mLat
toXZ = lambda lon, lat: ((lon - meta['lon0']) * mLon - W / 2, (meta['lat0'] - lat) * mLat - D / 2)
fromXZ = lambda x, z: (meta['lon0'] + (x + W / 2) / mLon, meta['lat0'] - (z + D / 2) / mLat)
PASO, N = 1.0, 201
def roca_de(p):
    i, m = p['id'], p['macizo']
    if 'garmo' in i or i == 'posets': return 'oscura'
    if 'infierno' in i or m == 'per': return 'caliza'
    return 'granito' if m in ('ane', 'pos', 'bal') else 'neutra'
def pieza_de(x0, z0):   # la pieza que contiene los 200 m enteros (con 20 m de margen), la que los tenga más centrados
    mejor = None
    for k, v in piezas.items():
        L = (v['n'] - 1) * v['paso']; m = min(x0 - v['x0'], v['x0'] + L - (x0 + 200), z0 - v['z0'], v['z0'] + L - (z0 + 200))
        if m >= 20 and (mejor is None or m > mejor[0]): mejor = (m, k)
    return mejor[1] if mejor else None
def hacer(p):
    pid = p['id']; cx, cz = toXZ(p['lon'], p['lat']); x0 = round(cx - 100, 2); z0 = round(cz - 100, 2)
    pz = pieza_de(x0, z0)
    if not pz: return pid, None, 'sin pieza'
    xs = x0 + np.arange(N) * PASO; zs = z0 + np.arange(N) * PASO
    X, Z = np.meshgrid(xs, zs); lon, lat = fromXZ(X, Z)
    ux, uy = transform('EPSG:4326', 'EPSG:25830', lon.ravel().tolist(), lat.ravel().tolist()); ux = np.array(ux).reshape(N, N); uy = np.array(uy).reshape(N, N)
    a, b, c, d = ux.min() - 40, ux.max() + 40, uy.min() - 40, uy.max() + 40
    url = f'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=GetCoverage&CoverageId=Elevacion25830_5&subset=x({a:.0f},{b:.0f})&subset=y({c:.0f},{d:.0f})&format=image/tiff'
    tmp = tempfile.mktemp(suffix='.tif')
    for _ in range(3):
        r = subprocess.run(['curl', '-s', '-m', '120', '-o', tmp, '-w', '%{http_code}', url], capture_output=True, text=True)
        if r.stdout == '200': break
    else: return pid, None, f'sin datos ({r.stdout})'
    with rasterio.open(tmp) as ds: h = ds.read(1).astype('f4'); t = ds.transform
    os.remove(tmp)
    bad = (h < 0) | (h > 5000); h[bad] = np.nan
    col = (ux - t.c) / t.a - 0.5; row = (uy - t.f) / t.e - 0.5
    v = map_coordinates(np.nan_to_num(h, nan=-1), [row, col], order=3, mode='nearest')
    sin = float((v < 0).mean())
    if sin > 0.25: return pid, None, f'{sin * 100:.0f} % sin dato'
    v = np.where(v < 0, np.nanmean(h), v)
    gzip.open(os.path.join(OUT, f'{pid}-cima.bin.gz'), 'wb', 9).write(np.round(v * 10).astype('<u2').tobytes())
    e = dict(x0=x0, z0=z0, n=N, paso=PASO, archivo=f'{pid}-cima.bin.gz', roca=roca_de(p), pieza=pz, ref='Coordenada de la ficha; MDT05 del IGN a 1 m. Rocas: js/rocas.js (biblioteca con texturas escaneadas).')
    if pz == pid: e.pop('pieza')
    return pid, e, f'máx {v.max():.0f} m (ficha {p["altitud"]}), sin dato {sin * 100:.0f} %, pieza {pz}'
ids = set(sys.argv[1:])
todo = [p for p in picos if (p['id'] in ids) or (not ids and p['id'] not in idx)]
print(len(todo), 'cimas', flush=True)
with ThreadPoolExecutor(4) as ex:
    for pid, e, txt in ex.map(hacer, todo):
        print(pid, txt, flush=True)
        if e: idx[pid] = e
for k, v in idx.items():   # las de antes (con modelo) también apuntan a su pieza si no tienen una propia
    if k not in piezas and 'pieza' not in v: v['pieza'] = pieza_de(v['x0'], v['z0'])
json.dump(idx, open(idx_path, 'w'), ensure_ascii=False, indent=1)
print('detalles:', len(idx))

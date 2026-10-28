#!/usr/bin/env python3
"""Mallas de alta resolución de la zona de cada cumbre activa a partir del MDT05 del IGN (5 m, CC BY 4.0, © Instituto Geográfico Nacional de España),
servido por el WCS de IDEE (Elevacion25830_5). El relieve general (GLO-30, ~23×31 m) no distingue crestas estrechas como el Paso de Mahoma;
estas piezas locales sí. Se remuestrean a la rejilla local de la web (x este, z sur, metros) con paso de 6 m.
Salida: data/terrain/cumbres/index.json  {id: {x0, z0, n, paso}}  y  data/terrain/cumbres/<id>.bin.gz  (u16 LE, decímetros, n×n; 0 = sin dato).
Uso: python3 tools/build_cumbres.py [id ...]"""
import json, os, sys, gzip, subprocess, math, tempfile
import numpy as np, rasterio
from rasterio.warp import transform
from scipy.ndimage import map_coordinates
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
meta = json.load(open(os.path.join(ROOT, 'data/terrain/meta.json')))
meta['nrows'] = meta.get('nrows0', meta['nrows'])   # el origen del mundo es la rejilla original: el mapa crece hacia el sur (ver js/geo.js y tools/build_terrain_sur.py)
peaks = json.load(open(os.path.join(ROOT, 'data/peaks.json')))
OUT = os.path.join(ROOT, 'data/terrain/cumbres'); os.makedirs(OUT, exist_ok=True)
latC = meta['lat0'] - ((meta['nrows'] - 1) * meta['step']) / 2
mLat = 111132.0; mLon = 111320.0 * math.cos(math.radians(latC))
W = (meta['ncols'] - 1) * meta['step'] * mLon; D = (meta['nrows'] - 1) * meta['step'] * mLat
# tono de la roca de las paredes (js/terrain.js crearMaterialPieza); sin entrada, granito. Sierras Exteriores y Guara: caliza, y conglomerado en los mallos
ROCA = {**{k: 'conglomerado' for k in ('pena-de-san-miguel', 'pena-de-l-aman', 'mallo-san-jorge')},
        **{k: 'caliza' for k in ('tozal-de-guara', 'tozal-de-cubilars', 'punta-vallemona', 'cabezo-de-guara', 'pico-fraxinito', 'la-gabardiella', 'tozal-de-sevill',
                                 'pico-de-luna', 'pico-del-aguila', 'tozal-de-gratal', 'el-turbon', 'pena-montanesa-o-picon-de-libro', 'cotiella')}}
PASO, N, R = 6.0, 280, 840.0    # N*PASO/2 = R
toXZ = lambda lon, lat: ((lon - meta['lon0']) * mLon - W / 2, (meta['lat0'] - lat) * mLat - D / 2)
fromXZ = lambda x, z: (meta['lon0'] + (x + W / 2) / mLon, meta['lat0'] - (z + D / 2) / mLat)
ids = sys.argv[1:] or peaks['activos']
idx_path = os.path.join(OUT, 'index.json'); idx = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
byid = {p['id']: p for p in peaks['picos']}
men = os.path.join(ROOT, 'data/menores.json')   # también las cumbres de menos de 3.000 m (ficha sencilla), p. ej. las de la Sierra de Guara
if os.path.exists(men): byid.update({p['id']: p for p in json.load(open(men))['picos'] if p['id'] not in byid})
for pid in ids:
    p = byid[pid]; cx, cz = toXZ(p['lon'], p['lat'])
    x0, z0 = round(cx - R), round(cz - R)
    xs = x0 + np.arange(N) * PASO; zs = z0 + np.arange(N) * PASO
    X, Z = np.meshgrid(xs, zs); lon, lat = fromXZ(X, Z)
    ux, uy = transform('EPSG:4326', 'EPSG:25830', lon.ravel().tolist(), lat.ravel().tolist()); ux = np.array(ux).reshape(N, N); uy = np.array(uy).reshape(N, N)
    a, b, c, d = ux.min() - 30, ux.max() + 30, uy.min() - 30, uy.max() + 30
    url = f'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=GetCoverage&CoverageId=Elevacion25830_5&subset=x({a:.0f},{b:.0f})&subset=y({c:.0f},{d:.0f})&format=image/tiff'
    tmp = tempfile.mktemp(suffix='.tif'); ok = False
    for intento in range(3):
        r = subprocess.run(['curl', '-s', '-m', '120', '-o', tmp, '-w', '%{http_code}', url], capture_output=True, text=True)
        if r.stdout == '200' and os.path.getsize(tmp) > 2000: ok = True; break
    if not ok: print(pid, 'sin datos del WCS'); continue
    with rasterio.open(tmp) as ds:
        h = ds.read(1).astype('f4'); t = ds.transform
    os.remove(tmp)
    h[(h < 0) | (h > 5000)] = np.nan
    col = (ux - t.c) / t.a - 0.5; row = (uy - t.f) / t.e - 0.5
    inside = (col >= 0) & (row >= 0) & (col <= h.shape[1] - 1) & (row <= h.shape[0] - 1)
    v = map_coordinates(np.nan_to_num(h, nan=-1), [row, col], order=1, mode='nearest')
    bad = ~inside | (v < 0) | (map_coordinates(np.isnan(h).astype('f4'), [row, col], order=1, mode='nearest') > 0.01)
    out = np.where(bad, 0, np.round(v * 10)).astype('<u2')
    gzip.open(os.path.join(OUT, f'{pid}.bin.gz'), 'wb', 9).write(out.tobytes())
    idx[pid] = dict(x0=x0, z0=z0, n=N, paso=PASO, **({'roca': ROCA[pid]} if pid in ROCA else {}))
    print(pid, 'ok', f'max {out.max() / 10:.0f} m, sin dato {bad.mean() * 100:.0f} %', os.path.getsize(os.path.join(OUT, f'{pid}.bin.gz')) // 1024, 'KB', flush=True)
json.dump(idx, open(idx_path, 'w'))

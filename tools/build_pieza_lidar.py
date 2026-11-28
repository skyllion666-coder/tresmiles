#!/usr/bin/env python3
"""Pieza fina de la web (data/terrain/cumbres/<id>.bin.gz, como tools/build_cumbres.py) hecha con el relieve LiDAR de 1 m de un paquete de zona
(~/tresmiles-fuentes/lidar/<zona>_mdt1m.tif, tools/lidar_mdt.py; LiDAR PNOA del IGN, CC BY 4.0) en vez del MDT05, y con un paso más fino (3 m por defecto).
Donde el LiDAR no llega se rellena con el MDT05 (WCS de IDEE). Para paredes muy verticales y visitadas (Mallos de Riglos).
Uso: python3 tools/build_pieza_lidar.py <id> <mdt1m.tif> [--paso 3] [--x0 X --z0 Z] [--lado 1674]
  sin --x0/--z0: centrada en la cumbre <id> (o conserva el x0/z0 que ya tenga en index.json). Después: tools/build_orto.py <id> y tools/igualar_orto.py <id>."""
import argparse, gzip, json, math, os, subprocess, tempfile
import numpy as np, rasterio
from rasterio.warp import transform
from scipy.ndimage import map_coordinates

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
meta = json.load(open(os.path.join(ROOT, 'data/terrain/meta.json'))); meta['nrows'] = meta.get('nrows0', meta['nrows'])
if meta.get('iw'): meta['lon0'] += meta['iw'] * meta['chunk'] * meta['step']; meta['ncols'] = meta['ncols0']   # x = 0 en el centro de las columnas originales
latC = meta['lat0'] - ((meta['nrows'] - 1) * meta['step']) / 2
mLat = 111132.0; mLon = 111320.0 * math.cos(math.radians(latC))
W = (meta['ncols'] - 1) * meta['step'] * mLon; D = (meta['nrows'] - 1) * meta['step'] * mLat
toXZ = lambda lon, lat: ((lon - meta['lon0']) * mLon - W / 2, (meta['lat0'] - lat) * mLat - D / 2)
fromXZ = lambda x, z: (meta['lon0'] + (x + W / 2) / mLon, meta['lat0'] - (z + D / 2) / mLat)

ap = argparse.ArgumentParser(); ap.add_argument('id'); ap.add_argument('tif')
ap.add_argument('--paso', type=float, default=3.0); ap.add_argument('--lado', type=float, default=1674.0)
ap.add_argument('--x0', type=float); ap.add_argument('--z0', type=float); ap.add_argument('--roca', default='conglomerado')
a = ap.parse_args()
OUT = os.path.join(ROOT, 'data/terrain/cumbres'); idx_path = os.path.join(OUT, 'index.json'); idx = json.load(open(idx_path))
N = int(round(a.lado / a.paso)) + 1
if a.x0 is not None: x0, z0 = round(a.x0), round(a.z0)
elif a.id in idx: x0, z0 = idx[a.id]['x0'], idx[a.id]['z0']
else:
    picos = json.load(open(os.path.join(ROOT, 'data/peaks.json')))['picos'] + json.load(open(os.path.join(ROOT, 'data/menores.json')))['picos']
    p = next(q for q in picos if q['id'] == a.id); cx, cz = toXZ(p['lon'], p['lat']); x0, z0 = round(cx - a.lado / 2), round(cz - a.lado / 2)
X, Z = np.meshgrid(x0 + np.arange(N) * a.paso, z0 + np.arange(N) * a.paso); lon, lat = fromXZ(X, Z)

def muestrea(h, t, crs):   # alturas de la rejilla de la pieza en el ráster (bilineal); NaN fuera o sin dato
    ux, uy = transform('EPSG:4326', crs, lon.ravel().tolist(), lat.ravel().tolist()); ux = np.array(ux).reshape(N, N); uy = np.array(uy).reshape(N, N)
    col = (ux - t.c) / t.a - 0.5; row = (uy - t.f) / t.e - 0.5
    dentro = (col >= 0) & (row >= 0) & (col <= h.shape[1] - 1) & (row <= h.shape[0] - 1)
    v = map_coordinates(np.nan_to_num(h, nan=-1), [row, col], order=1, mode='nearest')
    malo = ~dentro | (v < 0) | (map_coordinates(np.isnan(h).astype('f4'), [row, col], order=1, mode='nearest') > 0.01)
    return np.where(malo, np.nan, v), ux, uy

with rasterio.open(a.tif) as ds:
    h = ds.read(1).astype('f4'); nd = ds.nodata; crs = ds.crs.to_string(); t = ds.transform
if nd is not None: h[h == nd] = np.nan
h[(h < 0) | (h > 5000)] = np.nan
v, _, _ = muestrea(h, t, crs); lid = np.isfinite(v).mean()
if not np.isfinite(v).all():   # relleno con el MDT05 donde el LiDAR no llega
    ux, uy = transform('EPSG:4326', 'EPSG:25830', lon.ravel().tolist(), lat.ravel().tolist())
    b = (min(ux) - 30, max(ux) + 30, min(uy) - 30, max(uy) + 30); tmp = tempfile.mktemp(suffix='.tif')
    url = f'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=GetCoverage&CoverageId=Elevacion25830_5&subset=x({b[0]:.0f},{b[1]:.0f})&subset=y({b[2]:.0f},{b[3]:.0f})&format=image/tiff'
    if subprocess.run(['curl', '-s', '-m', '180', '-o', tmp, '-w', '%{http_code}', url], capture_output=True, text=True).stdout == '200':
        with rasterio.open(tmp) as ds: h5 = ds.read(1).astype('f4'); t5 = ds.transform
        h5[(h5 < 0) | (h5 > 5000)] = np.nan; v5, _, _ = muestrea(h5, t5, 'EPSG:25830'); v = np.where(np.isfinite(v), v, v5); os.remove(tmp)
out = np.where(np.isfinite(v), np.round(v * 10), 0).astype('<u2')
gzip.open(os.path.join(OUT, f'{a.id}.bin.gz'), 'wb', 9).write(out.tobytes())
viejo = idx.get(a.id, {}); idx[a.id] = dict(x0=x0, z0=z0, n=N, paso=a.paso, roca=a.roca, lidar=True, **{k: viejo[k] for k in ('orto', 'ortoM', 'og') if k in viejo})
json.dump(idx, open(idx_path, 'w'))
print(a.id, f'n {N} paso {a.paso} m · LiDAR {lid * 100:.0f} % · sin dato {(out == 0).mean() * 100:.1f} % · máx {out.max() / 10:.0f} m ·',
      os.path.getsize(os.path.join(OUT, f'{a.id}.bin.gz')) // 1024, 'KB')

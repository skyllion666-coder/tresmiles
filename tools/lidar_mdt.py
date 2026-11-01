#!/usr/bin/env python3
"""Relieve de 1 m a partir de las nubes de puntos LiDAR del PNOA (3.ª cobertura, IGN, CC BY 4.0, © Instituto Geográfico Nacional de España),
bajadas del Centro de Descargas del CNIG (archivos .laz de 1 × 1 km, ETRS89 UTM, alturas ortométricas).
Se usan solo los puntos de suelo (clase 2): en cada celda de 1 m, la media de sus alturas; los huecos pequeños (bajo rocas o agua) se rellenan
con el valor más cercano dentro del mismo archivo, y donde no hay archivo queda sin dato (NaN).
Salida: un GeoTIFF float32 de 1 m (EPSG:25830 o el huso de los archivos) con todo el recorrido.
Necesita laspy con lazrs (entorno ~/.venvs/lidar). Uso: ~/.venvs/lidar/bin/python tools/lidar_mdt.py <carpeta de .laz> <salida.tif>"""
import glob, os, re, sys
import numpy as np, laspy, rasterio
from rasterio.transform import from_origin
from scipy.ndimage import distance_transform_edt

carpeta, salida = sys.argv[1], sys.argv[2]
archivos = sorted(glob.glob(os.path.join(carpeta, '*.laz')))
tes = [(int(m.group(1)), int(m.group(2)), f) for f in archivos if (m := re.search(r'_(\d{3})-(\d{4})_', os.path.basename(f)))]   # km x (oeste) y km y (norte)
x0 = min(t[0] for t in tes) * 1000; x1 = (max(t[0] for t in tes) + 1) * 1000
y1 = max(t[1] for t in tes) * 1000; y0 = (min(t[1] for t in tes) - 1) * 1000
W, H = x1 - x0, y1 - y0
M = np.full((H, W), np.nan, np.float32)
for kx, ky, f in tes:
    las = laspy.read(f); g = np.asarray(las.classification) == 2
    x = np.asarray(las.x)[g]; y = np.asarray(las.y)[g]; z = np.asarray(las.z)[g]
    ox, oy = kx * 1000, ky * 1000   # esquina noroeste del archivo
    ix = np.clip((x - ox).astype(int), 0, 999); iy = np.clip((oy - y).astype(int), 0, 999); k = iy * 1000 + ix
    s = np.bincount(k, z, 1_000_000); n = np.bincount(k, None, 1_000_000)
    D = np.where(n > 0, s / np.maximum(n, 1), np.nan).reshape(1000, 1000)
    hueco = np.isnan(D)
    if hueco.all(): continue
    if hueco.any(): D = D[tuple(distance_transform_edt(hueco, return_distances=False, return_indices=True))]
    r, c = (y1 - oy), (ox - x0)
    M[r:r + 1000, c:c + 1000] = D
    print(os.path.basename(f), f'suelo {g.sum():,}', f'huecos {hueco.mean() * 100:.1f} %', flush=True)
crs = 'EPSG:25830' if '_H30_' in tes[0][2] else 'EPSG:25831' if '_H31_' in tes[0][2] else 'EPSG:25829'   # huso del nombre del archivo (H30…)
with rasterio.open(salida, 'w', driver='GTiff', width=W, height=H, count=1, dtype='float32', crs=crs, transform=from_origin(x0, y1, 1, 1), nodata=np.nan, compress='deflate', predictor=3, tiled=True) as ds:
    ds.write(M, 1)
print(salida, W, 'x', H, 'm', f'sin dato {np.isnan(M).mean() * 100:.0f} %')

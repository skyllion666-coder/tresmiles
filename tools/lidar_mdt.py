#!/usr/bin/env python3
"""Relieve de 1 m a partir de las nubes de puntos LiDAR del PNOA (3.ª cobertura, IGN, CC BY 4.0, © Instituto Geográfico Nacional de España),
bajadas del Centro de Descargas del CNIG (archivos .laz de 1 × 1 km, ETRS89 UTM, alturas ortométricas).
Se usan solo los puntos de suelo (clase 2): en cada celda de 1 m, la media de sus alturas; los huecos pequeños (bajo rocas o agua) se rellenan
con el valor más cercano dentro del mismo archivo, y donde no hay archivo queda sin dato (NaN).
Salida: un GeoTIFF float32 de 1 m (EPSG:25830 o el huso de los archivos; si hay de dos husos, el más frecuente, y los del otro se reproyectan) con todo el recorrido.
Necesita laspy con lazrs (entorno ~/.venvs/lidar). Uso: ~/.venvs/lidar/bin/python tools/lidar_mdt.py <carpeta de .laz> <salida.tif>"""
import glob, os, re, sys
import numpy as np, laspy, rasterio
from rasterio.transform import from_origin
from scipy.ndimage import distance_transform_edt

carpeta, salida = sys.argv[1], sys.argv[2]
archivos = sorted(glob.glob(os.path.join(carpeta, '*.laz')))
huso = lambda f: 'EPSG:25830' if '_H30_' in f else 'EPSG:25831' if '_H31_' in f else 'EPSG:25829'   # huso del nombre del archivo (H30…)
todas = [(int(m.group(1)), int(m.group(2)), f) for f in archivos if (m := re.search(r'_(\d{3})-(\d{4})_', os.path.basename(f)))]   # km x (oeste) y km y (norte)
husos = [huso(t[2]) for t in todas]; crs = max(set(husos), key=husos.count)   # zonas en la raya de dos husos: salida en el más frecuente
tes = [t for t, h in zip(todas, husos) if h == crs]; otros = [t for t, h in zip(todas, husos) if h != crs]
from rasterio.warp import transform as reproy
def esquinas(t):   # km de la tesela de otro huso pasados al huso de salida
    h = huso(t[2]); xs, ys = reproy(h, crs, [t[0] * 1000, t[0] * 1000 + 1000] * 2, [t[1] * 1000, t[1] * 1000, t[1] * 1000 - 1000, t[1] * 1000 - 1000]); return xs, ys
bx = [t[0] * 1000 for t in tes] + [t[0] * 1000 + 1000 for t in tes]; by = [t[1] * 1000 for t in tes] + [t[1] * 1000 - 1000 for t in tes]
for t in otros: xs, ys = esquinas(t); bx += xs; by += ys
x0 = int(min(bx) // 1000) * 1000; x1 = int(-(-max(bx) // 1000)) * 1000
y1 = int(-(-max(by) // 1000)) * 1000; y0 = int(min(by) // 1000) * 1000
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
for kx, ky, f in otros:   # teselas del otro huso: sus puntos de suelo pasados al huso de salida; solo rellenan donde no hay dato
    las = laspy.read(f); g = np.asarray(las.classification) == 2
    xs, ys = reproy(huso(f), crs, np.asarray(las.x)[g].tolist(), np.asarray(las.y)[g].tolist()); z = np.asarray(las.z)[g]
    ix = np.asarray(xs).astype(int) - x0; iy = y1 - np.ceil(np.asarray(ys)).astype(int); ok = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
    ix, iy, z = ix[ok], iy[ok], z[ok]
    if not len(z): continue
    a, b, c, d = ix.min(), ix.max() + 1, iy.min(), iy.max() + 1; w = b - a   # solo el recuadro de esta tesela (no toda la zona: memoria)
    k = (iy - c) * w + (ix - a); s = np.bincount(k, z, w * (d - c)).reshape(d - c, w); n = np.bincount(k, None, w * (d - c)).reshape(d - c, w)
    sub = M[c:d, a:b]; nuevo = np.isnan(sub) & (n > 0); sub[nuevo] = (s / np.maximum(n, 1))[nuevo]
    h = np.isnan(sub)
    if h.any() and (~h).any():   # huecos pequeños (≤ 3 m) del reproyectado: el valor más cercano
        dist, (ri, ci) = distance_transform_edt(h, return_distances=True, return_indices=True); r = h & (dist <= 3); sub[r] = sub[ri[r], ci[r]]
    print(os.path.basename(f), f'suelo {g.sum():,} (otro huso → {crs})', flush=True); del s, n
with rasterio.open(salida, 'w', driver='GTiff', width=W, height=H, count=1, dtype='float32', crs=crs, transform=from_origin(x0, y1, 1, 1), nodata=np.nan, compress='deflate', predictor=3, tiled=True) as ds:
    ds.write(M, 1)
print(salida, W, 'x', H, 'm', f'sin dato {np.isnan(M).mean() * 100:.0f} %')

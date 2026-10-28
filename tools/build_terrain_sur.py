#!/usr/bin/env python3
"""Amplía el relieve de la web hacia el sur (Sierra de Guara) sin tocar los bloques ya publicados.

Los 9×3 bloques de data/terrain (de lat 42,99 a 42,56) se quedan tal cual; se añaden las filas j = 3..6 (hasta lat ~41,99) con la misma receta que
tools/build_terrain.py: alturas Copernicus GLO-30 (1" ≈ 30 m, mosaico N42 W001 + E000 de ~/Tresmiles/data/dem, solo lectura; el borde sur, bajo 42° N, sale de
GLO-90 N41 remuestreado) y textura Sentinel-2 cloudless 2016 (EOX, CC BY 4.0) de las teselas z14 (las del vídeo en ~/Tresmiles/data/imagery y las nuevas
en ~/tresmiles-fuentes/guara/s2_z14, que baja fetch_sur.py).
Cambia: meta.json (nrows, ncj, tiles, hmin/hmax y `nrows0` = filas originales: js/geo.js fija el origen del mundo con él), overview.bin (todas las filas),
h/ (filas 2..6: la fila 2 gana su muestra de margen real), lo/ y hi/ (filas nuevas).
Uso: ~/venv-tresmiles/bin/python tools/build_terrain_sur.py [filas_nuevas=4]"""
import json, math, os, sys
import numpy as np, tifffile
from PIL import Image, ImageFilter
from scipy.ndimage import map_coordinates, zoom

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'data', 'terrain')
DEM = os.path.expanduser('~/Tresmiles/data/dem')
TILES = [os.path.expanduser('~/Tresmiles/data/imagery/s2_2016_z14'), os.path.expanduser('~/tresmiles-fuentes/guara/s2_z14')]
NUEVAS = int(sys.argv[1]) if len(sys.argv) > 1 else 4
CH, LO, HI, TEXN = 512, 384, 1536, 2048
C0, R0 = 1692, 36                       # origen del bloque 0 en el mosaico de 1" (origen -1E, 43N), igual que prep_terrain.py
STEP = 1 / 3600

meta = json.load(open(os.path.join(OUT, 'meta.json')))
NR0 = meta.get('nrows0', meta['nrows'])
NCI, NCJ0 = meta['nci'], (NR0 - 1) // CH
NCJ = NCJ0 + NUEVAS
NC, NR = meta['ncols'], NCJ * CH + 1
assert abs(meta['step'] - STEP) < 1e-12 and NC == NCI * CH + 1

# ---------- alturas ----------
w = tifffile.imread(f'{DEM}/Copernicus_DSM_COG_10_N42_00_W001_00_DEM.tif'); e = tifffile.imread(f'{DEM}/Copernicus_DSM_COG_10_N42_00_E000_00_DEM.tif')
n42 = np.concatenate([w, e], axis=1)
filas_n42 = n42.shape[0] - R0           # filas del relieve que caben en N42 (de 43 a 42)
if R0 + NR > n42.shape[0]:              # el resto sale de GLO-90 N41 (3") ×3, solo es el borde sur
    n41 = np.concatenate([tifffile.imread(f'{DEM}/Copernicus_DSM_COG_30_N41_00_W001_00_DEM.tif'), tifffile.imread(f'{DEM}/Copernicus_DSM_COG_30_N41_00_E000_00_DEM.tif')], axis=1)
    falta = R0 + NR - n42.shape[0]
    z = zoom(n41[:falta // 3 + 3].astype(np.float32), 3, order=1)[:falta]
    full = np.concatenate([n42, z.astype(n42.dtype)], axis=0)
else:
    full = n42
h = np.clip(full[R0:R0 + NR, C0:C0 + NC].astype(np.float32), 0, 6000)
sub = np.ascontiguousarray(np.round(h * 10).astype('<u2'))
assert sub.shape == (NR, NC), sub.shape
print('alturas', sub.shape, 'mín', sub.min() * 0.1, 'máx', sub.max() * 0.1, flush=True)

def nivel(i, j, s):
    n = CH // s
    cc = np.clip(i * CH + np.arange(-1, n + 2) * s, 0, NC - 1)
    rr = np.clip(j * CH + np.arange(-1, n + 2) * s, 0, NR - 1)
    return sub[np.ix_(rr, cc)].astype('<u2')

# ---------- texturas ----------
cache = {}
def tile(x, y):
    k = (x, y)
    if k not in cache:
        cache[k] = None
        for d in TILES:
            f = f'{d}/{y}_{x}.jpg'
            if os.path.exists(f): cache[k] = np.asarray(Image.open(f).convert('RGB')); break
    return cache[k]

def muestra(lon, lat, z=14):
    n = 2 ** z
    px = (lon + 180) / 360 * n * 256
    py = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / math.pi) / 2 * n * 256
    x0, x1 = int(px.min() // 256), int(px.max() // 256); y0, y1 = int(py.min() // 256), int(py.max() // 256)
    mos = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256, 3), np.uint8); falta = 0
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            t = tile(tx, ty)
            if t is None: falta += 1; continue
            mos[(ty - y0) * 256:(ty - y0 + 1) * 256, (tx - x0) * 256:(tx - x0 + 1) * 256] = t
    cy, cx = py - y0 * 256 - 0.5, px - x0 * 256 - 0.5
    return np.stack([map_coordinates(mos[..., c], [cy, cx], order=1, mode='nearest') for c in range(3)], -1), falta

os.makedirs(os.path.join(OUT, 'h'), exist_ok=True)
tiles = [dict(i=i, j=j, f=f'c_{i}_{j}.jpg') for j in range(NCJ) for i in range(NCI)]
tot = dict(h=0, lo=0, hi=0)
for j in range(NCJ0 - 1, NCJ):          # la última fila vieja solo reescribe alturas (gana el margen real)
    for i in range(NCI):
        for s in (4, 2, 1):
            b = nivel(i, j, s).tobytes(); open(os.path.join(OUT, 'h', f'c_{i}_{j}_{s}.bin'), 'wb').write(b); tot['h'] += len(b)
        if j < NCJ0: continue
        lon_a = meta['lon0'] + i * CH * STEP; lat_a = meta['lat0'] - j * CH * STEP
        u = (np.arange(TEXN) + 0.5) / TEXN
        LON, LAT = np.meshgrid(lon_a + u * CH * STEP, lat_a - u * CH * STEP)
        img, falta = muestra(LON, LAT)
        im = Image.fromarray(img).filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))
        for sz, d, q in ((LO, 'lo', 76), (HI, 'hi', 80)):
            p = os.path.join(OUT, d, f'c_{i}_{j}.jpg'); os.makedirs(os.path.dirname(p), exist_ok=True)
            im.resize((sz, sz), Image.LANCZOS).save(p, quality=q, optimize=True, progressive=True); tot[d] += os.path.getsize(p)
        print('bloque', i, j, 'teselas ausentes', falta, flush=True)

with open(os.path.join(OUT, 'overview.bin'), 'wb') as fo:
    for j in range(NCJ):
        for i in range(NCI): fo.write(nivel(i, j, 8).tobytes())

meta.update(nrows=int(NR), ncj=NCJ, nrows0=int(NR0), hmin=float(sub.min()) * 0.1, hmax=float(sub.max()) * 0.1, tiles=tiles)
json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)
print(f"listo: {NCI}x{NCJ} bloques · alturas {tot['h'] / 1e6:.1f} MB · lo {tot['lo'] / 1e6:.1f} MB · hi {tot['hi'] / 1e6:.1f} MB")
print(f"lat {meta['lat0'] - (NR - 1) * STEP:.4f}..{meta['lat0']:.4f}")

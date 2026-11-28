#!/usr/bin/env python3
"""Amplía el relieve de la web hacia el oeste (Mallos de Riglos y de Agüero, Peña Rueba, valle de Hecho) sin mover nada de lo publicado.

Se añaden NUEVAS columnas de bloques (512 celdas de 1″ cada una) al oeste de las 9 que había. Los bloques viejos no se tocan, salvo la muestra de
margen oeste de la columna que era la 0 (ahora tiene vecino de verdad). Los bloques nuevos salen con la misma receta que tools/build_terrain_sur.py:
alturas Copernicus GLO-30 (mosaico N42 W001, y GLO-90 N41 bajo 42° N) y textura Sentinel-2 cloudless 2016 (EOX, CC BY 4.0) z14
(~/tresmiles-fuentes/oeste/s2_z14, que baja ~/tresmiles-fuentes/oeste/fetch_oeste.py). La columna de muestras compartida con los bloques viejos se
copia de ellos (así el relieve enlaza sin escalón).

Nombres de archivo: el bloque i de la rejilla se guarda como c_<i - iw>_<j>: los viejos siguen llamándose igual y los nuevos son c_-1_j, c_-2_j…
meta.json: lon0 (nuevo borde oeste), ncols, nci, tiles (i desplazado; f con el nombre), `ncols0` (columnas originales) e `iw` (bloques añadidos al
oeste): js/geo.js fija con ellos el origen del mundo (x = 0 sigue donde estaba). `v` sube y `vh0` marca qué archivos de alturas cambian (los de
nombre ≤ 0 llevan ?v=). Reescribe overview.bin (los bloques viejos copiados tal cual).
Uso: ~/venv-tresmiles/bin/python tools/build_terrain_oeste.py [columnas_nuevas=2]"""
import json, math, os, shutil, sys
import numpy as np, tifffile
from PIL import Image, ImageFilter
from scipy.ndimage import map_coordinates, zoom

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'data', 'terrain')
DEM = os.path.expanduser('~/Tresmiles/data/dem')
TILES = [os.path.expanduser('~/Tresmiles/data/imagery/s2_2016_z14'), os.path.expanduser('~/tresmiles-fuentes/guara/s2_z14'), os.path.expanduser('~/tresmiles-fuentes/oeste/s2_z14')]
NUEVAS = int(sys.argv[1]) if len(sys.argv) > 1 else 2
CH, LO, HI, TEXN = 512, 384, 1536, 2048
C0, R0 = 1692, 36                       # origen del bloque viejo 0 en el mosaico de 1″ (origen -1E, 43N)
STEP = 1 / 3600

meta = json.load(open(os.path.join(OUT, 'meta.json')))
assert meta.get('iw', 0) == 0, 'ya ampliado al oeste'
shutil.copy(os.path.join(OUT, 'meta.json'), os.path.expanduser('~/tresmiles-fuentes/oeste/meta_antes.json'))
shutil.copy(os.path.join(OUT, 'overview.bin'), os.path.expanduser('~/tresmiles-fuentes/oeste/overview_antes.bin'))
NCI0, NCJ, NR = meta['nci'], meta['ncj'], meta['nrows']
NW = NUEVAS * CH                        # columnas añadidas
NC = NW + CH + 1                        # columnas que se calculan aquí: las nuevas + el bloque viejo 0 (para márgenes y enlace)
CW = C0 - NW; assert CW >= 1

# ---------- alturas ----------
w = tifffile.imread(f'{DEM}/Copernicus_DSM_COG_10_N42_00_W001_00_DEM.tif')
if R0 + NR > w.shape[0]:
    n41 = tifffile.imread(f'{DEM}/Copernicus_DSM_COG_30_N41_00_W001_00_DEM.tif')
    falta = R0 + NR - w.shape[0]
    z = zoom(n41[:falta // 3 + 3].astype(np.float32), 3, order=1)[:falta]
    w = np.concatenate([w, z.astype(w.dtype)], axis=0)
h = np.clip(w[R0:R0 + NR, CW:CW + NC].astype(np.float32), 0, 6000)
sub = np.round(h * 10).astype('<u2')
# columnas del bloque viejo 0: se copian de sus archivos (nivel 1) para que el relieve enlace exactamente
for j in range(NCJ):
    a = np.fromfile(os.path.join(OUT, 'h', f'c_0_{j}_1.bin'), '<u2').reshape(CH + 3, CH + 3)
    r0, r1 = j * CH, min(NR, j * CH + CH + 1)
    sub[r0:r1, NW:NW + CH + 1] = a[1:1 + r1 - r0, 1:CH + 2]
print('alturas', sub.shape, 'mín', sub.min() * 0.1, 'máx', sub.max() * 0.1, flush=True)

def nivel(i, j, s):                     # i: índice de bloque en esta franja (0..NUEVAS)
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

lon0n = meta['lon0'] - NW * STEP
tot = dict(h=0, lo=0, hi=0)
for j in range(NCJ):
    for i in range(NUEVAS + 1):
        nombre = i - NUEVAS             # -2, -1 nuevos; 0 = bloque viejo (solo se rehace su margen oeste)
        for s in (4, 2, 1):
            p = os.path.join(OUT, 'h', f'c_{nombre}_{j}_{s}.bin')
            if nombre == 0:
                a = np.fromfile(p, '<u2').reshape(CH // s + 3, CH // s + 3); a[:, 0] = nivel(i, j, s)[:, 0]; b = a.tobytes()
            else:
                b = nivel(i, j, s).tobytes()
            open(p, 'wb').write(b); tot['h'] += len(b)
        if nombre == 0: continue
        lon_a = lon0n + i * CH * STEP; lat_a = meta['lat0'] - j * CH * STEP
        u = (np.arange(TEXN) + 0.5) / TEXN
        LON, LAT = np.meshgrid(lon_a + u * CH * STEP, lat_a - u * CH * STEP)
        img, falta = muestra(LON, LAT)
        im = Image.fromarray(img).filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))
        for sz, d, q in ((LO, 'lo', 76), (HI, 'hi', 80)):
            p = os.path.join(OUT, d, f'c_{nombre}_{j}.jpg')
            im.resize((sz, sz), Image.LANCZOS).save(p, quality=q, optimize=True, progressive=True); tot[d] += os.path.getsize(p)
        print('bloque', nombre, j, 'teselas ausentes', falta, flush=True)

# overview: nivel 8 de todos los bloques, fila a fila; los viejos se copian del overview anterior
dim = CH // 8 + 3; n8 = dim * dim
viejo = np.fromfile(os.path.expanduser('~/tresmiles-fuentes/oeste/overview_antes.bin'), '<u2').reshape(NCJ, NCI0, n8)
with open(os.path.join(OUT, 'overview.bin'), 'wb') as fo:
    for j in range(NCJ):
        for i in range(NUEVAS): fo.write(nivel(i, j, 8).tobytes())
        v0 = viejo[j, 0].reshape(dim, dim).copy(); v0[:, 0] = nivel(NUEVAS, j, 8)[:, 0]; fo.write(v0.tobytes())
        for i in range(1, NCI0): fo.write(viejo[j, i].tobytes())

tiles = [dict(i=t['i'] + NUEVAS, j=t['j'], f=t['f']) for t in meta['tiles']] + [dict(i=i, j=j, f=f'c_{i - NUEVAS}_{j}.jpg') for j in range(NCJ) for i in range(NUEVAS)]
tiles.sort(key=lambda t: (t['j'], t['i']))
meta.update(lon0=lon0n, ncols=meta['ncols'] + NW, nci=NCI0 + NUEVAS, ncols0=meta['ncols'], iw=NUEVAS, v=meta.get('v', 1) + 1, vh0=1,
            hmin=min(meta['hmin'], float(sub.min()) * 0.1), hmax=max(meta['hmax'], float(sub.max()) * 0.1), tiles=tiles)
json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)
print(f"listo: {meta['nci']}x{NCJ} bloques · alturas {tot['h'] / 1e6:.1f} MB · lo {tot['lo'] / 1e6:.1f} MB · hi {tot['hi'] / 1e6:.1f} MB · lon0 {lon0n:.4f}")

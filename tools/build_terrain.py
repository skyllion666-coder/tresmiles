#!/usr/bin/env python3
"""Prepara el relieve por zonas para la web a partir de ~/Tresmiles/web/data (proyecto del vídeo).

Entrada : ~/Tresmiles/web/data/{meta.json,near_h.bin,near_II_JJ.jpg}
          (alturas u16 en decímetros, malla de 1" ~ 30 m; Copernicus GLO-30 + MDT05 en cumbres;
           textura Sentinel-2 cloudless 2016 de EOX, CC BY 4.0)
Salida  : data/terrain/
    meta.json            rejilla de bloques (512 celdas) y lista de texturas
    overview.bin         alturas de TODOS los bloques en baja resolución (paso 8, con 1 muestra de margen): vista general ligera
    h/c_<i>_<j>_<s>.bin  alturas de un bloque con paso s = 4, 2 y 1 (con 1 muestra de margen); se piden solo al acercarse
    lo/, hi/             texturas de satélite de cada bloque (384 y 1536 px); las `hi` se piden solo cerca
Uso: python3 tools/build_terrain.py [i0 i1 j0 j1]   (por defecto 0 9 0 3: del Valle de Tena al Aneto)
"""
import json, os, sys
import numpy as np
from PIL import Image

SRC = os.path.expanduser('~/Tresmiles/web/data')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'terrain')
I0, I1, J0, J1 = (int(a) for a in sys.argv[1:5]) if len(sys.argv) >= 5 else (0, 9, 0, 3)
CH, LO, HI = 512, 384, 1536

meta = json.load(open(os.path.join(SRC, 'meta.json')))
N = meta['near']
cols, rows = N['ncols'], N['nrows']
h = np.fromfile(os.path.join(SRC, 'near_h.bin'), dtype='<u2').reshape(rows, cols)
c0, c1, r0, r1 = I0 * CH, I1 * CH + 1, J0 * CH, J1 * CH + 1
sub = np.ascontiguousarray(h[r0:r1, c0:c1])
R, C = sub.shape

import shutil
for d in ('h', 'lo', 'hi'):
    shutil.rmtree(os.path.join(OUT, d), ignore_errors=True); os.makedirs(os.path.join(OUT, d))
for f in ('heights.bin', 'overview.bin'):
    try: os.remove(os.path.join(OUT, f))
    except FileNotFoundError: pass

def nivel(i, j, s):
    """alturas del bloque (i, j) cada s celdas, con 1 muestra de margen por lado (se repiten los bordes de la región)"""
    n = CH // s
    cc = np.clip(i * CH + (np.arange(-1, n + 2)) * s, 0, C - 1)
    rr = np.clip(j * CH + (np.arange(-1, n + 2)) * s, 0, R - 1)
    return sub[np.ix_(rr, cc)].astype('<u2')

step = N['step']
out = dict(lon0=N['lon0'] + c0 * step, lat0=N['lat0'] - r0 * step, step=step, ncols=int(C), nrows=int(R), chunk=CH,
           nci=I1 - I0, ncj=J1 - J0, hscale=0.1, hmin=float(sub.min()) * 0.1, hmax=float(sub.max()) * 0.1, niveles=[8, 4, 2, 1],
           tiles=[dict(i=i - I0, j=j - J0, f=f'c_{i - I0}_{j - J0}.jpg') for j in range(J0, J1) for i in range(I0, I1)])
json.dump(out, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)

tot = dict(ov=0, h=0, lo=0, hi=0)
with open(os.path.join(OUT, 'overview.bin'), 'wb') as fo:
    for j in range(J1 - J0):
        for i in range(I1 - I0):
            b = nivel(i, j, 8).tobytes(); fo.write(b); tot['ov'] += len(b)
for j in range(J1 - J0):
    for i in range(I1 - I0):
        for s in (4, 2, 1):
            b = nivel(i, j, s).tobytes(); open(os.path.join(OUT, 'h', f'c_{i}_{j}_{s}.bin'), 'wb').write(b); tot['h'] += len(b)
        im = Image.open(os.path.join(SRC, f'near_{i + I0:02d}_{j + J0:02d}.jpg')).convert('RGB')
        name = f'c_{i}_{j}.jpg'
        for sz, d, q in ((LO, 'lo', 76), (HI, 'hi', 80)):
            p = os.path.join(OUT, d, name)
            im.resize((sz, sz), Image.LANCZOS).save(p, quality=q, optimize=True, progressive=True)
            tot['lo' if d == 'lo' else 'hi'] += os.path.getsize(p)
print(f'bloques {I1 - I0}x{J1 - J0}  región {C}x{R} celdas')
print(f"overview {tot['ov'] / 1e6:.2f} MB · alturas por niveles {tot['h'] / 1e6:.1f} MB · texturas lo {tot['lo'] / 1e6:.1f} MB, hi {tot['hi'] / 1e6:.1f} MB")
print(f"lon {out['lon0']:.3f}..{out['lon0'] + (C - 1) * step:.3f}  lat {out['lat0'] - (R - 1) * step:.3f}..{out['lat0']:.3f}")

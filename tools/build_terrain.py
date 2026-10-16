#!/usr/bin/env python3
"""Prepara el relieve y las texturas de satélite para la web a partir de ../Tresmiles/web/data.

Entrada  : ~/Tresmiles/web/data/{meta.json,near_h.bin,near_II_JJ.jpg}
           (alturas u16 en decímetros, malla de 1" ~ 30 m; Copernicus GLO-30 + MDT05 en cumbres;
            textura Sentinel-2 cloudless 2016 de EOX, CC BY 4.0)
Salida   : data/terrain/{meta.json,heights.bin,lo/*.jpg,hi/*.jpg}

Por defecto se conservan los bloques i=0..3, j=0..2 (12 bloques de 512 celdas, zona occidental).
Con `0 9 0 3` se conservan los 27 bloques que contienen los doce picos.
"""
import json, math, os, sys
import numpy as np
from PIL import Image

SRC = os.path.expanduser('~/Tresmiles/web/data')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'terrain')
# rango de bloques [I0,I1) x [J0,J1); uso: build_terrain.py [i0 i1 j0 j1]
# por defecto, la zona occidental (Balaitús, Infiernos, Vignemale); 0 9 0 3 cubre los doce picos
I0, I1, J0, J1 = (int(a) for a in sys.argv[1:5]) if len(sys.argv) >= 5 else (0, 4, 0, 3)
CH = 512
LO, HI = 512, 1536

meta = json.load(open(os.path.join(SRC, 'meta.json')))
N = meta['near']
cols, rows = N['ncols'], N['nrows']
h = np.fromfile(os.path.join(SRC, 'near_h.bin'), dtype='<u2').reshape(rows, cols)

c0, c1 = I0 * CH, I1 * CH + 1
r0, r1 = J0 * CH, J1 * CH + 1
sub = np.ascontiguousarray(h[r0:r1, c0:c1])
os.makedirs(os.path.join(OUT, 'lo'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'hi'), exist_ok=True)
sub.astype('<u2').tofile(os.path.join(OUT, 'heights.bin'))

step = N['step']
lon0 = N['lon0'] + c0 * step
lat0 = N['lat0'] - r0 * step
out = dict(
    lon0=lon0, lat0=lat0, step=step, ncols=int(sub.shape[1]), nrows=int(sub.shape[0]),
    chunk=CH, nci=I1 - I0, ncj=J1 - J0, hscale=0.1,
    hmin=float(sub.min()) * 0.1, hmax=float(sub.max()) * 0.1,
    tiles=[dict(i=i - I0, j=j - J0, f=f'c_{i - I0}_{j - J0}.jpg') for j in range(J0, J1) for i in range(I0, I1)],
)
json.dump(out, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)

tot_lo = tot_hi = 0
for j in range(J0, J1):
    for i in range(I0, I1):
        im = Image.open(os.path.join(SRC, f'near_{i:02d}_{j:02d}.jpg')).convert('RGB')
        name = f'c_{i - I0}_{j - J0}.jpg'
        for sz, d, q in ((LO, 'lo', 78), (HI, 'hi', 80)):
            p = os.path.join(OUT, d, name)
            im.resize((sz, sz), Image.LANCZOS).save(p, quality=q, optimize=True, progressive=True)
            if d == 'lo': tot_lo += os.path.getsize(p)
            else: tot_hi += os.path.getsize(p)
print(f'alturas {sub.shape} {sub.nbytes / 1e6:.1f} MB  hmin {out["hmin"]:.0f} hmax {out["hmax"]:.0f}')
print(f'lon {lon0:.4f}..{lon0 + (sub.shape[1] - 1) * step:.4f}  lat {lat0 - (sub.shape[0] - 1) * step:.4f}..{lat0:.4f}')
print(f'texturas lo {tot_lo / 1e6:.1f} MB  hi {tot_hi / 1e6:.1f} MB')

#!/usr/bin/env python3
"""Ortofoto del PNOA (IGN, 25–50 cm, CC BY 4.0, © Instituto Geográfico Nacional de España) para una pieza de cumbre (data/terrain/cumbres/<id>.bin.gz).
Pide al WMS del IGN la imagen de la misma zona que la pieza, en lon/lat (proyección lineal con el mundo de la web), a 4096 px (escritorio) y 2048 px (móvil),
y añade `orto` y `ortoM` a data/terrain/cumbres/index.json. Uso: python3 tools/build_orto.py perdido [otra ...]"""
import json, math, os, subprocess, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
D = lambda *p: os.path.join(ROOT, *p)
m = json.load(open(D('data', 'terrain', 'meta.json'))); idx_path = D('data', 'terrain', 'cumbres', 'index.json'); idx = json.load(open(idx_path))
latC = m['lat0'] - ((m['nrows'] - 1) * m['step']) / 2; mLat = 111132; mLon = 111320 * math.cos(math.radians(latC))
W = (m['ncols'] - 1) * m['step'] * mLon; Dd = (m['nrows'] - 1) * m['step'] * mLat
fx = lambda x: m['lon0'] + (x + W / 2) / mLon; fz = lambda z: m['lat0'] - (z + Dd / 2) / mLat
for pid in sys.argv[1:]:
    d = idx[pid]; x0, z0 = d['x0'], d['z0']; x1 = x0 + (d['n'] - 1) * d['paso']; z1 = z0 + (d['n'] - 1) * d['paso']
    bb = (fx(x0), fz(z1), fx(x1), fz(z0))
    tmp = f'/tmp/orto_{pid}.jpg'
    url = ('https://www.ign.es/wms-inspire/pnoa-ma?service=WMS&version=1.3.0&request=GetMap&layers=OI.OrthoimageCoverage&styles=&crs=CRS:84'
           f'&bbox={bb[0]},{bb[1]},{bb[2]},{bb[3]}&width=4096&height=4096&format=image/jpeg')
    r = subprocess.run(['curl', '-s', '-m', '300', '-o', tmp, '-w', '%{http_code}', url], capture_output=True, text=True)
    if r.stdout != '200' or os.path.getsize(tmp) < 100000: print(pid, 'sin imagen', r.stdout); continue
    im = Image.open(tmp).convert('RGB')
    im.save(D('data', 'terrain', 'cumbres', f'{pid}-orto.jpg'), quality=80, optimize=True, progressive=True)
    im.resize((2048, 2048), Image.LANCZOS).save(D('data', 'terrain', 'cumbres', f'{pid}-orto-m.jpg'), quality=82, optimize=True, progressive=True)
    d['orto'] = f'{pid}-orto.jpg'; d['ortoM'] = f'{pid}-orto-m.jpg'
    print(pid, os.path.getsize(D('data', 'terrain', 'cumbres', f'{pid}-orto.jpg')) // 1024, 'KB y', os.path.getsize(D('data', 'terrain', 'cumbres', f'{pid}-orto-m.jpg')) // 1024, 'KB')
json.dump(idx, open(idx_path, 'w'), separators=(',', ':'))

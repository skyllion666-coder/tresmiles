#!/usr/bin/env python3
"""Parche de ortofoto del PNOA a máxima resolución (IGN, 25 cm donde existe, CC BY 4.0, © Instituto Geográfico Nacional de España) solo en la malla fina de la cima
(los 200 × 200 m de data/terrain/cumbres/detalles.json), encima de la ortofoto de la pieza (~41 cm/px, tools/build_orto.py).
El color se iguala al de la ortofoto de la pieza en esa misma zona (media y desviación por canal), para que no se note el borde.
Salida: <id>-cima-orto.webp (1024 px, ~0,2 m/px) y <id>-cima-orto-m.webp (512 px, para el móvil); añade `orto` y `ortoM` a la entrada del id en detalles.json.
Uso: python3 tools/build_orto_cima.py astorg [otra ...]"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
D = lambda *p: os.path.join(ROOT, 'data', 'terrain', *p)
m = json.load(open(D('meta.json'))); det_path = D('cumbres', 'detalles.json'); det = json.load(open(det_path)); idx = json.load(open(D('cumbres', 'index.json')))
latC = m['lat0'] - ((m['nrows'] - 1) * m['step']) / 2; mLat = 111132; mLon = 111320 * math.cos(math.radians(latC))
W = (m['ncols'] - 1) * m['step'] * mLon; Dd = (m['nrows'] - 1) * m['step'] * mLat
fx = lambda x: m['lon0'] + (x + W / 2) / mLon; fz = lambda z: m['lat0'] - (z + Dd / 2) / mLat
N = 1024
for pid in sys.argv[1:]:
    d = det[pid]; x0, z0 = d['x0'], d['z0']; lado = (d['n'] - 1) * d['paso']; x1, z1 = x0 + lado, z0 + lado
    url = ('https://www.ign.es/wms-inspire/pnoa-ma?service=WMS&version=1.3.0&request=GetMap&layers=OI.OrthoimageCoverage&styles=&crs=CRS:84'
           f'&bbox={fx(x0)},{fz(z1)},{fx(x1)},{fz(z0)}&width={N}&height={N}&format=image/jpeg')
    tmp = f'/tmp/orto_cima_{pid}.jpg'
    for _ in range(4):
        r = subprocess.run(['curl', '-s', '-m', '300', '-o', tmp, '-w', '%{http_code}', url], capture_output=True, text=True)
        if r.stdout == '200' and os.path.getsize(tmp) > 20000: break
    else: print(pid, 'sin imagen'); continue
    im = np.asarray(Image.open(tmp).convert('RGB'), np.float32)
    # la misma zona en la ortofoto de la pieza: referencia de color
    p = idx[pid]; px0, pz0 = p['x0'], p['z0']; plado = (p['n'] - 1) * p['paso']
    ref = Image.open(D('cumbres', p['orto'])).convert('RGB'); S = ref.size[0]
    caja = tuple(round(v) for v in ((x0 - px0) / plado * S, (z0 - pz0) / plado * S, (x1 - px0) / plado * S, (z1 - pz0) / plado * S))
    rf = np.asarray(ref.crop(caja).resize((N, N), Image.BICUBIC), np.float32)
    out = (im - im.mean((0, 1))) / (im.std((0, 1)) + 1e-3) * rf.std((0, 1)) + rf.mean((0, 1))
    out = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    nit = lambda a: float(np.abs(np.diff(np.asarray(a.convert('L'), np.float32), axis=1)).mean())   # nitidez media (diferencia entre píxeles vecinos)
    out.save(D('cumbres', f'{pid}-cima-orto.webp'), quality=70, method=6)
    out.resize((N // 2, N // 2), Image.LANCZOS).save(D('cumbres', f'{pid}-cima-orto-m.webp'), quality=65, method=6)
    d['orto'] = f'{pid}-cima-orto.webp'; d['ortoM'] = f'{pid}-cima-orto-m.webp'
    print(pid, f'{lado:.0f} m a {lado / N:.2f} m/px:', os.path.getsize(D('cumbres', f'{pid}-cima-orto.webp')) // 1024, 'KB y', os.path.getsize(D('cumbres', f'{pid}-cima-orto-m.webp')) // 1024,
          'KB (móvil); nitidez', round(nit(out), 1), 'frente a', round(nit(Image.fromarray(rf.astype(np.uint8))), 1), 'de la ortofoto de la pieza ampliada')
json.dump(det, open(det_path, 'w'), ensure_ascii=False, indent=1)

#!/usr/bin/env python3
"""Ortofoto del PNOA (IGN, 25–50 cm, CC BY 4.0, © Instituto Geográfico Nacional de España) para una pieza de cumbre (data/terrain/cumbres/<id>.bin.gz).
Pide al WMS del IGN la imagen de la misma zona que la pieza, en lon/lat (proyección lineal con el mundo de la web), a 4096 px (escritorio) y 2048 px (móvil),
y añade `orto` y `ortoM` a data/terrain/cumbres/index.json. Uso: python3 tools/build_orto.py perdido [otra ...]"""
import json, math, os, subprocess, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
D = lambda *p: os.path.join(ROOT, *p)
m = json.load(open(D('data', 'terrain', 'meta.json'))); idx_path = D('data', 'terrain', 'cumbres', 'index.json'); idx = json.load(open(idx_path))
m['nrows'] = m.get('nrows0', m['nrows'])   # el origen del mundo es la rejilla original: el mapa crece hacia el sur (ver js/geo.js y tools/build_terrain_sur.py)
latC = m['lat0'] - ((m['nrows'] - 1) * m['step']) / 2; mLat = 111132; mLon = 111320 * math.cos(math.radians(latC))
W = (m['ncols'] - 1) * m['step'] * mLon; Dd = (m['nrows'] - 1) * m['step'] * mLat
fx = lambda x: m['lon0'] + (x + W / 2) / mLon; fz = lambda z: m['lat0'] - (z + Dd / 2) / mLat
def aplana_sombras(im, fuerza=0.5, sigma=80):
    """Las sombras de la ortofoto (propias de la hora del vuelo) chocan con la luz de la web: se divide parcialmente por el brillo de baja frecuencia."""
    import numpy as np
    from PIL import ImageFilter
    a = np.asarray(im, np.float32) / 255; L = a.mean(2)
    pq = Image.fromarray((L * 255).astype(np.uint8)).resize((1024, 1024), Image.BILINEAR).filter(ImageFilter.GaussianBlur(sigma / 4))
    low = np.asarray(pq.resize(im.size, Image.BICUBIC), np.float32) / 255
    f = np.clip((low.mean() / np.maximum(low, 0.02)) ** fuerza, 0.7, 1.6)
    return Image.fromarray((np.clip(a * f[..., None], 0, 1) * 255).astype(np.uint8))
for pid in sys.argv[1:]:
    d = idx[pid]; x0, z0 = d['x0'], d['z0']; x1 = x0 + (d['n'] - 1) * d['paso']; z1 = z0 + (d['n'] - 1) * d['paso']
    bb = (fx(x0), fz(z1), fx(x1), fz(z0))
    # 4 teselas de 2048 px (el WMS del IGN da error 500 con 4096 px de una vez en algunas zonas, p. ej. el Aneto)
    im = Image.new('RGB', (4096, 4096)); ok = True
    for a in range(2):
        for c in range(2):
            lon0 = bb[0] + (bb[2] - bb[0]) * a / 2; lon1 = bb[0] + (bb[2] - bb[0]) * (a + 1) / 2
            lat1 = bb[3] - (bb[3] - bb[1]) * c / 2; lat0 = bb[3] - (bb[3] - bb[1]) * (c + 1) / 2
            tmp = f'/tmp/orto_{pid}_{a}{c}.jpg'
            url = ('https://www.ign.es/wms-inspire/pnoa-ma?service=WMS&version=1.3.0&request=GetMap&layers=OI.OrthoimageCoverage&styles=&crs=CRS:84'
                   f'&bbox={lon0},{lat0},{lon1},{lat1}&width=2048&height=2048&format=image/jpeg')
            for _ in range(4):
                r = subprocess.run(['curl', '-s', '-m', '300', '-o', tmp, '-w', '%{http_code}', url], capture_output=True, text=True)
                if r.stdout == '200' and os.path.getsize(tmp) > 50000: break
            else: ok = False; break
            im.paste(Image.open(tmp).convert('RGB'), (a * 2048, c * 2048))
        if not ok: break
    if not ok: print(pid, 'sin imagen'); continue
    im = aplana_sombras(im)
    im.save(D('data', 'terrain', 'cumbres', f'{pid}-orto.webp'), quality=60, method=6)
    im.resize((2048, 2048), Image.LANCZOS).save(D('data', 'terrain', 'cumbres', f'{pid}-orto-m.webp'), quality=55, method=6)
    d['orto'] = f'{pid}-orto.webp'; d['ortoM'] = f'{pid}-orto-m.webp'
    print(pid, os.path.getsize(D('data', 'terrain', 'cumbres', f'{pid}-orto.webp')) // 1024, 'KB y', os.path.getsize(D('data', 'terrain', 'cumbres', f'{pid}-orto-m.webp')) // 1024, 'KB')
json.dump(idx, open(idx_path, 'w'), separators=(',', ':'))

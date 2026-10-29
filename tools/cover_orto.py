#!/usr/bin/env python3
"""Corrige la cobertura (ESA WorldCover, data/terrain/cover/c_i_j.bin.gz) dentro de las piezas con ortofoto del PNOA.
WorldCover (10 m, reducido a la rejilla de 1") marca como «arbolado» mesetas de roca con matorral disperso (p. ej. la Peña de San Miguel), y la web planta
ahí árboles grandes (js/vegetacion.js) y oscurece el suelo. Con la ortofoto de la pieza (~0,4 m/px) se mide en cada celda qué parte es arbolado
(píxeles verde oscuro) y qué parte roca o suelo claro:
  arbolado con mucha roca clara o casi sin copas en la foto → matorral (2) o, si casi todo es claro, roca desnuda (4). Nunca añade arbolado.
Solo toca las celdas cuyo centro cae dentro de alguna de las piezas indicadas; guarda una copia de cada cobertura original en tools/datos/cover_orig/
(la primera vez) y parte siempre de ella, así que se puede repetir. Sube `meta.vcover` para renovar la caché (js/terrain.js pide cover/…?v=).
Sin argumentos usa todas las piezas de cumbres de menos de 3.000 (data/menores.json); con ids, solo esas (y las demás vuelven al original: pasar siempre todas).
Uso: ~/venv-tresmiles/bin/python tools/cover_orto.py [id ...]   (DEPURA=1 guarda /tmp/cover_orto_<id>.png con la clasificación)"""
import gzip, json, math, os, shutil, subprocess, sys, time
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
T = lambda *p: os.path.join(ROOT, 'data', 'terrain', *p)
ORIG = os.path.join(ROOT, 'tools', 'datos', 'cover_orig')
meta = json.load(open(T('meta.json'))); idx = json.load(open(T('cumbres', 'index.json')))
NR0 = meta.get('nrows0', meta['nrows']); CH = meta['chunk'] if 'chunk' in meta else 512
latC = meta['lat0'] - ((NR0 - 1) * meta['step']) / 2; mLat = 111132; mLon = 111320 * math.cos(math.radians(latC))
W = (meta['ncols'] - 1) * meta['step'] * mLon; Dd = (NR0 - 1) * meta['step'] * mLat
toXZ = lambda lon, lat: ((lon - meta['lon0']) * mLon - W / 2, (meta['lat0'] - lat) * mLat - Dd / 2)
os.makedirs(ORIG, exist_ok=True)
covers, cambios = {}, {}

def cover(i, j):
    k = (i, j)
    if k not in covers:
        f = T('cover', f'c_{i}_{j}.bin.gz'); o = os.path.join(ORIG, f'c_{i}_{j}.bin.gz')
        if not os.path.exists(o): shutil.copy(f, o)
        covers[k] = np.frombuffer(gzip.open(o).read(), np.uint8).reshape(CH, CH).copy()
    return covers[k]

def corrige(nom, im, x0, z0, lx, lz, marco=None):
    """Corrige las celdas cuyo centro cae en el rectángulo [x0, x0+lx] × [z0, z0+lz] del mundo, que la imagen `im` cubre entera.
    `marco` (x0, z0, lx, lz): rectángulo cuyo borde se difumina (por defecto el de la imagen; en las teselas de la zona, el de toda la zona)."""
    mx0, mz0, mlx, mlz = marco or (x0, z0, lx, lz)
    im = np.asarray(im.convert('RGB'), np.float32); NZ, NX = im.shape[:2]
    R, G, B = im[..., 0], im[..., 1], im[..., 2]; L = 0.3 * R + 0.59 * G + 0.11 * B
    arbol = (L < 65) & (G >= R * 0.95)                            # copa: verde muy oscuro (pino, encina, haya); la foto es de poco contraste
    claro = L > 110                                               # roca o suelo claro
    lon_a, lon_b = meta['lon0'] + (x0 + W / 2) / mLon, meta['lon0'] + (x0 + lx + W / 2) / mLon
    lat_a, lat_b = meta['lat0'] - (z0 + lz + Dd / 2) / mLat, meta['lat0'] - (z0 + Dd / 2) / mLat
    gi0, gi1 = int(math.ceil((lon_a - meta['lon0']) / meta['step'] - 0.5)), int((lon_b - meta['lon0']) / meta['step'] - 0.5)
    gj0, gj1 = int(math.ceil((meta['lat0'] - lat_b) / meta['step'] - 0.5)), int((meta['lat0'] - lat_a) / meta['step'] - 0.5)
    dep = np.zeros((gj1 - gj0 + 1, gi1 - gi0 + 1, 3), np.uint8); n = {}
    for gj in range(gj0, gj1 + 1):
        for gi in range(gi0, gi1 + 1):
            ci, cj = gi // CH, gj // CH; c = cover(ci, cj); cl = int(c[gj % CH, gi % CH])
            # la celda en píxeles de la imagen
            xa, za = toXZ(meta['lon0'] + gi * meta['step'], meta['lat0'] - gj * meta['step'])
            xb, zb = toXZ(meta['lon0'] + (gi + 1) * meta['step'], meta['lat0'] - (gj + 1) * meta['step'])
            pa, pb = int(max(0, (xa - x0) / lx * NX)), int(min(NX, (xb - x0) / lx * NX))
            qa, qb = int(max(0, (za - z0) / lz * NZ)), int(min(NZ, (zb - z0) / lz * NZ))
            if pb - pa < 3 or qb - qa < 3: continue
            fa, fc = arbol[qa:qb, pa:pb].mean(), claro[qa:qb, pa:pb].mean()
            nuevo = cl
            # cerca del borde el cambio se aplica a salto (más probable hacia dentro) para que no se vea un cuadrado de árboles cortado en seco
            borde = min(xa - mx0, mx0 + mlx - xb, za - mz0, mz0 + mlz - zb)
            if ((gi * 73856093) ^ (gj * 19349663)) % 1000 / 1000 >= min(1, max(0, borde / 350)): continue
            if cl == 1 and (fc > 0.45 or fa < 0.12): nuevo = 4 if fc > 0.65 else 2   # solo quita: sombras y matorral denso se confunden con bosque
            if nuevo != cl: c[gj % CH, gi % CH] = nuevo; cambios[(ci, cj)] = True; n[f'{cl}>{nuevo}'] = n.get(f'{cl}>{nuevo}', 0) + 1
            dep[gj - gj0, gi - gi0] = {1: (30, 90, 40), 2: (150, 150, 60), 3: (120, 200, 90), 4: (220, 210, 190)}.get(nuevo, (60, 60, 160))
    print(nom, 'cambios', n or 'ninguno', flush=True)
    if os.environ.get('DEPURA'): Image.fromarray(dep).resize((dep.shape[1] * 4, dep.shape[0] * 4), Image.NEAREST).save(f'/tmp/cover_orto_{nom}.png')

# 1) toda la Sierra de Guara y las sierras exteriores con la ortofoto del PNOA a ~3 m/px (teselas guardadas en tools/datos/orto_zona/, no se publican)
ZONA = (-0.52, 42.20, 0.04, 42.34); TL, TB = 0.07, 0.05   # lon0, lat0, lon1, lat1 y tamaño de tesela en grados
os.makedirs(os.path.join(ROOT, 'tools', 'datos', 'orto_zona'), exist_ok=True)
_a, _b = toXZ(ZONA[0], ZONA[3]), toXZ(ZONA[2], ZONA[1]); MARCO = (_a[0], _a[1], _b[0] - _a[0], _b[1] - _a[1])
lon = ZONA[0]
while lon < ZONA[2] - 1e-9:
    lat = ZONA[1]
    while lat < ZONA[3] - 1e-9:
        f = os.path.join(ROOT, 'tools', 'datos', 'orto_zona', f'z_{lon:.2f}_{lat:.2f}.jpg')
        if not os.path.exists(f) or os.path.getsize(f) < 50000:
            url = ('https://www.ign.es/wms-inspire/pnoa-ma?service=WMS&version=1.3.0&request=GetMap&layers=OI.OrthoimageCoverage&styles=&crs=CRS:84'
                   f'&bbox={lon},{lat},{lon + TL},{lat + TB}&width=2048&height=1984&format=image/jpeg')
            for k in range(6):
                if subprocess.run(['curl', '-s', '-m', '300', '-o', f, '-w', '%{http_code}', url], capture_output=True, text=True).stdout == '200' and os.path.getsize(f) > 50000: break
                time.sleep(10 * (k + 1))
            else: print('sin tesela', f); lat += TB; continue
        xa, za = toXZ(lon, lat + TB); xb, zb = toXZ(lon + TL, lat)
        corrige(f'zona_{lon:.2f}_{lat:.2f}', Image.open(f), xa, za, xb - xa, zb - za, MARCO)
        lat += TB
    lon += TL

# 2) las piezas de cumbres, con su ortofoto de ~0,4 m/px (manda sobre la de la zona)
menores = {p['id'] for p in json.load(open(os.path.join(ROOT, 'data', 'menores.json')))['picos']}
for pid in sys.argv[1:] or [k for k in idx if k in menores]:
    d = idx.get(pid)
    if not d or 'orto' not in d: print(pid, 'sin pieza u ortofoto'); continue
    lado = (d['n'] - 1) * d['paso']
    corrige(pid, Image.open(T('cumbres', d['orto'])), d['x0'], d['z0'], lado, lado)

for (ci, cj) in cambios:
    gzip.open(T('cover', f'c_{ci}_{cj}.bin.gz'), 'wb', 9).write(covers[(ci, cj)].tobytes())
if cambios:
    meta['vcover'] = meta.get('vcover', 1) + 1; json.dump(meta, open(T('meta.json'), 'w'), indent=1)
    print('coberturas reescritas:', sorted(cambios), '· vcover', meta['vcover'])

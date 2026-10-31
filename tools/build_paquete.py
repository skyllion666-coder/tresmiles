#!/usr/bin/env python3
"""Paquete de zona a máxima calidad para llevar sin conexión (piloto: Balaitús). Cubre el pasillo de las rutas de una cumbre (la de ejemplo y sus «Otras subidas»,
data/subidas/<id>.json) con piezas de 1 × 1 km alineadas a la rejilla de la web (x este, z sur, metros), con un margen de 400 m a cada lado del camino:
  - relieve: MDT05 del IGN (5 m, CC BY 4.0, © Instituto Geográfico Nacional de España, WCS de IDEE), remuestreado a 2,5 m con spline cúbico
    (no añade datos: suaviza el sombreado de cerca). <pieza>.bin.gz: u16 LE, decímetros, n×n (n = 401); 0 = sin dato (fuera de España: se queda el relieve general).
  - ortofoto: PNOA máxima actualidad del IGN (CC BY 4.0) a 4096 px por kilómetro (≈ 25 cm por píxel, la resolución del vuelo), en 4 teselas de 2048 px.
    <pieza>.webp (calidad alta; el paquete es para descargar y borrar).
Salida: data/paquetes/<cumbre>/ con index.json {cumbre, lado, piezas: [{id, x0, z0, n, paso, orto}]}.
Uso: python3 tools/build_paquete.py balaitus [subidas a incluir, p. ej. 1 2]   (sin subidas: la ruta de ejemplo y la primera subida)"""
import gzip, json, math, os, subprocess, sys, tempfile
import numpy as np, rasterio
from rasterio.warp import transform
from scipy.ndimage import map_coordinates
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
meta = json.load(open(os.path.join(ROOT, 'data/terrain/meta.json'))); meta['nrows'] = meta.get('nrows0', meta['nrows'])   # origen del mundo: la rejilla original (js/geo.js)
latC = meta['lat0'] - ((meta['nrows'] - 1) * meta['step']) / 2
mLat = 111132.0; mLon = 111320.0 * math.cos(math.radians(latC))
W = (meta['ncols'] - 1) * meta['step'] * mLon; D = (meta['nrows'] - 1) * meta['step'] * mLat
toXZ = lambda lon, lat: ((lon - meta['lon0']) * mLon - W / 2, (meta['lat0'] - lat) * mLat - D / 2)
fromXZ = lambda x, z: (meta['lon0'] + (x + W / 2) / mLon, meta['lat0'] - (z + D / 2) / mLat)
LADO, MARGEN, PASO = 1000.0, 400.0, 2.5
N = int(LADO / PASO) + 1

def aplana_sombras(im, fuerza=0.5, sigma=80):   # como tools/build_orto.py: las sombras del vuelo chocan con la luz de la web
    from PIL import ImageFilter
    a = np.asarray(im, np.float32) / 255; L = a.mean(2)
    pq = Image.fromarray((L * 255).astype(np.uint8)).resize((1024, 1024), Image.BILINEAR).filter(ImageFilter.GaussianBlur(sigma / 4))
    low = np.asarray(pq.resize(im.size, Image.BICUBIC), np.float32) / 255
    f = np.clip((low.mean() / np.maximum(low, 0.02)) ** fuerza, 0.7, 1.6)
    return Image.fromarray((np.clip(a * f[..., None], 0, 1) * 255).astype(np.uint8))

def curl(url, out, minimo):
    for _ in range(4):
        r = subprocess.run(['curl', '-s', '-m', '300', '-o', out, '-w', '%{http_code}', url], capture_output=True, text=True)
        if r.stdout == '200' and os.path.exists(out) and os.path.getsize(out) > minimo: return True
    return False

def relieve(x0, z0):
    xs = x0 + np.arange(N) * PASO; zs = z0 + np.arange(N) * PASO
    X, Z = np.meshgrid(xs, zs); lon, lat = fromXZ(X, Z)
    ux, uy = transform('EPSG:4326', 'EPSG:25830', lon.ravel().tolist(), lat.ravel().tolist()); ux = np.array(ux).reshape(N, N); uy = np.array(uy).reshape(N, N)
    a, b, c, d = ux.min() - 30, ux.max() + 30, uy.min() - 30, uy.max() + 30
    tmp = tempfile.mktemp(suffix='.tif')
    if not curl(f'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=GetCoverage&CoverageId=Elevacion25830_5&subset=x({a:.0f},{b:.0f})&subset=y({c:.0f},{d:.0f})&format=image/tiff', tmp, 2000):
        return None
    with rasterio.open(tmp) as ds: h = ds.read(1).astype('f4'); t = ds.transform
    os.remove(tmp)
    h[(h < 0) | (h > 5000)] = np.nan
    col = (ux - t.c) / t.a - 0.5; row = (uy - t.f) / t.e - 0.5
    inside = (col >= 0) & (row >= 0) & (col <= h.shape[1] - 1) & (row <= h.shape[0] - 1)
    v = map_coordinates(np.nan_to_num(h, nan=-1), [row, col], order=3, mode='nearest')
    bad = ~inside | (map_coordinates(np.isnan(h).astype('f4'), [row, col], order=1, mode='nearest') > 0.01) | (v < 0)
    return np.where(bad, 0, np.round(v * 10)).astype('<u2'), bad.mean()

def orto(x0, z0, dest):
    lon0, lat1 = fromXZ(x0, z0); lon1, lat0 = fromXZ(x0 + LADO, z0 + LADO)
    im = Image.new('RGB', (4096, 4096))
    for a in range(2):
        for c in range(2):
            la0 = lon0 + (lon1 - lon0) * a / 2; la1 = lon0 + (lon1 - lon0) * (a + 1) / 2
            ta1 = lat1 - (lat1 - lat0) * c / 2; ta0 = lat1 - (lat1 - lat0) * (c + 1) / 2
            tmp = tempfile.mktemp(suffix='.jpg')
            url = ('https://www.ign.es/wms-inspire/pnoa-ma?service=WMS&version=1.3.0&request=GetMap&layers=OI.OrthoimageCoverage&styles=&crs=CRS:84'
                   f'&bbox={la0},{ta0},{la1},{ta1}&width=2048&height=2048&format=image/jpeg')
            if not curl(url, tmp, 30000): return False
            im.paste(Image.open(tmp).convert('RGB'), (a * 2048, c * 2048)); os.remove(tmp)
    aplana_sombras(im).save(dest, quality=82, method=6)
    return True

cumbre = sys.argv[1]; elegidas = [int(a) for a in sys.argv[2:]] or [1]
pico = next(p for p in json.load(open(os.path.join(ROOT, 'data/peaks.json')))['picos'] if p['id'] == cumbre)
lineas = [json.load(open(os.path.join(ROOT, 'data/rutas', f'{r}.json')))['puntos'] for r in pico.get('rutas') or []]
sub = os.path.join(ROOT, 'data/subidas', f'{cumbre}.json')
if os.path.exists(sub): lineas += [s['puntos'] for s in json.load(open(sub))['subidas'] if int(s['id'].rsplit('-', 1)[1]) in elegidas]
celdas = set()
for L in lineas:
    for p in L:
        x, z = toXZ(p[0], p[1])
        for dx in (-MARGEN, 0, MARGEN):
            for dz in (-MARGEN, 0, MARGEN): celdas.add((math.floor((x + dx) / LADO), math.floor((z + dz) / LADO)))
OUT = os.path.join(ROOT, 'data/paquetes', cumbre); os.makedirs(OUT, exist_ok=True)
I = os.path.join(OUT, 'index.json'); idx = json.load(open(I)) if os.path.exists(I) else {'cumbre': cumbre, 'lado': LADO, 'piezas': []}
hechas = {p['id'] for p in idx['piezas']}
print(cumbre, len(celdas), 'piezas de 1 km', flush=True)
for i, j in sorted(celdas):
    pid = f'p_{i}_{j}'
    if pid in hechas: continue
    x0, z0 = i * LADO, j * LADO
    r = relieve(x0, z0)
    if r is None: print(pid, 'sin relieve del WCS', flush=True); continue
    arr, sin = r
    gzip.open(os.path.join(OUT, f'{pid}.bin.gz'), 'wb', 9).write(arr.tobytes())
    ok = orto(x0, z0, os.path.join(OUT, f'{pid}.webp'))
    idx['piezas'].append({'id': pid, 'x0': x0, 'z0': z0, 'n': N, 'paso': PASO, **({'orto': f'{pid}.webp'} if ok else {}), **({'sinDato': round(float(sin), 2)} if sin > 0.01 else {})})
    json.dump(idx, open(I, 'w'), separators=(',', ':'))
    print(pid, f'sin dato {sin * 100:.0f} %', 'orto' if ok else 'SIN ORTO', os.path.getsize(os.path.join(OUT, f'{pid}.webp')) // 1024 if ok else 0, 'KB', flush=True)
# color: un solo ajuste para todo el paquete (como tools/igualar_orto.py, media y desviación por canal en lineal contra el satélite de debajo), para que el pasillo
# case con el resto del mapa y las piezas no se distingan entre sí
lin = lambda v: np.where(v <= .04045, v / 12.92, ((v + .055) / 1.055) ** 2.4)
A, B = [], []
for d in idx['piezas']:
    if not d.get('orto'): continue
    c0 = (d['x0'] + W / 2) / mLon / meta['step']; c1 = (d['x0'] + LADO + W / 2) / mLon / meta['step']; r0 = (d['z0'] + D / 2) / mLat / meta['step']; r1 = (d['z0'] + LADO + D / 2) / mLat / meta['step']
    ci, rj = int((c0 + c1) / 2 // meta['chunk']), int((r0 + r1) / 2 // meta['chunk'])
    f = os.path.join(ROOT, 'data/terrain/hi', f'c_{ci}_{rj}.jpg')
    if not os.path.exists(f): continue
    sat = Image.open(f).convert('RGB'); S = sat.size[0] / meta['chunk']
    caja = tuple(int(round(v * S)) for v in (c0 - ci * meta['chunk'], r0 - rj * meta['chunk'], c1 - ci * meta['chunk'], r1 - rj * meta['chunk']))
    if min(caja) < 0 or caja[2] > sat.size[0] or caja[3] > sat.size[1]: continue
    sc = sat.crop(caja); oc = Image.open(os.path.join(OUT, d['orto'])).convert('RGB').resize(sc.size, Image.LANCZOS)
    A.append(lin(np.asarray(sc, float).reshape(-1, 3) / 255)); B.append(lin(np.asarray(oc, float).reshape(-1, 3) / 255))
if A:
    A = np.concatenate(A); B = np.concatenate(B); mS, sS, mO, sO = A.mean(0), A.std(0), B.mean(0), B.std(0)
    k = np.clip(sS / sO, .8, 1.12); mT = mO + np.clip(mS - mO, -.10, .10)
    idx['og'] = [[round(float(v), 4) for v in mO], [round(float(v), 4) for v in k], [round(float(v), 4) for v in mT]]
    json.dump(idx, open(I, 'w'), separators=(',', ':'))
    print('color: satélite', mS.round(3), 'orto', mO.round(3), 'ganancia', k.round(2))
tam = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) / 1e6
print(f'{cumbre}: {len(idx["piezas"])} piezas, {tam:.0f} MB')

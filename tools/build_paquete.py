#!/usr/bin/env python3
"""Paquete de zona a máxima calidad para llevar sin conexión (piloto: Balaitús). Cubre el pasillo de las rutas de una cumbre (la de ejemplo y sus «Otras subidas»,
data/subidas/<id>.json) con piezas de 1 × 1 km alineadas a la rejilla de la web (x este, z sur, metros), con un margen de 400 m a cada lado del camino:
  - relieve: MDT05 del IGN (5 m, CC BY 4.0, © Instituto Geográfico Nacional de España, WCS de IDEE), remuestreado a 2,5 m con spline cúbico
    (no añade datos: suaviza el sombreado de cerca). <pieza>.bin.gz: u16 LE, decímetros, n×n (n = 401); 0 = sin dato (fuera de España: se queda el relieve general).
  - ortofoto: PNOA máxima actualidad del IGN (CC BY 4.0) a 4096 px por kilómetro (≈ 25 cm por píxel, la resolución del vuelo), en 4 teselas de 2048 px.
    <pieza>.webp (calidad alta; el paquete es para descargar y borrar).
  - frontera: donde llegan, se usan los datos del IGN de Francia (Géoplateforme, Licence Ouverte Etalab 2.0): el RGE ALTI de 1 m allí donde el MDT05 no llega
    o donde ambos coinciden (dentro de España el servicio francés rellena con datos que se desvían decenas de metros: ahí manda el MDT05), y la ortofoto
    francesa allí donde existe (Francia y la franja de la frontera, con las sombras más suaves), fundida con la del PNOA.
Salida: data/paquetes/<cumbre>/ con index.json {cumbre, lado, piezas: [{id, x0, z0, n, paso, orto}]}.
Uso: python3 tools/build_paquete.py balaitus [subidas a incluir, p. ej. 1 2] [--rehacer]   (sin subidas: la ruta de ejemplo y la primera subida)"""
import gzip, json, math, os, subprocess, sys, tempfile, time
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
LADO, MARGEN, PASO = 1000.0, 400.0, 1.0   # relieve a 1 m (máxima calidad): js/paquete.js lo dibuja a 1, 2 o 4 m según la distancia
N = int(LADO / PASO) + 1
LIDAR = None   # relieve LiDAR de 1 m de la zona (tools/lidar_mdt.py), si existe: ~/tresmiles-fuentes/lidar/<cumbre>_mdt1m.tif

def aplana_sombras(im, fuerza=0.5, sigma=80):   # como tools/build_orto.py: las sombras del vuelo chocan con la luz de la web
    from PIL import ImageFilter
    a = np.asarray(im, np.float32) / 255; L = a.mean(2)
    pq = Image.fromarray((L * 255).astype(np.uint8)).resize((1024, 1024), Image.BILINEAR).filter(ImageFilter.GaussianBlur(sigma / 4))
    low = np.asarray(pq.resize(im.size, Image.BICUBIC), np.float32) / 255
    f = np.clip((low.mean() / np.maximum(low, 0.02)) ** fuerza, 0.7, 1.6)
    return Image.fromarray((np.clip(a * f[..., None], 0, 1) * 255).astype(np.uint8))

def curl(url, out, minimo):
    for k in range(6):
        if k: time.sleep(15 * k)   # el WMS del PNOA falla a rachas: esperar antes de reintentar
        r = subprocess.run(['curl', '-s', '-m', '300', '-o', out, '-w', '%{http_code}', url], capture_output=True, text=True)
        if r.stdout == '200' and os.path.exists(out) and os.path.getsize(out) > minimo:
            if not any(f in url.lower() for f in ('image/jpeg', 'image/png', 'image%2fjpeg', 'image%2fpng')): return True
            try: Image.open(out).load(); return True   # el WMS a veces manda la imagen cortada con un 200
            except Exception: pass
    return False

def bbox_rejilla(x0, z0, n, paso):   # recuadro lon/lat cuyos centros de píxel caen en los puntos de la rejilla (con medio píxel de margen)
    lo0, la1 = fromXZ(x0 - paso / 2, z0 - paso / 2); lo1, la0 = fromXZ(x0 + (n - 1) * paso + paso / 2, z0 + (n - 1) * paso + paso / 2)
    return lo0, la0, lo1, la1

def relieve_fr(x0, z0):
    lo0, la0, lo1, la1 = bbox_rejilla(x0, z0, N, PASO); tmp = tempfile.mktemp(suffix='.bil')
    url = ('https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES&STYLES=&CRS=EPSG:4326'
           f'&BBOX={la0},{lo0},{la1},{lo1}&WIDTH={N}&HEIGHT={N}&FORMAT=image/x-bil;bits=32')
    if not curl(url, tmp, N * N * 4 - 1): return None
    a = np.fromfile(tmp, '<f4'); os.remove(tmp)
    if a.size != N * N: return None
    a = a.reshape(N, N); a[(a < -1000) | (a > 5000)] = np.nan
    return a

def relieve(x0, z0, cobertura=None):   # cobertura: dónde hay datos franceses de verdad (la máscara de su ortofoto, n×n, 0–1)
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
    # RGE ALTI (1 m): donde no hay MDT05, y donde coinciden (menos de 4 m: aporta detalle; más de 10 m, en España, es un relleno malo y manda el MDT05)
    F = relieve_fr(x0, z0) if cobertura is not None else None; usoF = 0.0
    if F is not None:
        from scipy.ndimage import gaussian_filter
        okF = ~np.isnan(F); Fz = np.nan_to_num(F)
        w = np.where(bad, okF.astype('f4'), np.clip(1 - (np.abs(Fz - v) - 4) / 6, 0, 1) * okF)
        w = np.clip(gaussian_filter(w.astype('f4'), 2), 0, 1) * okF * cobertura; okF = okF & (cobertura > 0.5)
        v = np.where(okF, v * (1 - w) + Fz * w, v); v = np.where(bad & okF, Fz, v); bad = bad & ~okF; usoF = float((w > 0.5).mean())
    # LiDAR del PNOA (1 m): manda donde existe, fundido 25 m hacia el resto en el borde de su cobertura
    usoL = 0.0
    if LIDAR is not None:
        from scipy.ndimage import distance_transform_edt
        Lz, Lt, Lcrs = LIDAR; lx, ly = (ux, uy)
        if Lcrs != 'EPSG:25830':   # el LiDAR va en el huso de sus archivos (Aneto: 31)
            lx, ly = transform('EPSG:4326', Lcrs, lon.ravel().tolist(), lat.ravel().tolist()); lx = np.array(lx).reshape(N, N); ly = np.array(ly).reshape(N, N)
        colL = (lx - Lt.c) / Lt.a - 0.5; rowL = (ly - Lt.f) / Lt.e - 0.5
        okL = (colL >= 0) & (rowL >= 0) & (colL <= Lz.shape[1] - 1) & (rowL <= Lz.shape[0] - 1)
        zl = map_coordinates(np.nan_to_num(Lz, nan=-9999), [rowL, colL], order=1, mode='nearest')
        okL &= zl > 0
        if okL.any():
            wl = np.clip(distance_transform_edt(okL) * PASO / 25.0, 0, 1)
            v = np.where(bad, np.where(okL, zl, v), v * (1 - wl) + np.where(okL, zl, 0) * wl); bad = bad & ~okL; usoL = float(okL.mean())
    return np.where(bad, 0, np.round(v * 10)).astype('<u2'), bad.mean(), usoF, usoL

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
            if not curl(url, tmp, 30000): return False, None
            im.paste(Image.open(tmp).convert('RGB'), (a * 2048, c * 2048)); os.remove(tmp)
    # ortofoto francesa (PNG con transparencia donde no hay foto): manda donde existe, con el borde fundido unos 10 m
    fr = Image.new('RGBA', (4096, 4096), (0, 0, 0, 0)); hay = False
    for a in range(2):
        for c in range(2):
            la0 = lon0 + (lon1 - lon0) * a / 2; la1 = lon0 + (lon1 - lon0) * (a + 1) / 2
            ta1 = lat1 - (lat1 - lat0) * c / 2; ta0 = lat1 - (lat1 - lat0) * (c + 1) / 2
            tmp = tempfile.mktemp(suffix='.png')
            url = ('https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=&CRS=EPSG:4326'
                   f'&BBOX={ta0},{la0},{ta1},{la1}&WIDTH=2048&HEIGHT=2048&FORMAT=image/png&TRANSPARENT=TRUE')
            if curl(url, tmp, 1000):
                t = Image.open(tmp).convert('RGBA'); os.remove(tmp); fr.paste(t, (a * 2048, c * 2048))
    # donde no hay foto el servicio devuelve blanco liso (no transparencia): válido = transparente no y no blanco; se rellenan los huecos blancos pequeños
    # (nieve, brillos) y se quitan los grandes (sin foto)
    from PIL import ImageFilter
    A = np.asarray(fr); val = (A[..., 3] > 200) & ~((A[..., 0] > 250) & (A[..., 1] > 250) & (A[..., 2] > 250))
    m = Image.fromarray((val * 255).astype(np.uint8)).resize((1024, 1024), Image.BOX).point(lambda v: 255 if v > 127 else 0)
    m = m.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MinFilter(5))   # cierra huecos de nieve; aleja del borde
    hay = np.asarray(m).mean() > 2
    if hay:
        al = m.resize((4096, 4096), Image.BILINEAR).filter(ImageFilter.GaussianBlur(14))
        im = Image.composite(fr.convert('RGB'), im, al)
    aplana_sombras(im).save(dest, quality=94, method=6)   # máxima calidad: el paquete es para una excursión (se descarga y se borra)
    return ('fr' if hay else True), (np.asarray(m.resize((N, N), Image.BILINEAR), np.float32) / 255 if hay else None)

REHACER = '--rehacer' in sys.argv; args = [a for a in sys.argv[1:] if a != '--rehacer']
cumbre = args[0]; elegidas = [int(a) for a in args[1:]] or [1]
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
fL = os.path.expanduser(f'~/tresmiles-fuentes/lidar/{cumbre}_mdt1m.tif')
if os.path.exists(fL):
    with rasterio.open(fL) as ds: LIDAR = (ds.read(1), ds.transform, ds.crs.to_string())
    print('LiDAR', fL, LIDAR[0].shape, flush=True)
OUT = os.path.join(ROOT, 'data/paquetes', cumbre); os.makedirs(OUT, exist_ok=True)
I = os.path.join(OUT, 'index.json'); idx = json.load(open(I)) if os.path.exists(I) else {'cumbre': cumbre, 'lado': LADO, 'piezas': []}
if REHACER: idx['piezas'] = []
hechas = {p['id'] for p in idx['piezas']}
print(cumbre, len(celdas), 'piezas de 1 km', flush=True)
for i, j in sorted(celdas):
    pid = f'p_{i}_{j}'
    if pid in hechas: continue
    x0, z0 = i * LADO, j * LADO
    ok, cob = orto(x0, z0, os.path.join(OUT, f'{pid}.webp'))
    r = relieve(x0, z0, cob)
    if r is None: print(pid, 'sin relieve del WCS', flush=True); continue
    arr, sin, usoF, usoL = r
    gzip.open(os.path.join(OUT, f'{pid}.bin.gz'), 'wb', 9).write(arr.tobytes())
    idx['piezas'].append({'id': pid, 'x0': x0, 'z0': z0, 'n': N, 'paso': PASO, **({'orto': f'{pid}.webp'} if ok else {}), **({'sinDato': round(float(sin), 2)} if sin > 0.01 else {})})
    json.dump(idx, open(I, 'w'), separators=(',', ':'))
    if usoF > 0.01 or ok == 'fr': idx['piezas'][-1]['francia'] = {'relieve': round(usoF, 2), 'orto': ok == 'fr'}; json.dump(idx, open(I, 'w'), separators=(',', ':'))
    print(pid, f'sin dato {sin * 100:.0f} %', f'LiDAR {usoL * 100:.0f} %', f'RGE ALTI {usoF * 100:.0f} %', 'orto' + (' con la francesa' if ok == 'fr' else '') if ok else 'SIN ORTO', os.path.getsize(os.path.join(OUT, f'{pid}.webp')) // 1024 if ok else 0, 'KB', flush=True)
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

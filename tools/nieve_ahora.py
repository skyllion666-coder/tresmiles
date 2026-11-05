#!/usr/bin/env python3
"""«Nieve ahora»: dónde hay nieve en todo el mapa según el satélite Sentinel-2 (Copernicus, L2A de Earth Search / Element84), para pintarla sobre el relieve.

Para cada punto, la observación sin nubes más reciente de los últimos DIAS días (de cualquier pasada: el satélite pasa cada 2-5 días).
Nieve = clase «nieve» del propio producto L2A (SCL 11) o NDSI > 0,40 con algo de brillo (la nieve en sombra también la ve).
Salida (rejilla en lon/lat como data/terrain/meta.json, 1,5 veces más gruesa: ~34 × 46 m):
  data/nieve/nieve.png  R = fracción de nieve (0–250), G = 255 si se ha visto el suelo (sin nubes) en esos días, B = antigüedad de la observación en días
  data/nieve/nieve.json {fecha (la más reciente), desde (la más antigua usada), visto (%), caja [oeste, sur, este, norte], ancho, alto, escenas}
Uso: ~/.venvs/lidar/bin/python tools/nieve_ahora.py [días=20]   (tools/nieve_ahora.sh lo ejecuta cada día y publica si hay imagen nueva)"""
import json, os, sys, urllib.request, warnings, datetime as dt
import numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from PIL import Image
warnings.filterwarnings('ignore')
os.environ.update(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', AWS_NO_SIGN_REQUEST='YES', GDAL_HTTP_MAX_RETRY='5', GDAL_HTTP_RETRY_DELAY='4', GDAL_CACHEMAX='512')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); OUT = os.path.join(ROOT, 'data/nieve'); os.makedirs(OUT, exist_ok=True)
DIAS = int(sys.argv[1]) if len(sys.argv) > 1 else 20
M = json.load(open(os.path.join(ROOT, 'data/terrain/meta.json')))
PASO = M['step'] * 1.5
W, H = int(M['ncols'] / 1.5), int(M['nrows'] / 1.5)
oeste, norte = M['lon0'], M['lat0']; este, sur = oeste + W * PASO, norte - H * PASO
T = from_origin(oeste, norte, PASO, PASO)
hoy = dt.datetime.utcnow()

def busca():
    q = {'collections': ['sentinel-2-l2a'], 'bbox': [oeste, sur, este, norte], 'limit': 200,
         'datetime': f"{(hoy - dt.timedelta(days=DIAS)).strftime('%Y-%m-%dT00:00:00Z')}/{hoy.strftime('%Y-%m-%dT23:59:59Z')}", 'query': {'eo:cloud_cover': {'lt': 90}}}
    r = urllib.request.urlopen(urllib.request.Request('https://earth-search.aws.element84.com/v1/search', json.dumps(q).encode(), {'Content-Type': 'application/json'}), timeout=90)
    it = json.load(r)['features']
    # misma toma repetida con otro procesado (…_0_L2A, …_1_L2A): la última
    vistos = {}
    for f in it:
        k = f['id'].rsplit('_', 2)[0]
        if k not in vistos or f['id'] > vistos[k]['id']: vistos[k] = f
    return sorted(vistos.values(), key=lambda f: f['properties']['datetime'], reverse=True)   # de la más reciente a la más antigua

def lee40(href, ov):
    """banda leída a ~40 m (overview), con su transformación y su sistema"""
    with rasterio.open(href, OVERVIEW_LEVEL=ov) as ds:
        return ds.read(1), ds.transform, ds.crs

frac = np.zeros((H, W), 'float32'); visto = np.zeros((H, W), bool); edad = np.full((H, W), 255, 'uint8')
usadas = []
for f in busca():
    if visto.mean() > 0.995: break
    p = f['properties']; fecha = p['datetime'][:10]; a = f['assets']
    try:
        scl, ts, crs = lee40(a['scl']['href'], 0)          # 20 m → overview 0 = 40 m
        g, tg, _ = lee40(a['green']['href'], 1)            # 10 m → overview 1 = 40 m
        s, _, _ = lee40(a['swir16']['href'], 0)
    except Exception as e:
        print('  !', f['id'], e); continue
    n = min(scl.shape[0], g.shape[0], s.shape[0]), min(scl.shape[1], g.shape[1], s.shape[1])
    scl, g, s = scl[:n[0], :n[1]], g[:n[0], :n[1]].astype('float32'), s[:n[0], :n[1]].astype('float32')
    off = a['green'].get('raster:bands', [{}])[0].get('offset', 0) or 0
    gr, sr = g * 1e-4 + off, s * 1e-4 + off
    ndsi = (gr - sr) / np.maximum(gr + sr, 1e-3)
    nube = np.isin(scl, (0, 1, 3, 8, 9, 10))               # sin dato, saturado, sombra de nube, nubes, cirros
    nieve = (scl == 11) | ((ndsi > 0.40) & (gr > 0.06) & ~np.isin(scl, (6,)))   # 6 = agua
    obs = np.where(nube, np.nan, nieve.astype('float32'))
    dst = np.full((H, W), np.nan, 'float32')
    reproject(obs, dst, src_transform=ts, src_crs=crs, src_nodata=np.nan, dst_transform=T, dst_crs='EPSG:4326', dst_nodata=np.nan, resampling=Resampling.average)
    nuevo = ~np.isnan(dst) & ~visto
    if not nuevo.any(): continue
    frac[nuevo] = dst[nuevo]; visto |= nuevo
    edad[nuevo] = min(254, (hoy.date() - dt.date.fromisoformat(fecha)).days)
    usadas.append({'id': f['id'], 'fecha': fecha, 'nubes': round(p.get('eo:cloud_cover', 0)), 'px': int(nuevo.sum())})
    print(f"{f['id']:28s} nubes {p.get('eo:cloud_cover', 0):5.1f} %  nuevo {nuevo.mean():6.1%}  visto {visto.mean():6.1%}", flush=True)

if not usadas: sys.exit('sin imágenes')
img = np.dstack([np.round(frac * 250).astype('uint8'), np.where(visto, 255, 0).astype('uint8'), edad])
Image.fromarray(img, 'RGB').save(os.path.join(OUT, 'nieve.png'), optimize=True)
fechas = sorted(u['fecha'] for u in usadas)
# la fecha que se enseña: la de la imagen que más mapa aporta (la más reciente no siempre: puede ser una pasada casi toda nublada)
principal = max(usadas, key=lambda u: u['px'])['fecha']
json.dump({'fecha': principal, 'ultima': fechas[-1], 'desde': fechas[0], 'visto': round(float(visto.mean()) * 100, 1),
           'caja': [round(oeste, 7), round(sur, 7), round(este, 7), round(norte, 7)], 'ancho': W, 'alto': H,
           'escenas': usadas, 'fuente': 'Copernicus Sentinel-2 (ESA), procesado por Tresmiles'},
          open(os.path.join(OUT, 'nieve.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('nieve', f'{(frac * visto).sum() / visto.sum():.1%}', 'del suelo visto;', 'visto', f'{visto.mean():.1%}', fechas[0], '→', fechas[-1],
      os.path.getsize(os.path.join(OUT, 'nieve.png')) // 1024, 'KB')

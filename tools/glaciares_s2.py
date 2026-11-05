#!/usr/bin/env python3
"""Contornos de los glaciares después de 2022 (sin datos abiertos publicados): estimación propia con Sentinel-2 L2A (Copernicus, vía Earth Search de Element84).
Para cada glaciar y verano: de las escenas del 10 de agosto al 20 de septiembre (en octubre las caras norte quedan en sombra y el hielo no se ve) sin nubes sobre él, la de menos nieve; hielo = NDSI (B03, B11) > umbral,
dentro del último contorno científico (un glaciar no crece en estos años: así la nieve de alrededor no cuenta).
Se valida con los años que sí tienen contorno científico (2020; Aneto 2020–2022).
Uso: ~/.venvs/lidar/bin/python tools/glaciares_s2.py [años…] → ~/tresmiles-fuentes/glaciares/s2/estimas.json"""
import json, os, sys, urllib.request, warnings
warnings.filterwarnings('ignore')
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.features import shapes, geometry_mask
from rasterio.enums import Resampling
from pyproj import Transformer
from shapely.geometry import shape, Polygon, MultiPolygon, mapping
from shapely.ops import transform, unary_union
os.environ.update(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', AWS_NO_SIGN_REQUEST='YES', GDAL_HTTP_MAX_RETRY='4', GDAL_HTTP_RETRY_DELAY='3')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); OUT = os.path.expanduser('~/tresmiles-fuentes/glaciares/s2')
UMBRAL, HOLGURA = float(os.environ.get('UMBRAL', 0.15)), float(os.environ.get('HOLGURA', 0))   # NDSI; metros que se amplía el contorno anterior
AÑOS = [int(a) for a in sys.argv[1:]] or [2020, 2021, 2022, 2023, 2024, 2025, 2026]

def escenas(lon, lat, anio):
    q = {'collections': ['sentinel-2-l2a'], 'intersects': {'type': 'Point', 'coordinates': [lon, lat]}, 'datetime': f'{anio}-08-10T00:00:00Z/{anio}-09-20T23:59:59Z',
         'limit': 100, 'query': {'eo:cloud_cover': {'lt': 60}}}
    r = urllib.request.urlopen(urllib.request.Request('https://earth-search.aws.element84.com/v1/search', json.dumps(q).encode(), {'Content-Type': 'application/json'}), timeout=60)
    return json.load(r)['features']

def lee(href, crs_bounds, shape_out):
    with rasterio.open(href) as ds:
        w = from_bounds(*crs_bounds, ds.transform)
        return ds.read(1, window=w, out_shape=shape_out, resampling=Resampling.bilinear, boundless=True, fill_value=0).astype('float32')

def estima(gl, anio, previo_ll):
    res = None
    for it in escenas(gl['lon'], gl['lat'], anio):
        epsg = it['properties']['proj:epsg']; tr = Transformer.from_crs(4326, epsg, always_xy=True)
        prev = unary_union([Polygon(r).buffer(0) for r in previo_ll])   # par-impar aproximado: une todo (los huecos de hielo son raros y pequeños)
        prev = transform(lambda x, y, z=None: tr.transform(x, y), prev)
        zona = prev.buffer(HOLGURA); x0, y0, x1, y1 = [round(v / 10) * 10 for v in prev.buffer(200).bounds]
        n = (int((y1 - y0) / 10), int((x1 - x0) / 10)); b = (x0, y0, x1, y1)
        try:
            scl = lee(it['assets']['scl']['href'], b, n)
            m = geometry_mask([mapping(zona)], n, rasterio.transform.from_bounds(*b, n[1], n[0]), invert=True)
            sc = np.rint(scl[m])
            if (sc == 0).mean() > 0.05 or np.isin(sc, (8, 9, 10)).mean() > 0.12:   # sin dato o nubes sobre el glaciar
                print(f"  · {it['id']} descartada: sin dato {(sc == 0).mean():.0%} nubes {np.isin(sc, (8, 9, 10)).mean():.0%}"); continue
            g = lee(it['assets']['green']['href'], b, n); s = lee(it['assets']['swir16']['href'], b, n)
        except Exception as e:
            print('  !', it['id'], e); continue
        ndsi = (g - s) / np.maximum(g + s, 1); hielo = (ndsi > UMBRAL) & m
        ha = hielo.sum() * 100 / 1e4
        # también la nieve de alrededor (fuera del contorno): mide cuánta nieve tardía hay ese día; se prefiere la escena con menos
        nieve_fuera = ((ndsi > UMBRAL) & ~m).sum() * 100 / 1e4
        k = (round(nieve_fuera, 0), it['properties']['datetime'][:10])
        print(f"  {it['id']:28s} hielo {ha:6.1f} ha  nieve fuera {nieve_fuera:6.1f} ha")
        if res is None or k[0] < res['k'][0] or (k[0] == res['k'][0] and k[1] > res['k'][1]):
            T = rasterio.transform.from_bounds(*b, n[1], n[0]); inv = Transformer.from_crs(epsg, 4326, always_xy=True)
            polys = [shape(p) for p, v in shapes(hielo.astype('uint8'), mask=hielo, transform=T) if v == 1]
            g2 = unary_union(polys).buffer(5).buffer(-5).simplify(4) if polys else Polygon()
            res = {'k': k, 'fecha': k[1], 'escena': it['id'], 'ha': round(ha, 1), 'geom_ll': mapping(transform(lambda x, y, z=None: inv.transform(x, y), g2))}
    return res

if __name__ == '__main__':
    D = json.load(open(os.path.join(ROOT, 'data/glaciares.json')))
    f = f'{OUT}/estimas.json'; est = json.load(open(f)) if os.path.exists(f) else {}
    solo = os.environ.get('SOLO')
    for gl in D['glaciares']:
        if len(gl['epocas']) < 2 or (solo and gl['id'] not in solo.split(',')): continue
        for anio in AÑOS:
            if est.get(gl['id'], {}).get(str(anio)): continue
            # contorno previo: el último científico anterior a ese año (o el mismo año, para validar), si no la estimación del año anterior
            cien = [a for a in gl['epocas'] if a not in gl.get('sat', {})]
            ant = [a for a in cien if int(a) < anio] or [min(cien)]
            previo = gl['epocas'][max(ant)]
            # siempre dentro del último contorno científico (no del estimado el año anterior: así los errores no se acumulan)
            print(gl['id'], anio, 'ciencia:', None if str(anio) in gl.get('sat', {}) else gl['ha'].get(str(anio)))
            r = estima(gl, anio, previo)
            if r: r.pop('k'); est.setdefault(gl['id'], {})[str(anio)] = r; json.dump(est, open(f, 'w')); print('  →', r['fecha'], r['ha'], 'ha')

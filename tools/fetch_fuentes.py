#!/usr/bin/env python3
"""Fuentes y manantiales de OpenStreetMap en el relieve cargado → data/fuentes.json (para el mapa y la ficha: agua en la ruta).
natural=spring (manantial), amenity=drinking_water / water_point y man_made=water_tap (fuente). Cada una: lon, lat, alt (ele de OSM o del Copernicus GLO-30),
tipo, nombre (si lo tiene), potable (True/False solo si OSM lo dice), temporal (si se seca). Fuera las privadas.
Datos © colaboradores de OpenStreetMap (ODbL). Uso: python3 tools/fetch_fuentes.py"""
import json, os, re, sys, time, urllib.parse, urllib.request
import rasterio

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
meta = json.load(open(os.path.join(ROOT, 'data', 'terrain', 'meta.json')))
lon0, lat0 = meta['lon0'], meta['lat0']
lon1, lat1 = lon0 + (meta['ncols'] - 1) * meta['step'], lat0 - (meta['nrows'] - 1) * meta['step']
BBOX = f'{lat1:.4f},{lon0:.4f},{lat0:.4f},{lon1:.4f}'
Q = f'[out:json][timeout:180];(nwr["natural"="spring"]({BBOX});nwr["amenity"~"^(drinking_water|water_point)$"]({BBOX});nwr["man_made"="water_tap"]({BBOX}););out tags center;'
UA = {'User-Agent': 'tresmiles/1.0 (proyecto educativo)'}
HOSTS = ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter')
DEMS = [rasterio.open(os.path.expanduser('~/Tresmiles/data/dem/' + f)) for f in ('Copernicus_DSM_COG_10_N42_00_E000_00_DEM.tif', 'Copernicus_DSM_COG_10_N42_00_W001_00_DEM.tif')]

def cota(lon, lat):
    for r in DEMS:
        b = r.bounds
        if b.left <= lon < b.right and b.bottom <= lat < b.top:
            row, col = r.index(lon, lat); return float(r.read(1, window=((row, row + 1), (col, col + 1)))[0, 0])

def get():
    for i in range(6):
        for h in HOSTS:
            try: return json.loads(urllib.request.urlopen(urllib.request.Request(h, data=urllib.parse.urlencode({'data': Q}).encode(), headers=UA), timeout=150).read())
            except Exception as e: print('  reintento', h.split('/')[2], e, flush=True); time.sleep(5 * (i + 1))
    sys.exit('Overpass no responde')

def num(s):
    m = re.match(r'\s*(\d+(?:[.,]\d+)?)', str(s or '')); return float(m.group(1).replace(',', '.')) if m else None

out = []
for e in get()['elements']:
    t = e['tags']; nombre = (t.get('name:es') or t.get('name') or '').strip()
    lon, lat = (e['lon'], e['lat']) if 'lon' in e else (e['center']['lon'], e['center']['lat'])
    if t.get('access') in ('private', 'no'): continue
    ele = num(t.get('ele')); ele = ele if ele and 200 < ele < 3500 else cota(lon, lat)
    if ele is None: continue
    tipo = 'manantial' if t.get('natural') == 'spring' else 'fuente'
    dw = t.get('drinking_water')
    pot = 'si' if dw == 'yes' or (t.get('amenity') == 'drinking_water' and dw != 'no') else 'no' if dw in ('no', 'not_recommended') else None
    f = {'lon': round(lon, 5), 'lat': round(lat, 5), 'alt': round(ele), 'tipo': tipo}
    if nombre: f['nombre'] = nombre
    if pot: f['potable'] = pot == 'si'
    if t.get('seasonal') not in (None, 'no') or t.get('intermittent') == 'yes': f['temporal'] = True
    out.append(f)
# los repetidos (mismo sitio con nodo y área) fuera
vistos, final = set(), []
for f in sorted(out, key=lambda f: (not f.get('nombre'), f['tipo'] != 'fuente')):
    k = (round(f['lon'] * 2000), round(f['lat'] * 2000))
    if k in vistos: continue
    vistos.add(k); final.append(f)
final.sort(key=lambda f: -f['alt'])
json.dump(final, open(os.path.join(ROOT, 'data', 'fuentes.json'), 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
print(len(final), 'fuentes:', sum(f['tipo'] == 'fuente' for f in final), 'fuentes,', sum(f['tipo'] == 'manantial' for f in final), 'manantiales;', sum(f.get('potable') is True for f in final), 'potables,', sum(f.get('potable') is False for f in final), 'no potables,', sum('nombre' in f for f in final), 'con nombre')

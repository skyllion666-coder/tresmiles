#!/usr/bin/env python3
"""Descarga de OpenStreetMap (Overpass) los refugios del relieve cargado y los guarda en data/refugios.json. Tres tipos: guardado (tourism=alpine_hut), libre (tourism=wilderness_hut)
y cabaña o abrigo (amenity=shelter de montaña: basic_hut, rock_shelter, weather_shelter, lean_to y los de tipo sin indicar con nombre; fuera marquesinas, merenderos y observatorios).
Los que no tienen nombre se guardan con uno genérico («Refugio libre», «Cabaña o abrigo»): en una emergencia cuentan igual.
Cada refugio: nombre, lon, lat, altitud (ele de OSM o, si falta, del Copernicus GLO-30), guardado (bool), tipo, plazas, teléfono, web, operador.
Datos © colaboradores de OpenStreetMap (ODbL). Uso: python3 tools/fetch_refugios.py"""
import json, os, re, sys, time, urllib.parse, urllib.request
import rasterio

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
meta = json.load(open(os.path.join(ROOT, 'data', 'terrain', 'meta.json')))
lon0, lat0 = meta['lon0'], meta['lat0']
lon1, lat1 = lon0 + (meta['ncols'] - 1) * meta['step'], lat0 - (meta['nrows'] - 1) * meta['step']
BBOX = f'{lat1:.4f},{lon0:.4f},{lat0:.4f},{lon1:.4f}'
Q = f'[out:json][timeout:120];(nwr["tourism"~"^(alpine_hut|wilderness_hut)$"]({BBOX});nwr["amenity"="shelter"]({BBOX}););out tags center;'
CABANA = {'basic_hut', 'rock_shelter', 'weather_shelter', 'lean_to', 'basic'}
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
    t = e['tags']; nombre = t.get('name:es') or t.get('name')
    tipo = 'guardado' if t.get('tourism') == 'alpine_hut' else 'libre' if t.get('tourism') == 'wilderness_hut' else 'cabana' if t.get('shelter_type') in CABANA or (not t.get('shelter_type') and nombre) else None
    if not tipo: continue
    nombre = nombre or {'guardado': 'Refugio guardado', 'libre': 'Refugio libre', 'cabana': 'Cabaña o abrigo'}[tipo]
    lon, lat = (e['lon'], e['lat']) if 'lon' in e else (e['center']['lon'], e['center']['lat'])
    ele = num(t.get('ele')); ele = ele if ele and 300 < ele < 3500 else cota(lon, lat)
    if ele is None: continue
    r = {'nombre': nombre, 'lon': round(lon, 5), 'lat': round(lat, 5), 'alt': round(ele), 'guardado': tipo == 'guardado', 'tipo': tipo}
    plazas = num(t.get('capacity') or t.get('beds'))
    if plazas: r['plazas'] = int(plazas)
    tel = t.get('phone') or t.get('contact:phone')
    if tel: r['tel'] = tel.split(';')[0].strip()
    web = t.get('website') or t.get('contact:website') or t.get('url')
    if web: r['web'] = (web if web.startswith('http') else 'https://' + web).split(';')[0].strip()
    if t.get('operator'): r['gestor'] = t['operator']
    out.append(r)
out.sort(key=lambda r: (-r['alt']))
json.dump(out, open(os.path.join(ROOT, 'data', 'refugios.json'), 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
print(len(out), 'refugios:', sum(r['tipo'] == 'guardado' for r in out), 'guardados,', sum(r['tipo'] == 'libre' for r in out), 'libres,', sum(r['tipo'] == 'cabana' for r in out), 'cabañas o abrigos;', sum('tel' in r for r in out), 'con teléfono,', sum('plazas' in r for r in out), 'con plazas')

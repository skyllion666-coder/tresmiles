#!/usr/bin/env python3
"""Picos de 2.500 a 3.000 m con nombre (OpenStreetMap, data/picos_osm.json) dentro del relieve cargado y de Aragón o en su límite,
con una ficha sencilla (sin ruta). Escribe data/menores.json. La zona de cada pico es la del macizo o comarca más cercana (aproximada).
Límite de Aragón: OpenStreetMap vía Nominatim (tools/datos/aragon.geojson). Datos © colaboradores de OpenStreetMap (ODbL).
Uso: python3 tools/build_menores.py"""
import json, math, os, re, unicodedata
from shapely.geometry import shape, Point

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
D = lambda *p: os.path.join(ROOT, *p)
ARAGON = shape(json.load(open(D('tools', 'datos', 'aragon.geojson')))['features'][0]['geometry'])
FRANCIA = next(shape(f['geometry']) for f in json.load(open(os.path.expanduser('~/Tresmiles/data/vector/ne_10m_admin_0_countries.geojson')))['features'] if f['properties'].get('ADM0_A3') == 'FRA')
meta = json.load(open(D('data', 'terrain', 'meta.json')))
lon0, lat0 = meta['lon0'], meta['lat0']
lon1, lat1 = lon0 + (meta['ncols'] - 1) * meta['step'], lat0 - (meta['nrows'] - 1) * meta['step']
KX, KY = 111.2 * math.cos(math.radians(42.75)), 111.2   # km por grado
km = lambda a, b, c, d: math.hypot((a - c) * KX, (b - d) * KY)

data = json.load(open(D('data', 'peaks.json')))
# zonas: los macizos de los tresmiles (su centro) y otras sierras de menos de 3.000 m
ZONAS_NUEVAS = [
    {'id': 'z-anayet', 'nombre': 'Collarada–Telera–Anayet', 'c': (-0.44, 42.72)},
    {'id': 'z-tendenera', 'nombre': 'Tendeñera–Sobrepuerto', 'c': (-0.18, 42.66)},
    {'id': 'z-sobrarbe', 'nombre': 'Bielsa–Escuaín', 'c': (0.05, 42.60)},
    {'id': 'z-chistau', 'nombre': 'Valle de Chistau', 'c': (0.25, 42.57)},
    {'id': 'z-cerler', 'nombre': 'Cerler–Castanesa', 'c': (0.58, 42.59)},
]
centros = {}
for m in data['macizos']:
    ps = [p for p in data['picos'] if p['macizo'] == m['id']]
    centros[m['id']] = (sum(p['lon'] for p in ps) / len(ps), sum(p['lat'] for p in ps) / len(ps))
for z in ZONAS_NUEVAS: centros[z['id']] = z['c']
nombreZona = {**{m['id']: m['nombre'] for m in data['macizos']}, **{z['id']: z['nombre'] for z in ZONAS_NUEVAS}}

pueblos = [(n, lo, la) for n, lo, la, tipo, pob in json.load(open(D('data', 'pueblos.json'))) if tipo in ('village', 'town') and ARAGON.contains(Point(lo, la))]
fmt = lambda n: f'{n:,}'.replace(',', '.')
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()).strip('-')

ids = {p['id'] for p in data['picos']}
out, vistos = [], []
for nombre, lon, lat, alt in json.load(open(D('data', 'picos_osm.json'))):
    if not (2500 <= alt < 3000 and lon0 + 0.01 < lon < lon1 - 0.01 and lat1 + 0.01 < lat < lat0 - 0.01): continue
    pt = Point(lon, lat)
    limite = ARAGON.boundary.distance(pt) * KX * 1000   # m
    if not ARAGON.contains(pt) and limite > 300: continue
    if any(km(lon, lat, p['lon'], p['lat']) < 0.1 for p in data['picos']): continue   # ya es un tresmil del inventario
    if any(n == nombre and km(lon, lat, a, b) < 0.6 for n, a, b in vistos): continue   # repetido
    vistos.append((nombre, lon, lat))
    frontera = limite < 300 and FRANCIA.distance(pt) * KX < 1.5
    situacion = 'Frontera Aragón–Francia' if frontera else ('Límite de Aragón' if limite < 300 else 'Aragón')
    zona = min(centros, key=lambda k: km(lon, lat, *centros[k]))
    pn, plo, pla = min(pueblos, key=lambda q: km(lon, lat, q[1], q[2]))
    dist = km(lon, lat, plo, pla)
    pid = base = slug(nombre) or 'pico'
    k = 2
    while pid in ids: pid = f'{base}-{k}'; k += 1
    ids.add(pid)
    lugar = 'en la frontera entre Aragón y Francia' if frontera else ('en el límite de Aragón' if limite < 300 else 'en territorio aragonés')
    out.append({
        'id': pid, 'nombre': nombre, 'altitud': alt, 'lat': lat, 'lon': lon, 'macizo': zona, 'frontera': frontera, 'situacion': situacion,
        'cerca': f'{pn} ({fmt(round(dist))} km en línea recta)' if dist >= 1 else pn,
        'descripcion': f'Cumbre de {fmt(alt)} m de la zona {nombreZona[zona]}, {lugar}. Es una ficha sencilla: sin ruta ni recorrido en el mapa. Nombre, altitud y posición de OpenStreetMap.',
        'menor': True,
    })
out.sort(key=lambda p: -p['altitud'])
json.dump({'zonas': [{'id': z['id'], 'nombre': z['nombre']} for z in ZONAS_NUEVAS if any(p['macizo'] == z['id'] for p in out)], 'picos': out},
          open(D('data', 'menores.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(out), 'picos de 2.500 a 3.000 m;', sum(p['frontera'] for p in out), 'en la frontera con Francia;', os.path.getsize(D('data', 'menores.json')) // 1024, 'KB')

#!/usr/bin/env python3
"""Descarga de OpenStreetMap (Overpass) los contornos y nombres de los ibones del relieve cargado y los guarda en data/lagos.json.
Datos © colaboradores de OpenStreetMap (ODbL). Uso: python3 tools/fetch_lagos.py"""
import json, math, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
meta = json.load(open(os.path.join(ROOT, 'data', 'terrain', 'meta.json')))
lon0, lat0 = meta['lon0'], meta['lat0']
lon1, lat1 = lon0 + (meta['ncols'] - 1) * meta['step'], lat0 - (meta['nrows'] - 1) * meta['step']
BBOX = f'{lat1:.4f},{lon0:.4f},{lat0:.4f},{lon1:.4f}'
Q = f'[out:json][timeout:180];(way["natural"="water"]["water"~"lake|reservoir|pond"]({BBOX});relation["natural"="water"]["water"~"lake|reservoir|pond"]({BBOX});way["natural"="water"][!"water"]({BBOX}););out geom;'
UA = {'User-Agent': 'tresmiles/1.0 (proyecto educativo)'}

def get():
    for i in range(8):
        for host in ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'):
            try:
                req = urllib.request.Request(host, data=urllib.parse.urlencode({'data': Q}).encode(), headers=UA)
                return json.loads(urllib.request.urlopen(req, timeout=240).read())
            except Exception as e:
                print('  reintento', i + 1, host.split('/')[2], e); time.sleep(10 * (i + 1))
    sys.exit('Overpass no responde')

def area(poly):   # m² aproximados
    k = 111320 * math.cos(math.radians(42.8)); s = 0
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]): s += (x1 * k) * (y2 * 110574) - (x2 * k) * (y1 * 110574)
    return abs(s) / 2

def stitch(ways):   # une tramos abiertos de un multipolígono en anillos cerrados
    segs = [list(w) for w in ways if len(w) > 1]; rings = []
    while segs:
        r = segs.pop()
        changed = True
        while changed and r[0] != r[-1]:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == r[-1]: r += s[1:]; segs.pop(i); changed = True; break
                if s[-1] == r[-1]: r += s[::-1][1:]; segs.pop(i); changed = True; break
                if s[-1] == r[0]: r = s[:-1] + r; segs.pop(i); changed = True; break
                if s[0] == r[0]: r = s[::-1][:-1] + r; segs.pop(i); changed = True; break
        if r[0] == r[-1] and len(r) > 3: rings.append(r[:-1])
    return rings

# Nombres que OpenStreetMap no trae, verificados en otras fuentes (id OSM -> nombre)
NOMBRES_EXTRA = {49179050: 'Ibón Medio de Coronas', 49179048: 'Ibonet de Coronas',   # el nivel del relieve y lacsdespyrenees.com cuadran (2.239 m / 2.235 m)
                 49179049: 'Ibón Inferior de Coronas', 49179052: 'Ibón Superior de Coronas'}   # por altura (2.626 m / 2.770 m) y posición bajo el glaciar; el Superior es menos seguro
# Ibones sin polígono en OpenStreetMap: (nombre, lon, lat, m² según lacsdespyrenees.com), se dibujan como círculo y siempre llevan etiqueta
LAGOS_EXTRA = [('Ibón Maldito', 0.64216, 42.63415, 1000), ('Ibón Coronado', 0.6528, 42.63456, 2000)]   # el mayor de los ibones de Coronas, 5,1 ha, 2.735 m (lacsdespyrenees.com)

pts = lambda g: [(round(p['lon'], 5), round(p['lat'], 5)) for p in g]
out = []; vistos = set()
for e in get()['elements']:
    t = e.get('tags', {}); nombre = t.get('name') or t.get('name:es') or None
    nombre = NOMBRES_EXTRA.get(e['id'], nombre)
    nombre = {"Barage d'Ossoue": "Barrage d'Ossoue"}.get(nombre, nombre)   # errata de OpenStreetMap
    anillos = []
    if e['type'] == 'way' and len(e.get('geometry', [])) > 3 and e['geometry'][0] == e['geometry'][-1]: anillos = [pts(e['geometry'])[:-1]]
    elif e['type'] == 'relation': anillos = stitch([pts(m['geometry']) for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')])
    for r in anillos:
        a = area(r)
        if a < 600: continue
        out.append(dict(id=e['id'], nombre=nombre, tipo='lake', area=int(a), poly=[list(p) for p in r]))
for k, (nom, lo, la, a) in enumerate(LAGOS_EXTRA):
    r = math.sqrt(a / math.pi)
    out.append(dict(id=-1 - k, nombre=nom, tipo='lake', area=a, etiqueta=True, poly=[[round(lo + r * math.cos(t) / (111320 * math.cos(math.radians(la))), 5), round(la + r * math.sin(t) / 111132, 5)] for t in [i * math.pi / 8 for i in range(16)]]))
out.sort(key=lambda l: -l['area'])
json.dump(out, open(os.path.join(ROOT, 'data', 'lagos.json'), 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
print(len(out), 'lagos,', sum(1 for l in out if l['nombre']), 'con nombre')

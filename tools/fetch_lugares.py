#!/usr/bin/env python3
"""Nombres de barrancos, gargantas, cascadas, miradores, cuevas y otros lugares conocidos de la Sierra de Guara (OpenStreetMap, Overpass).
Solo etiquetas en el mapa, sin ficha. Guarda data/lugares.json = [[nombre, lon, lat, tipo], …] y, aparte, tools/datos/lugares_candidatos.json con todo lo
encontrado y su puntuación, para revisar a mano; `tools/datos/lugares_lista.json` (si existe) manda sobre la selección automática.
Datos © colaboradores de OpenStreetMap (ODbL). Uso: python3 tools/fetch_lugares.py"""
import json, math, os, re, sys, time, unicodedata, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
GUARA = (-0.56, 0.12, 41.99, 42.40)   # lon0, lon1, lat0, lat1: la misma caja que tools/build_menores.py
BBOX = f'{GUARA[2]},{GUARA[0]},{GUARA[3]},{GUARA[1]}'
Q = f'''[out:json][timeout:120];(
 nwr["natural"~"^(gorge|valley|cave_entrance|waterfall|spring|arch|cliff)$"]["name"]({BBOX});
 nwr["waterway"~"^(canyon|waterfall|river)$"]["name"]({BBOX});
 nwr["tourism"~"^(viewpoint|attraction)$"]["name"]({BBOX});
 nwr["sport"~"^(canyoning|climbing)$"]["name"]({BBOX});
 way["waterway"="stream"]["name"~"^(Barranco|Barranc|Barrancu|Foz|Oscuros|Gargant)"]({BBOX});
);out center tags;'''
UA = {'User-Agent': 'tresmiles/1.0 (proyecto educativo)'}
HOSTS = ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter')

def get():
    for i in range(10):
        for host in HOSTS:
            try:
                req = urllib.request.Request(host, data=urllib.parse.urlencode({'data': Q}).encode(), headers=UA)
                return json.loads(urllib.request.urlopen(req, timeout=130).read())
            except Exception as e:
                print('  reintento', i + 1, host.split('/')[2], e, flush=True); time.sleep(6 * (i + 1))
    sys.exit('Overpass no responde')

def tipo(t):
    if t.get('sport') == 'canyoning' or t.get('waterway') == 'canyon' or t.get('natural') == 'gorge' or re.match(r'(?i)(barranc|foz|oscuros|gargant)', t['name']): return 'barranco'
    if t.get('waterway') == 'waterfall' or t.get('natural') == 'waterfall': return 'cascada'
    if t.get('tourism') == 'viewpoint': return 'mirador'
    if t.get('natural') == 'cave_entrance': return 'cueva'
    if t.get('sport') == 'climbing' or t.get('natural') in ('cliff', 'arch'): return 'roca'
    if t.get('waterway') == 'river': return 'rio'
    if t.get('natural') == 'valley': return 'valle'
    return 'lugar'

sin = lambda s: unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()
out, vistos = [], set()
for e in get()['elements']:
    t = e.get('tags', {}); nombre = (t.get('name') or '').strip()
    if not nombre: continue
    c = e.get('center') or e
    lon, lat = c.get('lon'), c.get('lat')
    if lon is None or not (GUARA[0] <= lon <= GUARA[1] and GUARA[2] <= lat <= GUARA[3]): continue
    k = (sin(nombre), round(lon, 2), round(lat, 2))
    if k in vistos: continue
    vistos.add(k)
    out.append([nombre, round(lon, 4), round(lat, 4), tipo(t)])
out.sort(key=lambda x: (x[3], x[0]))
os.makedirs(os.path.join(ROOT, 'tools', 'datos'), exist_ok=True)
json.dump(out, open(os.path.join(ROOT, 'tools', 'datos', 'lugares_candidatos.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
from collections import Counter
print(len(out), 'candidatos:', dict(Counter(x[3] for x in out)))
# la selección final (tools/datos/lugares_lista.json, hecha a mano a partir de los candidatos) es la que va a la web
lista = os.path.join(ROOT, 'tools', 'datos', 'lugares_lista.json')
if os.path.exists(lista):
    sel = json.load(open(lista, encoding='utf-8'))
    json.dump([[n, lo, la] for n, lo, la, t in sel], open(os.path.join(ROOT, 'data', 'lugares.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(len(sel), 'lugares en data/lugares.json')

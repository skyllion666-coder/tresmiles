#!/usr/bin/env python3
"""Descarga de OpenStreetMap (Overpass) los picos con nombre del relieve cargado y los guarda en data/picos_osm.json
como [nombre, lon, lat, altitud_m|0]. Datos © colaboradores de OpenStreetMap (ODbL). Uso: python3 tools/fetch_picos.py [sur]"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
meta = json.load(open(os.path.join(ROOT, 'data', 'terrain', 'meta.json')))
lon0, lat0 = meta['lon0'], meta['lat0']
lon1, lat1 = lon0 + (meta['ncols'] - 1) * meta['step'], lat0 - (meta['nrows'] - 1) * meta['step']
# «sur»: solo la franja nueva (al sur de la rejilla original, lat < LAT_SUR) y se fusiona con el archivo que ya hay: Overpass se atraganta con todo el mapa
SUR = len(sys.argv) > 1 and sys.argv[1] == 'sur'; LAT_SUR = meta['lat0'] - (meta.get('nrows0', meta['nrows']) - 1) * meta['step']
BBOX = f'{lat1:.4f},{lon0:.4f},{(LAT_SUR if SUR else lat0):.4f},{lon1:.4f}'
Q = f'[out:json][timeout:90];node["natural"="peak"]["name"]({BBOX});out;'
UA = {'User-Agent': 'tresmiles/1.0 (proyecto educativo)'}
HOSTS = ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter')


def get():
    for i in range(10):
        for host in HOSTS:
            try:
                req = urllib.request.Request(host, data=urllib.parse.urlencode({'data': Q}).encode(), headers=UA)
                return json.loads(urllib.request.urlopen(req, timeout=100).read())
            except Exception as e:
                print('  reintento', i + 1, host.split('/')[2], e, flush=True)
                time.sleep(6 * (i + 1))
    sys.exit('Overpass no responde')


out = []
for e in get()['elements']:
    t = e['tags']
    nombre = (t.get('name') or '').strip()
    if not nombre:
        continue
    m = re.match(r'\s*(\d{3,4})(?:[.,]\d+)?', t.get('ele', ''))
    out.append([nombre, round(e['lon'], 4), round(e['lat'], 4), int(m.group(1)) if m else 0])
dest = os.path.join(ROOT, 'data', 'picos_osm.json')
if SUR:   # lo de antes, salvo lo que cae en la franja nueva
    out = [p for p in json.load(open(dest, encoding='utf-8')) if p[2] >= LAT_SUR] + out
out.sort(key=lambda p: -p[3])
json.dump(out, open(dest, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(out), 'picos con nombre;', sum(1 for p in out if p[3]), 'con altitud;', sum(1 for p in out if p[3] >= 3000), '≥ 3.000 m;', os.path.getsize(dest) // 1024, 'KB')

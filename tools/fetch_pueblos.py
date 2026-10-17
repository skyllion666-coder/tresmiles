#!/usr/bin/env python3
"""Descarga de OpenStreetMap (Overpass) los núcleos de población con nombre del relieve cargado y los guarda en data/pueblos.json.
Datos © colaboradores de OpenStreetMap (ODbL). Uso: python3 tools/fetch_pueblos.py"""
import json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
meta = json.load(open(os.path.join(ROOT, 'data', 'terrain', 'meta.json')))
lon0, lat0 = meta['lon0'], meta['lat0']
lon1, lat1 = lon0 + (meta['ncols'] - 1) * meta['step'], lat0 - (meta['nrows'] - 1) * meta['step']
BBOX = f'{lat1:.4f},{lon0:.4f},{lat0:.4f},{lon1:.4f}'
Q = f'[out:json][timeout:120];node["place"~"^(city|town|village|hamlet)$"]["name"]({BBOX});out tags center;'
UA = {'User-Agent': 'tresmiles/1.0 (proyecto educativo)'}
ORDEN = {'city': 0, 'town': 1, 'village': 2, 'hamlet': 3}

def get():
    for i in range(8):
        for host in ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'):
            try:
                req = urllib.request.Request(host, data=urllib.parse.urlencode({'data': Q}).encode(), headers=UA)
                return json.loads(urllib.request.urlopen(req, timeout=180).read())
            except Exception as e:
                print('  reintento', i + 1, host.split('/')[2], e); time.sleep(10 * (i + 1))
    sys.exit('Overpass no responde')

out = []
for e in get()['elements']:
    t = e['tags']
    try: pop = int(str(t.get('population', '0')).replace('.', '').replace(' ', '') or 0)
    except ValueError: pop = 0
    out.append([t['name'], round(e['lon'], 5), round(e['lat'], 5), t['place'], pop])
out.sort(key=lambda p: (ORDEN[p[3]], -p[4], p[0]))
json.dump(out, open(os.path.join(ROOT, 'data', 'pueblos.json'), 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
print(len(out), 'núcleos:', {k: sum(1 for p in out if p[3] == k) for k in ORDEN})

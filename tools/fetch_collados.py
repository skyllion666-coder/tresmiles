#!/usr/bin/env python3
"""Collados y puertos de OpenStreetMap (natural=saddle, mountain_pass=yes) en toda la zona del mapa → ~/tresmiles-fuentes/collados_osm.json.
Reintenta con espera creciente (Overpass suele estar saturado). © OpenStreetMap (ODbL)."""
import json, os, time, urllib.request, urllib.parse
HOSTS = ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter')
Q = '[out:json][timeout:170];(node["natural"="saddle"](41.95,-0.55,43.00,0.90);node["mountain_pass"="yes"](41.95,-0.55,43.00,0.90););out body;'
SAL = os.path.expanduser('~/tresmiles-fuentes/collados_osm.json')
espera = 30
for intento in range(12):
    for h in HOSTS:
        try:
            req = urllib.request.Request(h, data=urllib.parse.urlencode({'data': Q}).encode(), headers={'User-Agent': 'tresmiles-mapa/1.0'})
            d = json.loads(urllib.request.urlopen(req, timeout=200).read())
            json.dump(d, open(SAL, 'w'), ensure_ascii=False)
            print('ok', h, len(d['elements']), flush=True); raise SystemExit
        except SystemExit: raise
        except Exception as e:
            print(intento, h, str(e)[:80], flush=True)
    time.sleep(espera); espera = min(espera * 2, 600)
print('sin respuesta')

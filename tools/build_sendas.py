#!/usr/bin/env python3
"""Capa «Sendas y pistas» (botón del mapa): los caminos de OpenStreetMap (~/tresmiles-fuentes/sendas_osm.json, los mismos de tools/pegar_sendas.py)
en teselas de 5 km en coordenadas del mundo de la web (x este, z sur, metros; tools/build_paquete.py → toXZ), simplificados a 3 m.
Salida: data/sendas/index.json {lado, teselas: ["i_j", …]} y data/sendas/<i>_<j>.json {l: [[tipo, x0, z0, dx, dz, …], …]} (tipo 0 senda, 1 pista, 2 vía ferrata).
Un camino que cruza teselas va entero en la de su primer punto (las teselas se cargan con margen). Datos © colaboradores de OpenStreetMap (ODbL).
Uso: python3 tools/build_sendas.py"""
import json, math, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gpx2json import dp
T = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(T, '..')
src = open(os.path.join(T, 'build_paquete.py')).read().replace("os.path.dirname(os.path.abspath(__file__))", repr(T))
exec(src[src.index('ROOT ='):src.index('def aplana_sombras')])
LADO5 = 5000; TIPO = {'track': 1, 'via_ferrata': 2}
out = {}
for w in json.load(open(os.path.expanduser('~/tresmiles-fuentes/sendas_osm.json'))):
    p = [toXZ(lon, lat) for lon, lat in w['g']]
    p = [q[:2] for q in dp([(x, z, 0) for x, z in p], 3.0)]
    q = [(round(x), round(z)) for x, z in p]
    if len(q) < 2: continue
    lin = [TIPO.get(w['h'], 0), q[0][0], q[0][1]]
    for (a, b), (c, d) in zip(q, q[1:]): lin += [c - a, d - b]
    k = f'{math.floor(q[0][0] / LADO5)}_{math.floor(q[0][1] / LADO5)}'
    out.setdefault(k, []).append(lin)
D = os.path.join(ROOT, 'data/sendas'); shutil.rmtree(D, ignore_errors=True); os.makedirs(D)
for k, l in out.items(): json.dump({'l': l}, open(os.path.join(D, k + '.json'), 'w'), separators=(',', ':'))
json.dump({'lado': LADO5, 'teselas': sorted(out)}, open(os.path.join(D, 'index.json'), 'w'), separators=(',', ':'))
tot = sum(os.path.getsize(os.path.join(D, f)) for f in os.listdir(D))
print(len(out), 'teselas,', sum(len(l) for l in out.values()), 'caminos,', round(tot / 1e6, 1), 'MB')

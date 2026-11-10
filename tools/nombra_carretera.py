#!/usr/bin/env python3
"""Pone nombre a las salidas «la carretera» de data/subidas (aparcamientos sin nombre en OSM y lejos de todo).
Los nombres salen de lo que hay en OpenStreetMap junto a cada salida (consulta del 10-11-2026).
Uso: tools/nombra_carretera.py   → dice las que no sabe nombrar (salida a más de 400 m de las conocidas)."""
import glob, json, math

SALIDAS = [   # lon, lat, nombre
    (-0.059575, 42.649615, 'Pradera de Ordesa'),
    (0.758135, 42.596256, 'Puente de Salenques'),          # N-230, junto al embalse de Baserca
    (0.581492, 42.661364, 'Puente de los Baños'),          # carretera de Benasque, Baños de Benasque
    (0.585389, 42.661382, 'Baños de Benasque'),
    (0.346111, 42.615172, 'Molino de Chistén'),            # Valle de Chistau, Puen del Molín
    (-0.107513, 42.644453, 'Camping San Antón (Torla)'),
    (-0.108533, 42.660652, 'Pista de Bujaruelo (Las Tobas)'),
    (0.563748, 42.641449, 'Plan de Senarta'),               # arranque de la pista de Vallibierna
]

for f in sorted(glob.glob('data/subidas/*.json')):
    if f.endswith('index.json'): continue
    d = json.load(open(f)); cambia = False
    for s in d['subidas']:
        if s.get('desde') != 'la carretera': continue
        lo, la = s['puntos'][0][:2]
        dist, nom = min((math.hypot((x - lo) * 82000, (y - la) * 111000), n) for x, y, n in SALIDAS)
        if dist < 400: s['desde'] = nom; cambia = True; print(f'{s["id"]}: {nom}')
        else: print(f'{s["id"]}: SIN NOMBRE ({lo}, {la})')
    if cambia: json.dump(d, open(f, 'w'), ensure_ascii=False, separators=(',', ':'))

#!/usr/bin/env python3
"""Quita de los tracks de las rutas (data/rutas/*.json, los de Wikiloc; no los trazados por OSM) los saltos del GPS: «dientes» en los que un punto se
aparta y el siguiente vuelve casi al mismo sitio para seguir en la misma dirección que traía. Las revueltas de verdad (lazadas, zigzags de una canal)
se quedan: después del giro el camino sigue en la dirección contraria. Se repite hasta que no queda ninguno y se recalcula la distancia acumulada.
El track original sigue en Wikiloc (enlace de la ficha); aquí se guarda `suavizada`: puntos quitados. Uso: python3 tools/suavizar_rutas.py [id ...]"""
import glob, json, math, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

def diente(P, i, xy):
    """¿El punto i es un salto del GPS? (necesita i-2 … i+2)."""
    a, p, b = xy[i - 1], xy[i], xy[i + 1]
    na, nb, ab = math.dist(a, p), math.dist(p, b), math.dist(a, b)
    if min(na, nb) < 1e-6 or max(na, nb) > 90: return False
    if ab > 0.5 * min(na, nb): return False   # vuelve casi al mismo sitio
    d0 = (a[0] - xy[i - 2][0], a[1] - xy[i - 2][1]); d1 = (xy[i + 2][0] - b[0], xy[i + 2][1] - b[1])
    n0, n1 = math.hypot(*d0), math.hypot(*d1)
    if n0 < 1e-6 or n1 < 1e-6: return True
    return (d0[0] * d1[0] + d0[1] * d1[1]) / (n0 * n1) > 0.5   # y sigue en la dirección que traía (menos de 60°): no es una lazada

def suaviza(f):
    r = json.load(open(f))
    if r.get('osm'): return None
    P = r['puntos']; lat0 = P[0][1]; mx, my = 111320 * math.cos(math.radians(lat0)), 111132
    quitados = 0
    while True:
        xy = [((p[0] - P[0][0]) * mx, (p[1] - P[0][1]) * my) for p in P]
        malos = [i for i in range(2, len(P) - 2) if diente(P, i, xy)]
        if not malos: break
        quita = set(); ult = -9
        for i in malos:   # de uno en uno por zona: al quitar uno cambian sus vecinos
            if i - ult >= 3: quita.add(i); ult = i
        P = [p for k, p in enumerate(P) if k not in quita]; quitados += len(quita)
    if not quitados: return 0
    d = 0.0
    for k in range(len(P)):
        if k: d += math.hypot((P[k][0] - P[k - 1][0]) * mx, (P[k][1] - P[k - 1][1]) * my)
        P[k] = [P[k][0], P[k][1], P[k][2], round(d)]
    r['puntos'] = P; r['distancia'] = round(d); r['suavizada'] = r.get('suavizada', 0) + quitados
    json.dump(r, open(f, 'w'), ensure_ascii=False, separators=(',', ':'))
    return quitados

ids = sys.argv[1:]
for f in sorted(glob.glob(os.path.join(ROOT, 'data/rutas/*.json'))):
    rid = os.path.basename(f)[:-5]
    if ids and rid not in ids: continue
    q = suaviza(f)
    if q: print(rid, q, 'saltos quitados')

#!/usr/bin/env python3
"""Rehace una ruta (data/rutas/<id>.json) o las «Otras subidas» de una cumbre (data/subidas/<cumbre>.json) POR LA RED DE CAMINOS de OpenStreetMap,
como un navegador: la línea va exactamente sobre el camino (que coincide con la ortofoto), sin los zigzags ni los desvíos del GPS.
- Red: ~/tresmiles-fuentes/sendas_osm.json (los caminos que comparten un punto se cruzan ahí).
- El track original (de ~/tresmiles-fuentes/antes_sendas/ si existe) se parte en tramos «con camino» (a menos de CERCA m de la red) y «sin camino»
  (cima, glaciar, pedrera: se queda el GPS). Cada tramo con camino se corta en trozos de ~TROZO m y cada trozo se busca por la red con un camino
  más corto que penaliza alejarse del track (pasillo): así sigue la misma vía que el track, no un atajo.
- Comprobación: si en un trozo el camino encontrado se aparta del track más de DESVIO m o es más de un LARGO de veces más largo, ese trozo
  se queda con el GPS pegado (tools/pegar_sendas.py). Se imprime un informe por ruta.
Datos © colaboradores de OpenStreetMap (ODbL). Uso: python3 tools/rutas_por_caminos.py <id ruta | cumbre> … [--prueba]"""
import heapq, json, math, os, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gpx2json import dp
import pegar_sendas as PS

ROOT, ANTES = PS.ROOT, PS.ANTES
CERCA, TROZO, DESVIO, LARGO, PASILLO = 35.0, 1200.0, 60.0, 1.35, 120.0
xy, mLon, mLat = PS.xy, PS.mLon, PS.mLat

def red():
    nodos, ady = {}, defaultdict(list)   # clave (lon,lat) -> id ; id -> [(vecino, largo)]
    pts = []
    def nid(p):
        k = (round(p[0], 6), round(p[1], 6))
        if k not in nodos: nodos[k] = len(pts); pts.append(xy(*k))
        return nodos[k]
    for w in json.load(open(os.path.join(PS.F, 'sendas_osm.json'))):
        ids = [nid(p) for p in w['g']]
        for a, b in zip(ids, ids[1:]):
            if a == b: continue
            L = math.dist(pts[a], pts[b]); ady[a].append((b, L)); ady[b].append((a, L))
    rej = defaultdict(list)
    for a in ady:
        x, y = pts[a]; rej[(int(x // 100), int(y // 100))].append(a)
    return pts, ady, rej

def dist_seg(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy or 1e-9
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)); return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)

class Linea:   # distancia rápida de un punto a una polilínea (rejilla de 50 m)
    def __init__(s, P):
        s.P = P; s.g = defaultdict(list)
        for i in range(len(P) - 1):
            for k in {(int(P[i][0] // 50), int(P[i][1] // 50)), (int(P[i + 1][0] // 50), int(P[i + 1][1] // 50))}: s.g[k].append(i)
    def d(s, p, lim=200):
        r = int(lim // 50) + 1; i0, j0 = int(p[0] // 50), int(p[1] // 50); m = 1e9
        for i in range(i0 - r, i0 + r + 1):
            for j in range(j0 - r, j0 + r + 1):
                for k in s.g.get((i, j), ()): m = min(m, dist_seg(p, s.P[k], s.P[k + 1]))
        return m

def nodo_cerca(pts, rej, p, lim=CERCA):
    i0, j0 = int(p[0] // 100), int(p[1] // 100); m = None
    for i in (i0 - 1, i0, i0 + 1):
        for j in (j0 - 1, j0, j0 + 1):
            for n in rej.get((i, j), ()):
                d = math.dist(p, pts[n])
                if d < lim and (m is None or d < m[0]): m = (d, n)
    return m and m[1]

def busca(pts, ady, a, b, linea):
    """camino más corto de a a b con penalización por alejarse del track (solo dentro del pasillo)"""
    cache = {}
    def pen(n):
        if n not in cache: cache[n] = linea.d(pts[n], PASILLO)
        return cache[n]
    dist, prev, cola = {a: 0.0}, {}, [(0.0, a)]
    while cola:
        c, n = heapq.heappop(cola)
        if n == b: break
        if c > dist[n]: continue
        for v, L in ady[n]:
            dv = pen(v)
            if dv > PASILLO: continue
            nc = c + L * (1 + (dv / 12.0) ** 2)
            if nc < dist.get(v, 1e18): dist[v] = nc; prev[v] = n; heapq.heappush(cola, (nc, v))
    if b not in dist: return None
    r = [b]
    while r[-1] != a: r.append(prev[r[-1]])
    return r[::-1]

def rehace(puntos, pts, ady, rej, nombre):
    # track en metros, densificado a 10 m, con altitud
    T = []
    for a, b in zip(puntos, puntos[1:]):
        A, B = xy(a[0], a[1]), xy(b[0], b[1]); n = max(1, math.ceil(math.dist(A, B) / 10))
        for k in range(n): t = k / n; T.append((A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, a[2] + (b[2] - a[2]) * t))
    T.append((*xy(puntos[-1][0], puntos[-1][1]), puntos[-1][2]))
    cerca = [nodo_cerca(pts, rej, p[:2]) for p in T]
    # cortes: trozos de ~TROZO m en los tramos con camino (los bordes de cada trozo, en un nodo de la red cercano)
    out, i, n_ok, n_no, m_ok, m_tot = [], 0, 0, 0, 0.0, 0.0
    def tramo_pegado(i, j):   # trozo sin ruta por la red: el GPS de ese trozo, pegado a los caminos cercanos (tools/pegar_sendas.py)
        ll = [[p[0] / mLon, p[1] / mLat, p[2]] for p in T[i:j + 1]]
        return [(*xy(q[0], q[1]), q[2]) for q in PS.pega(ll, *PS_IDX)[0]] if len(ll) > 1 else [T[i]]
    while i < len(T) - 1:
        if cerca[i] is None:   # sin camino: GPS hasta que vuelva a haber camino
            j = i
            while j < len(T) - 1 and cerca[j + 1] is None: j += 1
            j = min(j + 1, len(T) - 1); out += [T[k] for k in range(i, j + 1)]; m_tot += 10 * (j - i); i = j; continue
        j = min(len(T) - 1, i + int(TROZO / 10))
        while j > i + 1 and cerca[j] is None: j -= 1
        if j == i + 1 and cerca[j] is None: out.append(T[i]); i += 1; continue
        trozo = T[i:j + 1]; L0 = 10 * (j - i); linea = Linea([p[:2] for p in trozo])
        r = busca(pts, ady, cerca[i], cerca[j], linea) if cerca[i] != cerca[j] else [cerca[i]]
        ok = False
        if r:
            camino = [pts[n] for n in r]; Lc = sum(math.dist(a, b) for a, b in zip(camino, camino[1:]))
            dev = max([linea.d(p, 300) for p in camino] + [Linea(camino).d(p[:2], 300) if len(camino) > 1 else 0 for p in trozo[::5]])
            ok = dev <= DESVIO and Lc <= LARGO * L0 + 40
        if ok:
            # altitud: la del punto del track más cercano (solo para el perfil; la línea 3D va sobre el relieve)
            for p in camino:
                k = min(range(len(trozo)), key=lambda q: math.dist(trozo[q][:2], p)); out.append((p[0], p[1], trozo[k][2]))
            n_ok += 1; m_ok += L0
        else:
            out += tramo_pegado(i, j); n_no += 1
        m_tot += L0; i = j
    out.append(T[-1])
    # quitar duplicados seguidos y simplificar a 1 m
    lim = [out[0]] + [p for a, p in zip(out, out[1:]) if math.dist(a[:2], p[:2]) > 0.3]
    def pico(a, b, c):   # ida y vuelta en la junta entre dos trozos
        u = (b[0] - a[0], b[1] - a[1]); v = (c[0] - b[0], c[1] - b[1]); lu, lv = math.hypot(*u), math.hypot(*v)
        return lu > 0.5 and lv > 0.5 and (u[0] * v[0] + u[1] * v[1]) / (lu * lv) < -0.7
    cambio = True
    while cambio:
        cambio = False; k = 1
        while k < len(lim) - 1:
            if pico(lim[k - 1], lim[k], lim[k + 1]): del lim[k]; cambio = True
            else: k += 1
    keep = dp([(x, y, z, k) for k, (x, y, z) in enumerate(lim)], 1.0)
    nuevos, acum, prev = [], 0.0, None
    for x, y, z, _ in keep:
        if prev: acum += math.hypot(x - prev[0], y - prev[1])
        nuevos.append([round(x / mLon, 6), round(y / mLat, 6), round(z, 1), round(acum)]); prev = (x, y)
    L_orig = sum(math.dist(a[:2], b[:2]) for a, b in zip(T, T[1:]))
    print(f'{nombre}: {m_ok / max(1, m_tot) * 100:.0f} % por la red de caminos ({n_ok} trozos), {n_no} trozos con el GPS pegado; {L_orig / 1000:.2f} → {acum / 1000:.2f} km', flush=True)
    return nuevos

PS_IDX = None
def main():
    global PS_IDX
    args = [a for a in sys.argv[1:] if not a.startswith('--')]; prueba = '--prueba' in sys.argv
    pts, ady, rej = red(); PS_IDX = PS.indice(); print(len(pts), 'nodos de camino', flush=True)
    for a in args:
        if os.path.exists(os.path.join(ROOT, 'data/rutas', a + '.json')):
            d = PS.original(f'rutas/{a}.json'); n = rehace(d['puntos'], pts, ady, rej, 'ruta ' + a)
            if not prueba: d['puntos'] = n; d['distancia'] = n[-1][3]; d['por_caminos'] = True; json.dump(d, open(os.path.join(ROOT, 'data/rutas', a + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
        if os.path.exists(os.path.join(ROOT, 'data/subidas', a + '.json')):
            d = PS.original(f'subidas/{a}.json')
            for s in d['subidas']:
                n = rehace(s['puntos'], pts, ady, rej, 'subida ' + s['id'])
                if not prueba: s['puntos'] = n; s['distancia'] = n[-1][3]
            if not prueba: d['por_caminos'] = True; json.dump(d, open(os.path.join(ROOT, 'data/subidas', a + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))

if __name__ == '__main__': main()

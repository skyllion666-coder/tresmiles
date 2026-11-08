#!/usr/bin/env python3
"""Pega las rutas (data/rutas/<id>.json) y las «Otras subidas» (data/subidas/<cumbre>.json) a los senderos y pistas de OpenStreetMap,
que están dibujados sobre las ortofotos del PNOA: así la línea va por el camino que se ve en la foto y no a 10–40 m (error del GPS de quien grabó el track).
- Senderos: ~/tresmiles-fuentes/sendas_osm.json (highway=path/footway/track/bridleway/steps/via_ferrata de todo el relieve, de Overpass).
- Cada punto (la ruta se densifica a 5 m) se lleva al punto más cercano de un camino a menos de RADIO m; en los cruces se prefiere seguir por el mismo
  camino (un cambio cuesta CAMBIO m). Donde no hay camino cerca (glaciar, pedrera, cresta sin senda) se queda el GPS, con un fundido de unos metros.
  Si dos puntos seguidos pegados quedan muy separados (salto entre caminos paralelos), esos no se pegan.
- Altitudes: las del track (solo se usan en el perfil; la línea 3D va sobre el relieve). Distancias recalculadas. Se simplifica a 1,5 m.
- Los originales se guardan en ~/tresmiles-fuentes/antes_sendas/ (si ya están, se parte de ellos: se puede relanzar sin acumular cambios).
Datos © colaboradores de OpenStreetMap (ODbL). Uso: python3 tools/pegar_sendas.py [--todas | --subidas | id …] [--prueba]"""
import json, math, os, shutil, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gpx2json import dp

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
F = os.path.expanduser('~/tresmiles-fuentes'); ANTES = os.path.join(F, 'antes_sendas')
RADIO, CAMBIO, PASO, CELDA = 30.0, 10.0, 5.0, 50.0
LAT0 = 42.7; mLon = 111320 * math.cos(math.radians(LAT0)); mLat = 110540
xy = lambda lon, lat: (lon * mLon, lat * mLat)

def indice():
    segs, grid = [], defaultdict(list)
    for w in json.load(open(os.path.join(F, 'sendas_osm.json'))):
        g = [xy(*p) for p in w['g']]
        for a, b in zip(g, g[1:]):
            k = len(segs); segs.append((a, b, w['id']))
            x0, x1 = sorted((a[0], b[0])); y0, y1 = sorted((a[1], b[1]))
            for i in range(int(x0 // CELDA), int(x1 // CELDA) + 1):
                for j in range(int(y0 // CELDA), int(y1 // CELDA) + 1): grid[(i, j)].append(k)
    return segs, grid

def proyecta(p, s):
    (ax, ay), (bx, by), _ = s; dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy or 1e-9
    t = max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2)); q = (ax + t * dx, ay + t * dy)
    return q, math.hypot(p[0] - q[0], p[1] - q[1])

def pega(puntos, segs, grid):
    # densificar a PASO m (lon, lat, alt)
    P = []
    for a, b in zip(puntos, puntos[1:]):
        A, B = xy(a[0], a[1]), xy(b[0], b[1]); n = max(1, math.ceil(math.hypot(B[0] - A[0], B[1] - A[1]) / PASO))
        for k in range(n): t = k / n; P.append((A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, a[2] + (b[2] - a[2]) * t))
    B = xy(puntos[-1][0], puntos[-1][1]); P.append((B[0], B[1], puntos[-1][2]))
    # pegar con preferencia por seguir en el mismo camino
    out, via, ant = [], [], None
    for p in P:
        i0, j0 = int(p[0] // CELDA), int(p[1] // CELDA); mejor = None
        for i in (i0 - 1, i0, i0 + 1):
            for j in (j0 - 1, j0, j0 + 1):
                for k in grid.get((i, j), ()):
                    q, d = proyecta(p, segs[k])
                    if d > RADIO: continue
                    c = d + (CAMBIO if ant is not None and segs[k][2] != ant else 0)
                    if mejor is None or c < mejor[0]: mejor = (c, q, d, segs[k][2])
        if mejor: out.append(mejor[1]); via.append(mejor[3]); ant = mejor[3]
        else: out.append(None); via.append(None); ant = None
    # saltos: dos pegados seguidos mucho más separados que los originales → no se pegan
    for i in range(1, len(P)):
        if out[i] and out[i - 1]:
            do = math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); dn = math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1])
            if dn > 3 * do + 12: out[i] = out[i - 1] = None
    # desplazamiento suavizado (media de ±3 puntos, 0 donde no se pega) y aplicado; así no hay escalones entre lo pegado y lo que no
    off = [((o[0] - p[0], o[1] - p[1]) if o else (0.0, 0.0)) for p, o in zip(P, out)]
    pegado = [o is not None for o in out]; res = []
    for i, p in enumerate(P):
        if pegado[i] and all(pegado[max(0, i - 3):i + 4]): dx, dy = off[i]   # en pleno camino, el punto del camino tal cual
        else:
            v = off[max(0, i - 3):i + 4]; dx = sum(a for a, _ in v) / len(v); dy = sum(b for _, b in v) / len(v)
        res.append((p[0] + dx, p[1] + dy, p[2]))
    frac = sum(pegado) / len(pegado); mov = sum(math.hypot(*o) for o, g in zip(off, pegado) if g) / max(1, sum(pegado))
    keep = dp([(x, y, z, i) for i, (x, y, z) in enumerate(res)], 1.5)
    nuevos, acum, prev = [], 0.0, None
    for x, y, z, _ in keep:
        if prev: acum += math.hypot(x - prev[0], y - prev[1])
        nuevos.append([round(x / mLon, 6), round(y / mLat, 6), round(z, 1), round(acum)]); prev = (x, y)
    return nuevos, frac, mov

def original(rel):   # el archivo sin pegar: si el actual no lleva la marca «pegado», es nuevo (o recalculado) y se guarda como original
    o = os.path.join(ANTES, rel); a = os.path.join(ROOT, 'data', rel)
    if not json.load(open(a)).get('pegado') or not os.path.exists(o): os.makedirs(os.path.dirname(o), exist_ok=True); shutil.copy(a, o)
    d = json.load(open(o)); d['pegado'] = True; return d

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]; prueba = '--prueba' in sys.argv
    rutas = sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, 'data/rutas')) if f.endswith('.json')) if '--todas' in sys.argv else [a for a in args if os.path.exists(os.path.join(ROOT, 'data/rutas', a + '.json'))]
    subidas = sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, 'data/subidas')) if f.endswith('.json') and f != 'index.json') if '--subidas' in sys.argv else [a for a in args if os.path.exists(os.path.join(ROOT, 'data/subidas', a + '.json'))]
    segs, grid = indice(); print(len(segs), 'tramos de camino', flush=True)
    for r in rutas:
        d = original(f'rutas/{r}.json'); n, frac, mov = pega(d['puntos'], segs, grid)
        print(f'ruta {r}: {frac * 100:.0f} % pegado, se mueve {mov:.0f} m de media, {d["distancia"]} → {n[-1][3]} m', flush=True)
        if not prueba: d['puntos'] = n; d['distancia'] = n[-1][3]; json.dump(d, open(os.path.join(ROOT, 'data/rutas', r + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    for c in subidas:
        d = original(f'subidas/{c}.json')
        for s in d['subidas']:
            n, frac, mov = pega(s['puntos'], segs, grid)
            print(f'subida {s["id"]}: {frac * 100:.0f} % pegado, {mov:.0f} m de media', flush=True)
            if not prueba: s['puntos'] = n; s['distancia'] = n[-1][3]
        if not prueba: json.dump(d, open(os.path.join(ROOT, 'data/subidas', c + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))

if __name__ == '__main__': main()

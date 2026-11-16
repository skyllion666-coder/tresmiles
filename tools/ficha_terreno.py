#!/usr/bin/env python3
"""Datos de «El terreno» para la ficha de los 181 tresmiles → data/terreno.json. Todo calculado; nada escrito a mano.

- Prominencia, collado clave y cima madre: tools/datos/prominencia.json (tools/prominencia.py), con la cifra publicada por
  Viewfinder Panoramas (Clem Clements, «Spain – The 3000m Peaks») cuando la cumbre está en esa lista (tools/datos/prominencia_ref.json).
- Nombre del collado clave: collado o puerto de OpenStreetMap a menos de 450 m con la misma cota (±25 m), o a menos de 150 m si no tiene cota (~/tresmiles-fuentes/collados_osm.json, tools/fetch_collados.py).
- Caras: desnivel a 500 m de la cima en 8 direcciones, con el relieve de 30 m (~/Tresmiles/web/data/near_h.bin).
- Ruta normal (la primera de p.rutas): por qué lado llega a la cima, qué parte de la subida va por laderas que miran al norte (umbría)
  y los collados de OSM por los que pasa (a menos de 100 m del track).
Uso: python3 tools/fetch_collados.py (una vez) → python3 tools/prominencia.py → python3 tools/ficha_terreno.py
"""
import json, math, os
import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.join(AQUI, '..')
SRC = os.path.expanduser('~/Tresmiles/web/data')
N = json.load(open(os.path.join(SRC, 'meta.json')))['near']
H = np.fromfile(os.path.join(SRC, 'near_h.bin'), dtype='<u2').reshape(N['nrows'], N['ncols']).astype(np.float32) * 0.1
STEP = N['step']; MY = STEP * 111320; MX = MY * math.cos(math.radians(42.7))

picos = json.load(open(os.path.join(RAIZ, 'data', 'peaks.json')))['picos']
P = {p['id']: p for p in picos}
prom = {x['id']: x for x in json.load(open(os.path.join(AQUI, 'datos', 'prominencia.json')))}
ref = json.load(open(os.path.join(AQUI, 'datos', 'prominencia_ref.json')))
f_col = os.path.expanduser('~/tresmiles-fuentes/collados_osm.json')
collados = []
if os.path.exists(f_col):
    for e in json.load(open(f_col)).get('elements', []):
        t = e.get('tags', {})
        if t.get('name'):
            try: ele = round(float(t['ele'].replace(',', '.'))) if t.get('ele') else None
            except ValueError: ele = None
            collados.append(dict(nombre=t['name'], lon=e['lon'], lat=e['lat'], ele=ele))


def rc(lon, lat): return (N['lat0'] - lat) / STEP, (lon - N['lon0']) / STEP


def alt(lon, lat):
    r, c = rc(lon, lat); r0, c0 = int(r), int(c); fr, fc = r - r0, c - c0
    a = H[r0:r0 + 2, c0:c0 + 2]
    return float(a[0, 0] * (1 - fr) * (1 - fc) + a[0, 1] * (1 - fr) * fc + a[1, 0] * fr * (1 - fc) + a[1, 1] * fr * fc)


def metros(a, b): return math.hypot((a[0] - b[0]) * 111320 * math.cos(math.radians(42.7)), (a[1] - b[1]) * 111320)


def cima(p):
    """cima del relieve: lo más alto a menos de 90 m y de ahí, subiendo por la máxima pendiente"""
    r, c = (int(round(v)) for v in rc(p['lon'], p['lat'])); k = 3
    v = H[r - k:r + k + 1, c - k:c + k + 1]; i = int(np.argmax(v)); r, c = r - k + i // v.shape[1], c - k + i % v.shape[1]
    for _ in range(60):
        v = H[r - 1:r + 2, c - 1:c + 2]; i = int(np.argmax(v))
        if i == 4: break
        r, c = r + i // 3 - 1, c + i % 3 - 1
    return N['lon0'] + c * STEP, N['lat0'] - r * STEP, float(H[r, c])


def caras(p):
    lon, lat, h = cima(p)
    res = []
    for az in range(0, 360, 45):
        a = math.radians(az)
        q = (lon + 500 * math.sin(a) / (111320 * math.cos(math.radians(42.7))), lat + 500 * math.cos(a) / 111320)
        caida = h - alt(*q)
        res.append(dict(az=az, caida=round(caida), grados=round(math.degrees(math.atan2(caida, 500)))))
    return res


# orientación de las laderas (hacia dónde mira la pendiente, 0 = N, en el sentido del reloj) y pendiente
gN = -np.gradient(H, axis=0) / MY; gE = np.gradient(H, axis=1) / MX
ASPECTO = (np.degrees(np.arctan2(-gE, -gN)) + 360) % 360
PEND = np.degrees(np.arctan(np.hypot(gE, gN)))
del gN, gE


def rumbo(lon0, lat0, lon1, lat1):
    return (math.degrees(math.atan2((lon1 - lon0) * math.cos(math.radians(42.7)), lat1 - lat0)) + 360) % 360


def ruta_normal(p):
    if not p.get('rutas'): return None
    f = os.path.join(RAIZ, 'data', 'rutas', p['rutas'][0] + '.json')
    if not os.path.exists(f): return None
    R = json.load(open(f)); pts = R['puntos']
    # la subida: hasta el punto más cercano a la cima
    j = min(range(len(pts)), key=lambda i: metros(pts[i][:2], (p['lon'], p['lat'])))
    sub = pts[:j + 1]
    if len(sub) < 5 or metros(sub[-1][:2], (p['lon'], p['lat'])) > 150: return None
    # por dónde llega: rumbo desde la cima hasta el punto de la subida a ~300 m (en línea recta)
    k = next((i for i in range(len(sub) - 1, -1, -1) if metros(sub[i][:2], sub[-1][:2]) >= 300), 0)
    llega = rumbo(sub[-1][0], sub[-1][1], sub[k][0], sub[k][1])
    # umbría: tramos (por distancia) en laderas de más de 10° que miran entre el NO y el NE
    total = umbria = solana = 0.0
    for a, b in zip(sub, sub[1:]):
        d = b[3] - a[3]
        if d <= 0: continue
        r, c = (int(round(v)) for v in rc((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
        total += d
        if PEND[r, c] > 10:
            asp = ASPECTO[r, c]
            if asp >= 315 or asp <= 45: umbria += d
            elif 135 <= asp <= 225: solana += d
    # collados de OSM junto al track (orden de paso)
    pasa = []
    for co in collados:
        dmin, imin = min((metros((x[0], x[1]), (co['lon'], co['lat'])), i) for i, x in enumerate(sub))
        if dmin < 100 and metros((co['lon'], co['lat']), (p['lon'], p['lat'])) > 120: pasa.append((imin, co))
    pasa.sort(key=lambda x: x[0])
    vistos, cols = set(), []
    for _, co in pasa:
        if co['nombre'] in vistos: continue
        vistos.add(co['nombre']); cols.append(dict(nombre=co['nombre'], ele=co['ele']))
    return dict(ruta=p['rutas'][0], llega=round(llega), umbria=round(100 * umbria / total) if total else None,
                solana=round(100 * solana / total) if total else None, collados=cols)


def nombre_collado(x):
    """collado de OSM que corresponde al collado clave: a menos de 450 m si su cota coincide (±25 m) o a menos de 150 m si no tiene cota"""
    if x.get('colLon') is None: return None
    mejor = None
    for c in collados:
        d = metros((c['lon'], c['lat']), (x['colLon'], x['colLat']))
        ok = (c['ele'] is not None and abs(c['ele'] - x['col']) <= 25 and d < 450) or (c['ele'] is None and d < 150)
        if ok and (mejor is None or d < mejor[0]): mejor = (d, c)
    return dict(nombre=mejor[1]['nombre'], ele=mejor[1]['ele'], m=round(mejor[0])) if mejor else None


sal = {}
for p in picos:
    x = prom.get(p['id'], {}); o = {}
    if x.get('prom') is not None:
        o['prom'] = x['prom']; o['col'] = x['col']; o['colLon'] = x['colLon']; o['colLat'] = x['colLat']
        o['fiable'] = 'alta' if x['prom'] >= 100 else 'media' if x['prom'] >= 30 else 'baja'
        nc = nombre_collado(x)
        if nc: o['colNombre'] = nc['nombre']; o['colOsm'] = nc['ele']
        if x.get('madre') or x.get('madreNombre'):
            o['madre'] = x.get('madre'); o['madreNombre'] = x.get('madreNombre'); o['madreAlt'] = x.get('madreAlt'); o['madreKm'] = x.get('madreKm')
    elif x.get('nota') == 'no se distingue':
        o['fiable'] = 'no'; o['con'] = x.get('con')
    elif x.get('nota') == 'la más alta de la malla':
        o['masAlta'] = True
    if p['id'] in ref: o['ref'] = ref[p['id']]
    o['caras'] = caras(p)
    rn = ruta_normal(p)
    if rn: o['rutaNormal'] = rn
    sal[p['id']] = o
# cimas que dependen de cada una (su cima madre es esta, o no se distinguen de ella)
for pid, o in sal.items():
    m = o.get('madre') if o.get('fiable') in ('baja', 'media') else o.get('con') if o.get('fiable') == 'no' else None
    if m and m in sal: sal[m].setdefault('dependen', []).append(pid)
json.dump(dict(fuentes=dict(
    relieve='Copernicus GLO-30 con el MDT05 del IGN en las cumbres (malla de 1″ ≈ 30 m)',
    collados='© OpenStreetMap (ODbL)',
    ref=dict(texto='Clem Clements, «Spain – The 3000m Peaks» (Viewfinder Panoramas)', url='https://www.viewfinderpanoramas.org/reascent/Spanish_3000m_Peaks.doc')),
    cumbres=sal), open(os.path.join(RAIZ, 'data', 'terreno.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
n = len(sal)
print(n, 'cumbres ·', sum('prom' in o for o in sal.values()), 'con prominencia ·', sum('colNombre' in o for o in sal.values()), 'collado con nombre ·',
      sum('rutaNormal' in o for o in sal.values()), 'con ruta ·', len(collados), 'collados OSM')

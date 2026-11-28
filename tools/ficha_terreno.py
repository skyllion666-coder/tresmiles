#!/usr/bin/env python3
"""Datos de «El terreno» para la ficha de los 181 tresmiles → data/terreno.json. Todo calculado; nada escrito a mano.

- Prominencia, collado clave y cima madre: tools/datos/prominencia.json (tools/prominencia.py), con la cifra publicada por
  Viewfinder Panoramas (Clem Clements, «Spain – The 3000m Peaks») cuando la cumbre está en esa lista (tools/datos/prominencia_ref.json).
- Nombre del collado clave: collado o puerto de OpenStreetMap a menos de 450 m con la misma cota (±25 m), o a menos de 150 m si no tiene cota (~/tresmiles-fuentes/collados_osm.json, tools/fetch_collados.py).
- Caras: desnivel a 500 m de la cima en 8 direcciones, con el relieve de 30 m (~/Tresmiles/web/data/near_h.bin).
- Ruta normal (la primera de p.rutas): por qué lado llega a la cima, qué parte de la subida va por laderas que miran al norte (umbría)
  y los collados de OSM por los que pasa (a menos de 100 m del track).
- Geología (IGME): roca de la cima y rocas que pisa la subida, de tools/datos/geologia.json (tools/geologia.py [--ruta]); edades y
  traducciones en tools/datos/geologia_textos.py.
Uso: python3 tools/fetch_collados.py (una vez) → python3 tools/prominencia.py → python3 tools/geologia.py --ruta → python3 tools/ficha_terreno.py
Menores: lo mismo con --menores en prominencia.py, geologia.py y aquí (→ data/terreno_menores.json).
"""
import json, math, os
import numpy as np
import re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'datos'))
from geologia_textos import EDADES, ERAS, EN as GEO_EN, TIPOS

AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.join(AQUI, '..')
MENORES = '--menores' in sys.argv   # cumbres de data/menores.json → data/terreno_menores.json (con el relieve de toda la web, que llega a Guara)
SRC = os.path.expanduser('~/tresmiles-fuentes/relieve_todo' if MENORES else '~/Tresmiles/web/data')
N = json.load(open(os.path.join(SRC, 'meta.json')))['near']
H = np.fromfile(os.path.join(SRC, 'near_h.bin'), dtype='<u2').reshape(N['nrows'], N['ncols']).astype(np.float32) * 0.1
STEP = N['step']; MY = STEP * 111320; MX = MY * math.cos(math.radians(42.7))

picos = json.load(open(os.path.join(RAIZ, 'data', 'menores.json' if MENORES else 'peaks.json')))['picos']
P = {p['id']: p for p in picos}
prom = {x['id']: x for x in json.load(open(os.path.join(AQUI, 'datos', 'prominencia_menores.json' if MENORES else 'prominencia.json')))}
ref = {} if MENORES else json.load(open(os.path.join(AQUI, 'datos', 'prominencia_ref.json')))
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
        if not (0 <= r < H.shape[0] and 0 <= c < H.shape[1]): continue   # tramo fuera del relieve (alguna ruta se sale del mapa)
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


f_geo = os.path.join(AQUI, 'datos', 'geologia_menores.json' if MENORES else 'geologia.json')
GEO = json.load(open(f_geo)) if os.path.exists(f_geo) else {}
faltan_en = set()


def normaliza(t):
    t = t.strip().rstrip('.').strip()
    if t.isupper(): t = t[0] + t[1:].lower()
    t = t.replace('Hielo. (Glaciar)', 'Hielo (glaciar)').replace('2 micas', 'dos micas').replace('silex', 'sílex').replace('Graniodiorita', 'Granodiorita').replace('Fm Salarons', 'Fm. Salarons')
    t = t.replace('negras, ocasionalmente arenosa', 'negras, ocasionalmente arenosas')
    t = re.sub(r'"([^"]+)"', r'«\1»', t).replace('.».', '»').replace('».', '»')
    return t


def tipo(desc):
    d = desc.lower()
    return next(((es, en) for k, es, en in TIPOS if k in d), None)


def edad(inf, sup):
    a, b = EDADES.get(inf), EDADES.get(sup)
    if not a or not b: return None
    nom_es = a[0] if inf == sup else f'{a[0]}–{b[0]}'; nom_en = a[1] if inf == sup else f'{a[1]}–{b[1]}'
    ep_es = a[2] if a[2] == b[2] else f'{a[2]} a {b[2].split(" ", 1)[1]}' if a[2].split()[0] == b[2].split()[0] and ' ' in b[2] else f'{a[2]} a {b[2]}'
    ep_en = a[3] if a[3] == b[3] else f'{a[3].split()[0]} to {b[3]}' if a[3].split()[-1] == b[3].split()[-1] and ' ' in a[3] else f'{a[3]} to {b[3]}'
    m0, m1 = round(a[4]), round(b[5])
    return dict(es=f'{nom_es} ({ep_es}), hace unos {m0}–{m1} millones de años', en=f'{nom_en} ({ep_en}), about {m0}–{m1} million years ago', ma0=m0, ma1=m1)


def geo_cima(g):
    c = (g or {}).get('cima')
    if not c or not c.get('desc'): return None
    d = normaliza(c['desc']); en = GEO_EN.get(d)
    if not en: faltan_en.add(d)
    o = dict(desc=d, descEn=en, fuente=c['fuente'], m=c.get('m', 0))
    if c.get('cubierta'): o['cubierta'] = normaliza(c['cubierta']); o['cubiertaEn'] = GEO_EN.get(o['cubierta'])
    if c['fuente'] == 'magna': o['hoja'] = c.get('hoja')
    e = edad(c.get('edadInf'), c.get('edadSup')) if c['fuente'] == 'geode' else None
    if e: o['edad'] = e
    return o


def geo_ruta(g):
    r = (g or {}).get('ruta')
    if not r: return None
    cuenta = {}
    for x in r:
        u = x.get('u')
        if not u or not u.get('desc'): continue
        tp = tipo(u['desc'])
        if tp: cuenta[tp] = cuenta.get(tp, 0) + 1
    n = sum(cuenta.values())
    if n < 3: return None
    l = sorted(cuenta.items(), key=lambda kv: -kv[1])
    return [dict(es=k[0], en=k[1], pc=round(100 * v / n)) for k, v in l if round(100 * v / n) >= 5][:5]


sal = {}
for p in picos:
    x = prom.get(p['id'], {}); o = {}
    if x.get('prom') is not None:
        o['prom'] = x['prom']; o['col'] = x['col']; o['colLon'] = x['colLon']; o['colLat'] = x['colLat']
        o['fiable'] = 'alta' if x['prom'] >= 100 else 'media' if x['prom'] >= 30 else 'baja'
        if x.get('malla') == '150 m' and o['fiable'] == 'alta': o['fiable'] = 'media'   # collado lejos (Guara): calculado con la malla de 150 m
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
    gc = geo_cima(GEO.get(p['id']))
    if gc: o['geo'] = gc
    gr = geo_ruta(GEO.get(p['id']))
    if gr: o['geoRuta'] = gr
    sal[p['id']] = o
# cimas que dependen de cada una (su cima madre es esta, o no se distinguen de ella)
for pid, o in sal.items():
    m = o.get('madre') if o.get('fiable') in ('baja', 'media') else o.get('con') if o.get('fiable') == 'no' else None
    if m and m in sal: sal[m].setdefault('dependen', []).append(pid)
json.dump(dict(fuentes=dict(
    relieve='Copernicus GLO-30 con el MDT05 del IGN en las cumbres (malla de 1″ ≈ 30 m)',
    collados='© OpenStreetMap (ODbL)',
    geode=dict(texto='IGME, GEODE: Mapa Geológico Digital continuo de España 1:50.000', url='https://info.igme.es/cartografiadigital/geologica/Geode.aspx'),
    magna=dict(texto='IGME, MAGNA 50: Mapa Geológico de España 1:50.000, hoja {h}', url='https://info.igme.es/cartografiadigital/geologica/Magna50Hoja.aspx?language=es&id={h}'),
    ref=dict(texto='Clem Clements, «Spain – The 3000m Peaks» (Viewfinder Panoramas)', url='https://www.viewfinderpanoramas.org/reascent/Spanish_3000m_Peaks.doc')),
    cumbres=sal), open(os.path.join(RAIZ, 'data', 'terreno_menores.json' if MENORES else 'terreno.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
n = len(sal)
print(n, 'cumbres ·', sum('prom' in o for o in sal.values()), 'con prominencia ·', sum('colNombre' in o for o in sal.values()), 'collado con nombre ·',
      sum('rutaNormal' in o for o in sal.values()), 'con ruta ·', len(collados), 'collados OSM')
print(sum('geo' in o for o in sal.values()), 'con geología ·', sum('geoRuta' in o for o in sal.values()), 'con rocas de la subida')
if faltan_en: print('SIN TRADUCIR:', sorted(faltan_en))

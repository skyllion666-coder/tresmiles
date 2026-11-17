#!/usr/bin/env python3
"""Datos de «Naturaleza» para la ficha de los 181 tresmiles → data/naturaleza.json. Todo de fuentes con datos reales:
- Especies observadas a menos de ~2 km de la cima: tools/datos/gbif.json (tools/fauna_gbif.py), GBIF.org.
- Por dónde pasa la subida de la ruta de ejemplo (rutas[0]): cobertura del suelo ESA WorldCover 2021 (10 m), remuestreada a la
  rejilla del relieve en data/terrain/cover (tools/build_cover.py): % de bosque, matorral, pasto, roca, nieve y hielo, agua;
  y la altitud más alta de la subida con bosque (dos puntos seguidos con arbolado).
Uso: python3 tools/fauna_gbif.py → python3 tools/ficha_naturaleza.py
"""
import gzip, json, math, os, re
import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.join(AQUI, '..')
meta = json.load(open(os.path.join(RAIZ, 'data', 'terrain', 'meta.json')))
CH, ST = meta['chunk'], meta['step']
picos = json.load(open(os.path.join(RAIZ, 'data', 'peaks.json')))['picos']
gbif = json.load(open(os.path.join(AQUI, 'datos', 'gbif.json')))
CLASES = {1: 'bosque', 2: 'matorral', 3: 'pasto', 4: 'roca', 5: 'nieve', 6: 'agua', 8: 'pasto'}   # 8 musgo y líquenes: con el pasto
_cov = {}


def cobertura(lon, lat):
    c, r = (lon - meta['lon0']) / ST, (meta['lat0'] - lat) / ST
    i, j = int(c // CH), int(r // CH)
    if (i, j) not in _cov:
        f = os.path.join(RAIZ, 'data', 'terrain', 'cover', f'c_{i}_{j}.bin.gz')
        _cov[(i, j)] = np.frombuffer(gzip.open(f).read(), 'u1').reshape(CH, CH) if os.path.exists(f) else None
    a = _cov[(i, j)]
    return 0 if a is None else int(a[min(CH - 1, int(r - j * CH)), min(CH - 1, int(c - i * CH))])


def metros(a, b): return math.hypot((a[0] - b[0]) * 111320 * math.cos(math.radians(42.7)), (a[1] - b[1]) * 111320)


def ruta(p):
    if not p.get('rutas'): return None
    f = os.path.join(RAIZ, 'data', 'rutas', p['rutas'][0] + '.json')
    if not os.path.exists(f): return None
    pts = json.load(open(f))['puntos']
    j = min(range(len(pts)), key=lambda i: metros(pts[i][:2], (p['lon'], p['lat'])))
    sub = pts[:j + 1]
    if len(sub) < 5 or metros(sub[-1][:2], (p['lon'], p['lat'])) > 150: return None
    tot, cuenta, bosque, prev = 0.0, {}, None, False
    for a, b in zip(sub, sub[1:]):
        d = b[3] - a[3]
        if d <= 0: continue
        k = CLASES.get(cobertura((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
        es = k == 'bosque'
        if es and prev: bosque = max(bosque or 0, round(b[2]))
        prev = es
        if k: cuenta[k] = cuenta.get(k, 0) + d; tot += d
    if tot <= 0: return None
    pc = {k: round(100 * v / tot) for k, v in sorted(cuenta.items(), key=lambda kv: -kv[1]) if round(100 * v / tot) >= 2}
    return dict(pc=pc, bosqueHasta=bosque)


PROPIOS = re.compile(r'^(Eurasia|Europa|Pirineo|Pirineos|Alpes|Iberia|España|Francia|Asia|África|América)$')
def frase(n):
    """«Colirrojo Tizón» → «Colirrojo tizón»; respeta los nombres de lugar («Ardilla roja de Eurasia»)"""
    if not n: return n
    w = n.split(' ')
    return ' '.join([w[0][:1].upper() + w[0][1:]] + [x if PROPIOS.match(x) else x.lower() for x in w[1:]])


f_h = os.path.join(AQUI, 'datos', 'historia.json')
HIST = json.load(open(f_h)) if os.path.exists(f_h) else {}   # tools/historia.py: primera ascensión según Wikipedia (es, en, fr)
sal = {}
for p in picos:
    g = gbif.get(p['id'])
    o = {}
    if g:
        o['total'] = g['total']
        for k in ('aves', 'mamiferos', 'mariposas', 'reptiles', 'anfibios', 'plantas'):
            l = [dict(key=x['key'], n=x['n'], c=x['cient'], es=frase(x['es']), en=x['en']) for x in g.get(k, []) if x.get('cient')]
            if l: o[k] = l
    r = ruta(p)
    if r: o['ruta'] = r
    if p['id'] in HIST:
        h = HIST[p['id']]; anios = {y for v in h.values() for y in re.findall(r'1[6-9]\d\d|20\d\d', v['t'])}
        o['historia'] = dict(fuentes=h, difieren=len(anios) > 1)
    sal[p['id']] = o
json.dump(dict(fuentes=dict(
    gbif=dict(texto='GBIF.org', url='https://www.gbif.org/'),
    cover=dict(texto='ESA WorldCover 2021 (10 m), CC BY 4.0', url='https://esa-worldcover.org/')), cumbres=sal),
    open(os.path.join(RAIZ, 'data', 'naturaleza.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(sal), 'cumbres ·', sum(1 for o in sal.values() if o.get('total')), 'con observaciones ·', sum('ruta' in o for o in sal.values()), 'rutas')

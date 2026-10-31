#!/usr/bin/env python3
"""«Otras subidas» de una cumbre, sacadas del mapa de calor (data/calor/<zona>-datos.png, tools/build_calor.py): por dónde sube la gente de verdad.
Desde la cima se busca el camino más «caliente» (más pasadas GPS) hasta cada aparcamiento o pueblo de OpenStreetMap de la zona: el coste de cada casilla de 20 m
baja cuanto más brilla (sin datos cuesta 50 veces más, así que solo se cruzan huecos pequeños). Se descartan los caminos con mucho tramo sin datos
y los que repiten otro ya elegido (al menos un 35 % y 1,5 km propios); de los que comparten casi todo, queda el más corto (el aparcamiento más cercano).
Nombre: el punto de salida y los refugios, collados e ibones por los que pasa (OSM). Avisos: tramos con hielo o nieve (tools/build_hielo.py) y tramos de más de 30°.
Salida: data/subidas/<cumbre>.json. Datos © colaboradores de OpenStreetMap; altitudes del Copernicus GLO-30.
Uso: python3 tools/subidas.py aneto"""
import json, math, os, sys, time, urllib.parse, urllib.request
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, binary_dilation
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
import rasterio
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gpx2json import dp, local, EPS
from build_hielo import color as color_sat, hielo as es_hielo

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
UA = {'User-Agent': 'tresmiles/1.0 (proyecto educativo)'}
F = 2   # casillas de 10 m que se juntan: se trabaja a 20 m
DEMS = [rasterio.open(os.path.expanduser('~/Tresmiles/data/dem/' + f)) for f in ('Copernicus_DSM_COG_10_N42_00_E000_00_DEM.tif', 'Copernicus_DSM_COG_10_N42_00_W001_00_DEM.tif')]

def cota(lon, lat):
    for r in DEMS:
        b = r.bounds
        if b.left <= lon < b.right and b.bottom <= lat < b.top:
            row, col = r.index(lon, lat); return float(r.read(1, window=((row, row + 1), (col, col + 1)))[0, 0])

def overpass(q, f):
    if os.path.exists(f): return json.load(open(f))
    for i in range(6):
        for h in ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'):
            try:
                d = json.loads(urllib.request.urlopen(urllib.request.Request(h, data=urllib.parse.urlencode({'data': q}).encode(), headers=UA), timeout=200).read())
                json.dump(d, open(f, 'w')); return d
            except Exception as e: print('  reintento', h.split('/')[2], e, flush=True); time.sleep(8 * (i + 1))
    sys.exit('Overpass no responde')

def hacer(pid):
    pico = next(p for p in json.load(open(os.path.join(ROOT, 'data/peaks.json')))['picos'] if p['id'] == pid)
    idx = json.load(open(os.path.join(ROOT, 'data/calor/index.json')))
    zona, z = next((k, v) for k, v in idx.items() if v['caja'][0] < pico['lon'] < v['caja'][2] and v['caja'][1] < pico['lat'] < v['caja'][3])
    w, s, e, n = z['caja']; mLat, mLon = 111132, 111320 * math.cos(math.radians((s + n) / 2)); PX = 10.0 * F
    a = np.array(Image.open(os.path.join(ROOT, z['datos']))).astype(np.float32)
    pas = a[..., 0] + (a[..., 1] * 256 + a[..., 2]) / 5   # pasadas equivalentes por casilla de 10 m (como build_calor)
    H0, W0 = pas.shape; H, W = H0 // F, W0 // F
    D = gaussian_filter(pas[:H * F, :W * F].reshape(H, F, W, F).max(axis=(1, 3)), 0.8)
    h = np.clip(np.log1p(D * 2.2) / math.log1p(60 * 2.2), 0, 1)
    coste = 1 / (0.02 + h)   # 50 sin datos, 1 en los caminos más pisados
    rc = lambda lat, lon: (int((n - lat) * mLat / PX), int((lon - w) * mLon / PX))
    ll = lambda r, c: (n - (r + .5) * PX / mLat, w + (c + .5) * PX / mLon)
    # grafo de 8 vecinos: el paso entre dos casillas cuesta la media de sus costes por la distancia
    ids = np.arange(H * W).reshape(H, W)
    fil, col, pes = [], [], []
    for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
        r0, r1 = 0, H - dr; c0, c1 = max(0, -dc), W - max(0, dc)
        A = ids[r0:r1, c0:c1]; B = ids[r0 + dr:r1 + dr, c0 + dc:c1 + dc]
        cA = coste[r0:r1, c0:c1]; cB = coste[r0 + dr:r1 + dr, c0 + dc:c1 + dc]
        wgt = (cA + cB) / 2 * math.hypot(dr, dc)
        fil += [A.ravel(), B.ravel()]; col += [B.ravel(), A.ravel()]; pes += [wgt.ravel(), wgt.ravel()]
    G = coo_matrix((np.concatenate(pes), (np.concatenate(fil), np.concatenate(col))), shape=(H * W, H * W)).tocsr()
    # la cima: la casilla con más pasadas a menos de 60 m
    r, c = rc(pico['lat'], pico['lon']); k = 3
    sub = D[r - k:r + k + 1, c - k:c + k + 1]; dr_, dc_ = np.unravel_index(sub.argmax(), sub.shape); cima = ids[r - k + dr_, c - k + dc_]
    dist, pred = dijkstra(G, indices=cima, return_predecessors=True)
    # puntos de salida y nombres (OSM)
    bb = f'{s},{w},{n},{e}'
    osm = overpass(f'[out:json][timeout:120];(node["amenity"="parking"]({bb});way["amenity"="parking"]({bb});node["place"~"^(village|hamlet)$"]({bb});'
                   f'node["tourism"~"^(alpine_hut|wilderness_hut)$"]({bb});way["tourism"~"^(alpine_hut|wilderness_hut)$"]({bb});node["natural"="saddle"]["name"]({bb});node["mountain_pass"="yes"]["name"]({bb}););out center tags;',
                   os.path.join(ROOT, 'tools/datos/calor', f'{zona}_lugares.json'))['elements']
    lug = []
    for el in osm:
        t = el.get('tags', {}); la, lo = (el['lat'], el['lon']) if 'lat' in el else (el['center']['lat'], el['center']['lon'])
        tipo = 'parking' if t.get('amenity') == 'parking' else 'pueblo' if t.get('place') else 'refugio' if t.get('tourism') else 'collado'
        lug.append({'tipo': tipo, 'nombre': t.get('name'), 'lat': la, 'lon': lo})
    lagos = [l for l in json.load(open(os.path.join(ROOT, 'data/lagos.json'))) if l.get('nombre')]
    def nombre_salida(la, lo):
        cerca = sorted((math.hypot((x['lon'] - lo) * mLon, (x['lat'] - la) * mLat), x) for x in lug if x['nombre'] and x['tipo'] in ('parking', 'pueblo', 'refugio'))
        cerca = [(d, x) for d, x in cerca if d < 1500]
        return cerca[0][1]['nombre'] if cerca else None
    cand = []
    for x in lug:
        if x['tipo'] not in ('parking', 'pueblo'): continue
        rr, cc = rc(x['lat'], x['lon'])
        if not (0 <= rr < H and 0 <= cc < W) or not np.isfinite(dist[ids[rr, cc]]): continue
        # el camino acaba en la casilla con datos más cercana al aparcamiento (a menos de 200 m)
        k = 10; zona_ = D[max(0, rr - k):rr + k + 1, max(0, cc - k):cc + k + 1]
        if zona_.max() <= 0: continue
        camino, q = [], ids[rr, cc]
        while q != cima and q >= 0: camino.append(q); q = pred[q]
        if q != cima: continue
        camino.append(cima)
        rcs = [divmod(int(q), W) for q in camino]   # de la salida a la cima
        hs = np.array([h[a_, b_] for a_, b_ in rcs])
        largo = len(rcs) * PX
        if largo < 1500 or (hs < 0.04).mean() > 0.12: continue   # demasiado corto o con mucho tramo sin datos
        cand.append({'x': x, 'rcs': rcs, 'largo': largo, 'uso': float(np.median(hs))})
    cand.sort(key=lambda c: c['largo'])
    elegidos, tapado = [], np.zeros((H, W), bool)
    for cnd in cand:
        m = np.zeros((H, W), bool); rr, cc = zip(*cnd['rcs']); m[list(rr), list(cc)] = True
        propio = (m & ~tapado).sum() * PX
        if elegidos and (propio < 1500 or propio / cnd['largo'] < 0.35): continue
        if any(min(math.hypot(r_ - e_['rcs'][0][0], c_ - e_['rcs'][0][1]) for r_, c_ in cnd['rcs']) < 5 for e_ in elegidos): continue   # pasa por la salida de otra: es la misma, alargada
        elegidos.append(cnd); tapado |= binary_dilation(m, iterations=3)   # ±60 m
    out = []
    for i, cnd in enumerate(elegidos):
        lineal = [ll(r_, c_) for r_, c_ in cnd['rcs']]
        lat0 = sum(q[0] for q in lineal) / len(lineal)
        xy = [local(lo, la, lat0) + (lo, la) for la, lo in lineal]
        xy = dp(xy, EPS * 2)
        puntos, d, sube, ref = [], 0.0, 0.0, None
        for j, (x_, y_, lo, la) in enumerate(xy):
            if j: d += math.hypot(x_ - xy[j - 1][0], y_ - xy[j - 1][1])
            zz = cota(lo, la)
            if ref is None: ref = zz
            elif zz > ref + 3: sube += zz - ref; ref = zz
            elif zz < ref - 3: ref = zz
            puntos.append([round(lo, 5), round(la, 5), round(zz, 1), round(d)])
        # por dónde pasa: refugios y collados a menos de 120 m, ibones a menos de 150 m de su orilla (en orden)
        por = []
        for p in puntos:
            for x in lug:
                if x['nombre'] and x['tipo'] in ('refugio', 'collado') and math.hypot((x['lon'] - p[0]) * mLon, (x['lat'] - p[1]) * mLat) < 120 and x['nombre'] not in por: por.append(x['nombre'])
            for l in lagos:
                if l['nombre'] not in por and any(math.hypot((q[0] - p[0]) * mLon, (q[1] - p[1]) * mLat) < 150 for q in l['poly'][::4]): por.append(l['nombre'])
        # hielo o nieve (mismo criterio que las rutas) y tramos de más de 30° (pendiente del terreno en tramos de ~60 m)
        f = [es_hielo(color_sat(p[0], p[1]), p[2]) for p in puntos]
        hielo = tramos([p[3] for p in puntos], f)
        emp = [False] + [abs(puntos[j][2] - puntos[j - 1][2]) / max(1, puntos[j][3] - puntos[j - 1][3]) > math.tan(math.radians(30)) and puntos[j][3] - puntos[j - 1][3] > 15 for j in range(1, len(puntos))]
        empinado = tramos([p[3] for p in puntos], emp, minimo=20)
        if cnd['x']['nombre']: desde = cnd['x']['nombre']
        else:   # aparcamiento sin nombre: se dice junto a qué está (refugio, pueblo o aparcamiento con nombre a menos de 5 km)
            xl, yl = cnd['x']['lon'], cnd['x']['lat']
            cerca = min(((math.hypot((x['lon'] - xl) * mLon, (x['lat'] - yl) * mLat), x['nombre']) for x in lug if x['nombre'] and x['tipo'] in ('parking', 'pueblo', 'refugio')), default=(1e9, None))
            agua = min(((min(math.hypot((q[0] - xl) * mLon, (q[1] - yl) * mLat) for q in l['poly']), l['nombre']) for l in lagos), default=(1e9, None))
            if agua[0] < 150 and agua[0] < cerca[0]: cerca = agua   # el aparcamiento está en la misma presa o ibón
            desde = cerca[1] if cerca[0] < 1500 else 'la carretera'
        por = [q for q in por if q != desde and q not in desde]
        out.append({'id': f'{pid}-{i + 1}', 'desde': desde, 'por': por[:3], 'puntos': puntos, 'distancia': round(d), 'desnivel': round(sube),
                    'max': round(max(p[2] for p in puntos)), 'min': round(min(p[2] for p in puntos)),
                    'uso': round(cnd['uso'], 3), 'nivel': 3 if cnd['uso'] > .55 else 2 if cnd['uso'] > .4 else 1 if cnd['uso'] > .25 else 0,
                    'hielo': hielo, 'empinado': empinado})
        print(f"  {out[-1]['id']}: desde {desde} por {', '.join(por[:3]) or '—'} · {d / 1000:.1f} km, +{round(sube)} m, uso {cnd['uso']:.2f}, hielo {hielo}, >30° {empinado}")
    os.makedirs(os.path.join(ROOT, 'data/subidas'), exist_ok=True)
    json.dump({'pico': pid, 'zona': zona, 'subidas': out, 'fuente': 'Trazas GPS públicas de OpenStreetMap', 'autorUrl': 'https://www.openstreetmap.org/traces'},
              open(os.path.join(ROOT, 'data/subidas', f'{pid}.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print(pid, len(out), 'subidas de', len(cand), 'candidatas')
    I = os.path.join(ROOT, 'data/subidas/index.json'); ix = json.load(open(I)) if os.path.exists(I) else []
    json.dump(sorted(set(ix) | {pid}), open(I, 'w'))

def tramos(dd, f, minimo=60):
    """[[d0, d1], …] donde f es cierto (mayoría en ventanas de 5 puntos, juntando huecos de menos de 120 m)."""
    for _ in range(2): f = [sum(f[max(0, i - 2):i + 3]) >= 3 for i in range(len(f))]
    out, cur = [], None
    for i, d in enumerate(dd):
        if f[i]: cur = [d, d] if cur is None else [cur[0], d]
        elif cur: out.append(cur); cur = None
    if cur: out.append(cur)
    m = []
    for t in out:
        if m and t[0] - m[-1][1] < 120: m[-1][1] = t[1]
        else: m.append(t)
    return [[round(a), round(b)] for a, b in m if b - a >= minimo]

for p in sys.argv[1:] or ['aneto']: hacer(p)

#!/usr/bin/env python3
"""Rutas orientativas para las cumbres menores (data/menores.json) por los senderos de OpenStreetMap.
Para cada zona se baja una vez la red de caminos y carreteras de OSM; para cada cumbre con un sendero a menos de 150 m de la cima,
se busca el punto de carretera más cercano a pie (camino más corto: las sendas pesan menos que las pistas) y se traza la subida desde allí.
Altitudes del Copernicus GLO-30 y mismo formato que tools/ruta_osm.py: data/rutas/m-<id>.json y .gpx, y la cumbre recibe `rutas`.
Se descartan las subidas de menos de 500 m de camino (cima junto a una carretera) y las de más de 16 km.
Datos © colaboradores de OpenStreetMap, licencia ODbL.
Uso: python3 tools/rutas_menores.py [zona ...]   (sin zonas: todas)"""
import heapq, json, math, os, sys, time, urllib.parse, urllib.request
import rasterio
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gpx2json import dp, local, EPS

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
UA = {'User-Agent': 'tresmiles/1.0 (proyecto educativo)'}
HOSTS = ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter')
PESO = {'path': 1.0, 'footway': 1.0, 'bridleway': 1.05, 'steps': 1.2, 'track': 1.15, 'service': 1.4, 'unclassified': 1.6, 'residential': 1.3, 'living_street': 1.3, 'tertiary': 2.5, 'secondary': 3.0}
COCHE = {'service', 'unclassified', 'residential', 'living_street', 'tertiary', 'secondary'}
DEMS = [rasterio.open(os.path.expanduser('~/Tresmiles/data/dem/' + f)) for f in ('Copernicus_DSM_COG_10_N42_00_E000_00_DEM.tif', 'Copernicus_DSM_COG_10_N42_00_W001_00_DEM.tif')]

def cota(lon, lat):
    for r in DEMS:
        b = r.bounds
        if b.left <= lon < b.right and b.bottom <= lat < b.top:
            row, col = r.index(lon, lat); return float(r.read(1, window=((row, row + 1), (col, col + 1)))[0, 0])

def overpass(q):
    for i in range(6):
        for h in HOSTS:
            try: return json.loads(urllib.request.urlopen(urllib.request.Request(h, data=urllib.parse.urlencode({'data': q}).encode(), headers=UA), timeout=200).read())
            except Exception as e: print('  reintento', h.split('/')[2], e, flush=True); time.sleep(8 * (i + 1))
    sys.exit('Overpass no responde')

def dist(a, b):
    return math.hypot((a[0] - b[0]) * 111320 * math.cos(math.radians(a[1])), (a[1] - b[1]) * 111132)

def red(bbox):
    q = (f'[out:json][timeout:180];(way["highway"~"^({"|".join(PESO)})$"]["access"!~"^(private|no)$"]({bbox});'
         f'node["place"~"^(village|hamlet|locality|isolated_dwelling)$"]({bbox});node["amenity"="parking"]({bbox});way["amenity"="parking"]({bbox}););out geom tags;')
    grafo, coche, nombres, lugares = {}, set(), {}, []
    for w in overpass(q)['elements']:
        t = w.get('tags', {})
        if w['type'] == 'node': lugares.append(((w['lon'], w['lat']), t.get('name'), t.get('amenity') == 'parking')); continue
        if 'highway' not in t:
            if t.get('amenity') == 'parking' and w.get('geometry'): g = w['geometry']; lugares.append(((sum(c['lon'] for c in g) / len(g), sum(c['lat'] for c in g) / len(g)), t.get('name'), True))
            continue
        g = [(round(c['lon'], 7), round(c['lat'], 7)) for c in w['geometry']]; f = PESO[t['highway']]
        for a, b in zip(g, g[1:]):
            d = dist(a, b) * f; grafo.setdefault(a, []).append((b, d)); grafo.setdefault(b, []).append((a, d))
        if t['highway'] in COCHE:
            coche.update(g)
            if t.get('name'): nombres.update({n: t['name'] for n in g})
    return grafo, coche, nombres, lugares

def subida(grafo, coche, cima):
    """Camino desde la carretera más cercana a pie hasta el nodo de sendero más cercano a la cima (o None)."""
    lon, lat = cima; dlat, dlon = 0.0015, 0.0015 / math.cos(math.radians(lat))
    cerca = [n for n in grafo if abs(n[0] - lon) < dlon and abs(n[1] - lat) < dlat]
    if not cerca: return None
    na = min(cerca, key=lambda n: dist(n, cima))
    if dist(na, cima) > 150: return None
    prev, best, cola = {na: None}, {na: 0}, [(0, na)]
    fin = None
    while cola:
        d, n = heapq.heappop(cola)
        if d > best[n]: continue
        if n in coche: fin = n; break
        if d > 22000: break
        for m, w in grafo[n]:
            if d + w < best.get(m, 1e18): best[m] = d + w; prev[m] = n; heapq.heappush(cola, (d + w, m))
    if not fin: return None
    out, n = [], fin
    while n: out.append(n); n = prev[n]
    return out + [cima]   # de la carretera a la cima

def lugar_salida(p0, nombres, lugares):
    par = [(dist(c, p0), nom) for c, nom, pk in lugares if pk and dist(c, p0) < 400]
    pue = sorted((dist(c, p0), nom) for c, nom, pk in lugares if not pk and nom and dist(c, p0) < 4000)
    if pue: return pue[0][1]
    if nombres.get(p0): return nombres[p0]
    return None

def trazar(linea):
    lat0 = sum(q[1] for q in linea) / len(linea)
    xy = [local(lon, lat, lat0) + (lon, lat) for lon, lat in linea]
    dens = [xy[0]]
    for p in xy[1:]:
        q = dens[-1]; n = int(math.hypot(p[0] - q[0], p[1] - q[1]) // 10)
        for k in range(1, n + 1): dens.append(tuple(q[i] + (p[i] - q[i]) * k / (n + 1) for i in range(4)))
        dens.append(p)
    dens = dp(dens, EPS)
    puntos, d, sube, ref = [], 0.0, 0.0, None
    for i, (x, y, lon, lat) in enumerate(dens):
        if i: d += math.hypot(x - dens[i - 1][0], y - dens[i - 1][1])
        z = cota(lon, lat)
        if ref is None: ref = z
        elif z > ref + 3: sube += z - ref; ref = z
        elif z < ref - 3: ref = z
        puntos.append([round(lon, 5), round(lat, 5), round(z, 1), round(d)])
    return puntos, d, sube

M = os.path.join(ROOT, 'data', 'menores.json')
menores = json.load(open(M))
zonas = sys.argv[1:] or sorted({p['macizo'] for p in menores['picos']})
FRASE, NUEVA = 'Ficha sencilla: sin ruta ni recorrido en el mapa.', 'Ruta orientativa por los senderos de OpenStreetMap.'
hechas = 0
for z in zonas:
    ps = [p for p in menores['picos'] if p['macizo'] == z]
    if not ps: continue
    bbox = f'{min(p["lat"] for p in ps) - 0.06},{min(p["lon"] for p in ps) - 0.08},{max(p["lat"] for p in ps) + 0.06},{max(p["lon"] for p in ps) + 0.08}'
    print(f'{z}: {len(ps)} cumbres, bajando la red…', flush=True)
    grafo, coche, nombres, lugares = red(bbox)
    n0 = hechas
    for p in ps:
        if p.get('rutas'): continue
        cam = subida(grafo, coche, (p['lon'], p['lat']))
        if not cam: continue
        puntos, d, sube = trazar(cam)
        if d < 500 or d > 16000: continue
        rid = 'm-' + p['id']; alts = [q[2] for q in puntos]
        sal = lugar_salida(cam[0], nombres, lugares)
        nombre = f'{p["nombre"]} desde {sal}' if sal else f'Subida a {p["nombre"]}'
        lat0, lon0 = puntos[len(puntos) // 2][1], puntos[len(puntos) // 2][0]
        out = {'nombre': nombre, 'autor': 'colaboradores de OpenStreetMap', 'autorUrl': 'https://www.openstreetmap.org/copyright', 'fuenteUrl': f'https://www.openstreetmap.org/#map=14/{lat0:.4f}/{lon0:.4f}',
               'osm': True, 'auto': True, 'gpx': f'data/rutas/{rid}.gpx', 'puntos': puntos, 'distancia': round(d), 'desnivel': round(sube), 'max': round(max(alts)), 'min': round(min(alts))}
        json.dump(out, open(os.path.join(ROOT, 'data', 'rutas', f'{rid}.json'), 'w'), separators=(',', ':'))
        trk = ''.join(f'<trkpt lat="{lat}" lon="{lon}"><ele>{zz}</ele></trkpt>' for lon, lat, zz, _ in puntos)
        open(os.path.join(ROOT, 'data', 'rutas', f'{rid}.gpx'), 'w').write(f'<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Tresmiles" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>{nombre}</name><copyright author="OpenStreetMap contributors"><license>https://opendatacommons.org/licenses/odbl/</license></copyright></metadata><trk><name>{nombre}</name><trkseg>{trk}</trkseg></trk></gpx>\n')
        p['rutas'] = [rid]; p['descripcion'] = p['descripcion'].replace(FRASE, NUEVA); hechas += 1
    print(f'  {hechas - n0} rutas', flush=True)
    json.dump(menores, open(M, 'w'), ensure_ascii=False, separators=(',', ':'))
    time.sleep(5)
print('total', hechas)

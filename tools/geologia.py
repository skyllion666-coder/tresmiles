#!/usr/bin/env python3
"""Geología de la cima de los 181 tresmiles según el IGME → tools/datos/geologia.json (lo lee tools/ficha_geologia.py).

1.º GEODE (Mapa Geológico Digital continuo de España 1:50.000, IGME): unidad, descripción y edad.
2.º si GEODE no tiene dato en ese punto (hay huecos, como la Maladeta): MAGNA 50 (hoja y descripción litológica, sin edad).
Consulta GetFeatureInfo de los WMS del IGME en el punto de la cima; si no hay unidad, prueba a 60 m en 4 direcciones.
Con --ruta, además, puntos cada ~400 m de la subida de la ruta de ejemplo (rutas[0]).
Respuestas guardadas en ~/tresmiles-fuentes/igme/ (no se repiten consultas). Una consulta por segundo.
Uso: python3 tools/geologia.py [--ruta] [id ...]
"""
import json, math, os, sys, time, urllib.request, urllib.parse

AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.join(AQUI, '..')
CACHE = os.path.expanduser('~/tresmiles-fuentes/igme'); os.makedirs(CACHE, exist_ok=True)
WMS = dict(geode='https://mapas.igme.es/gis/services/Cartografia_Geologica/IGME_Geode_50/MapServer/WMSServer',
           magna='https://mapas.igme.es/gis/services/Cartografia_Geologica/IGME_MAGNA_50/MapServer/WMSServer')
ultimo = [0.0]


def consulta(serv, lon, lat):
    f = os.path.join(CACHE, f'{serv}_{lon:.5f}_{lat:.5f}.json')
    if os.path.exists(f): return json.load(open(f))
    espera = 1.0 - (time.time() - ultimo[0])
    if espera > 0: time.sleep(espera)
    d = 0.0005
    q = dict(service='WMS', version='1.3.0', request='GetFeatureInfo', layers='0,1', query_layers='0,1', crs='EPSG:4326',
             bbox=f'{lat - d},{lon - d},{lat + d},{lon + d}', width=101, height=101, i=50, j=50, info_format='application/geo+json')
    for intento in range(4):
        try:
            ultimo[0] = time.time()
            r = urllib.request.urlopen(urllib.request.Request(WMS[serv] + '?' + urllib.parse.urlencode(q), headers={'User-Agent': 'tresmiles-mapa/1.0'}), timeout=60)
            txt = r.read().decode('utf-8', 'replace')
            dat = json.loads(txt.replace('\t', ' '))
            json.dump(dat, open(f, 'w'), ensure_ascii=False)
            return dat
        except Exception as e:
            print('  reintento', serv, e, file=sys.stderr); time.sleep(5 * (intento + 1))
    return None


def unidad(lon, lat):
    """unidad geológica en el punto: dict o None"""
    g = consulta('geode', lon, lat)
    for ft in (g or {}).get('features', []):
        pr = ft.get('properties', {})
        if ft.get('layerName') == 'Recintos geología' and pr.get('Descripción Unidad Geológica'):
            return dict(fuente='geode', codigo=pr.get('Código de Unidad Geológica'), desc=pr['Descripción Unidad Geológica'].strip(),
                        edadSup=(pr.get('Edad Superior') or '').strip(), edadInf=(pr.get('Edad Inferior') or '').strip())
    m = consulta('magna', lon, lat)
    for ft in (m or {}).get('features', []):
        pr = ft.get('properties', {})
        if pr.get('descripción litológica'):
            return dict(fuente='magna', hoja=pr.get('nº de hoja'), codigo=pr.get('unidad cartográfica'), desc=pr['descripción litológica'].strip())
    return None


CUBIERTA = ('hielo', 'morrena', 'coluvi', 'canchal', 'derrubio', 'aluvi', 'glacis', 'cono de deyecci')


def roca(u):
    """unidad válida como roca de la cima: con descripción y sin ser un depósito o el hielo que la cubre"""
    if not u or not u['desc']: return False
    if any(x in u['desc'].lower() for x in CUBIERTA): return False
    return not any(x in (u.get('edadSup') or '') for x in ('HOLOCENO', 'PLEISTOCENO'))


def en_cima(p):
    u = unidad(p['lon'], p['lat'])
    if roca(u): return dict(u, m=0)
    cubierta = u['desc'] if u and u['desc'] and not roca(u) else None
    for r in (60, 120, 200):
        dl = r / (111320 * math.cos(math.radians(42.7))); dt = r / 111320
        for az in range(0, 360, 45):
            a = math.radians(az)
            v = unidad(p['lon'] + dl * math.sin(a), p['lat'] + dt * math.cos(a))
            if roca(v): return dict(v, m=r, cubierta=cubierta)
    return dict(u, m=0) if u and u['desc'] else None


def metros(a, b): return math.hypot((a[0] - b[0]) * 111320 * math.cos(math.radians(42.7)), (a[1] - b[1]) * 111320)


def en_ruta(p):
    if not p.get('rutas'): return None
    f = os.path.join(RAIZ, 'data', 'rutas', p['rutas'][0] + '.json')
    if not os.path.exists(f): return None
    pts = json.load(open(f))['puntos']
    j = min(range(len(pts)), key=lambda i: metros(pts[i][:2], (p['lon'], p['lat'])))
    sub = pts[:j + 1]
    if len(sub) < 5: return None
    res, sig = [], 0.0
    for x in sub:
        if x[3] >= sig:
            u = unidad(x[0], x[1]); sig = x[3] + 400
            res.append(dict(d=x[3], alt=round(x[2]), u=u))
    return res


if __name__ == '__main__':
    ruta = '--ruta' in sys.argv
    ids = {a for a in sys.argv[1:] if not a.startswith('--')}
    picos = json.load(open(os.path.join(RAIZ, 'data', 'peaks.json')))['picos']
    sal = os.path.join(AQUI, 'datos', 'geologia.json')
    previo = json.load(open(sal)) if os.path.exists(sal) else {}
    for p in picos:
        if ids and p['id'] not in ids: continue
        o = previo.get(p['id'], {})
        o['cima'] = en_cima(p)
        if ruta: o['ruta'] = en_ruta(p)
        previo[p['id']] = o
        c = o['cima']
        print(p['id'], '|', c and c['fuente'], '|', c and c['desc'], '|', c and c.get('edadInf'), '-', c and c.get('edadSup'), flush=True)
        json.dump(previo, open(sal, 'w'), ensure_ascii=False, indent=0)

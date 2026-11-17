#!/usr/bin/env python3
"""Especies observadas cerca de cada tresmil según GBIF (api.gbif.org) → tools/datos/gbif.json (lo lee tools/ficha_naturaleza.py).

Para cada cima: registros de presencia sin problemas de coordenadas, con incertidumbre ≤ 1 km, en un recuadro de ±2 km;
las especies con más registros de cada grupo (aves, mamíferos, mariposas y polillas, reptiles, anfibios y plantas).
Nombres: el científico de GBIF y los comunes en castellano e inglés de GBIF (/species/{key}/vernacularNames).
Caché de respuestas en ~/tresmiles-fuentes/gbif/. Datos de GBIF.org: cada registro tiene su propia licencia (CC0, CC BY o CC BY-NC).
Uso: python3 tools/fauna_gbif.py [id ...]
"""
import json, os, sys, time, urllib.request, urllib.parse, hashlib

AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.join(AQUI, '..')
CACHE = os.path.expanduser('~/tresmiles-fuentes/gbif'); os.makedirs(CACHE, exist_ok=True)
GRUPOS = [('aves', dict(classKey=212)), ('mamiferos', dict(classKey=359)), ('mariposas', dict(orderKey=797)),
          ('reptiles', dict(classKey=358)), ('anfibios', dict(classKey=131)), ('plantas', dict(kingdomKey=6))]
POR_GRUPO = 6


def api(ruta, **q):
    url = 'https://api.gbif.org/v1/' + ruta + ('?' + urllib.parse.urlencode(q, doseq=True) if q else '')
    f = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + '.json')
    if os.path.exists(f): return json.load(open(f))
    for i in range(5):
        try:
            d = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'tresmiles-mapa/1.0'}), timeout=60).read())
            json.dump(d, open(f, 'w')); time.sleep(0.2); return d
        except Exception as e:
            print('  reintento', e, file=sys.stderr); time.sleep(5 * (i + 1))
    return None


ESPECIES = {}
def especie(k):
    if k in ESPECIES: return ESPECIES[k]
    s = api(f'species/{k}') or {}
    v = (api(f'species/{k}/vernacularNames', limit=200) or {}).get('results', [])
    def nombre(lang):
        l = [x['vernacularName'].strip() for x in v if x.get('language') == lang and x.get('vernacularName')]
        return min(l, key=lambda n: (l.count(n) * -1, len(n))) if l else None   # el más repetido entre fuentes; a igualdad, el más corto
    ESPECIES[k] = dict(cient=s.get('canonicalName') or s.get('scientificName'), es=nombre('spa'), en=nombre('eng'))
    return ESPECIES[k]


if __name__ == '__main__':
    ids = set(sys.argv[1:])
    picos = json.load(open(os.path.join(RAIZ, 'data', 'peaks.json')))['picos']
    sal = os.path.join(AQUI, 'datos', 'gbif.json')
    res = json.load(open(sal)) if os.path.exists(sal) else {}
    for p in picos:
        if ids and p['id'] not in ids: continue
        dla, dlo = 0.018, 0.0245   # ≈ ±2 km
        base = dict(decimalLatitude=f"{p['lat'] - dla},{p['lat'] + dla}", decimalLongitude=f"{p['lon'] - dlo},{p['lon'] + dlo}",
                    hasGeospatialIssue='false', occurrenceStatus='PRESENT', coordinateUncertaintyInMeters='0,1000', limit=0)
        o = {'total': 0}
        for g, filtro in GRUPOS:
            d = api('occurrence/search', **base, **filtro, facet='speciesKey', facetLimit=POR_GRUPO) or {}
            o['total'] += d.get('count', 0)
            cs = (d.get('facets') or [{}])[0].get('counts', [])
            o[g] = [dict(key=int(c['name']), n=c['count'], **especie(int(c['name']))) for c in cs]
        res[p['id']] = o
        print(p['id'], o['total'], '|', ', '.join(f"{x['es'] or x['cient']}" for x in o['aves'][:3]), flush=True)
        json.dump(res, open(sal, 'w'), ensure_ascii=False, indent=0)

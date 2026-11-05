#!/usr/bin/env python3
"""«El glaciar en el tiempo»: contornos de los glaciares del Pirineo en varias épocas → data/glaciares.json.

Fuentes (todas CC BY 4.0 o de uso libre citando), descargadas en ~/tresmiles-fuentes/glaciares:
  - 2000: GLIMS (análisis del Instituto Pirenaico de Ecología, IPE-CSIC), glims2000.json (WFS GLIMS_Glacier_Outlines).
  - 2011 y 2020: Vidaller et al. 2021, GRL, «Toward an ice-free mountain range» — Zenodo 10.5281/zenodo.4756351 (Glaciers2011/2020.shp).
  - Aneto 1981, 2011, 2020, 2021 y 2022: Vidaller et al. 2023, The Cryosphere — Zenodo 10.5281/zenodo.7472185 (Areas.zip).
Cada polígono de 2011/2020 se asigna al glaciar de 2000 con el que más se solapa (o al más cercano, a menos de 600 m).
Las cumbres a menos de 2,5 km del glaciar lo muestran en su ficha.
Uso: ~/.venvs/lidar/bin/python tools/build_glaciares.py"""
import glob, json, math, os
import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import shape, mapping, Polygon, MultiPolygon
from shapely.ops import transform, unary_union

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
G = os.path.expanduser('~/tresmiles-fuentes/glaciares')
U31 = Transformer.from_crs(4326, 25831, always_xy=True)

def lee_shp(f):
    """polígonos de un shapefile, en UTM 31 (metros)"""
    prj = open(f[:-4] + '.prj').read(); tr = Transformer.from_crs(CRS.from_wkt(prj), 25831, always_xy=True)
    out = []
    for s in shapefile.Reader(f).shapes():
        g = shape(s.__geo_interface__)
        g = transform(lambda x, y, z=None: tr.transform(x, y), g)
        if not g.is_valid: g = g.buffer(0)
        if g.area > 200: out.append(g)
    return out

# 2000: GLIMS, con nombre
base = []
for ft in json.load(open(f'{G}/glims2000.json'))['features']:
    g = transform(lambda x, y, z=None: U31.transform(x, y), shape(ft['geometry']))
    base.append({'nombre': ft['properties']['glac_name'], 'g': {2000: g.buffer(0)}})

def asigna(g, anio):
    mejor, bo = None, 0
    for b in base:
        o = b['g'][2000].intersection(g).area
        if o > bo: mejor, bo = b, o
    if not mejor:
        d, i = min((b['g'][2000].distance(g), i) for i, b in enumerate(base))
        if d > 600: return False
        mejor = base[i]
    mejor['g'][anio] = unary_union([mejor['g'][anio], g]) if anio in mejor['g'] else g
    return True

V = glob.glob(f'{G}/vidaller/*/')[0]
for anio, f in ((2011, 'Boundaries2011/Glaciers2011.shp'), (2020, 'Boundaries2020/Glaciers2020.shp')):
    n = sum(asigna(g, anio) for g in lee_shp(V + f)); print(anio, n, 'polígonos asignados')
# Aneto: serie propia (sustituye a la de 2011/2020 de la colección, que es la misma pero así todo el Aneto sale del mismo trabajo)
aneto = next(b for b in base if b['nombre'] == 'Aneto')
for anio, f in ((1981, 'Area1981'), (2011, 'Aneto2011'), (2020, 'Aneto2020'), (2021, 'Aneto2021'), (2022, 'Aneto2022')):
    aneto['g'][anio] = unary_union(lee_shp(f'{G}/aneto/Areas/{f}.shp'))

A_LL = Transformer.from_crs(25831, 4326, always_xy=True)
def anillos(g):
    g = g.simplify(1.5, preserve_topology=True)
    polys = [g] if isinstance(g, Polygon) else list(getattr(g, 'geoms', []))
    out = []
    for p in polys:
        if p.area < 300: continue
        out.append([[round(c, 6) for c in A_LL.transform(x, y)] for x, y in p.exterior.coords])
        out += [[[round(c, 6) for c in A_LL.transform(x, y)] for x, y in r.coords] for r in p.interiors if Polygon(r).area > 300]
    return out

PICOS = [p for p in json.load(open(os.path.join(ROOT, 'data/peaks.json')))['picos']]
res = []
for b in base:
    c = b['g'][2000].centroid; lon, lat = A_LL.transform(c.x, c.y)
    cum = sorted(((math.hypot((p['lat'] - lat) * 111132, (p['lon'] - lon) * 111320 * math.cos(math.radians(lat))), p['id']) for p in PICOS))
    epocas = {str(a): anillos(g) for a, g in sorted(b['g'].items()) if not g.is_empty}
    epocas = {a: v for a, v in epocas.items() if v}
    res.append({'id': b['nombre'].lower().replace(' ', '-').replace("'", ''), 'nombre': b['nombre'], 'lon': round(lon, 5), 'lat': round(lat, 5),
                'ha': {a: round(b['g'][int(a)].area / 1e4, 1) for a in epocas},
                'cumbres': [i for d, i in cum if d < 2500], 'epocas': epocas})
    print(f"{b['nombre']:20s}", ' '.join(f'{a}:{h}' for a, h in res[-1]['ha'].items()), '·', len(res[-1]['cumbres']), 'cumbres')
fuentes = [
    {'epoca': '2000', 'texto': 'GLIMS (análisis del Instituto Pirenaico de Ecología, IPE-CSIC)', 'url': 'https://www.glims.org/'},
    {'epoca': '2011 y 2020', 'texto': 'Vidaller et al. (2021), Geophysical Research Letters, CC BY 4.0', 'url': 'https://doi.org/10.5281/zenodo.4756351'},
    {'epoca': 'Aneto 1981–2022', 'texto': 'Vidaller et al. (2023), The Cryosphere, CC BY 4.0', 'url': 'https://doi.org/10.5281/zenodo.7472185'},
]
json.dump({'fuentes': fuentes, 'glaciares': res}, open(os.path.join(ROOT, 'data/glaciares.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(res), 'glaciares;', os.path.getsize(os.path.join(ROOT, 'data/glaciares.json')) // 1024, 'KB')

#!/usr/bin/env python3
"""Máscara del conglomerado rojizo del Prepirineo (Guara, Sierras Exteriores, Salto de Roldán, Vadiello…) → data/terrain/conglomerado.png.

Las paredes de conglomerado son ocre rojizas, pero la ortofoto (cenital) apenas lo recoge y el sombreado de la roca de js/terrain.js
las lleva a gris (está pensado para el granito). Con esta máscara el shader las pinta de su color.
Fuente: IGME, GEODE 50 (servicio REST «export», capa 8 «Recintos geología», solo las unidades cuya descripción tiene «conglomer»).
Rejilla: la misma del relieve (data/terrain/meta.json, 1″), desde el borde sur del mapa hasta LAT_N (al norte hay conglomerados del
Permotrías y del Culm que no tienen ese aspecto). Un píxel por paso de la rejilla, 255 = conglomerado.
Uso: python3 tools/conglomerado.py"""
import io, json, os, time, urllib.parse, urllib.request
import numpy as np
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'https://mapas.igme.es/gis/rest/services/Cartografia_Geologica/IGME_Geode_50/MapServer/export'
LAT_N = 42.50
m = json.load(open(f'{RAIZ}/data/terrain/meta.json'))
st, lon0, lat0 = m['step'], m['lon0'], m['lat0']
lat_s = lat0 - (m['nrows'] - 1) * st
W = m['ncols']; H = int(round((LAT_N - lat_s) / st)) + 1
lat_n = lat_s + (H - 1) * st
TX, TY = 4, 2
mask = np.zeros((H, W), np.uint8)
xs = np.linspace(0, W, TX + 1).astype(int); ys = np.linspace(0, H, TY + 1).astype(int)
for a in range(TX):
    for b in range(TY):
        c0, c1, r0, r1 = xs[a], xs[a + 1], ys[b], ys[b + 1]
        # bordes de píxel (los centros son los nodos de la rejilla)
        lo0, lo1 = lon0 + (c0 - .5) * st, lon0 + (c1 - .5) * st
        la1, la0 = lat_n - (r0 - .5) * st, lat_n - (r1 - .5) * st
        q = dict(bbox=f'{lo0},{la0},{lo1},{la1}', bboxSR=4326, imageSR=4326, size=f'{c1 - c0},{r1 - r0}', layers='show:8',
                 layerDefs=json.dumps({'8': "DESC_UNIT LIKE '%onglomer%'"}), transparent='true', format='png32', f='image')
        for intento in range(4):
            try:
                r = urllib.request.urlopen(urllib.request.Request(URL + '?' + urllib.parse.urlencode(q), headers={'User-Agent': 'tresmiles-mapa/1.0'}), timeout=120)
                im = Image.open(io.BytesIO(r.read())).convert('RGBA'); break
            except Exception as e:
                print('reintento', e); time.sleep(5 * (intento + 1))
        a_ = np.asarray(im)[..., 3]
        assert a_.shape == (r1 - r0, c1 - c0), a_.shape
        mask[r0:r1, c0:c1] = np.where(a_ > 0, 255, 0)
        print(a, b, f'{(a_ > 0).mean():.1%}'); time.sleep(1)
Image.fromarray(mask).save(f'{RAIZ}/data/terrain/conglomerado.png', optimize=True)
json.dump(dict(lon0=lon0, lat_n=lat_n, step=st, w=W, h=H, fuente='IGME, GEODE 50'), open(f'{RAIZ}/data/terrain/conglomerado.json', 'w'))
print(f'{W}×{H}, {(mask > 0).mean():.1%} conglomerado', os.path.getsize(f'{RAIZ}/data/terrain/conglomerado.png') // 1024, 'KB')

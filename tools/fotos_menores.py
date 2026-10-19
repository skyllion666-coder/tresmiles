#!/usr/bin/env python3
"""Fotos pequeñas de los picos de 2.500 a 3.000 m: cada archivo de Wikimedia Commons elegido a mano (tools/datos/fotos_menores_sel.json,
id del pico → nombre del archivo; revisadas una a una: que se vea el pico, licencia libre y sin caras) se baja a 640 px y se guarda en WebP
(img/menores/<id>.webp, calidad 60, ~30-60 KB). Autor y licencia van a tools/datos/fotos_menores.json, que lee build_menores.py.
Uso: python3 tools/fotos_menores.py && python3 tools/build_menores.py"""
import io, json, os, re, time, urllib.parse, urllib.request
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
D = lambda *p: os.path.join(ROOT, *p)
UA = {'User-Agent': 'tresmiles/1.0 (proyecto educativo; https://skyllion666-coder.github.io/tresmiles/)'}
LIBRES = re.compile(r'^(CC BY(-SA)? \d\.\d|CC0|Public domain|No restrictions)', re.I)
sel = json.load(open(D('tools', 'datos', 'fotos_menores_sel.json')))
os.makedirs(D('img', 'menores'), exist_ok=True)
meta, ids = {}, list(sel)
for i in range(0, len(ids), 40):
    tt = '|'.join('File:' + sel[k] for k in ids[i:i + 40])
    u = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'titles': tt, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|user', 'iiurlwidth': 640, 'format': 'json'})
    d = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read())
    por = {}
    for pg in d['query']['pages'].values():
        if 'imageinfo' in pg: por[pg['title'].replace('File:', '')] = pg['imageinfo'][0]
    for k in ids[i:i + 40]:
        ii = por.get(sel[k].replace('_', ' '))
        if not ii: print('sin datos', k, sel[k]); continue
        em = ii.get('extmetadata', {})
        g = lambda c: re.sub(r'\s+', ' ', re.sub('<[^>]+>', '', em.get(c, {}).get('value', ''))).strip()
        lic = g('LicenseShortName')
        if not LIBRES.match(lic): print('licencia no libre', k, lic); continue
        dest = D('img', 'menores', f'{k}.webp')
        if not os.path.exists(dest):
            im = Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(ii['thumburl'], headers=UA), timeout=60).read())).convert('RGB')
            im.thumbnail((640, 640)); im.save(dest, 'WEBP', quality=60, method=6); time.sleep(0.3)
        w, h = Image.open(dest).size
        autor = g('Artist')
        if not autor or re.search(r'unknown|desconocido', autor, re.I): autor = 'Autor desconocido' if re.match('Public domain', lic, re.I) else ii.get('user') or 'Autor desconocido'   # sin autor escrito (y no es una foto antigua de dominio público): quien la subió
        meta[k] = {'archivo': sel[k], 'autor': autor[:90], 'licencia': lic.replace('Public domain', 'Dominio público').replace('No restrictions', 'Sin restricciones'),
                   'licencia_url': g('LicenseUrl'), 'pagina': ii['descriptionurl'], 'fuente': 'Wikimedia Commons', 'w': w, 'h': h, 'ruta': f'img/menores/{k}.webp'}
json.dump(meta, open(D('tools', 'datos', 'fotos_menores.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
tam = sum(os.path.getsize(D('img', 'menores', f)) for f in os.listdir(D('img', 'menores')))
print(len(meta), 'fotos;', tam // 1024, 'KB en total')

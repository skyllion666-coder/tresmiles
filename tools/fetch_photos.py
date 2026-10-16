#!/usr/bin/env python3
"""Vuelve a descargar las fotos de data/fotos.json desde Wikimedia Commons (1400 px de ancho)
y actualiza autor y licencia. Uso: python3 tools/fetch_photos.py"""
import io, json, os, re, urllib.parse, urllib.request
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
UA = {'User-Agent': 'tresmiles-web/1.0 (proyecto educativo)'}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
clean = lambda x: re.sub('<[^>]+>', '', x).strip()
path = os.path.join(ROOT, 'data', 'fotos.json')
fotos = json.load(open(path, encoding='utf-8'))
for k, f in fotos.items():
    q = urllib.parse.urlencode(dict(action='query', format='json', titles='File:' + f['archivo'], prop='imageinfo', iiprop='url|extmetadata', iiurlwidth=1400))
    pg = list(json.loads(get('https://commons.wikimedia.org/w/api.php?' + q))['query']['pages'].values())[0]
    ii = pg['imageinfo'][0]; m = ii['extmetadata']
    im = Image.open(io.BytesIO(get(ii['thumburl']))).convert('RGB')
    if im.width > 1400: im = im.resize((1400, round(im.height * 1400 / im.width)), Image.LANCZOS)
    im.save(os.path.join(ROOT, 'img', 'peaks', k + '.jpg'), quality=82, optimize=True, progressive=True)
    f.update(autor=clean(m.get('Artist', {}).get('value', '')) or 'Autor desconocido', licencia=m.get('LicenseShortName', {}).get('value', ''),
             licencia_url=m.get('LicenseUrl', {}).get('value', ''), pagina=ii['descriptionurl'], w=im.width, h=im.height)
    print(k, im.size, f['licencia'])
json.dump(fotos, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

#!/usr/bin/env python3
"""Descarga las fotos de los hitos desde Wikimedia Commons (800 px) y guarda autor y licencia en data/fotos_hitos.json.
Uso: python3 tools/fetch_hitos_fotos.py   (la lista está abajo: clave -> archivo de Commons)"""
import io, json, os, re, time, urllib.parse, urllib.request
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
UA = {'User-Agent': 'tresmiles-web/1.0 (proyecto educativo)'}
FOTOS = {
    'respomuso': 'RefugioDeRespomuso20060814.jpg',
    'arriel-bajo': "L'ivó d'Arriel Bajo voltat de cims.jpeg",
    'gran-diagonal': 'Balaitús amb Gran Diagonal i estany Arriel Alto.png',
}
def get(u, tries=8):
    for i in range(tries):
        try: return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
        except Exception as e:
            print('  reintento', i + 1, e); time.sleep(20 * (i + 1))
    raise SystemExit('no se pudo descargar ' + u)
clean = lambda x: re.sub('<[^>]+>', '', x).strip()
out = {}
for k, archivo in FOTOS.items():
    q = urllib.parse.urlencode(dict(action='query', format='json', titles='File:' + archivo, prop='imageinfo', iiprop='url|extmetadata', iiurlwidth=800))
    pg = list(json.loads(get('https://commons.wikimedia.org/w/api.php?' + q))['query']['pages'].values())[0]
    ii = pg['imageinfo'][0]; m = ii['extmetadata']
    im = Image.open(io.BytesIO(get(ii['thumburl']))).convert('RGB')
    if im.width > 800: im = im.resize((800, round(im.height * 800 / im.width)), Image.LANCZOS)
    im.save(os.path.join(ROOT, 'img', 'hitos', k + '.jpg'), quality=80, optimize=True, progressive=True)
    out[k] = dict(archivo=archivo, autor=clean(m.get('Artist', {}).get('value', '')) or 'Autor desconocido',
                  licencia=m.get('LicenseShortName', {}).get('value', ''), licencia_url=m.get('LicenseUrl', {}).get('value', ''),
                  pagina=ii['descriptionurl'], w=im.width, h=im.height)
    print(k, im.size, out[k]['licencia'], out[k]['autor'])
    time.sleep(3)
json.dump(out, open(os.path.join(ROOT, 'data', 'fotos_hitos.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

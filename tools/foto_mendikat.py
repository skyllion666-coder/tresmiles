#!/usr/bin/env python3
"""Pone como foto de ficha de una cumbre una foto de su página de Mendikat (con el autor y el enlace a la página). Los autores de Mendikat son los usuarios que suben las fotos.
Uso: python3 tools/foto_mendikat.py lista <url-de-la-página>            → lista las fotos (n.º, título, enlace) y las baja a <tmp>/mk_<id>/<n>.jpg para mirarlas
     python3 tools/foto_mendikat.py pon <id-cumbre> <url-de-la-página> <n.º> "<pie>"  → la reduce a 1100 px (img/peaks/<id>.jpg) y actualiza fotos.json y peaks.json
Después: python3 tools/build_minis.py y subir DATOS_V. Sin caras de personas (norma del usuario)."""
import json, os, re, subprocess, sys, time, html
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); D = lambda *p: os.path.join(ROOT, *p)
def get(u, binario=False):
    for _ in range(6):
        r = subprocess.run(['curl', '-sL', '-A', 'Mozilla/5.0', u], capture_output=True)
        if binario: return r.stdout
        t = r.stdout.decode('utf8', 'ignore')
        if 'Demasiadas solicitudes' not in t[:3000]: return t
        time.sleep(20)
    sys.exit('Mendikat limita las peticiones; reintenta más tarde')
def fotos(url):
    s = get(url); mid = re.search(r'/(\d+)$', url).group(1)
    im = re.findall(r'<a href="(https://www.mendikat.net/com/mount/image/[\w-]+)" title="([^"]*)">\s*<img loading="lazy" src="https://www.mendikat.net/storage/mountains/thumbs/(%s_\w+)\.jpg"' % mid, s)
    au = re.search(r'"authors":\[\{"id":\d+,"username":"([^"]*)","name":"([^"]*)","lastname":"([^"]*)"', s)
    autor = f'{au.group(2)} {au.group(3)}'.strip() if au else 'usuario de Mendikat'
    autor = json.loads('"' + autor + '"')
    return s, im, autor, mid
if sys.argv[1] == 'lista':
    s, im, autor, mid = fotos(sys.argv[2]); out = f'/tmp/mk_{mid}'; os.makedirs(out, exist_ok=True)
    print('autor:', autor)
    for k, (h, t, f) in enumerate(im):
        open(f'{out}/{k}.jpg', 'wb').write(get(f'https://www.mendikat.net/storage/mountains/{f}.jpg', True)); print(k, html.unescape(t), '|', h)
    print('en', out)
else:
    _, pid, url, n, pie = sys.argv[1:6]
    s, im, autor, mid = fotos(url); h, t, f = im[int(n)]
    tmp = f'/tmp/mk_{pid}.jpg'; open(tmp, 'wb').write(get(f'https://www.mendikat.net/storage/mountains/{f}.jpg', True))
    img = Image.open(tmp).convert('RGB')
    if img.width > 1100: img = img.resize((1100, round(img.height * 1100 / img.width)), Image.LANCZOS)
    img.save(D('img', 'peaks', f'{pid}.jpg'), quality=82, optimize=True, progressive=True)
    fotos_ = json.load(open(D('data', 'fotos.json')))
    fotos_[pid] = {'archivo': 'foto de la página de Mendikat', 'autor': autor, 'licencia': '', 'licencia_url': '', 'pagina': url, 'fuente': 'Mendikat', 'w': img.width, 'h': img.height}
    json.dump(fotos_, open(D('data', 'fotos.json'), 'w'), ensure_ascii=False, indent=1)
    peaks = json.load(open(D('data', 'peaks.json'))); p = next(x for x in peaks['picos'] if x['id'] == pid)
    p['foto'] = pid; p['pie'] = pie; p['enlace'] = {'url': url, 'texto': f'Ficha en Mendikat (fotos de {autor})'}
    json.dump(peaks, open(D('data', 'peaks.json'), 'w'), ensure_ascii=False, indent=1)
    print('OK', pid, autor, url, img.size)

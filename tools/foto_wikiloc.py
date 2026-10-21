#!/usr/bin/env python3
"""Pone como foto de ficha de una cumbre una foto de una ruta de Wikiloc (con autor y enlace a la ruta).
Uso: python3 tools/foto_wikiloc.py <id-cumbre> <fuente.html> <id-foto> "<pie>"
  fuente.html = código fuente de la ficha de la ruta (ctrl+U, ctrl+A, ctrl+C en la ventana de Firefox del usuario); id-foto = `photos[].id` de un waypoint.
Baja la foto (Master.jpg con Referer de Wikiloc), la reduce a 1100 px de ancho (JPG progresivo), la guarda en img/peaks/<id>.jpg y actualiza
data/fotos.json y data/peaks.json (foto, pie, enlace, ruta). Después: python3 tools/build_minis.py (miniatura del marcador) y subir DATOS_V."""
import json, os, re, subprocess, sys
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); D = lambda *p: os.path.join(ROOT, *p)
pid, src, fid, pie = sys.argv[1:5]
s = open(src, errors='ignore').read()
m = re.search(r'"photos":\[\{"id":%s,"url":"([^"]+)","prettyUrl":"(/[^"]+?)/photo-%s"' % (fid, fid), s)
if not m: sys.exit('no encuentro esa foto en el código fuente')
url, ruta_path = m.group(1), m.group(2)
ruta_url = 'https://www.wikiloc.com' + ruta_path
autor = re.search(r'title="([^"]+)" class="author__user-image"', s).group(1).strip()
titulo = re.search(r'<title>(?:Wikiloc \| )?(.*?)(?: Trail)?</title>', s).group(1).strip()
tmp = f'/tmp/wl_{pid}.jpg'
subprocess.run(['curl', '-s', '-e', 'https://www.wikiloc.com/', '-o', tmp, url.replace('.jpg', 'Master.jpg')], check=True)
im = Image.open(tmp).convert('RGB')
if im.width > 1100: im = im.resize((1100, round(im.height * 1100 / im.width)), Image.LANCZOS)
im.save(D('img', 'peaks', f'{pid}.jpg'), quality=82, optimize=True, progressive=True)
fotos = json.load(open(D('data', 'fotos.json')))
fotos[pid] = {'archivo': 'foto de la ruta de Wikiloc', 'autor': autor, 'licencia': '', 'licencia_url': '', 'pagina': ruta_url, 'fuente': 'Wikiloc', 'w': im.width, 'h': im.height}
json.dump(fotos, open(D('data', 'fotos.json'), 'w'), ensure_ascii=False, indent=1)
peaks = json.load(open(D('data', 'peaks.json')))
p = next(x for x in peaks['picos'] if x['id'] == pid)
p['foto'] = pid; p['pie'] = pie
p['enlace'] = {'url': ruta_url, 'texto': f'Ruta de {autor} en Wikiloc'}
p['ruta'] = f'Esta cima aparece en la ruta «{titulo}» de {autor} en Wikiloc.'
json.dump(peaks, open(D('data', 'peaks.json'), 'w'), ensure_ascii=False, indent=1)
print('OK', pid, autor, ruta_url, im.size)

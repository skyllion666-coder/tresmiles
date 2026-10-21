#!/usr/bin/env python3
"""Foto de una ruta de Wikiloc para una cumbre de menos de 3.000 m (con autor y enlace a la ruta). Como foto_wikiloc.py pero para menores:
baja la foto a 640 px WebP (img/menores/<id>.webp) y la anota en tools/datos/fotos_menores.json (`propia: true`, que fotos_menores.py conserva) y
tools/datos/notas_menores.json (enlace y texto de la ruta). Después: python3 tools/build_menores.py y subir DATOS_V.
Uso: python3 tools/foto_wikiloc_menor.py <id> <fuente.html> <id-foto> "<pie>" """
import json, os, re, subprocess, sys
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); D = lambda *p: os.path.join(ROOT, *p)
pid, src, fid, pie = sys.argv[1:5]
s = open(src, errors='ignore').read()
m = re.search(r'"photos":\[\{"id":%s,"url":"([^"]+)","prettyUrl":"(/[^"]+?)/photo-%s"' % (fid, fid), s)
if not m: sys.exit('no encuentro esa foto en el código fuente')
url, ruta_url = m.group(1), 'https://www.wikiloc.com' + m.group(2)
autor = re.search(r'title="([^"]+)" class="author__user-image"', s).group(1).strip()
titulo = re.sub(r'&(\w+);', lambda x: {'amp': '&', 'quot': '"', 'apos': "'"}.get(x.group(1), x.group(0)), re.search(r'<title>(?:Wikiloc \| )?(.*?)(?: Trail)?</title>', s).group(1).strip())
tmp = f'/tmp/wlm_{pid}.jpg'
subprocess.run(['curl', '-s', '-e', 'https://www.wikiloc.com/', '-o', tmp, url.replace('.jpg', 'Master.jpg')], check=True)
im = Image.open(tmp).convert('RGB'); im.thumbnail((640, 640)); os.makedirs(D('img', 'menores'), exist_ok=True)
im.save(D('img', 'menores', f'{pid}.webp'), 'WEBP', quality=60, method=6)
fp = D('tools', 'datos', 'fotos_menores.json'); f = json.load(open(fp))
f[pid] = {'archivo': 'foto de la ruta de Wikiloc', 'autor': autor, 'licencia': '', 'licencia_url': '', 'pagina': ruta_url, 'fuente': 'Wikiloc', 'w': im.width, 'h': im.height,
          'ruta': f'img/menores/{pid}.webp', 'propia': True, 'pie': pie}
json.dump(f, open(fp, 'w'), ensure_ascii=False, indent=1)
np_ = D('tools', 'datos', 'notas_menores.json'); n = json.load(open(np_))
n[pid] = {'enlace': {'url': ruta_url, 'texto': f'Ruta de {autor} en Wikiloc'}, 'ruta': f'Esta cumbre aparece en la ruta «{titulo}», de {autor} en Wikiloc. En el enlace de abajo están su recorrido completo y sus fotos.'}
json.dump(n, open(np_, 'w'), ensure_ascii=False, indent=1)
print('OK', pid, autor, ruta_url, im.size)

#!/usr/bin/env python3
"""Páginas para compartir cada cumbre: c/<id>.html con su vista previa (título, texto y foto para WhatsApp, Telegram, Facebook…)
que lleva enseguida a la web con la cumbre abierta (../?directo#<id>; vale para Cloudflare y para GitHub Pages en /tresmiles/).
Los programas de mensajería no ejecutan JavaScript ni leen lo que va tras «#»: por eso hace falta una página fija por cumbre.
El botón «Compartir» de la ficha (js/main.js) enlaza aquí. Volver a ejecutar si cambian cumbres, fotos o descripciones.
Uso: python3 tools/compartir.py"""
import html, json, os, re
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = 'https://tresmiles.pages.dev/'
datos = json.load(open(f'{RAIZ}/data/peaks.json'))
menores = json.load(open(f'{RAIZ}/data/menores.json'))
fotos = {**json.load(open(f'{RAIZ}/data/fotos.json')), **menores.get('fotos', {})}
macizos = datos.get('macizos', {})
dest = f'{RAIZ}/c'; os.makedirs(dest, exist_ok=True)
for f in os.listdir(dest):
    if f.endswith('.html'): os.remove(f'{dest}/{f}')

def foto_de(p):
    for clave in (p.get('foto'), f"m-{p['id']}", p['id']):
        f = fotos.get(clave) if clave else None
        if not f: continue
        ruta = f.get('ruta') or f'img/peaks/{clave}.jpg'
        if os.path.exists(f'{RAIZ}/{ruta}'): return ruta, f.get('w'), f.get('h')
    return 'img/compartir.jpg', 1200, 630

def miles(n): return f'{n:,}'.replace(',', '.')

n = 0
for p in datos['picos'] + menores['picos']:
    pid = p['id']
    if not re.fullmatch(r'[a-z0-9-]+', pid): continue
    ruta, w, h = foto_de(p)
    titulo = f"{p['nombre']} ({miles(p['altitud'])} m) · Tresmiles"
    desc = re.sub(r'\s+', ' ', p.get('descripcion') or '').strip()
    if len(desc) > 190: desc = desc[:187].rsplit(' ', 1)[0].rstrip('.,;:') + '…'
    if not desc: desc = 'Mapa 3D de las cumbres del Pirineo aragonés.'
    e = lambda s: html.escape(str(s), quote=True)
    img_meta = f'<meta property="og:image" content="{WEB}{e(ruta)}">' + (f'\n<meta property="og:image:width" content="{w}">\n<meta property="og:image:height" content="{h}">' if w and h else '')
    open(f'{dest}/{pid}.html', 'w').write(f'''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titulo)}</title>
<meta name="description" content="{e(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tresmiles del Pirineo aragonés">
<meta property="og:title" content="{e(titulo)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{WEB}c/{pid}">
{img_meta}
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">
<link rel="canonical" href="{WEB}?directo#{pid}">
<meta http-equiv="refresh" content="0; url=../?directo#{pid}">
<script>location.replace('../' + (location.search ? location.search + '&' : '?') + 'directo#{pid}');</script>
</head>
<body style="background:#0d1424;color:#f5eede;font-family:sans-serif;text-align:center;padding:3em 1em">
<p><a style="color:#f5eede" href="../?directo#{pid}">{e(p['nombre'])} · Tresmiles</a></p>
</body>
</html>
''')
    n += 1
print(f'{n} páginas en c/')

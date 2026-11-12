#!/usr/bin/env python3
"""Mete en la web lo que manda la gente por el apartado «Colabora» de las fichas (correo de tresmilespirineo): fotos y comentarios.
Todo va a data/aportaciones.json; las fotos, a img/aportes/<id>.jpg (sin los datos EXIF: ni móvil, ni hora, ni GPS dentro del archivo).
La traducción al inglés (--en) va a data/textos_en.json, como el resto de textos de las fichas. Después: subir DATOS_V en index.html.

  tools/aportacion.py foto <archivo> <cima> "<autor>" "<pie>" [--en "<pie en inglés>"] [--fecha AAAA-MM-DD] [--sin-gps]
      Lee el GPS de la foto (si está dentro del mapa sale como hito «Foto» con icono de cámara en el mapa 3D de esa cima),
      dice la distancia y el rumbo hasta la cima para comprobar que es la que dice, y busca caras (ayuda: revisar la foto a ojo igualmente).
      --sin-gps: no publica la posición aunque la tenga. --prueba: solo mira la foto, no cambia nada.
  tools/aportacion.py comentario <cima> "<autor>" "<texto>" [--en "<texto en inglés>"] [--fecha AAAA-MM-DD]
  tools/aportacion.py quita <id>        → quita una foto (img y datos) o un comentario (si el autor lo pide, se quita sin más)
  tools/aportacion.py lista
<cima> es el id de la ficha (el que va entre corchetes en el asunto del correo: «Foto o comentario: Aneto [aneto]»)."""
import json, math, os, sys, datetime, argparse
from PIL import Image, ImageOps

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS, TEXTOS, CARPETA = f'{RAIZ}/data/aportaciones.json', f'{RAIZ}/data/textos_en.json', f'{RAIZ}/img/aportes'
LADO = 1600   # lado mayor de la foto publicada (px)

def carga(f, vacio): return json.load(open(f)) if os.path.exists(f) else vacio
def guarda(d): json.dump(d, open(DATOS, 'w'), ensure_ascii=False, indent=1); open(DATOS, 'a').write('\n')
def traduce(es, en):
    if not en: print(f'  OJO: falta la traducción al inglés de «{es[:60]}…» (--en)'); return
    tx = carga(TEXTOS, {}); tx[es] = en
    with open(TEXTOS, 'w') as f: json.dump(tx, f, ensure_ascii=False, indent=0)

def cimas():
    d = {p['id']: p for p in json.load(open(f'{RAIZ}/data/peaks.json'))['picos']}
    d.update({p['id']: p for p in json.load(open(f'{RAIZ}/data/menores.json'))['picos']})
    return d

def gps(img):
    ex = img.getexif(); g = ex.get_ifd(0x8825); fecha = ex.get_ifd(0x8769).get(36867) or ex.get(306)
    fecha = fecha[:10].replace(':', '-') if isinstance(fecha, str) and len(fecha) >= 10 else None
    if not g or 2 not in g or 4 not in g: return None, fecha
    gms = lambda v: float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
    lat, lon = gms(g[2]) * (-1 if g.get(1) == 'S' else 1), gms(g[4]) * (-1 if g.get(3) == 'W' else 1)
    alt = float(g[6]) * (-1 if g.get(5) == 1 else 1) if 6 in g else None
    rumbo = float(g[17]) if 17 in g else None
    return {'lat': round(lat, 6), 'lon': round(lon, 6), 'alt': round(alt) if alt is not None else None, 'rumbo': round(rumbo) if rumbo is not None else None}, fecha

def dentro_mapa(lat, lon):
    m = json.load(open(f'{RAIZ}/data/terrain/meta.json'))
    return m['lon0'] < lon < m['lon0'] + m['ncols'] * m['step'] and m['lat0'] - m['nrows'] * m['step'] < lat < m['lat0']

def caras(img):
    try: import cv2, numpy as np
    except ImportError: return None
    g = cv2.cvtColor(np.array(img.convert('RGB')), cv2.COLOR_RGB2GRAY); n = 0
    for c in ('haarcascade_frontalface_default.xml', 'haarcascade_profileface.xml'):
        n += len(cv2.CascadeClassifier(cv2.data.haarcascades + c).detectMultiScale(g, 1.1, 6, minSize=(24, 24)))
    return n

def nuevo_id(d, cima, pre=''):   # fotos: <cima>-1, -2…; comentarios: <cima>-c1, -c2… (los números de lo quitado no se reutilizan si queda la imagen)
    usados = {a['id'] for a in d['fotos'] + d['comentarios']}
    n = 1
    while f'{cima}-{pre}{n}' in usados or os.path.exists(f'{CARPETA}/{cima}-{pre}{n}.jpg'): n += 1
    return f'{cima}-{pre}{n}'

def foto(a):
    C = cimas(); p = C.get(a.cima)
    if not p: sys.exit(f'No hay ninguna cima con id «{a.cima}»')
    img = Image.open(a.archivo); pos, fecha_ex = gps(img); img = ImageOps.exif_transpose(img).convert('RGB')
    print(f'{p["nombre"]} ({p.get("altitud")} m) · foto de {img.width}×{img.height} px · fecha en la foto: {fecha_ex or "no tiene"}')
    if pos:
        dy, dx = (p['lat'] - pos['lat']) * 111195, (p['lon'] - pos['lon']) * 111195 * math.cos(math.radians(pos['lat']))
        print(f'  GPS: {pos["lat"]}, {pos["lon"]} · {pos["alt"] or "?"} m · la cima está a {math.hypot(dx, dy) / 1000:.1f} km, rumbo {math.degrees(math.atan2(dx, dy)) % 360:.0f}°'
              + (f' · la cámara miraba a {pos["rumbo"]}°' if pos['rumbo'] is not None else ''))
        if not dentro_mapa(pos['lat'], pos['lon']): print('  El punto está fuera del mapa: no se publica la posición.'); pos = None
    else: print('  Sin posición GPS (o la borró la aplicación con la que se mandó).')
    n = caras(img); print(f'  Caras detectadas: {n}' + ('  ← REVISAR: recortar o no publicar' if n else ' (revisar igualmente a ojo)') if n is not None else '  (sin OpenCV: revisar las caras a ojo)')
    if a.prueba: return
    d = carga(DATOS, {'fotos': [], 'comentarios': []}); i = nuevo_id(d, a.cima)
    img.thumbnail((LADO, LADO), Image.LANCZOS); os.makedirs(CARPETA, exist_ok=True)
    img.save(f'{CARPETA}/{i}.jpg', quality=84, optimize=True, progressive=True)   # sin exif=: el archivo publicado no lleva metadatos
    e = {'id': i, 'cima': a.cima, 'autor': a.autor, 'fecha': a.fecha or fecha_ex or datetime.date.today().isoformat(), 'pie': a.pie, 'w': img.width, 'h': img.height}
    if pos and not a.sin_gps: e.update({k: v for k, v in pos.items() if v is not None})
    d['fotos'].append(e); guarda(d); traduce(a.pie, a.en)
    print(f'  Hecho: {i} → img/aportes/{i}.jpg ({img.width}×{img.height})' + (' · sale en el mapa' if 'lat' in e else ''))

def comentario(a):
    if a.cima not in cimas(): sys.exit(f'No hay ninguna cima con id «{a.cima}»')
    d = carga(DATOS, {'fotos': [], 'comentarios': []}); i = nuevo_id(d, a.cima, 'c')
    d['comentarios'].append({'id': i, 'cima': a.cima, 'autor': a.autor, 'fecha': a.fecha or datetime.date.today().isoformat(), 'texto': a.texto})
    guarda(d); traduce(a.texto, a.en); print(f'Hecho: {i}')

def quita(a):
    d = carga(DATOS, {'fotos': [], 'comentarios': []}); antes = len(d['fotos']) + len(d['comentarios'])
    d['fotos'] = [x for x in d['fotos'] if x['id'] != a.id]; d['comentarios'] = [x for x in d['comentarios'] if x['id'] != a.id]
    if len(d['fotos']) + len(d['comentarios']) == antes: sys.exit(f'No hay ninguna aportación «{a.id}»')
    if os.path.exists(f'{CARPETA}/{a.id}.jpg'): os.remove(f'{CARPETA}/{a.id}.jpg')
    guarda(d); print(f'Quitada {a.id} (la traducción de textos_en.json no estorba; si se quiere, se borra a mano)')

def lista(a):
    d = carga(DATOS, {'fotos': [], 'comentarios': []})
    for x in d['fotos']: print(f'{x["id"]:28} foto  {x["fecha"]}  {x["autor"]}' + ('  [GPS]' if 'lat' in x else '') + f'  {x["pie"][:50]}')
    for x in d['comentarios']: print(f'{x["id"]:28} coment. {x["fecha"]}  {x["autor"]}  {x["texto"][:50]}')

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter); sub = ap.add_subparsers(required=True)
f = sub.add_parser('foto'); f.add_argument('archivo'); f.add_argument('cima'); f.add_argument('autor'); f.add_argument('pie')
f.add_argument('--en'); f.add_argument('--fecha'); f.add_argument('--sin-gps', action='store_true'); f.add_argument('--prueba', action='store_true'); f.set_defaults(fn=foto)
c = sub.add_parser('comentario'); c.add_argument('cima'); c.add_argument('autor'); c.add_argument('texto'); c.add_argument('--en'); c.add_argument('--fecha'); c.set_defaults(fn=comentario)
q = sub.add_parser('quita'); q.add_argument('id'); q.set_defaults(fn=quita)
sub.add_parser('lista').set_defaults(fn=lista)
a = ap.parse_args(); a.fn(a)

#!/usr/bin/env python3
"""Textura de una piedra con letras escritas a rotulador negro (las que dejan los montañeros en las cimas), sobre la textura escaneada de la roca.
La llaman los scripts de Blender (tools/modelos/cima_*.py) antes de construir la piedra, porque el Python de Blender no trae PIL.
Uso: python3 tools/modelos/rotulo_piedra.py <textura_roca.jpg> <salida.jpg> "LÍNEA 1|LÍNEA 2|..." [ancho alto tinte_r,g,b grosor tinta_r,g,b ocupa]
(tinta: color de las letras, 0-255; por defecto negro de rotulador)
La imagen ocupa la cara delantera de la piedra; el texto va centrado y algo torcido, con el trazo irregular de un rotulador."""
import sys, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
src, out, txt = sys.argv[1:4]
W = int(sys.argv[4]) if len(sys.argv) > 4 else 1024; H = int(sys.argv[5]) if len(sys.argv) > 5 else 768
tinte = np.array([float(v) for v in sys.argv[6].split(',')]) if len(sys.argv) > 6 else np.array([1.0, 1.0, 1.0])
grueso = float(sys.argv[7]) if len(sys.argv) > 7 else 1.0
tinta = np.array([float(v) for v in sys.argv[8].split(',')]) if len(sys.argv) > 8 else np.array([18.0, 18.0, 20.0])
ocupa = float(sys.argv[9]) if len(sys.argv) > 9 else 1.0   # tamaño del texto respecto al normal (62 % del alto, 80 % del ancho como mucho)
R = random.Random(txt)
base = Image.open(src).convert('RGB'); base = base.crop((0, 0, min(base.width, W), min(base.height, H))).resize((W, H))
im = (np.asarray(base, np.float32) * tinte).clip(0, 255)
lineas = txt.split('|'); fuente = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'
capa = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(capa)
alto = int(H * 0.62 * ocupa / len(lineas)); y = (H - alto * len(lineas)) / 2
for ln in lineas:
    t = int(alto * 0.8)
    while t > 8 and dr.textlength(ln, font=ImageFont.truetype(fuente, t)) > W * 0.8 * ocupa: t -= 2   # que quepa en el ancho de la piedra
    f = ImageFont.truetype(fuente, t); x = (W - dr.textlength(ln, font=f)) / 2 + R.uniform(-W * 0.04, W * 0.04)
    for k, ch in enumerate(ln):   # letra a letra, un poco bailadas, como escritas a mano
        dr.text((x, y + R.uniform(-alto * 0.05, alto * 0.05)), ch, font=f, fill=255, stroke_width=max(1, int(alto * 0.03 * grueso)), stroke_fill=255)
        x += dr.textlength(ch, font=f) * R.uniform(0.98, 1.06)
    y += alto
capa = capa.rotate(R.uniform(-6, 6), resample=Image.BICUBIC).filter(ImageFilter.GaussianBlur(1.2))
m = np.asarray(capa, np.float32) / 255
m *= 0.8 + 0.2 * np.random.default_rng(1).random(m.shape)   # la tinta no cubre igual en el grano de la piedra
im = im * (1 - 0.88 * m[..., None]) + tinta * 0.88 * m[..., None]
Image.fromarray(im.clip(0, 255).astype(np.uint8)).save(out, quality=88)
print('rotulo', out)

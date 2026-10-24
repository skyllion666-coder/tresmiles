#!/usr/bin/env python3
"""Texturas de roca derivadas de las escaneadas de Poly Haven (CC0) para las cimas hechas a partir de las fotos de las fichas.
Salen en ~/tresmiles-fuentes/texturas/web/<nombre>_diff_{1k,512}.jpg, con el mapa de normales de su textura de origen (<nombre>_nor_*.jpg),
para que rocas.material_escaneado('x', '<nombre>') las use igual que las escaneadas. El relieve (disp) se toma de la de origen.
- caliza_gris / caliza_parda (de rock_surface): caliza gris azulada y parda del Casco de Marboré.
- caliza_vetas (de rock_surface): caliza gris clara con vetas blancas de calcita y algo de óxido (Robiñera, La Munia).
- caliza_naranja (de rock_surface): caliza anaranjada del Cilindro de Marboré.
- caliza_clara (de rock_boulder_dry): caliza gris clara con manchas de liquen naranja (Pico de Algas).
- pizarra (de seaside_rock y rock_08): pizarra gris azulada con manchas pardas de óxido, en bandas (Gran Bachimala).
- granito_oscuro / granito_gris (de rock_boulder_dry): granito gris oscuro y gris medio, sin el tono beige (Pico de Alba).
- granito_liquen (de rock_boulder_dry): granito gris claro algo cálido con manchas de liquen amarillo verdoso y motas oscuras (Diente de Alba).
- granito_rojizo (de rock_boulder_dry y rock_08): granito pardo rojizo con grano y manchas grises (La Paúl).
- roca_parda (de rock_08 y rock_surface): roca parda rojiza (Infiernos, Paúl).
Uso: python3 tools/modelos/texturas_derivadas.py"""
import os, shutil
import numpy as np
from PIL import Image
W = os.path.expanduser('~/tresmiles-fuentes/texturas/web')
rng = np.random.default_rng(7)
def lee(n, tam): return np.asarray(Image.open(f'{W}/{n}_diff_{tam}.jpg').convert('RGB'), np.float32)
def ruido(N, escala, semilla, ex=1.0):   # ruido suave que se repite sin costuras: blanco filtrado con una gaussiana de `escala` (fracción del lado) en frecuencia; ex > 1 lo estira en horizontal
    f = np.fft.fftfreq(N); F = np.exp(-((f[:, None] / 1.0) ** 2 + (f[None, :] * ex) ** 2) * (np.pi * escala * N) ** 2 / 2)
    r = np.real(np.fft.ifft2(np.fft.fft2(np.random.default_rng(semilla).random((N, N))) * F))
    r -= r.min(); return r / (r.max() or 1)
def vetas(N, semilla):   # grietas rellenas de calcita: líneas quebradas casi rectas en una dirección dominante, con alguna rama; se dibujan repetidas para que casen en los bordes
    from PIL import ImageDraw, ImageFilter
    import random
    R = random.Random(semilla); im = Image.new('L', (N, N), 0); dr = ImageDraw.Draw(im); dom = R.uniform(0, np.pi)
    def linea(x, y, ang, largo, ancho, ramas):
        pts = [(x, y)]
        for _ in range(int(largo / (N * 0.03))):
            ang += R.uniform(-0.25, 0.25); x += np.cos(ang) * N * 0.03; y += np.sin(ang) * N * 0.03; pts.append((x, y))
            if ramas and R.random() < 0.12: linea(x, y, ang + R.choice((-1, 1)) * R.uniform(0.4, 0.9), largo * 0.35, max(1, ancho - 1), False)
        for ox in (-N, 0, N):
            for oy in (-N, 0, N): dr.line([(px + ox, py + oy) for px, py in pts], fill=R.randint(170, 255), width=ancho)
    for _ in range(7): linea(R.uniform(0, N), R.uniform(0, N), dom + R.uniform(-0.4, 0.4), R.uniform(0.4, 1.0) * N, R.choice((1, 2, 2, 3)) * max(1, N // 512), True)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(0.7 * max(1, N // 512))), np.float32) / 255
gris = lambda a: (a @ np.array([.3, .59, .11]))[..., None]
def guarda(nombre, img, tam, origen):
    Image.fromarray(img.clip(0, 255).astype(np.uint8)).save(f'{W}/{nombre}_diff_{tam}.jpg', quality=90)
    shutil.copy(f'{W}/{origen}_nor_{tam}.jpg', f'{W}/{nombre}_nor_{tam}.jpg')
for tam, N in (('1k', 1024), ('512', 512)):
    k = N // 512
    rs = lee('rock_surface', tam); g = gris(rs); g = (g - g.mean()) * 1.4 + g.mean()
    guarda('caliza_gris', g * np.array([0.98, 1.0, 1.03]) * 1.12, tam, 'rock_surface')
    guarda('caliza_parda', 0.55 * g * np.array([0.98, 1.0, 1.03]) * 1.12 + 0.45 * rs * np.array([1.02, 1.0, 0.95]) * 1.1, tam, 'rock_surface')
    # vetas: líneas finas donde un ruido suave cruza un nivel (varios niveles y escalas), blancas; algo de óxido en manchas
    v = vetas(N, 9)
    base = g * np.array([0.99, 1.0, 1.02]) * 1.25
    ox = np.clip((ruido(N, 0.05, 5) - 0.62) / 0.1, 0, 1)[..., None] * 0.35
    vet = base * (1 - v[..., None]) + np.array([235, 233, 228]) * v[..., None]
    guarda('caliza_vetas', vet * (1 - ox) + vet * np.array([1.15, 0.85, 0.6]) * ox, tam, 'rock_surface')
    t = ruido(N, 0.04, 3)[..., None]   # zonas más pardas y más grises, como las piedras de la foto
    guarda('caliza_naranja', g * (np.array([1.22, 0.9, 0.7]) * (1 - 0.35 * t) + np.array([1.0, 0.98, 0.96]) * 0.35 * t) * 1.25, tam, 'rock_surface')
    bd = lee('rock_boulder_dry', tam); gb = gris(bd)
    lq = np.clip((ruido(N, 0.02, 9) - 0.66) / 0.06, 0, 1)[..., None]   # manchas de liquen naranja
    clara = gb * np.array([1.02, 1.0, 0.97]) * 1.15
    lq *= np.clip((ruido(N, 0.004, 12) - 0.3) / 0.4, 0, 1)[..., None]   # el liquen, en motas dentro de las manchas
    guarda('caliza_clara', clara * (1 - lq * 0.45) + clara * np.array([1.05, 0.7, 0.4]) * lq * 0.45, tam, 'rock_boulder_dry')
    guarda('granito_oscuro', gb * np.array([0.97, 0.99, 1.02]) * 0.78, tam, 'rock_boulder_dry')
    guarda('granito_gris', gb * np.array([0.98, 1.0, 1.02]) * 0.95, tam, 'rock_boulder_dry')
    lv = np.clip((ruido(N, 0.012, 31) - 0.58) / 0.08, 0, 1) * np.clip((ruido(N, 0.003, 32) - 0.35) / 0.3, 0, 1)   # liquen amarillo verdoso, en motas dentro de manchas
    ln = np.clip((ruido(N, 0.003, 33) - 0.72) / 0.08, 0, 1) * 0.5   # motas oscuras (liquen negro)
    cl = gb * np.array([1.0, 0.99, 0.95]) * 1.12
    cl = cl * (1 - lv[..., None] * 0.6) + cl * np.array([1.05, 1.05, 0.45]) * lv[..., None] * 0.6
    guarda('granito_liquen', cl * (1 - ln[..., None] * 0.55), tam, 'rock_boulder_dry')
    mg = np.clip((ruido(N, 0.03, 41) - 0.5) / 0.15, 0, 1)[..., None] * 0.6   # manchas grises
    gc = (gb - gb.mean()) * 1.5 + gb.mean()
    roj = (gc * 0.7 + gris(lee('rock_08', tam)) * 0.3) * np.array([1.06, 0.88, 0.8]) * 0.72
    guarda('granito_rojizo', roj * (1 - mg) + gc * np.array([0.97, 0.98, 0.95]) * 0.8 * mg, tam, 'rock_boulder_dry')
    # pizarra: gris azulada oscura con bandas pardas de óxido estiradas en horizontal
    sr = lee('seaside_rock', tam); r8 = lee('rock_08', tam)
    banda = ruido(N, 0.05, 21); banda = np.repeat(banda.mean(1, keepdims=True), N, 1) * 0.5 + banda * 0.5
    m = np.clip((banda - 0.35) / 0.35, 0, 1)[..., None]
    azul = (gris(sr) - gris(sr).mean()) * 0.5 + gris(sr).mean(); azul = azul * np.array([0.95, 0.98, 1.05]) * 1.25 + 8
    oxido = gris(r8) * np.array([1.15, 0.88, 0.68]) * 0.85
    guarda('pizarra', azul * (1 - m) + oxido * m, tam, 'seaside_rock')
    guarda('roca_parda', 0.5 * r8 * np.array([1.05, 0.82, 0.7]) + 0.5 * g * np.array([1.0, 0.9, 0.85]), tam, 'rock_08')
    print(tam, 'hecho')

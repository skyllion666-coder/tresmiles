#!/usr/bin/env python3
"""Cima del Diente de Alba (3.136 m, granito de la Maladeta), a partir de la foto de la cima de la ficha (img/hitos/die-cima.jpg):
no hay hito; la cima es un bloque enorme de granito gris claro con líquenes, casi cúbico y de cantos vivos (~2,7 m de ancho, cara de la derecha a plomo),
con una losa encima (~1,6 m × 1,1 m × 0,4 m) algo inclinada que vuela hacia la derecha; a la izquierda, bloques más bajos que bajan en escalones (pocos y pegados: la web mide el suelo en las esquinas de la caja del modelo y la punta del Diente es estrecha).
Medidas sacadas de la foto con el montañero de pie en la losa (~1,75 m).
Uso: tools/modelos/hacer_cima.sh diente-alba"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-diente-alba.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3136)
M_G = C.mat('granito_liquen', 'granito_liquen'); M_O = C.mat('granito_gris', 'granito_gris', '512')
color = lambda: M_O if R.random() < 0.4 else M_G
hito = []
kw = dict(incl=0.2, bisel=0.05, cortes=4, uv=1.6)
# el bloque grande (la cima), la losa de encima y los escalones de la izquierda
grande = C.piedra('hito_grande', (2.0, 1.8, 1.5), (0.25, 0.0, 0.75), (0.0, 0.0, 0.05), M_G, bisel=0.04, cortes=3, uv=2.2); hito.append(grande)
losa = C.piedra('hito_losa', (1.7, 1.15, 0.45), (0.75, 0.05, 6.0), (0.04, -0.1, 0.1), M_G, bisel=0.12, cortes=4, uv=1.8); C.soltar(losa, [grande], hundir=0.05); hito.append(losa)
for k, (x, y, sx, sy, sz, ry) in enumerate(((-1.05, 0.05, 0.9, 1.5, 1.0, 0.25), (-0.85, -0.75, 0.6, 0.45, 0.5, 0.15))):
    hito.append(C.piedra(f'hito_esc{k}', (sx, sy, sz), (x, y, sz / 2 - 0.05), (0.0, ry, R.uniform(-0.2, 0.2)), M_G, bisel=0.08, cortes=4, uv=1.8))
for k, (x, y) in enumerate(((0.9, 1.05), (-0.4, 1.0), (1.2, -0.85))):   # calzos de granito al pie
    s = R.uniform(0.4, 0.6); hito.append(C.piedra(f'hito_pie{k}', (s * 1.3, s, s * 0.7), (x, y, s * 0.3), (R.uniform(-.2, .2), R.uniform(-.2, .2), R.uniform(0, 3)), color(), **kw))
sueltos = []
for k in range(14):
    a = R.uniform(0, math.tau); rr = R.uniform(1.6, 2.1); s = R.uniform(0.25, 0.5)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.45, 0.75)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_boulder_dry', 0.03), cam=((1.0, -6.0, 0.8), (-0.1, 0.0, 1.1), 30), suelo='granito_gris', cielo=(0.35, 0.55, 0.95))

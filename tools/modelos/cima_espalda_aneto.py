#!/usr/bin/env python3
"""Cima de la Espalda de Aneto (3.350 m, granito del Aneto), a partir de la foto de la cima de la ficha (img/hitos/esp-cima.jpg):
una cumbre ancha y casi llana de losas de granito gris claro con motas de liquen amarillo; a un lado, un mojón pequeño y bajo de cuatro o cinco piedras
redondeadas (~0,4 m de alto); al otro, bloques grandes de cantos muy gastados, redondeados, amontonados. (En la foto hay una mochila: no se modela.)
Pocos bloques y pegados: la web mide el suelo en las esquinas de la caja del modelo.
Uso: tools/modelos/hacer_cima.sh espalda-aneto"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-espalda-aneto.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3350)
M_L = C.mat('granito_liquen', 'granito_liquen'); M_G = C.mat('granito_gris', 'granito_gris', '512')
color = lambda: M_G if R.random() < 0.2 else M_L
hito = []
# las losas de la cumbre, anchas y bajas
for k, (x, y, sx, sy, sz, rz) in enumerate(((-0.6, -0.1, 1.3, 1.1, 0.3, 0.1), (0.55, 0.3, 1.1, 1.0, 0.35, -0.2), (0.0, -0.95, 1.0, 0.6, 0.22, 0.05), (-0.5, 0.95, 0.9, 0.6, 0.25, 0.3))):
    hito.append(C.piedra(f'hito_losa{k}', (sx, sy, sz), (x, y, sz / 2 - 0.08), (R.uniform(-.04, .04), R.uniform(-.04, .04), rz), M_L, bisel=0.2, cortes=4, uv=2.0))
losas = list(hito)
# el mojón pequeño: cuatro o cinco piedras redondeadas, a la izquierda
mojon = []
for k, (x, y, s) in enumerate(((-0.95, -0.22, 0.4), (-0.58, -0.3, 0.36), (-0.76, 0.1, 0.34))):   # las de abajo, a mano sobre la losa (soltar las apilaría)
    mojon.append(C.piedra(f'hito_moj{k}', (s * 1.2, s, s * 0.75), (x, y, 0.2 + s * 0.3), (R.uniform(-.15, .15), R.uniform(-.15, .15), R.uniform(0, 3)), M_L, bisel=0.3, cortes=3, uv=1.2))
for k, (x, y, s) in enumerate(((-0.76, -0.14, 0.32), (-0.74, -0.12, 0.22))):   # una encima y otra más pequeña arriba del todo
    o = C.piedra(f'hito_moj{k + 3}', (s * 1.2, s, s * 0.75), (x, y, 6.0), (R.uniform(-.2, .2), R.uniform(-.2, .2), R.uniform(0, 3)), M_L, bisel=0.3, cortes=3, uv=1.2); C.soltar(o, mojon, hundir=0.04); mojon.append(o)
hito += mojon
# los bloques grandes y redondeados, a la derecha
for k, (x, y, s) in enumerate(((1.15, -0.35, 0.8), (0.75, -0.6, 0.6), (1.2, 0.55, 0.65))):
    o = C.piedra(f'hito_bola{k}', (s * 1.3, s, s * 0.7), (x, y, 6.0), (R.uniform(-.15, .15), R.uniform(-.15, .15), R.uniform(0, 3)), M_L, bisel=0.3, cortes=5, uv=1.8); C.soltar(o, losas, hundir=0.08); hito.append(o)
sueltos = []
kw = dict(incl=0.2, bisel=0.2, cortes=4, uv=1.5)
for k in range(14):
    a = R.uniform(0, math.tau); rr = R.uniform(1.6, 2.1); s = R.uniform(0.2, 0.45)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.4, 0.7)), (rr * math.cos(a), rr * math.sin(a), s * 0.2), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_boulder_dry', 0.03), cam=((-0.4, -4.4, 1.8), (0.1, 0.0, 0.3), 30), suelo='granito_liquen', cielo=(0.45, 0.62, 0.92))

#!/usr/bin/env python3
"""Cima de la Margalida (3.241 m, granito del Aneto), a partir de la foto de la cima de la ficha (img/hitos/mar-cima.jpg):
sin hito; placas y bloques enormes de granito gris claro con motas de liquen, de cantos vivos y separados por grietas hondas y rectas; a un lado,
una laja alta en punta e inclinada (la «Cim Margalida» de la foto) y encima de las placas, un bloque tumbado. La cresta sigue en bloques más pequeños.
Pocos bloques y pegados: la web mide el suelo en las esquinas de la caja del modelo. El eje x del modelo va a lo largo de la cresta.
Uso: tools/modelos/hacer_cima.sh margalida"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-margalida.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3241)
M_L = C.mat('granito_liquen', 'granito_liquen'); M_G = C.mat('granito_gris', 'granito_gris', '512')
color = lambda: M_G if R.random() < 0.25 else M_L
hito = []
kw = dict(incl=0.1, bisel=0.03, cortes=3, uv=1.6)
C.nucleo(hito, 'hito_nucleo', 0.4, 1.0, 0.6, M_G)
# las placas grandes, con grietas de ~5–10 cm entre ellas
for k, (x, y, sx, sy, sz, rz, ry) in enumerate(((-0.05, -0.15, 1.05, 1.3, 0.75, 0.04, 0.05), (1.05, -0.1, 0.95, 1.2, 0.6, -0.03, -0.12), (0.4, 0.75, 1.1, 0.55, 0.65, 0.02, 0.0))):
    hito.append(C.piedra(f'hito_placa{k}', (sx, sy, sz), (x, y, sz / 2 - 0.05), (0.0, ry, rz), M_L, bisel=0.025, cortes=3, uv=2.0))
# la laja en punta, inclinada, a la izquierda: un bloque alto con la cara de arriba cortada en bisel
punta = C.piedra('hito_punta', (0.45, 0.9, 1.75), (-0.85, -0.05, 0.55), (0.12, 0.6, 0.1), M_L, bisel=0.03, cortes=4, uv=2.0); hito.append(punta)
base = [h for h in hito if h is not punta]
# el bloque tumbado encima de las placas y uno más pequeño detrás
o = C.piedra('hito_tumbado', (1.0, 0.55, 0.42), (0.25, -0.05, 6.0), (0.12, -0.06, 0.25), M_L, bisel=0.04, cortes=3, uv=1.8); C.soltar(o, base, hundir=0.03); hito.append(o)
o = C.piedra('hito_detras', (0.5, 0.42, 0.35), (0.75, 0.65, 6.0), (0.0, 0.1, 0.6), color(), **kw); C.soltar(o, base, hundir=0.03); hito.append(o)
for k, (x, y, s) in enumerate(((1.75, 0.3, 0.45), (1.8, -0.55, 0.38), (-0.55, 0.85, 0.4))):   # la cresta sigue en bloques más pequeños
    hito.append(C.piedra(f'hito_{k}', (s * 1.3, s, s * 0.85), (x, y, s * 0.35), (R.uniform(-.15, .15), R.uniform(-.15, .15), R.uniform(0, 3)), color(), **kw))
sueltos = []
for k in range(14):
    a = R.uniform(0, math.tau); rr = R.uniform(1.6, 2.1); s = R.uniform(0.22, 0.45)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.4, 0.7)), (rr * math.cos(a), rr * math.sin(a), s * 0.2), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_boulder_dry', 0.03), cam=((0.2, -5.2, 1.6), (0.2, 0.0, 0.7), 30), suelo='granito_gris', cielo=(0.45, 0.62, 0.92))

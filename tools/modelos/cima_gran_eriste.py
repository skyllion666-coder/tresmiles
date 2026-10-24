#!/usr/bin/env python3
"""Cima del Gran Pico de Eriste (3.056 m, granito del Posets–Eriste), a partir de la foto de la cima de la ficha (img/hitos/eri-gran.jpg):
una loma redondeada de cascajo y bloques angulosos de granito gris (~0,2–0,8 m), con alguna losa más grande; con la niebla de la foto no se ve hito,
y no se pone. Se hace un montón bajo y ancho de bloques pequeños y medianos con losas grandes al pie, y cascajo alrededor.
Uso: tools/modelos/hacer_cima.sh gran-eriste"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-gran-eriste.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3056)
M_G = C.mat('granito_gris', 'granito_gris'); M_L = C.mat('granito_liquen', 'granito_liquen', '512')
color = lambda: M_L if R.random() < 0.35 else M_G
hito = []
kw = dict(incl=0.35, bisel=0.05, cortes=4, uv=1.4)
C.hilera(hito, 'hito_', 0.0, 0.3, 1.05, (0.35, 0.55), (0.3, 0.45), color, **kw)
C.hilera(hito, 'hito_', 0.2, 0.28, 0.65, (0.3, 0.5), (0.3, 0.42), color, **kw)
C.hilera(hito, 'hito_', 0.38, 0.25, 0.28, (0.28, 0.4), (0.25, 0.35), color, **kw)
C.nucleo(hito, 'hito_nucleo', 0.55, 1.1, 0.25, M_G)
# losas grandes al pie, delante
for k, (x, y, rz) in enumerate(((-0.7, -1.05, 0.3), (0.45, -1.15, -0.2))):
    hito.append(C.piedra(f'hito_losa{k}', (0.85, 0.6, 0.3), (x, y, 0.1), (0.15, R.uniform(-.1, .1), rz), color(), bisel=0.04, cortes=3, uv=1.6))
sueltos = []
for k in range(22):   # cascajo
    a = R.uniform(0, math.tau); rr = R.uniform(1.3, 1.9); s = R.uniform(0.18, 0.4)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.4, 0.7)), (rr * math.cos(a), rr * math.sin(a), s * 0.2), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_boulder_dry', 0.03), cam=((0.3, -4.6, 1.4), (0.0, 0.0, 0.4), 30), suelo='granito_gris', cielo=(0.6, 0.66, 0.75))

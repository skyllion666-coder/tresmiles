#!/usr/bin/env python3
"""Cima del Aragüells (3.037 m, granito del Aneto), a partir de la foto de la ficha (img/hitos/ara-cima.jpg), hecha desde abajo (2.980 m): la pirámide
de la cima es un caos de bloques angulosos de granito claro, gris beis algo rosado con motas de liquen, de cantos vivos, amontonados en punta; entre
ellos, alguna losa grande inclinada. La foto no deja ver lo de arriba del todo: se hace la punta del montón sin hito.
Pocos bloques y pegados: la web mide el suelo en las esquinas de la caja del modelo.
Uso: tools/modelos/hacer_cima.sh araguells"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-araguells.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3037)
M_L = C.mat('granito_liquen', 'granito_liquen'); M_B = C.mat('roca_beis', 'roca_beis')
color = lambda: M_B if R.random() < 0.45 else M_L
hito = []
kw = dict(incl=0.35, bisel=0.03, cortes=4, uv=1.6)
C.hilera(hito, 'hito_', 0.0, 0.45, 1.0, (0.5, 0.8), (0.45, 0.6), color, **kw)
C.hilera(hito, 'hito_', 0.35, 0.42, 0.55, (0.45, 0.65), (0.4, 0.55), color, **kw)
C.nucleo(hito, 'hito_nucleo', 0.75, 1.0, 0.3, M_B)
base = list(hito)
# la punta: un bloque ancho y bajo encima y otro de canto a un lado
for k, (x, y, sz, s, rx) in enumerate(((0.0, 0.05, 0.42, 0.7, 0.1), (0.5, 0.3, 0.6, 0.38, 0.55))):   # cada uno sobre el montón, no uno encima de otro
    o = C.piedra(f'hito_punta{k}', (s * 1.25, s, sz), (x, y, 6.0), (rx, R.uniform(-.2, .2), R.uniform(0, 3)), color(), **kw); C.soltar(o, base, hundir=0.12); hito.append(o)
# una losa grande inclinada apoyada en el montón, delante a la derecha (como la de la foto)
losa = C.piedra('hito_losa', (1.1, 0.3, 0.9), (0.85, -0.85, 0.4), (0.45, 0.0, 0.5), M_L, bisel=0.02, cortes=3, uv=2.0); hito.append(losa)
sueltos = []
for k in range(16):
    a = R.uniform(0, math.tau); rr = R.uniform(1.5, 2.1); s = R.uniform(0.25, 0.55)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.45, 0.8)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_boulder_dry', 0.03), cam=((0.4, -4.8, 1.6), (0.0, 0.0, 0.7), 30), suelo='roca_beis', cielo=(0.4, 0.58, 0.95))

#!/usr/bin/env python3
"""Cima del Pico Vallibierna (3.067 m, granito del macizo de Vallibierna), a partir de la foto de la cima de la ficha (img/hitos/val-cima.jpg),
hecha junto a la cumbre: la cabeza de la cima es roca gris clara, con una losa grande, lisa e inclinada, y encima una cresta de bloques dentados
y partidos; entre ellos, cascajo y tierra parda. Sin hito a la vista. El eje x del modelo va a lo largo de la cresta.
Pocos bloques y pegados: la web mide el suelo en las esquinas de la caja del modelo.
Uso: tools/modelos/hacer_cima.sh vallibierna"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-vallibierna.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3067)
M_L = C.mat('granito_liquen', 'granito_liquen'); M_G = C.mat('granito_gris', 'granito_gris', '512'); M_B = C.mat('roca_beis', 'roca_beis', '512')
color = lambda: (M_G, M_G, M_L, M_L, M_B)[R.randrange(5)]
hito = []
kw = dict(incl=0.3, bisel=0.03, cortes=4, uv=1.5)
C.nucleo(hito, 'hito_nucleo', 0.55, 1.0, 0.4, M_G)
# la losa grande, lisa e inclinada, en la ladera de delante (sube hacia la cresta), con una cuña debajo
hito.append(C.piedra('hito_cuna', (1.9, 0.9, 0.35), (0.0, -0.6, 0.05), (0.3, 0.0, 0.03), M_G, bisel=0.05, cortes=3, uv=1.6))
hito.append(C.piedra('hito_losa', (2.0, 1.2, 0.28), (0.0, -0.65, 0.28), (0.3, 0.0, 0.03), M_L, bisel=0.03, cortes=2, uv=2.4))
# la cresta de bloques dentados, de canto y algo inclinados, a lo largo de x por encima de la losa
for k in range(7):
    x = -1.3 + k * 0.43 + R.uniform(-0.05, 0.05); h = (1.35 - 0.5 * abs(x) / 1.3) * R.uniform(0.8, 1.1)
    hito.append(C.piedra(f'hito_diente{k}', (R.uniform(0.3, 0.45), R.uniform(0.35, 0.55), h), (x, 0.3 + R.uniform(-0.1, 0.1), h * 0.42), (R.uniform(-0.25, 0.25), R.uniform(-0.25, 0.25), R.uniform(0, 3)), color(), **kw))
base = [h for h in hito if not h.name.startswith('hito_diente')]
for k, (x, y, s) in enumerate(((-0.8, 0.85, 0.36), (0.6, 0.85, 0.32), (1.2, -0.2, 0.3))):   # bloques partidos detrás y a un lado
    o = C.piedra(f'hito_{k}', (s * 1.3, s, s * 0.7), (x, y, 6.0), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw); C.soltar(o, base, hundir=0.06); hito.append(o)
sueltos = []
for k in range(20):   # cascajo
    a = R.uniform(0, math.tau); rr = R.uniform(1.3, 1.9); s = R.uniform(0.12, 0.32)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.4, 0.7)), (rr * math.cos(a), rr * math.sin(a), s * 0.2), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_boulder_dry', 0.03), cam=((2.2, -4.4, 1.7), (0.0, 0.0, 0.6), 30), suelo='roca_beis', cielo=(0.5, 0.65, 0.9))

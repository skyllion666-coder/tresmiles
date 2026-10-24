#!/usr/bin/env python3
"""Cima del Pico de Algas (3.036 m, macizo de Infiernos–Argualas), a partir de la foto de la cima de la ficha (img/hitos/alg-pico.jpg):
un amontonamiento de bloques grandes y angulosos de caliza gris clara con manchas de liquen naranja; delante, un bloque alto de pie (~0,9 m)
y detrás otro mayor y más redondeado que hace de punto más alto (~1,5 m); alrededor, bloques y lajas más pequeños.
(En la foto hay unos bastones apoyados: son del montañero y no se modelan.)
Uso: tools/modelos/hacer_cima.sh algas"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-algas.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3036)
M_C = C.mat('caliza_clara', 'caliza_clara'); M_G = C.mat('caliza_gris', 'caliza_gris', '512')
color = lambda: M_G if R.random() < 0.2 else M_C
hito = []
kw = dict(incl=0.3, bisel=0.05, cortes=6, uv=1.6)
C.hilera(hito, 'hito_', 0.0, 0.5, 0.9, (0.55, 0.9), (0.5, 0.75), color, **kw)
C.nucleo(hito, 'hito_nucleo', 0.55, 0.75, 0.45, M_C)
base = list(hito)
# el bloque grande de detrás (el punto más alto) y el alto de pie delante
grande = C.piedra('hito_grande', (0.95, 0.8, 0.85), (-0.05, 0.2, 6.0), (0.15, -0.1, 0.4), M_C, bisel=0.1, cortes=6, uv=1.6); C.soltar(grande, base, hundir=0.12); hito.append(grande)
alto = C.piedra('hito_alto', (0.55, 0.45, 0.95), (0.15, -0.45, 6.0), (0.08, 0.12, -0.3), M_C, bisel=0.06, cortes=5, uv=1.6); C.soltar(alto, base, hundir=0.15); hito.append(alto)
for k in range(4):   # bloques medianos alrededor, apoyados en la base
    a = k * 1.6 + 0.9; s = R.uniform(0.4, 0.6)
    o = C.piedra(f'hito_{len(hito)}', (s * 1.3, s, s * 0.7), (0.55 * math.cos(a), 0.55 * math.sin(a), 6.0), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw); C.soltar(o, base, hundir=0.05); hito.append(o)
sueltos = []
for k in range(16):
    a = R.uniform(0, math.tau); rr = R.uniform(1.3, 2.4); s = R.uniform(0.3, 0.75)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.45, 0.8)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_boulder_dry', 0.04), cam=((-0.6, -3.8, 1.5), (0.0, 0.0, 0.8), 30), suelo='caliza_clara')

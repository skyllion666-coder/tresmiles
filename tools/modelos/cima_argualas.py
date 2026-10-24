#!/usr/bin/env python3
"""Cima del Pico Argualas (3.046 m, macizo de Infiernos–Argualas), a partir de la foto de la cima de la ficha (img/hitos/alg-argualas.jpg):
un mojón de bloques grandes, angulosos y algo redondeados, de roca gris parda (~1,5 m de alto), con una laja gruesa y plana encima a modo de tapa,
y alrededor bloques sueltos de la misma roca.
Uso: tools/modelos/hacer_cima.sh argualas"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-argualas.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3046)
M_P = C.mat('caliza_parda', 'caliza_parda'); M_G = C.mat('caliza_gris', 'caliza_gris', '512'); M_O = C.mat('granito_ocre', 'rock_08', '512')
color = lambda: (M_G, M_O, M_P, M_P)[R.randrange(4)]
hito = []
kw = dict(incl=0.2, bisel=0.1, cortes=5, uv=1.5)
C.hilera(hito, 'hito_', 0.0, 0.5, 0.8, (0.5, 0.8), (0.45, 0.7), color, **kw)
C.hilera(hito, 'hito_', 0.45, 0.45, 0.5, (0.45, 0.7), (0.4, 0.55), color, **kw)
C.nucleo(hito, 'hito_nucleo', 0.9, 0.7, 0.4, M_P)
base = list(hito)
for k in range(2):   # dos bloques en medio que sostienen la tapa
    a = k * 3.1 + 0.5
    o = C.piedra(f'hito_{len(hito)}', (0.5, 0.42, 0.35), (0.18 * math.cos(a), 0.18 * math.sin(a), 6.0), R.uniform(0, 3), color(), **kw); C.soltar(o, base, hundir=0.04); hito.append(o)
tapa = C.piedra('hito_tapa', (0.85, 0.6, 0.22), (0.05, 0.0, 6.0), (0.05, -0.08, 0.3), M_G, bisel=0.06, cortes=3, uv=1.5); C.soltar(tapa, hito, hundir=0.02); hito.append(tapa)
sueltos = []
for k in range(16):
    a = R.uniform(0, math.tau); rr = R.uniform(1.2, 2.3); s = R.uniform(0.3, 0.7)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.45, 0.8)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_surface', 0.04), cam=((0.8, -3.8, 1.5), (0.0, 0.0, 0.85), 30), suelo='caliza_parda')

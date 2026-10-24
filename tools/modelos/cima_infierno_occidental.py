#!/usr/bin/env python3
"""Cima del Infierno Occidental (3.073 m, macizo de los Infiernos), a partir de la foto de la cima de la ficha (img/hitos/inf-oriental.jpg, hecha desde
la cresta): en primer plano, la cima es un amontonamiento de bloques angulosos y algo gastados (~0,4–0,8 m), unos pardos y rojizos, otros gris claro
y beis, sin mojón. Se hace una loma corta de bloques en dos vueltas con alguno grande encima.
Uso: tools/modelos/hacer_cima.sh infierno-occidental"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-infierno-occidental.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3073)
M_R = C.mat('granito_rojizo', 'granito_rojizo', '512'); M_G = C.mat('roca_beis', 'roca_beis'); M_O = C.mat('granito_ocre', 'rock_08', '512')
color = lambda: (M_G, M_G, M_G, M_R, M_R)[R.randrange(5)]
hito = []
kw = dict(incl=0.3, bisel=0.1, cortes=5, uv=1.5)
C.hilera(hito, 'hito_', 0.0, 0.4, 0.95, (0.45, 0.7), (0.4, 0.55), color, **kw)
C.hilera(hito, 'hito_', 0.32, 0.38, 0.5, (0.4, 0.6), (0.35, 0.5), color, **kw)
C.nucleo(hito, 'hito_nucleo', 0.65, 0.95, 0.35, M_G)
base = list(hito)
for k, (x, y, s) in enumerate(((-0.15, 0.1, 0.75), (0.35, -0.2, 0.55), (-0.45, -0.35, 0.45))):   # bloques grandes encima, cada uno en su sitio
    o = C.piedra(f'hito_g{k}', (s * 1.25, s, s * 0.75), (x, y, 6.0), (R.uniform(-.25, .25), R.uniform(-.25, .25), R.uniform(0, 3)), color(), **kw); C.soltar(o, base, hundir=0.12); hito.append(o)
sueltos = []
for k in range(18):
    a = R.uniform(0, math.tau); rr = R.uniform(1.3, 2.0); s = R.uniform(0.25, 0.55)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.45, 0.8)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_08', 0.04), cam=((0.6, -4.4, 1.5), (0.0, 0.0, 0.6), 30), suelo='roca_beis', cielo=(0.45, 0.62, 0.92))

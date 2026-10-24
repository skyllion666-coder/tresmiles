#!/usr/bin/env python3
"""Cima del Pico de Alba (3.118 m, granito de la Maladeta), a partir de la foto de la cima de la ficha (img/hitos/alb-cima.jpg):
un montón ancho de bloques grandes de granito gris (~2,2 m de ancho) y encima una torre de seis bloques apilados uno sobre otro, de más a menos
(el de abajo, una laja que sobresale a la izquierda; el último, una piedrita), en zigzag. En total ~2,8 m.
Medidas sacadas de la foto: los bloques de la torre miden ~0,55 m de ancho (~125 px), el montón ~500 px y el conjunto ~630 px de alto.
Uso: blender -b --python tools/modelos/cima_alba.py -- /tmp/cima-alba.glb [vista.png]   (o tools/modelos/hacer_cima.sh alba)"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-alba.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3118)
M_G = C.mat('granito_gris', 'granito_gris'); M_O = C.mat('granito_oscuro', 'granito_oscuro', '512')
color = lambda: M_O if R.random() < 0.35 else M_G
hito = []
# montón de abajo: bloques grandes y cuadrados, más altos en el centro
caidas = []   # la vuelta de fuera, suelta: en la web cada bloque se apoya en el relieve (la arista del Alba es estrecha)
C.hilera(caidas, 'caida', 0.0, 0.6, 1.0, (0.65, 0.95), (0.55, 0.8), color, incl=0.15, bisel=0.12, cortes=3, uv=1.8)
C.hilera(hito, 'hito_', 0.42, 0.4, 0.62, (0.5, 0.75), (0.45, 0.6), color, incl=0.12, bisel=0.12, cortes=3, uv=1.8)
for k in range(1):   # un bloque en medio, sobre los que se apoya la torre
    o = C.piedra(f'hito_{len(hito)}', (0.75, 0.6, 0.35), (R.uniform(-0.1, 0.1), R.uniform(-0.1, 0.1), 8.0), R.uniform(0, 3), color(), bisel=0.1, cortes=2, uv=1.8, incl=0.05)
    C.soltar(o, hito, hundir=0.05); hito.append(o)
# la torre: (largo, fondo, alto, desplazamiento en x, giro); la laja de abajo sobresale a la izquierda
torre = [(1.05, 0.62, 0.26, -0.18, 0.1), (0.9, 0.6, 0.22, 0.05, -0.05), (0.62, 0.5, 0.36, 0.0, 0.08), (0.52, 0.46, 0.38, -0.04, -0.1),
         (0.54, 0.42, 0.24, -0.03, 0.15), (0.34, 0.3, 0.22, 0.02, -0.2), (0.2, 0.17, 0.12, 0.0, 0.3)]
for k, (L, f, h, dx, g) in enumerate(torre):
    o = C.piedra(f'hito_{len(hito)}', (L, f, h), (dx, 0.0, 8.0), (R.uniform(-0.04, 0.04), R.uniform(-0.06, 0.06), g), M_G if k % 3 else M_O, bisel=0.06, cortes=2, uv=1.8)
    C.soltar(o, hito, hundir=0.015); hito.append(o)
C.nucleo(hito, 'hito_nucleo', 0.85, 0.7, 0.4, M_O)
# bloques sueltos alrededor (la arista de granito)
sueltos = []
for k in range(10):
    a = R.uniform(0, math.tau); rr = R.uniform(1.3, 2.1); s = R.uniform(0.35, 0.75)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.4), s * R.uniform(0.7, 1.0), s * R.uniform(0.5, 0.8)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), R.uniform(0, 3), color(), bisel=0.15, cortes=4, uv=1.8))
C.cerrar(OUT, PREV, relieve=('rock_boulder_dry', 0.04), cam=((0.4, -6.2, 1.1), (0.0, 0.0, 1.35), 30), cielo=(0.72, 0.75, 0.8), fuerza_cielo=1.3)

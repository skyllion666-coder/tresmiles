#!/usr/bin/env python3
"""Cima de la Frondiella / Punta Alta de las Frondiellas (3.071 m, granito del Balaitús), a partir de la foto de la cima de la ficha (img/hitos/fro-cima.jpg):
sin hito; bloques enormes de granito gris oscuro, angulosos y con los cantos gastados, cubiertos a manchas de liquen amarillo verdoso, y a un lado
una pared o torre de roca más alta partida en bloques. Se hace con un bloque grande inclinado delante, la torre detrás a un lado y bloques entre medias.
Pocos bloques y pegados: la web mide el suelo en las esquinas de la caja del modelo.
Uso: tools/modelos/hacer_cima.sh frondiellas"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-frondiellas.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3071)
M_L = C.mat('granito_oscuro_liquen', 'granito_oscuro_liquen'); M_O = C.mat('granito_oscuro', 'granito_oscuro', '512')
color = lambda: M_O if R.random() < 0.3 else M_L
hito = []
kw = dict(incl=0.15, bisel=0.12, cortes=5, uv=1.6)
C.nucleo(hito, 'hito_nucleo', 0.5, 1.0, 0.6, M_O)
# la torre (pared partida), detrás a la derecha: un bloque alto y otro encima
t0 = C.piedra('hito_torre0', (0.95, 0.75, 1.5), (0.8, 0.5, 0.7), (0.03, -0.05, 0.25), M_L, bisel=0.08, cortes=5, uv=1.6); hito.append(t0)
t1 = C.piedra('hito_torre1', (0.7, 0.6, 0.45), (0.75, 0.5, 6.0), (0.08, -0.06, 0.6), M_O, bisel=0.14, cortes=4, uv=1.6); C.soltar(t1, [t0], hundir=0.04); hito.append(t1)
# el bloque grande de delante, ancho y algo inclinado, y bloques medianos al pie (sobre el suelo, el núcleo y el grande, no en la torre)
g = C.piedra('hito_grande', (1.5, 1.0, 0.75), (-0.35, -0.3, 0.32), (0.1, -0.12, -0.15), M_L, bisel=0.15, cortes=6, uv=1.8); hito.append(g)
base = [h for h in hito if not h.name.startswith('hito_torre')]
for k, (x, y, s) in enumerate(((-0.35, 0.5, 0.6), (0.9, -0.45, 0.55), (-1.15, 0.25, 0.5), (0.2, -0.25, 0.42), (-0.95, -0.95, 0.4))):
    o = C.piedra(f'hito_{k}', (s * 1.3, s, s * 0.8), (x, y, 6.0), (R.uniform(-.2, .2), R.uniform(-.2, .2), R.uniform(0, 3)), color(), **kw); C.soltar(o, base, hundir=0.15); hito.append(o)
sueltos = []
for k in range(14):
    a = R.uniform(0, math.tau); rr = R.uniform(1.4, 2.0); s = R.uniform(0.25, 0.5)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.45, 0.75)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_boulder_dry', 0.04), cam=((-0.4, -4.6, 1.5), (0.1, 0.0, 0.7), 30), suelo='granito_oscuro', cielo=(0.45, 0.62, 0.92))

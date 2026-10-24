#!/usr/bin/env python3
"""Cima de La Paúl (3.078 m, granito de la cresta de Bardamina), a partir de la única foto de la ficha (img/hitos/pau-gendarmes.jpg), que es de los
gendarmes de la cresta (2.986 m) y no de la cima: se toma de ella la roca y su forma, no las torres. Granito pardo rojizo en bloques de cantos vivos
partidos en vertical (alguno de pie, con una piedra encima) y bloques gris verdosos con liquen; una cresta corta de bloques amontonados.
Pocos bloques y pegados: la web mide el suelo en las esquinas de la caja del modelo.
Uso: tools/modelos/hacer_cima.sh paul"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-paul.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3078)
M_P = C.mat('granito_rojizo', 'granito_rojizo'); M_L = C.mat('granito_liquen', 'granito_liquen', '512')
color = lambda: M_L if R.random() < 0.35 else M_P
hito = []
kw = dict(incl=0.15, bisel=0.04, cortes=4, uv=1.4)
# la cresta: bloques grandes a lo largo de x, más altos en medio
for k, (x, y, sx, sy, sz) in enumerate(((-1.0, 0.1, 0.7, 0.8, 0.6), (-0.35, -0.05, 0.75, 0.9, 0.85), (0.4, 0.05, 0.7, 0.85, 0.75), (1.05, -0.05, 0.65, 0.75, 0.5),
                                         (-0.6, 0.75, 0.6, 0.5, 0.45), (0.2, -0.8, 0.65, 0.5, 0.45), (0.8, 0.7, 0.55, 0.5, 0.4))):
    hito.append(C.piedra(f'hito_{k}', (sx, sy, sz), (x, y, sz / 2 - 0.05), (R.uniform(-.06, .06), R.uniform(-.06, .06), R.uniform(-0.25, 0.25)), color(), **kw))
base = list(hito)
# los bloques de pie, partidos en vertical, con su piedra encima (como en los gendarmes, pero bajos)
pie1 = C.piedra('hito_pie1', (0.4, 0.45, 1.0), (-0.3, 0.05, 6.0), (0.04, 0.03, 0.2), M_P, bisel=0.03, cortes=3, uv=1.4); C.soltar(pie1, base, hundir=0.1); hito.append(pie1)
pie2 = C.piedra('hito_pie2', (0.35, 0.4, 0.7), (0.15, 0.1, 6.0), (-0.03, -0.05, -0.1), M_P, bisel=0.03, cortes=3, uv=1.4); C.soltar(pie2, base, hundir=0.1); hito.append(pie2)
for k, (p, tam) in enumerate(((pie1, (0.65, 0.5, 0.3)), (pie2, (0.5, 0.42, 0.25)))):
    o = C.piedra(f'hito_tapa{k}', tam, ((-0.25, 0.15)[k], 0.05, 6.0), (R.uniform(-.1, .1), R.uniform(-.1, .1), R.uniform(0, 3)), M_P, bisel=0.06, cortes=4, uv=1.4); C.soltar(o, [p], hundir=0.03); hito.append(o)
sueltos = []
for k in range(16):
    a = R.uniform(0, math.tau); rr = R.uniform(1.4, 2.0); s = R.uniform(0.2, 0.45)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.45, 0.75)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_08', 0.03), cam=((0.8, -4.6, 1.4), (0.0, 0.0, 0.8), 30), suelo='granito_rojizo', cielo=(0.4, 0.6, 0.95))

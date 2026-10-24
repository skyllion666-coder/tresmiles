#!/usr/bin/env python3
"""Cima del Diente de Llardana (3.085 m, macizo del Posets), a partir de la foto de la cima de la ficha (img/hitos/ld-cima.jpg):
una cresta afilada de lajas de pizarra gris (algo azulada, con manchas pardas) inclinadas todas hacia el mismo lado y partidas en bloques de cantos vivos,
con alguna piedra ocre y cascajo entre ellas; sin hito. Se hace un tramo corto de cresta, más alto en medio. El eje x del modelo va a lo largo de la cresta.
Pocos bloques y pegados: la web mide el suelo en las esquinas de la caja del modelo.
Uso: tools/modelos/hacer_cima.sh diente-llardana"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-diente-llardana.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3085)
M_P = C.mat('pizarra', 'pizarra'); M_G = C.mat('caliza_gris', 'caliza_gris', '512'); M_O = C.mat('granito_ocre', 'rock_08', '512')
color = lambda: (M_G, M_G, M_G, M_P, M_P, M_O)[R.randrange(6)]
hito = []
kw = dict(incl=0.15, bisel=0.03, cortes=3, uv=1.5)
C.nucleo(hito, 'hito_nucleo', 0.5, 0.85, 0.35, M_P)
# la cresta: lajas de canto en fila, inclinadas todas hacia el mismo lado, más altas en medio
for k in range(8):
    x = -1.5 + k * 0.42 + R.uniform(-0.05, 0.05); h = (0.95 - 0.35 * abs(x) / 1.5) * R.uniform(0.85, 1.1)
    hito.append(C.piedra(f'hito_laja{k}', (R.uniform(0.2, 0.3), R.uniform(0.75, 1.0), h), (x, R.uniform(-0.12, 0.12), h * 0.4), (R.uniform(-0.06, 0.06), 0.45 + R.uniform(-0.08, 0.08), R.uniform(-0.15, 0.15)), color(), **kw))
base = hito[:1]   # los bloques de los lados caen sobre el núcleo, no en las puntas de las lajas
# bloques partidos y piedras ocres a los lados de la cresta
for k, (x, y, s) in enumerate(((-0.7, -0.75, 0.4), (0.3, -0.8, 0.36), (0.9, 0.75, 0.38), (-0.2, 0.8, 0.34), (1.3, -0.6, 0.3), (-1.2, 0.6, 0.3))):
    o = C.piedra(f'hito_{k}', (s * 1.3, s, s * 0.6), (x, y, 6.0), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw); C.soltar(o, base, hundir=0.06); hito.append(o)
sueltos = []
for k in range(18):   # cascajo
    a = R.uniform(0, math.tau); rr = R.uniform(1.1, 1.9); s = R.uniform(0.15, 0.35)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.6), s * R.uniform(0.6, 0.9), s * R.uniform(0.3, 0.5)), (rr * math.cos(a), rr * math.sin(a), s * 0.15), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_08', 0.03), cam=((-0.3, -4.6, 1.5), (0.0, 0.0, 0.5), 30), suelo='pizarra', cielo=(0.45, 0.62, 0.92))

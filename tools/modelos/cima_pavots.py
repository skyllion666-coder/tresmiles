#!/usr/bin/env python3
"""Cima del Pico de Pavots o Tucón Royo (3.121 m, macizo del Posets), a partir de la foto de la cima de la ficha (img/hitos/pav-cima.jpg):
un bloque enorme y redondeado de roca gris (~2,6 m de largo, ~1,3 de alto y ~1,5 de fondo), algo inclinado y apoyado sobre piedras más pequeñas,
con «Tucón ROYO» pintado en negro (y la altitud) en la cara de delante; alrededor, pedrera de bloques grises y pardos.
Medidas a ojo con la foto (el bloque ocupa casi todo el ancho; las piedras de debajo miden ~0,4 m).
Uso: tools/modelos/hacer_cima.sh pavots"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-pavots.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3121)
M_G = C.mat('granito_gris', 'granito_gris'); M_P = C.mat('caliza_parda', 'caliza_parda', '512')
color = lambda: M_P if R.random() < 0.35 else M_G
hito = []
kw = dict(incl=0.3, bisel=0.08, cortes=5, uv=1.5)
for k, (x, y) in enumerate(((-0.8, -0.2), (0.0, -0.35), (0.85, -0.15), (-0.6, 0.45), (0.5, 0.5), (0.0, 0.1))):   # las piedras sobre las que descansa
    s = R.uniform(0.38, 0.5)
    hito.append(C.piedra(f'hito_{k}', (s * 1.3, s, s * 0.75), (x, y, s * 0.3), (R.uniform(-.2, .2), R.uniform(-.2, .2), R.uniform(0, 3)), color(), **kw))
# el bloque grande: la cara de delante lleva las letras negras; redondeado (mucho bisel e irregular), algo inclinado hacia la derecha
bloque = C.piedra('placa_tucon', (2.6, 1.5, 1.3), (0.0, 0.05, 6.0), (-0.1, -0.08, 0.04), M_G, bisel=0.45, cortes=9, uv=None)
C.rotular(bloque, 'Tucón|ROYO  3123m', tex='granito_gris', tinte='1.08,1.06,1.03', tinta='12,12,16', salida=os.path.join(os.path.dirname(OUT) or '.', 'rotulos'), grueso=0.3, ocupa=0.9)
C.soltar(bloque, hito, hundir=0.45); hito.append(bloque)
sueltos = []
for k in range(22):
    a = R.uniform(0, math.tau); rr = R.uniform(1.8, 2.8); s = R.uniform(0.25, 0.6)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.45, 0.75)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_boulder_dry', 0.03), cam=((0.2, -4.6, 1.3), (0.0, 0.0, 0.8), 30), suelo='granito_gris')

#!/usr/bin/env python3
"""Cima del Gran Bachimala (3.177 m, pizarras del macizo de Bachimala), a partir de la foto de la cima de la ficha (img/hitos/bac-cima.jpg):
un montón de lajas de pizarra (pardas de óxido y gris azuladas), largas, planas y de cantos vivos, apiladas sin orden y algo inclinadas;
delante, dos lajas largas con letras blancas pintadas: «BACHIMALA» encima y «GRAN 3177m» debajo.
Medidas sacadas de la foto: la laja de «GRAN 3177m» mide ~1,2 m de largo y ~0,3 m de cara (las lajas, de 0,4 a 1,2 m y de 8 a 20 cm de grueso).
El montón (que en la foto se ve de cerca) se hace de ~1,3 m de alto y ~2,2 m de ancho, como los mojones de la cumbre.
Uso: tools/modelos/hacer_cima.sh bachimala"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-bachimala.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3177)
M_P = C.mat('pizarra', 'pizarra'); M_A = C.mat('pizarra_gris', 'caliza_gris', '512')   # alguna laja más gris y lisa
color = lambda: M_A if R.random() < 0.2 else M_P
FRENTE = -math.pi / 2
salta = lambda a, z: abs((a - FRENTE + math.pi) % math.tau - math.pi) < 0.55 and 0.25 < z < 0.95   # hueco delante para las dos lajas escritas
hito = []
# montón: vueltas de lajas planas (cantos vivos: poco bisel), cada vez más cerradas
C.mojon(hito, 'hito_', 1.15, lambda t: 1.05 - 0.55 * t, color, h=(0.1, 0.2), largo=(0.45, 0.9), hondo=(0.3, 0.55), salta=salta, incl=0.22, bisel=0.04, cortes=3, uv=1.3)
C.nucleo(hito, 'hito_nucleo', 1.1, 0.85, 0.35, M_P)
# encima, lajas tumbadas al azar
for k in range(4):   # (repartidas, no una encima de otra)
    a = k * 1.7 + 0.3; s = R.uniform(0.5, 0.75)
    o = C.piedra(f'hito_{len(hito)}', (s, s * 0.6, s * 0.22), (0.3 * math.cos(a), 0.3 * math.sin(a), 6.0), (R.uniform(-.25, .25), R.uniform(-.25, .25), R.uniform(0, 3)), color(), bisel=0.04, cortes=3, uv=1.3)
    C.soltar(o, hito, hundir=0.03); hito.append(o)
# las dos lajas escritas, apoyadas en el hueco de delante e inclinadas hacia atrás (se leen desde -Y)
rot = os.path.join(os.path.dirname(OUT) or '.', 'rotulos')
for nombre, texto, tam, pos, giro in (('placa_gran', 'GRAN   3177m', (1.25, 0.24, 0.32), (0.05, -0.86, 0.36), -0.04),
                                      ('placa_bachimala', 'BACHIMALA', (1.0, 0.22, 0.26), (0.12, -0.7, 0.74), 0.05)):
    hito.append(C.placa(nombre, texto, tam, pos, (-0.6, 0.04, giro), tex='pizarra', tinte='1.05,1.02,1.0', tinta='238,238,232', salida=rot, bisel=0.05, irregular=0.05, grueso=0.15, liso=False))
sueltos = []
for k in range(16):
    a = R.uniform(0, math.tau); rr = R.uniform(1.3, 2.2); s = R.uniform(0.35, 0.8)
    sueltos.append(C.piedra(f'bloque{k}', (s, s * R.uniform(0.45, 0.7), s * R.uniform(0.12, 0.25)), (rr * math.cos(a), rr * math.sin(a), 0.05), (R.uniform(-.2, .2), R.uniform(-.2, .2), R.uniform(0, 3)), color(), bisel=0.04, cortes=3, uv=1.3))
C.cerrar(OUT, PREV, relieve=('seaside_rock', 0.015), cam=((0.2, -3.6, 2.0), (0.0, -0.2, 0.6), 30), suelo='pizarra')

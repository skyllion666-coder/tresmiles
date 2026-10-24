#!/usr/bin/env python3
"""Cima del Cilindro de Marboré (3.325 m, caliza del macizo de Monte Perdido), a partir de la foto de la cima de la ficha (img/hitos/cil-cima.jpg):
un montón bajo y ancho (~0,9 m de alto, ~2 m de ancho) de bloques angulosos de caliza anaranjada, alguno gris, y arriba, algo inclinada hacia delante,
una piedra más grande (~0,5 m de cara) con «MARBORÉ» y la altitud escritos a mano con trazo fino y oscuro.
Uso: tools/modelos/hacer_cima.sh cilindro"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-cilindro.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3325)
M_N = C.mat('caliza_naranja', 'caliza_naranja'); M_G = C.mat('caliza_gris', 'caliza_gris', '512')
color = lambda: M_G if R.random() < 0.08 else M_N
hito = []
kw = dict(incl=0.3, bisel=0.05, cortes=5, uv=1.3)
C.hilera(hito, 'hito_', 0.0, 0.32, 1.0, (0.3, 0.55), (0.3, 0.5), color, **kw)
C.hilera(hito, 'hito_', 0.24, 0.3, 0.75, (0.3, 0.5), (0.3, 0.45), color, **kw)
C.hilera(hito, 'hito_', 0.46, 0.28, 0.5, (0.28, 0.45), (0.28, 0.4), color, **kw)
C.nucleo(hito, 'hito_nucleo', 0.72, 0.85, 0.3, M_N)
p = C.placa('placa_marbore', 'MARBORÉ|3325 m', (0.62, 0.3, 0.46), (0.05, -0.18, 0.95), (-0.55, 0.1, 0.12), tex='caliza_naranja', tinte='1.08,1.05,1.0', tinta='60,35,25',
            salida=os.path.join(os.path.dirname(OUT) or '.', 'rotulos'), bisel=0.12, irregular=0.12, grueso=0.0, liso=False)
C.soltar(p, hito, hundir=0.05); hito.append(p)
sueltos = []
for k in range(18):
    a = R.uniform(0, math.tau); rr = R.uniform(1.15, 2.2); s = R.uniform(0.2, 0.5)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.5, 0.8)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), bisel=0.05, cortes=5, uv=1.3))
C.cerrar(OUT, PREV, relieve=('rock_surface', 0.03), cam=((0.6, -3.4, 1.5), (0.0, 0.0, 0.55), 30), suelo='caliza_naranja')

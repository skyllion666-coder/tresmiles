#!/usr/bin/env python3
"""Cima de La Munia (3.133 m, caliza del circo de Barrosa), a partir de la foto de la cima de la ficha (img/hitos/mun-cima.jpg):
una tabla vieja y gastada (~0,75 m × 0,4 m, gris parduzco, con vetas) con «LA MUNIA» pintado en verde oscuro, tumbada e inclinada hacia arriba
sobre un bloque grande de caliza gris con vetas blancas (~1,1 m) y apoyada detrás en otro; a la izquierda, un bloque alto de la misma caliza.
Alrededor, la pedrera de la cresta: bloques angulosos grises, alguno anaranjado.
Uso: tools/modelos/hacer_cima.sh munia"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-munia.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3133)
M_V = C.mat('caliza_vetas', 'caliza_vetas'); M_G = C.mat('caliza_gris', 'caliza_gris', '512'); M_N = C.mat('caliza_naranja', 'caliza_naranja', '512')
color = lambda: M_N if R.random() < 0.05 else M_G
hito = []
kw = dict(incl=0.3, bisel=0.06, cortes=5, uv=1.5)
C.hilera(hito, 'hito_', 0.0, 0.3, 0.85, (0.35, 0.55), (0.3, 0.45), color, **kw)
C.nucleo(hito, 'hito_nucleo', 0.35, 0.8, 0.5, M_G)
base = list(hito)
# el bloque grande con vetas blancas (sobre el que está la tabla), el alto de la izquierda y el de detrás, en el que se apoya la tabla
grande = C.piedra('hito_grande', (1.1, 0.8, 0.55), (0.1, -0.05, 6.0), (0.05, -0.08, 0.15), M_V, bisel=0.1, cortes=6, uv=1.2); C.soltar(grande, base, hundir=0.15); hito.append(grande)
izq = C.piedra('hito_izq', (0.45, 0.5, 0.8), (-0.62, -0.15, 6.0), (0.0, 0.12, 0.3), M_V, bisel=0.08, cortes=5, uv=1.2); C.soltar(izq, base, hundir=0.2); hito.append(izq)
atras = C.piedra('hito_atras', (0.6, 0.4, 0.45), (0.0, 0.42, 6.0), (0.1, 0.0, -0.2), M_V, bisel=0.08, cortes=5, uv=1.2); C.soltar(atras, base + [grande], hundir=0.1); hito.append(atras)
# la tabla: tumbada hacia atrás (la cara de las letras mira arriba y adelante), un poco girada
tabla = C.placa('placa_munia', 'LA MUNIA', (0.78, 0.045, 0.4), (0.12, 0.0, 6.0), (-0.95, 0.06, 0.1), tex='caliza_parda', tinte='0.95,0.93,0.9', tinta='38,58,52',
                salida=os.path.join(os.path.dirname(OUT) or '.', 'rotulos'), bisel=0.3, irregular=0.04, grueso=0.15, liso=False)
C.soltar(tabla, hito, hundir=0.02); hito.append(tabla)
sueltos = []
for k in range(18):   # la pedrera de la cresta (cerca: la cresta cae mucho y las de fuera se esconden)
    a = R.uniform(0, math.tau); rr = R.uniform(1.05, 1.7); s = R.uniform(0.2, 0.5)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.45, 0.75)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_surface', 0.03), cam=((0.3, -3.0, 2.2), (0.05, 0.0, 0.7), 30), suelo='caliza_gris')

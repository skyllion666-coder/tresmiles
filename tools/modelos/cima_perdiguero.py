#!/usr/bin/env python3
"""Cima del Perdiguero (3.221 m, frontera con Francia, valle de Literola), a partir de la foto de la cima de la ficha (img/hitos/prd-cima-aurora.jpg):
un poste de madera oscura (~1,7 m, algo inclinado) clavado en un montón de bloques angulosos gris claro, con un cartel horizontal arriba
(«Pic Perdiguère 3222», letras blancas sobre madera oscura). Alrededor, pedrera de bloques grises.
Medidas sacadas de la foto: el cartel ocupa ~65 px de ancho y el poste ~110 px de alto (cartel de ~0,6 m → poste de ~1,7 m sobre el montón).
Uso: tools/modelos/hacer_cima.sh perdiguero"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
from mathutils import Matrix
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-perdiguero.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3221)
M_G = C.mat('granito_gris', 'granito_gris'); M_C = C.mat('caliza_gris', 'caliza_gris', '512')
M_MADERA = C.mat_liso('madera', (0.07, 0.045, 0.03), 0.85)
color = lambda: M_C if R.random() < 0.3 else M_G
hito = []
kw = dict(incl=0.3, bisel=0.06, cortes=5, uv=1.5)
C.hilera(hito, 'hito_', 0.0, 0.3, 0.75, (0.3, 0.5), (0.3, 0.45), color, **kw)
C.hilera(hito, 'hito_', 0.24, 0.26, 0.48, (0.25, 0.42), (0.25, 0.38), color, **kw)
C.nucleo(hito, 'hito_nucleo', 0.5, 0.6, 0.25, M_G)
# el poste: madera oscura, de sección cuadrada, un poco inclinado hacia la derecha
INCL = Matrix.Rotation(0.08, 4, 'Y')
poste = C.piedra('hito_poste', (0.1, 0.09, 1.9), (0.0, 0.0, 0.95), (0.0, 0.08, 0.0), M_MADERA, bisel=0.15, cortes=0, uv=None)
# el cartel, arriba, por delante del poste
cartel = C.placa('placa_cartel', 'Pic Perdiguère 3222', (0.62, 0.035, 0.12), (0.13, -0.065, 1.72), (0.0, 0.08, 0.0), tex='rock_08', tinte='0.3,0.24,0.19', tinta='235,232,225',
                 salida=os.path.join(os.path.dirname(OUT) or '.', 'rotulos'), bisel=0.2, irregular=False, grueso=0.2, liso=False)
base = list(hito)
for k in range(4):   # piedras que calzan el poste, apoyadas en el montón (no unas encima de otras)
    a = k * 1.57 + 0.4; s = R.uniform(0.16, 0.24)
    o = C.piedra(f'hito_{len(hito)}', (s * 1.3, s, s * 0.6), (0.17 * math.cos(a), 0.17 * math.sin(a), 6.0), a + 1.57, color(), **kw); C.soltar(o, base, hundir=0.05); hito.append(o)
sueltos = []
for k in range(22):   # la pedrera de alrededor
    a = R.uniform(0, math.tau); rr = R.uniform(1.0, 2.4); s = R.uniform(0.25, 0.6)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.45, 0.75)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_boulder_dry', 0.03), cam=((0.9, -3.6, 1.6), (0.0, 0.0, 0.95), 30), suelo='granito_gris')

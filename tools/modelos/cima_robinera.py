#!/usr/bin/env python3
"""Cima de la Robiñera (3.003 m, caliza del macizo de Monte Perdido), a partir de la foto de la cima de la ficha (img/hitos/rob-cima.jpg):
un montón cónico de ~1,3 m de bloques angulosos de caliza gris con vetas blancas de calcita (y algo de liquen), y encima, tumbada y algo inclinada
hacia delante, una piedra grande y plana (~1,1 × 0,45 m de cara) con «ROBIÑERA / 3003 m» escrito a rotulador negro.
Medidas sacadas de la foto: la piedra escrita ocupa ~330 px de ancho y el montón ~520 px (1,1 m → ~1,7 m de ancho).
Uso: tools/modelos/hacer_cima.sh robinera"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-robinera.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3003)
M_V = C.mat('caliza_vetas', 'caliza_vetas'); M_G = C.mat('caliza_gris', 'caliza_gris', '512')
color = lambda: M_G if R.random() < 0.25 else M_V
hito = []
# montón cónico: tres vueltas de bloques angulosos, cada vez más cerradas, y bloques en medio
C.hilera(hito, 'hito_', 0.0, 0.42, 0.85, (0.4, 0.65), (0.4, 0.6), color, incl=0.25, bisel=0.06, cortes=5, uv=1.4)
C.hilera(hito, 'hito_', 0.34, 0.38, 0.62, (0.35, 0.55), (0.35, 0.5), color, incl=0.25, bisel=0.06, cortes=5, uv=1.4)
C.hilera(hito, 'hito_', 0.66, 0.34, 0.4, (0.3, 0.5), (0.3, 0.45), color, incl=0.25, bisel=0.06, cortes=5, uv=1.4)
C.nucleo(hito, 'hito_nucleo', 0.95, 0.75, 0.38, M_G)   # la piedra escrita se apoya en el montón y en este relleno
# la piedra escrita, encima: plana, algo inclinada hacia delante (se lee desde -Y)
placa = C.placa('placa_robinera', 'ROBIÑERA|3003 m', (1.15, 0.55, 0.55), (0.0, -0.08, 0), (-0.3, 0.06, 0.08), tex='caliza_vetas', tinte='1.18,1.18,1.17',
                salida=os.path.join(os.path.dirname(OUT) or '.', 'rotulos'), bisel=0.15, irregular=0.07, grueso=0.2)
C.soltar(placa, hito, hundir=0.06)
sueltos = []
for k in range(14):
    a = R.uniform(0, math.tau); rr = R.uniform(1.2, 2.2); s = R.uniform(0.25, 0.55)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.4, 0.8)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), R.uniform(0, 3), color(), bisel=0.06, cortes=5, uv=1.4))
C.cerrar(OUT, PREV, relieve=('rock_surface', 0.03), cam=((0.3, -4.2, 1.5), (0.0, 0.0, 0.9), 32), cielo=(0.6, 0.7, 0.88), suelo='caliza_gris')

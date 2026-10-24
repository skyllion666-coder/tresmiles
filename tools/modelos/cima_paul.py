#!/usr/bin/env python3
"""Cima de La Paúl (3.078 m, cresta de Bardamina), con dos fotos de referencia que pasó el usuario (apatita.com; no se publican):
la cima vista de lejos, una cresta afilada toda de lajas de roca inclinadas y partidas (gris parduzco, con caras ocres de rotura fresca), y uno de los
pasos de la cresta: una losa grande e inclinada de granito gris con liquen que sube hacia la derecha, en medio bloques partidos apilados y, al final,
una torre de bloques casi cuadrados, pardo grisácea (~2 m sobre la losa). La cima se hace con ese paso sobre la cresta de lajas.
Pocos bloques y pegados: la web mide el suelo en las esquinas de la caja del modelo. El eje x del modelo va a lo largo de la cresta.
Uso: tools/modelos/hacer_cima.sh paul"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-paul.glb'; PREV = args[1] if len(args) > 1 else None
R = C.inicio(3078)
M_L = C.mat('granito_liquen', 'granito_liquen'); M_P = C.mat('granito_rojizo', 'granito_rojizo'); M_G = C.mat('granito_gris', 'granito_gris', '512'); M_O = C.mat('granito_ocre', 'rock_08', '512')
color = lambda: (M_O, M_G, M_G, M_G, M_P, M_P)[R.randrange(6)]
hito = []
kw = dict(incl=0.1, bisel=0.03, cortes=3, uv=1.4)
C.nucleo(hito, 'hito_nucleo', 0.45, 1.0, 0.6, M_G)
# la cresta: lajas de canto en fila, como libros caídos hacia un lado (todas inclinadas igual), a los dos lados del paso
for k, x in enumerate((-1.95, -1.72, -1.5, 1.75, 1.98)):
    h = R.uniform(0.5, 0.8)
    hito.append(C.piedra(f'hito_laja{k}', (R.uniform(0.18, 0.26), R.uniform(0.8, 1.1), h), (x, R.uniform(-0.1, 0.1), h * 0.4), (R.uniform(-0.08, 0.08), 0.5 + R.uniform(-0.1, 0.1), R.uniform(-0.12, 0.12)), color(), **kw))
base = list(hito)
# el paso: la losa grande que sube hacia la torre, con una cuña debajo
cuna = C.piedra('hito_cuna', (1.75, 0.95, 0.5), (-0.3, 0.0, 0.15), (0.0, -0.45, 0.05), M_G, bisel=0.05, cortes=3, uv=1.4); hito.append(cuna)
losa = C.piedra('hito_losa', (2.3, 1.25, 0.32), (-0.32, -0.05, 0.58), (0.04, -0.45, 0.05), M_L, bisel=0.04, cortes=4, uv=2.2); hito.append(losa)   # a mano: la punta baja en el suelo, la alta contra la torre
# la torre: un bloque de abajo y uno alto casi cuadrado encima, al final de la losa
tb = C.piedra('hito_torre0', (0.8, 0.8, 0.95), (1.15, 0.05, 0.45), (0.0, 0.02, 0.1), M_P, bisel=0.04, cortes=3, uv=1.6); hito.append(tb)
tt = C.piedra('hito_torre1', (0.75, 0.7, 0.9), (1.17, 0.08, 6.0), (0.02, -0.04, 0.05), M_P, bisel=0.06, cortes=4, uv=1.6); C.soltar(tt, [tb], hundir=0.03); hito.append(tt)
# en medio, bloques partidos entre la punta de la losa y la torre (cada uno en su sitio; el último, encima de otro)
apil = []
for k, (x, y, s) in enumerate(((0.55, -0.4, 0.36), (0.55, 0.38, 0.34), (0.68, -0.05, 0.3), (0.55, 0.3, 0.26))):
    o = C.piedra(f'hito_apil{k}', (s * 1.2, s, s * 0.85), (x, y, 6.0), (R.uniform(-.15, .15), R.uniform(-.15, .15), R.uniform(0, 3)), M_G if k % 2 else M_P, **kw)
    C.soltar(o, base + [losa, cuna] + (apil if k == 3 else []), hundir=0.05); apil.append(o)
hito += apil
sueltos = []
for k in range(14):
    a = R.uniform(0, math.tau); rr = R.uniform(1.3, 1.9); s = R.uniform(0.18, 0.4)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.5, 0.8), s * R.uniform(0.25, 0.5)), (rr * math.cos(a), rr * math.sin(a), s * 0.2), (R.uniform(-.4, .4), R.uniform(-.4, .4), R.uniform(0, 3)), color(), **kw))
C.cerrar(OUT, PREV, relieve=('rock_boulder_dry', 0.03), cam=((-1.0, -6.2, 1.8), (0.1, 0.0, 1.0), 30), suelo='granito_gris', cielo=(0.45, 0.62, 0.92))

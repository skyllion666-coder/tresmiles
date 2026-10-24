#!/usr/bin/env python3
"""Cima de la Gran Facha (3.005 m, granito de Panticosa), a partir de la foto de la cima de la ficha (img/hitos/gf-cima.jpg):
un pilar viejo de hormigón gris claro con la parte de arriba en arco (~0,6 m de ancho, ~0,9 de alto, ~0,35 de grueso) con «GRAN / FACHA / 3.006»
pintado en amarillo, y unas cintas de colores atadas arriba; está sobre una plataforma de bloques de granito pardo y gris unidos con cemento
(~0,6 m de alto, ~1,7 m de ancho, arriba plana con lajas), con un buzón metálico negro empotrado en la cara de delante.
Medidas sacadas de la foto: el pilar mide ~190 px de ancho y la plataforma ~550 px (0,6 m → ~1,7 m).
Uso: tools/modelos/hacer_cima.sh gran-facha"""
import sys, os, math, subprocess
import bpy, bmesh
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cima_comun as C, rocas
from mathutils import Matrix
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-gran-facha.glb'; PREV = args[1] if len(args) > 1 else None
ROT = os.path.join(os.path.dirname(OUT) or '.', 'rotulos'); os.makedirs(ROT, exist_ok=True)
R = C.inicio(3005)
M_G = C.mat('granito_gris', 'granito_gris'); M_P = C.mat('granito_ocre', 'rock_08', '512'); M_CEM = C.mat('cemento', 'caliza_clara', '512')
color = lambda: M_P if R.random() < 0.35 else M_G
hito = []
# plataforma: tres vueltas de bloques bastante planos, casi a plomo, con cemento en medio (núcleo) y lajas arriba
kw = dict(incl=0.06, bisel=0.06, cortes=3, uv=1.4)
for z, h in ((0.0, 0.22), (0.2, 0.2), (0.38, 0.2)):
    C.hilera(hito, 'hito_', z, h, 0.85, (0.3, 0.5), (0.25, 0.4), color, salta=lambda a, zz: abs(a + math.pi / 2) < 0.22 and 0.2 < zz < 0.42, **kw)
C.nucleo(hito, 'hito_cemento', 0.56, 0.82, 0.78, M_CEM)
for k, (x, y, rz) in enumerate(((-0.4, -0.35, 0.1), (0.35, -0.4, -0.15), (0.4, 0.35, 0.2), (-0.38, 0.4, -0.05), (0.0, -0.55, 0.0))):   # lajas de arriba
    o = C.piedra(f'hito_{len(hito)}', (0.55, 0.42, 0.09), (x, y, 0.62), rz, color(), bisel=0.08, cortes=2, uv=1.4); hito.append(o)
# buzón metálico empotrado delante
M_NEGRO = C.mat_liso('buzon', (0.02, 0.02, 0.022), 0.5, 0.5); M_INT = C.mat_liso('buzon_dentro', (0.35, 0.35, 0.33), 0.7)
C.piedra('hito_buzon', (0.34, 0.12, 0.12), (0.0, -0.83, 0.32), 0.0, M_NEGRO, bisel=0.08, cortes=0, uv=None)
C.piedra('hito_buzon_dentro', (0.28, 0.02, 0.07), (0.0, -0.895, 0.32), 0.0, M_INT, bisel=0.0, cortes=0, uv=None)
# el pilar con el arco arriba: perfil de frente (x, z) y grosor en y; la cara de delante lleva la imagen con las letras amarillas
img = os.path.join(ROT, 'pilar_gran_facha.jpg')
subprocess.run(['python3', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rotulo_piedra.py'), f'{rocas.TEX}/web/caliza_clara_diff_1k.jpg', img, 'GRAN|FACHA|3.006', '700', '1000', '1.05,1.03,0.98', '0.3', '200,165,40'], check=True, capture_output=True)
A, H, G = 0.6, 0.9, 0.35
perfil = [(-A / 2, 0.0), (A / 2, 0.0), (A / 2, H - A / 2)] + [(A / 2 * math.cos(t), H - A / 2 + A / 2 * math.sin(t)) for t in [math.pi * k / 10 for k in range(1, 10)]] + [(-A / 2, H - A / 2)]
bm = bmesh.new(); fr = [bm.verts.new((x, -G / 2, z)) for x, z in perfil]; tr = [bm.verts.new((x, G / 2, z)) for x, z in perfil]
bm.faces.new(fr[::-1]); bm.faces.new(tr)
for i in range(len(perfil)): j = (i + 1) % len(perfil); bm.faces.new((fr[i], fr[j], tr[j], tr[i]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
uv = bm.loops.layers.uv.new('UVMap')
for f in bm.faces:
    for l in f.loops:
        x, y, z = l.vert.co
        l[uv].uv = (0.5 + x / A, z / H) if f.normal.y < -0.5 else (0.03 + 0.1 * (0.5 + (x if abs(f.normal.x) < 0.5 else y) / A), 0.03 + 0.08 * z / H)
bmesh.ops.transform(bm, matrix=Matrix.Translation((0.05, 0.12, 0.66)) @ Matrix.Rotation(0.05, 4, 'Z'), verts=bm.verts)
me = bpy.data.meshes.new('placa_pilar'); bm.to_mesh(me); bm.free()
m = bpy.data.materials.new('pilar'); m.use_nodes = True; nt = m.node_tree; b = next(x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.9
t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(img); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
o = bpy.data.objects.new('placa_pilar', me); bpy.context.collection.objects.link(o); o.data.materials.append(m)
# cintas de colores atadas arriba (rosa y turquesa)
for k, (col, dx) in enumerate((((0.8, 0.25, 0.5), -0.05), ((0.2, 0.7, 0.7), 0.06))):
    C.piedra(f'hito_cinta{k}', (0.015, 0.36, 0.015), (0.05 + dx, 0.12, 1.57 - abs(dx)), (0.0, 0.0, 0.1 * k), C.mat_liso(f'cinta{k}', col, 0.6), bisel=0.0, cortes=0, uv=None)
sueltos = []
for k in range(16):
    a = R.uniform(0, math.tau); rr = R.uniform(1.2, 2.3); s = R.uniform(0.3, 0.7)
    sueltos.append(C.piedra(f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.45, 0.8)), (rr * math.cos(a), rr * math.sin(a), s * 0.25), (R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(0, 3)), color(), bisel=0.08, cortes=5, uv=1.5))
C.cerrar(OUT, PREV, relieve=('rock_08', 0.03), cam=((0.3, -3.4, 1.3), (0.0, 0.0, 0.75), 32), suelo='granito_gris')

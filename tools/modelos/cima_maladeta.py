#!/usr/bin/env python3
"""Cima del Pico de la Maladeta, a partir de la fotografía de la cumbre aportada por el usuario (22-10-2026): una cresta de bloques de granito gris angulosos, una laja larga
e inclinada delante, una torre de bloques detrás a la derecha con una muesca donde queda encajado un canto redondeado, nieve en grumos pegada a la derecha y, a la izquierda, un poste
fino de metal con una cajita (buzón de cumbre) ladeada. Medidas a ojo con la foto (poste de ~0,9 m, torre de ~1,5 m).
Unidades: metros. Z arriba; origen en el centro de la cresta, a ras de suelo. Frente = -Y. Uso: blender -b --python tools/modelos/cima_maladeta.py -- models/cima-maladeta.glb [vista.png]"""
import bpy, bmesh, math, sys, random
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-maladeta.glb'; PREV = args[1] if len(args) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
R = random.Random(3312)
def mat(nombre, col, rough=0.95, metal=0.0):
    m = bpy.data.materials.new(nombre); m.use_nodes = True; m.diffuse_color = (*col, 1)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
M_G = [mat('granito_a', (0.34, 0.33, 0.32)), mat('granito_b', (0.27, 0.27, 0.27)), mat('granito_c', (0.42, 0.40, 0.37)), mat('granito_d', (0.30, 0.28, 0.26))]
M_NIEVE = mat('nieve', (0.93, 0.95, 1.0), 0.7); M_METAL = mat('poste', (0.55, 0.57, 0.6), 0.5, 0.6); M_CAJA = mat('buzon', (0.16, 0.17, 0.18), 0.6, 0.3); M_BLANCO = mat('cartel', (0.9, 0.9, 0.88), 0.6)
def nuevo(nombre, bm, m, parent):
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nombre, me); bpy.context.collection.objects.link(o); o.data.materials.append(m); o.parent = parent; return o
V = bpy.data.objects.new('Vertice', None); bpy.context.collection.objects.link(V)
def xf(pos, rot): return Matrix.Translation(pos) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')
def bloque(nombre, sx, sy, sz, pos, rot, m, bisel=0.1, jit=0.12):   # bloque anguloso: cubo biselado con los vértices desplazados
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(sx, sy, sz) * bisel, segments=1, affect='EDGES')
    for v in bm.verts: v.co += Vector((R.uniform(-jit, jit) * sx, R.uniform(-jit, jit) * sy, R.uniform(-jit, jit) * sz))
    bmesh.ops.transform(bm, matrix=xf(pos, rot), verts=bm.verts); return nuevo(nombre, bm, m, V)
def canto(nombre, r, pos, m, aplastado=0.85):   # canto redondeado
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r)
    for v in bm.verts: v.co *= 1 + R.uniform(-0.05, 0.05); v.co.z *= aplastado
    bmesh.ops.transform(bm, matrix=Matrix.Translation(pos), verts=bm.verts); return nuevo(nombre, bm, m, V)
# laja larga e inclinada delante (sube hacia la izquierda), con un segundo bloque debajo
bloque('laja_larga', 2.3, 0.85, 0.42, (-0.1, -0.55, 0.3), (0.0, -0.16, 0.12), M_G[0], 0.07)
bloque('laja_apoyo', 1.3, 0.7, 0.5, (0.5, -0.45, 0.2), (0.08, 0.1, -0.2), M_G[1], 0.1)
# torre de bloques detrás a la derecha, con una muesca en medio
bloque('torre_base', 1.5, 1.1, 0.9, (0.55, 0.55, 0.45), (0.0, 0.05, 0.2), M_G[1], 0.08)
bloque('torre_izq', 0.7, 0.7, 1.4, (-0.05, 0.5, 0.9), (0.06, -0.12, 0.5), M_G[0], 0.07)
bloque('torre_der', 0.85, 0.8, 1.7, (0.95, 0.55, 1.05), (-0.04, 0.1, -0.3), M_G[2], 0.07)
bloque('torre_cima', 0.6, 0.5, 0.5, (1.0, 0.5, 2.0), (0.2, 0.3, 0.6), M_G[0], 0.1)
canto('canto_encajado', 0.24, (0.4, 0.2, 1.1), M_G[2])   # el canto redondeado entre las dos torres
# bloques sueltos de la cresta, alrededor
for k in range(46):
    a = R.uniform(0, math.tau); r = R.uniform(1.0, 2.1); x, y = r * math.cos(a) * 1.3, r * math.sin(a) * 0.9
    if abs(x - 0.0) < 1.1 and -1.2 < y < 0.1: continue   # no tapan la laja
    s = R.uniform(0.18, 0.48) * (0.7 if y < 0 else 1.0)
    bloque(f'bloque{k}', s * R.uniform(.9, 1.7), s * R.uniform(.8, 1.4), s * R.uniform(.5, 1.0), (x, y, s * 0.3 + max(0, 0.35 * (1 - r / 2.5)) * (1 if y > 0 else 0.3)), (R.uniform(-.4, .4), R.uniform(-.4, .4), R.uniform(0, 3)), R.choice(M_G))
# nieve pegada a la derecha: grumos blancos aplastados que tapan la base de la torre y la laja
for k, (x, y, s) in enumerate(((1.45, -0.2, 0.55), (1.1, -0.65, 0.4), (1.9, 0.2, 0.5), (1.55, 0.6, 0.45), (0.75, -0.95, 0.28), (2.2, -0.35, 0.4))):
    canto(f'nieve{k}', s, (x, y, s * 0.35), M_NIEVE, 0.45)
# poste fino con cajita (buzón de cumbre), a la izquierda y delante
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.016, radius2=0.016, depth=0.95); bmesh.ops.transform(bm, matrix=Matrix.Translation((-1.15, -0.75, 0.62)), verts=bm.verts); nuevo('poste', bm, M_METAL, V)
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.1, 0.13, 0.15), verts=bm.verts)
for v in bm.verts:
    if v.co.z > 0: v.co.y -= 0.02 * (1 if v.co.y < 0 else -1) * 0.5
bmesh.ops.transform(bm, matrix=xf((-1.15, -0.75, 1.14), (0.0, 0.0, 0.4)), verts=bm.verts); nuevo('buzon', bm, M_CAJA, V)
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.075, 0.004, 0.06), verts=bm.verts); bmesh.ops.transform(bm, matrix=xf((-1.17, -0.82, 1.14), (0.0, 0.0, 0.4)), verts=bm.verts); nuevo('buzon_cartel', bm, M_BLANCO, V)
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True)
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
print('OK', OUT, 'caras', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
if PREV:
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x, sc.render.resolution_y = 700, 700; sc.display.shading.color_type = 'MATERIAL'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
    cam.location = (1.5, -6.0, 2.2); d = Vector((0.3, 0, 0.9)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = PREV; bpy.ops.render.render(write_still=True)

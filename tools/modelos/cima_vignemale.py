#!/usr/bin/env python3
"""Cima del Gran Vignemale (Pique Longue), a partir de la fotografía de la cima aportada por el usuario (22-10-2026): bloque de hormigón gris rosado (~0,8 × 0,55 × 0,35 m) con
«GRAND VIGNEMALE (3298 m)» escrito a mano en la cara delantera, losa superior algo saliente, placa verde redonda de vértice, dos piedras pintadas de azul, una pegatina,
y encima un montón de lajas pardo-rojizas (una grande en pie, otra plana a la derecha) dentro de un majano de bloques angulosos. Medidas a ojo con la foto (las piedras de la losa miden ~15 cm).
Unidades: metros. Z arriba; origen en el centro del bloque, a ras de suelo. Frente = -Y.
Uso: blender -b --python tools/modelos/cima_vignemale.py -- models/cima-vignemale.glb [vista.png]"""
import bpy, bmesh, math, sys, random
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-vignemale.glb'; PREV = args[1] if len(args) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
R = random.Random(3298)
def mat(nombre, col, rough=0.95, metal=0.0):
    m = bpy.data.materials.new(nombre); m.use_nodes = True; m.diffuse_color = (*col, 1)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
M_ROCAS = [mat('roca_a', (0.26, 0.12, 0.06)), mat('roca_b', (0.36, 0.18, 0.08)), mat('roca_c', (0.20, 0.10, 0.06)), mat('roca_d', (0.42, 0.28, 0.18)), mat('roca_e', (0.32, 0.23, 0.17))]
M_LAJA = mat('laja', (0.36, 0.16, 0.08)); M_LAJA2 = mat('laja2', (0.50, 0.30, 0.17))
M_HORM = mat('hormigon', (0.74, 0.68, 0.64)); M_TEXTO = mat('texto', (0.05, 0.05, 0.06), 0.8)
M_PLACA = mat('placa', (0.10, 0.45, 0.22), 0.5, 0.2); M_PLACA_B = mat('placa_borde', (0.88, 0.88, 0.84), 0.5, 0.2); M_PLACA_D = mat('placa_dibujo', (0.78, 0.82, 0.76), 0.5)
M_AZUL = mat('piedra_azul', (0.05, 0.32, 0.72), 0.5); M_NARANJA = mat('pegatina', (0.9, 0.55, 0.1), 0.5)
def nuevo(nombre, bm, m, parent):
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nombre, me); bpy.context.collection.objects.link(o); o.data.materials.append(m); o.parent = parent; return o
V = bpy.data.objects.new('Vertice', None); bpy.context.collection.objects.link(V)
def bloque(nombre, sx, sy, sz, pos, rot, m, bisel=0.12, jit=0.08):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(sx, sy, sz) * bisel, segments=1, affect='EDGES')
    for v in bm.verts: v.co += Vector((R.uniform(-jit, jit) * sx, R.uniform(-jit, jit) * sy, R.uniform(-jit, jit) * sz))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(pos) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X'), verts=bm.verts)
    return nuevo(nombre, bm, m, V)
# bloque de hormigón y losa superior algo saliente
bloque('bloque_hormigon', 0.78, 0.52, 0.36, (0, 0, 0.18), (0, 0, 0.02), M_HORM, 0.03, 0.0)
bloque('losa_superior', 0.82, 0.56, 0.1, (0, 0, 0.41), (0, 0, 0.02), M_HORM, 0.05, 0.0)
ZT = 0.46   # cara superior
# texto a mano en la cara delantera (y = -0.26)
def rotulo(nombre, txt, x, z, sz, giro):
    cu = bpy.data.curves.new(nombre, 'FONT'); cu.body = txt; cu.size = sz; cu.align_x = 'CENTER'; cu.extrude = 0.002
    o = bpy.data.objects.new(nombre, cu); bpy.context.collection.objects.link(o)
    o.rotation_euler = (math.pi / 2, 0, 0); o.location = (x, -0.275, z); o.rotation_euler[1] = giro
    bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False)
    o.data.materials.clear(); o.data.materials.append(M_TEXTO); o.parent = V
rotulo('texto_grand', 'GRAND', -0.1, 0.25, 0.085, 0.02); rotulo('texto_vignemale', 'VIGNEMALE', 0.04, 0.16, 0.085, 0.0); rotulo('texto_alt', '(3298 m)', -0.1, 0.05, 0.07, 0.0)
# placa verde redonda de vértice, a la derecha, con borde claro y dibujo
def disco(nombre, r, h, pos, m):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=r, radius2=r, depth=h); bmesh.ops.transform(bm, matrix=Matrix.Translation(pos), verts=bm.verts); return nuevo(nombre, bm, m, V)
disco('placa_borde', 0.135, 0.012, (0.2, -0.09, ZT + 0.006), M_PLACA_B); disco('placa_verde', 0.118, 0.016, (0.2, -0.09, ZT + 0.008), M_PLACA)
for k in range(3):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.17, 0.018, 0.004), verts=bm.verts); bmesh.ops.transform(bm, matrix=Matrix.Translation((0.2, -0.09 + (k - 1) * 0.04, ZT + 0.018)), verts=bm.verts); nuevo(f'placa_dibujo{k}', bm, M_PLACA_D, V)
# dos piedras pintadas de azul y una pegatina
for k, (x, y, sx, sy, r) in enumerate(((-0.1, -0.16, 0.12, 0.07, 0.2), (0.0, -0.14, 0.1, 0.06, -0.3))):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1); bmesh.ops.scale(bm, vec=(sx / 2, sy / 2, 0.022), verts=bm.verts)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((x, y, ZT + 0.015)) @ Matrix.Rotation(r, 4, 'Z'), verts=bm.verts); nuevo(f'piedra_azul{k}', bm, M_AZUL, V)
disco('pegatina', 0.035, 0.004, (-0.02, -0.22, ZT + 0.002), M_NARANJA)
# lajas y bloques sobre la losa: uno grande a la izquierda, una laja alta detrás y otra plana inclinada a la derecha
bloque('laja_grande', 0.3, 0.24, 0.3, (-0.17, 0.06, ZT + 0.15), (0.1, 0.12, 0.5), M_LAJA2, 0.08)
bloque('laja_alta', 0.3, 0.08, 0.42, (-0.04, 0.2, ZT + 0.3), (0.12, -0.18, 0.25), M_ROCAS[4], 0.04)
bloque('laja_plana', 0.62, 0.28, 0.07, (0.3, 0.1, ZT + 0.24), (0.1, 0.14, -0.3), M_LAJA, 0.04)
bloque('apoyo_laja', 0.16, 0.14, 0.2, (0.22, 0.12, ZT + 0.1), (0.2, 0.1, 0.4), M_ROCAS[2], 0.1)
for k, (x, y) in enumerate(((-0.28, -0.1), (-0.22, -0.2), (-0.35, 0.0), (0.05, 0.02), (-0.02, -0.04))):   # piedras pequeñas sueltas
    s = R.uniform(0.05, 0.09); bloque(f'piedrita{k}', s * 1.3, s, s * 0.7, (x, y, ZT + s * 0.3), (R.uniform(-.4, .4), R.uniform(-.4, .4), R.uniform(0, 3)), R.choice(M_ROCAS))
# majano de bloques alrededor del bloque: más alto y apretado a los lados y detrás, bajo delante
n = 0
for k in range(560):
    a = R.uniform(0, math.tau); r = 0.4 + 1.2 * R.random() ** 1.4
    x, y = r * math.cos(a) * 1.2, r * math.sin(a)
    if abs(x) < 0.5 and abs(y) < 0.34: continue
    if y < 0 and abs(x) < 0.55 and r < 1.0: continue   # delante no tapan el texto
    alt = max(0.0, 0.36 * (1 - r / 1.7)) + (0.1 if y > 0 else 0) + (0.08 if abs(x) > 0.4 and abs(y) < 0.4 else 0)
    s = R.uniform(0.07, 0.2) * (0.6 if y < 0 else 1.1)
    bloque(f'roca{n}', s * R.uniform(.9, 1.5), s * R.uniform(.8, 1.3), s * R.uniform(.5, .9), (x, y, alt + s * 0.25), (R.uniform(-.5, .5), R.uniform(-.5, .5), R.uniform(0, 3)), R.choice(M_ROCAS)); n += 1
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True)
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
print('OK', OUT, 'caras', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
if PREV:
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x, sc.render.resolution_y = 700, 700
    sc.display.shading.color_type = 'MATERIAL'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
    cam.location = (0.9, -2.2, 0.9); d = Vector((0, 0, 0.4)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = PREV; bpy.ops.render.render(write_still=True)

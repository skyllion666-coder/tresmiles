#!/usr/bin/env python3
"""Cima del Balaitús, a partir de una fotografía de la cumbre aportada por el usuario (octubre de 2026): losa de hormigón con un pilar cilíndrico en dos tramos
(el de arriba más estrecho y desgastado, con la coronación rota), una placa de «vértice geodésico» apoyada al pie con el emblema en relieve, un medallón metálico redondo,
y un cartel de madera de remate redondeado con «BALAITUS 3.145» apoyado delante; un palito amarillo de plástico junto a la losa. Medidas estimadas a ojo con la foto
(pilar de ~1,1 m y 0,30–0,34 m de diámetro sobre una losa de ~1,1 m de lado).
Unidades: metros. Z arriba; origen en el centro de la losa. Frente = -Y. Uso: blender -b --python tools/modelos/cima_balaitus.py -- models/cima-balaitus.glb [vista.png]"""
import bpy, bmesh, math, sys, random
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-balaitus.glb'; PREV = args[1] if len(args) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
R = random.Random(3145)
def mat(nombre, col, rough=0.9, metal=0.0):
    m = bpy.data.materials.new(nombre); m.use_nodes = True; m.diffuse_color = (*col, 1)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
M_BASE = mat('losa', (0.60, 0.58, 0.54)); M_INF = mat('pilar_inferior', (0.63, 0.61, 0.57)); M_SUP = mat('pilar_superior', (0.55, 0.52, 0.46))
M_PLACA = mat('placa', (0.34, 0.34, 0.33), 0.6, 0.15); M_MEDALLON = mat('medallon', (0.52, 0.52, 0.5), 0.5, 0.2)
M_MADERA = mat('madera', (0.34, 0.17, 0.08), 0.8); M_LETRAS = mat('letras', (0.92, 0.86, 0.70), 0.7); M_AMAR = mat('amarillo', (0.90, 0.70, 0.03), 0.6)
M_RELIEVE = mat('relieve', (0.42, 0.42, 0.41), 0.6, 0.15)
def nuevo(nombre, bm, m, parent):
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nombre, me); bpy.context.collection.objects.link(o); o.data.materials.append(m); o.parent = parent; return o
V = bpy.data.objects.new('Vertice', None); bpy.context.collection.objects.link(V)
# losa de hormigón: tarima baja con los cantos achaflanados
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(1.12, 1.08, 0.2), verts=bm.verts); bmesh.ops.translate(bm, vec=(0, 0, 0.1), verts=bm.verts)
bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.025, segments=1, affect='EDGES')
for v in bm.verts: v.co.z += R.uniform(-0.004, 0.004)
nuevo('losa', bm, M_BASE, V)
# pilar inferior (algo más ancho) y anillo de unión
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.175, radius2=0.168, depth=0.58)
bmesh.ops.translate(bm, vec=(0, 0, 0.2 + 0.29), verts=bm.verts)
for v in bm.verts: v.co.x += R.uniform(-.004, .004); v.co.y += R.uniform(-.004, .004)
nuevo('pilar_inferior', bm, M_INF, V)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.19, radius2=0.19, depth=0.035)
bmesh.ops.translate(bm, vec=(0, 0, 0.2 + 0.58 + 0.005), verts=bm.verts); nuevo('anillo', bm, M_INF, V)
# pilar superior, más estrecho y desgastado, con la coronación rota y áspera
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=22, radius1=0.153, radius2=0.147, depth=0.56)
bmesh.ops.translate(bm, vec=(0, 0, 0.2 + 0.58 + 0.28), verts=bm.verts)
for v in bm.verts:
    if v.co.z > 1.2:
        a = math.atan2(v.co.y, v.co.x); v.co.z -= 0.05 + 0.04 * math.sin(a * 3 + 1.1) + R.uniform(0, 0.04)
        v.co.x += R.uniform(-.012, .012); v.co.y += R.uniform(-.012, .012)
    else:
        v.co.x += R.uniform(-.006, .006); v.co.y += R.uniform(-.006, .006)
nuevo('pilar_superior', bm, M_SUP, V)
# placa del vértice apoyada al pie del pilar, inclinada hacia atrás, con el emblema en relieve y el rótulo
P = bpy.data.objects.new('placa', None); bpy.context.collection.objects.link(P); P.parent = V
P.location = (-0.12, -0.2, 0.36); P.rotation_euler = (math.radians(-12), 0, math.radians(4))
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.36, 0.014, 0.28), verts=bm.verts); nuevo('placa_chapa', bm, M_PLACA, P)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.055, radius2=0.055, depth=0.012)
bmesh.ops.transform(bm, matrix=Matrix.Translation((-0.095, -0.012, -0.065)) @ Matrix.Rotation(math.pi / 2, 4, 'X'), verts=bm.verts); nuevo('emblema', bm, M_RELIEVE, P)
for k, (txt, z, sz) in enumerate((('VERTICE', 0.085, 0.052), ('GEODESICO', 0.03, 0.05))):
    cu = bpy.data.curves.new(f'txt{k}', 'FONT'); cu.body = txt; cu.size = sz; cu.align_x = 'CENTER'; cu.extrude = 0.001
    o = bpy.data.objects.new(f'rotulo{k}', cu); bpy.context.collection.objects.link(o)
    o.rotation_euler = (math.pi / 2, 0, 0); o.location = (0.0, -0.011, z)
    bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False)
    o.data.materials.clear(); o.data.materials.append(M_RELIEVE); o.parent = P
# medallón metálico redondo apoyado en la losa, a la derecha
Md = bpy.data.objects.new('medallon', None); bpy.context.collection.objects.link(Md); Md.parent = V
Md.location = (0.3, -0.5, 0.13); Md.rotation_euler = (math.radians(-62), 0, math.radians(-8))
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.125, radius2=0.125, depth=0.012); bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.pi / 2, 4, 'X'), verts=bm.verts); nuevo('medallon_disco', bm, M_MEDALLON, Md)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.095, radius2=0.095, depth=0.006); bmesh.ops.transform(bm, matrix=Matrix.Translation((0, -0.008, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'X'), verts=bm.verts); nuevo('medallon_relieve', bm, M_RELIEVE, Md)
# cartel de madera «BALAITUS 3.145»: tablero con la parte alta redondeada, apoyado delante de la losa
C = bpy.data.objects.new('cartel', None); bpy.context.collection.objects.link(C); C.parent = V
C.location = (0.02, -0.6, 0.11); C.rotation_euler = (math.radians(-52), 0, math.radians(-6))
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.3, 0.02, 0.17), verts=bm.verts); bmesh.ops.translate(bm, vec=(0, 0, -0.04), verts=bm.verts); nuevo('cartel_tabla', bm, M_MADERA, C)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.15, radius2=0.15, depth=0.02); bmesh.ops.transform(bm, matrix=Matrix.Translation((0, 0, 0.045)) @ Matrix.Rotation(math.pi / 2, 4, 'X'), verts=bm.verts); nuevo('cartel_arco', bm, M_MADERA, C)
for k, (txt, z, sz) in enumerate((('BALAITUS', 0.045, 0.062), ('3.145', -0.04, 0.062))):
    cu = bpy.data.curves.new(f'cart{k}', 'FONT'); cu.body = txt; cu.size = sz; cu.align_x = 'CENTER'; cu.extrude = 0.0015
    o = bpy.data.objects.new(f'cartel_txt{k}', cu); bpy.context.collection.objects.link(o)
    o.rotation_euler = (math.pi / 2, 0, 0); o.location = (0.0, -0.011, z)
    bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False)
    o.data.materials.clear(); o.data.materials.append(M_LETRAS); o.parent = C
# palito de plástico amarillo junto a la losa
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.025, 0.025, 0.16), verts=bm.verts)
bmesh.ops.transform(bm, matrix=Matrix.Translation((0.5, -0.52, 0.08)) @ Matrix.Rotation(0.12, 4, 'Y'), verts=bm.verts); nuevo('palito', bm, M_AMAR, V)
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True)
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
print('OK', OUT, 'caras', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
if PREV:
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x, sc.render.resolution_y = 600, 700
    sc.display.shading.color_type = 'MATERIAL'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
    cam.location = (0.25, -2.2, 1.0); d = Vector((0, -0.1, 0.55)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = PREV; bpy.ops.render.render(write_still=True)

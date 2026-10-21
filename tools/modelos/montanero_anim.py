#!/usr/bin/env python3
"""Montañero con esqueleto y animaciones (andar, trotar, correr, agacharse, tropezar, voltereta, caída).
Base: maniquí y animaciones del *Universal Animation Library* (Standard) de Quaternius, CC0 (https://quaternius.com/packs/universalanimationlibrary.html;
zip «Universal Animation Library [Standard]» en https://opengameart.org/node/174563 → Godot/AnimationLibrary_Godot_Standard.glb). El archivo de origen se guarda fuera
del repositorio: ~/tresmiles-fuentes/AnimationLibrary_Godot_Standard.glb.
Aquí se le pone la ropa por zonas (materiales: chaqueta, pantalon, piel, guante, bota), casco, gafas, tres mochilas y dos bastones atados a los huesos, y se
dejan solo los clips que usa la web, sin dedos ni traslaciones (para que pese poco). Los nodos «Casco», «Gafas», «Mochila_grande/media/pequena», «Baston_L/R»
se encienden o apagan desde el código; los materiales se tiñen desde el código (cada montañero con su ropa).
Unidades: metros, 1,83 m de alto, mira hacia +Z (glTF). Uso: blender -b --python tools/modelos/montanero_anim.py -- models/montanero-anim.glb [vista.png]"""
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/montanero-anim.glb'; PREV = args[1] if len(args) > 1 else None
SRC = os.path.expanduser('~/tresmiles-fuentes/AnimationLibrary_Godot_Standard.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); me = bpy.data.objects['Mannequin']
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o is not me: bpy.data.objects.remove(o)
CLIPS = {'Idle_Loop_Rig': 'idle', 'Walk_Loop_Rig': 'walk', 'Jog_Fwd_Loop_Rig': 'jog', 'Sprint_Loop_Rig': 'sprint', 'Crouch_Fwd_Loop_Rig': 'agachado', 'Crouch_Idle_Loop_Rig': 'agachado_quieto',
         'Roll_Rig': 'voltereta', 'Hit_Chest_Rig': 'tropiezo', 'Death01_Rig': 'caida'}
for a in list(bpy.data.actions):
    if a.name not in CLIPS: bpy.data.actions.remove(a)
# clips ligeros: sin dedos, sin escala y solo con traslación en la raíz y la cadera
for a in list(bpy.data.actions):
    for fc in list(a.fcurves):
        dp = fc.data_path; hueso = dp.split('"')[1] if '"' in dp else ''
        if 'f_' in hueso or 'thumb' in hueso or dp.endswith('scale') or (dp.endswith('location') and hueso not in ('root', 'DEF-hips')): a.fcurves.remove(fc)
    a.name = CLIPS[a.name]; a.use_fake_user = True
walk = bpy.data.actions['walk']; arm.animation_data_create(); arm.animation_data.action = walk
def mat(nombre, col, rough=0.8, metal=0.0):
    m = bpy.data.materials.new(nombre); m.use_nodes = True; m.diffuse_color = (*col, 1)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
NOMB = ['chaqueta', 'pantalon', 'piel', 'guante', 'bota']
MATS = {n: mat(n, c, r) for n, c, r in (('chaqueta', (0.72, 0.22, 0.18), 0.62), ('pantalon', (0.17, 0.2, 0.23), 0.85), ('piel', (0.79, 0.57, 0.45), 0.6), ('guante', (0.13, 0.15, 0.17), 0.8), ('bota', (0.29, 0.21, 0.15), 0.75))}
# ropa por zonas: cada polígono toma el material del hueso que más pesa en sus vértices (las botas, por debajo de 17 cm)
vg = {g.index: g.name for g in me.vertex_groups}
def zona(nombre, z):
    if nombre in ('DEF-head', 'DEF-neck'): return 'piel'
    if 'f_' in nombre or 'thumb' in nombre or 'hand' in nombre: return 'guante'
    if nombre in ('DEF-foot.L', 'DEF-foot.R', 'DEF-toe.L', 'DEF-toe.R') or z < 0.17: return 'bota'
    if 'thigh' in nombre or 'shin' in nombre or nombre == 'DEF-hips': return 'pantalon'
    return 'chaqueta'
me.data.materials.clear()
for n in NOMB: me.data.materials.append(MATS[n])
for p in me.data.polygons:
    pesos = {}
    for vi in p.vertices:
        for g in me.data.vertices[vi].groups: pesos[vg[g.group]] = pesos.get(vg[g.group], 0) + g.weight
    hueso = max(pesos, key=pesos.get) if pesos else 'DEF-spine.002'
    p.material_index = NOMB.index(zona(hueso, p.center.z))
# piezas rígidas atadas a un hueso: se pesan al 100 % a ese hueso (como una malla con piel), porque el padre «hueso» de Blender se desplaza en la cola del hueso y no se exporta bien.
# `mundo` coloca la pieza en el espacio del esqueleto en reposo (T); `desde_pose` la coloca como si estuviera en la pose actual del hueso (para los bastones, orientados con la mano al andar)
def pieza(nombre, bm, material, hueso, mundo=Matrix.Identity(4), desde_pose=False):
    if desde_pose:
        pb = arm.pose.bones[hueso]; mundo = pb.bone.matrix_local @ pb.matrix.inverted() @ mundo
    bmesh.ops.transform(bm, matrix=mundo, verts=bm.verts)
    m = bpy.data.meshes.new(nombre); bm.to_mesh(m); bm.free()
    o = bpy.data.objects.new(nombre, m); bpy.context.collection.objects.link(o); o.data.materials.append(material)
    g = o.vertex_groups.new(name=hueso); g.add(list(range(len(m.vertices))), 1.0, 'REPLACE')
    o.parent = arm; md = o.modifiers.new('Armature', 'ARMATURE'); md.object = arm; return o
def esfera(r, seg=16):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r); return bm
def caja(w, d, h, bisel=0.02):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bisel, segments=2, affect='EDGES'); return bm
M_CASCO = mat('casco', (0.91, 0.9, 0.86), 0.35); M_LENTE = mat('lente', (0.11, 0.16, 0.21), 0.15, 0.3); M_MOCH = mat('mochila', (0.85, 0.51, 0.17), 0.7); M_MOCH2 = mat('mochila2', (0.6, 0.35, 0.1), 0.7)
M_PALO = mat('palo', (0.68, 0.7, 0.73), 0.35, 0.4); M_NEGRO = mat('negro', (0.1, 0.1, 0.11), 0.8)
bpy.context.view_layer.update()
# pose de reposo (T) para colocar la cabeza y la espalda
arm.animation_data.action = None; bpy.context.view_layer.update()
T = lambda x, y, z: Matrix.Translation((x, y, z))
# casco: casquete que cubre la parte alta de la cabeza (cabeza z 1,55–1,83; delante = -Y) con un pequeño visera
bm = esfera(1.0, 20); bmesh.ops.scale(bm, vec=(0.108, 0.132, 0.112), verts=bm.verts)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.02], context='VERTS')
pieza('Casco', bm, M_CASCO, 'DEF-head', T(0, 0.0, 1.725))
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.15, 0.06, 0.012), verts=bm.verts); pieza('Casco_visera', bm, M_CASCO, 'DEF-head', T(0, -0.135, 1.732) @ Matrix.Rotation(0.18, 4, 'X'))
pieza('Gafas', caja(0.17, 0.035, 0.04, 0.012), M_LENTE, 'DEF-head', T(0, -0.113, 1.703))
# mochilas (espalda = +Y; el torso llega a y=0,164): grande con tapa, media y pequeña
for nombre, (w, d, h, zc) in {'Mochila_grande': (0.36, 0.24, 0.52, 1.25), 'Mochila_media': (0.32, 0.2, 0.42, 1.27), 'Mochila_pequena': (0.28, 0.15, 0.32, 1.31)}.items():
    pieza(nombre, caja(w, d, h, 0.04), M_MOCH, 'DEF-spine.003', T(0, 0.164 + d / 2 - 0.02, zc))
    if nombre == 'Mochila_grande': pieza('Mochila_tapa', caja(w * 0.98, d * 1.05, 0.1, 0.035), M_MOCH2, 'DEF-spine.003', T(0, 0.164 + d / 2 - 0.02, zc + h / 2 + 0.01))
# bastones: se orientan con la mano en el primer fotograma de «andar» (puño casi vertical), punta algo hacia atrás
arm.animation_data.action = walk; bpy.context.scene.frame_set(0); bpy.context.view_layer.update()
for lado, hueso in (('L', 'DEF-hand.L'), ('R', 'DEF-hand.R')):
    pb = arm.pose.bones[hueso]; H = arm.matrix_world @ pb.head
    arriba = H + Vector((0, 0, 0.12)); punta = H + Vector((0, 0.3, -0.95)); eje = (arriba - punta); L = eje.length; c = (arriba + punta) / 2
    rot = eje.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    mundo = Matrix.Translation(c) @ rot
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.011, radius2=0.011, depth=L); pieza(f'Baston_{lado}', bm, M_PALO, hueso, mundo, True)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.019, radius2=0.019, depth=0.13); pieza(f'Baston_{lado}_mango', bm, M_NEGRO, hueso, mundo @ T(0, 0, L / 2 - 0.05), True)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.03, radius2=0.012, depth=0.05); pieza(f'Baston_{lado}_punta', bm, M_NEGRO, hueso, mundo @ T(0, 0, -L / 2 + 0.03), True)
# exportación
arm.animation_data.action = None
for a in bpy.data.actions: a.use_fake_user = True
kw = dict(filepath=OUT, export_format='GLB', export_apply=False, export_yup=True, export_animations=True, export_animation_mode='ACTIONS', export_skins=True)
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
print('OK', OUT, round(os.path.getsize(OUT) / 1024), 'KB', 'clips', sorted(a.name for a in bpy.data.actions))
if PREV:
    arm.animation_data.action = walk; bpy.context.scene.frame_set(8); bpy.context.view_layer.update()
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x, sc.render.resolution_y = 700, 700; sc.display.shading.color_type = 'MATERIAL'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
    cam.location = (2.2, -3.0, 1.3); d = Vector((0, 0, 0.9)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = PREV; bpy.ops.render.render(write_still=True)

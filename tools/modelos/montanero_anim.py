#!/usr/bin/env python3
"""Montañero con esqueleto y animaciones (andar, trotar, correr, agacharse, tropezar, voltereta, caída).
Base: maniquí y animaciones del *Universal Animation Library* (Standard) de Quaternius, CC0 (https://quaternius.com/packs/universalanimationlibrary.html;
zip «Universal Animation Library [Standard]» en https://opengameart.org/node/174563 → Godot/AnimationLibrary_Godot_Standard.glb). El archivo de origen se guarda fuera
del repositorio: ~/tresmiles-fuentes/AnimationLibrary_Godot_Standard.glb.
Aquí se le pone la ropa por zonas (materiales: chaqueta, pantalon, piel, guante, bota), casco, gafas, tres mochilas y dos bastones atados a los huesos, y se
dejan solo los clips que usa la web, sin dedos ni traslaciones (para que pese poco). Los nodos «Casco», «Gafas», «Mochila_grande/media/pequena», «Baston_L/R»
se encienden o apagan desde el código; los materiales se tiñen desde el código (cada montañero con su ropa).
Unidades: metros, 1,83 m de alto, mira hacia +Z (glTF). Uso: blender -b --python tools/modelos/montanero_anim.py -- models/montanero-anim.glb [vista.png]
Con `--chica` (blender -b --python tools/modelos/montanero_anim.py -- --chica models/montanera-anim.glb [vista.png]) hace la montañera: el mismo esqueleto y los mismos clips, pero con el cuerpo
remodelado (hombros más estrechos, cintura marcada, caderas y pecho), pelo con cinta y una coleta con dos huesos propios («Coleta1», «Coleta2») que el código balancea al andar. Sin casco ni gafas."""
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
CHICA = '--chica' in args; args = [a for a in args if a != '--chica']
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
if CHICA:   # silueta femenina: se remodela la malla en reposo (T) y se acercan los brazos al tronco (huesos incluidos, para que giren sobre el hombro nuevo)
    sm = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(max(0.0, min(1.0, (x - a) / (b - a))))
    campana = lambda z0, sg, z: math.exp(-(((z - z0) / sg) ** 2))
    for v in me.data.vertices:
        x, y, z = v.co; ax = abs(x); sg = 1 if x >= 0 else -1
        if 1.30 < z < 1.60:   # hombros más estrechos
            banda = sm(1.28, 1.38, z) * (1 - sm(1.52, 1.62, z)); x = sg * (ax - banda * (0.175 * ax if ax < 0.2 else 0.035)); ax = abs(x)
            if ax > 0.17: k = 1 - 0.16 * sm(0.17, 0.36, ax); y = 0.067 + (y - 0.067) * k; z = 1.441 + (z - 1.441) * k   # brazos y deltoides más delgados
            if ax > 0.7: k = 0.9; y = 0.065 + (y - 0.065) * k; z = 1.441 + (z - 1.441) * k   # manos más pequeñas
        w = campana(1.12, 0.07, z); x *= 1 - 0.17 * w; y *= 1 - 0.12 * w   # cintura
        h = campana(0.93, 0.09, z); x *= 1 + 0.15 * h; y *= 1 + (0.12 if y > 0 else 0.04) * h   # caderas
        if y < 0 and 1.18 < z < 1.42 and ax < 0.19: y -= 0.062 * campana(1.29, 0.05, z) * math.exp(-(((ax - 0.085) / 0.05) ** 2)) - (0.015 * campana(1.40, 0.05, z) if y < -0.1 else 0)   # pecho
        if 1.50 < z < 1.585 and ax < 0.07: x *= 0.88; y = (y - 0.0) * 0.88   # cuello
        if z > 1.60 and ax < 0.13: x *= 0.95; y = -0.01 + (y + 0.01) * 0.95; z = 1.70 + (z - 1.70) * 0.95   # cabeza algo menor
        v.co = (x, y, z)
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
    for eb in arm.data.edit_bones:
        n = eb.name
        if not n.endswith(('.L', '.R')): continue
        sg = 1 if n.endswith('.L') else -1
        if 'shoulder' in n: eb.tail.x -= sg * 0.035
        elif any(k in n for k in ('upper_arm', 'forearm', 'hand', 'f_', 'thumb')): eb.head.x -= sg * 0.035; eb.tail.x -= sg * 0.035
    # coleta: dos huesos hijos de la cabeza que el código balancea
    c1 = arm.data.edit_bones.new('Coleta1'); c1.head = (0, 0.12, 1.755); c1.tail = (0, 0.215, 1.63); c1.parent = arm.data.edit_bones['DEF-head']; c1.use_deform = True
    c2 = arm.data.edit_bones.new('Coleta2'); c2.head = (0, 0.215, 1.63); c2.tail = (0, 0.22, 1.52); c2.parent = c1; c2.use_connect = True; c2.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT'); bpy.context.view_layer.update()
# piezas rígidas atadas a un hueso: se pesan al 100 % a ese hueso (como una malla con piel), porque el padre «hueso» de Blender se desplaza en la cola del hueso y no se exporta bien.
# `mundo` coloca la pieza en el espacio del esqueleto en reposo (T); `desde_pose` la coloca como si estuviera en la pose actual del hueso (para los bastones, orientados con la mano al andar)
def pieza(nombre, bm, material, hueso, mundo=Matrix.Identity(4), desde_pose=False, pesos=None):   # pesos: {índice de vértice: {hueso: peso}} para piezas que se doblan entre varios huesos
    if desde_pose:
        pb = arm.pose.bones[hueso]; mundo = pb.bone.matrix_local @ pb.matrix.inverted() @ mundo
    bmesh.ops.transform(bm, matrix=mundo, verts=bm.verts)
    m = bpy.data.meshes.new(nombre); bm.to_mesh(m); bm.free()
    o = bpy.data.objects.new(nombre, m); bpy.context.collection.objects.link(o); o.data.materials.append(material)
    if pesos:
        grupos = {}
        for vi, d in pesos.items():
            for h, w in d.items():
                if w > 0: grupos.setdefault(h, o.vertex_groups.new(name=h)).add([vi], w, 'REPLACE')
    else: g = o.vertex_groups.new(name=hueso); g.add(list(range(len(m.vertices))), 1.0, 'REPLACE')
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
if not CHICA:
    # casco: casquete que cubre la parte alta de la cabeza (cabeza z 1,55–1,83; delante = -Y) con un pequeño visera
    bm = esfera(1.0, 20); bmesh.ops.scale(bm, vec=(0.108, 0.132, 0.112), verts=bm.verts)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.02], context='VERTS')
    pieza('Casco', bm, M_CASCO, 'DEF-head', T(0, 0.0, 1.725))
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.15, 0.06, 0.012), verts=bm.verts); pieza('Casco_visera', bm, M_CASCO, 'DEF-head', T(0, -0.135, 1.732) @ Matrix.Rotation(0.18, 4, 'X'))
    pieza('Gafas', caja(0.17, 0.035, 0.04, 0.012), M_LENTE, 'DEF-head', T(0, -0.113, 1.703))
else:   # pelo recogido: casquete que deja la frente y las orejas al aire, cinta y coleta con dos huesos
    M_PELO = mat('pelo', (0.29, 0.18, 0.1), 0.55); M_CINTA = mat('cinta', (0.95, 0.78, 0.2), 0.7)
    def umbral(y):   # altura mínima (respecto al centro de la cabeza) de la línea del pelo según lo adelante o atrás que esté
        if y > 0.06: return -0.10
        if y > 0: return -0.02 - 0.08 * y / 0.06
        return -0.02 + 0.07 * min(1.0, -y / 0.13)
    bm = esfera(1.0, 24); bmesh.ops.scale(bm, vec=(0.113, 0.136, 0.12), verts=bm.verts)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < umbral(v.co.y)], context='VERTS')
    pieza('Pelo', bm, M_PELO, 'DEF-head', T(0, 0.004, 1.722))
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=28, radius1=1.0, radius2=1.0, depth=0.034); bmesh.ops.scale(bm, vec=(0.119, 0.143, 1.0), verts=bm.verts)
    pieza('Cinta', bm, M_CINTA, 'DEF-head', T(0, 0.004, 1.752))
    # coleta: tubo aplastado que sigue la trayectoria (y, z, radio); cada anillo se pesa a Coleta1 (arriba) y Coleta2 (abajo) con mezcla en medio
    RUTA = [(0.12, 1.755, 0.026), (0.165, 1.748, 0.038), (0.2, 1.705, 0.044), (0.215, 1.635, 0.042), (0.22, 1.575, 0.034), (0.22, 1.525, 0.012)]
    bm = bmesh.new(); anillos = []; NS = 8; largo = [0.0]
    for i in range(1, len(RUTA)): largo.append(largo[-1] + math.hypot(RUTA[i][0] - RUTA[i - 1][0], RUTA[i][1] - RUTA[i - 1][1]))
    for i, (y, z, r) in enumerate(RUTA):
        a0 = RUTA[max(i - 1, 0)]; a1 = RUTA[min(i + 1, len(RUTA) - 1)]; ty, tz = a1[0] - a0[0], a1[1] - a0[1]; n = math.hypot(ty, tz); ty, tz = ty / n, tz / n; ny, nz = -tz, ty
        anillo = []
        for k in range(NS):
            an = 2 * math.pi * k / NS; cx, cn = math.cos(an) * r * 1.0, math.sin(an) * r * 0.75
            anillo.append(bm.verts.new((cx, y + ny * cn, z + nz * cn)))
        anillos.append(anillo)
    for i in range(len(anillos) - 1):
        for k in range(NS): bm.faces.new((anillos[i][k], anillos[i][(k + 1) % NS], anillos[i + 1][(k + 1) % NS], anillos[i + 1][k]))
    bm.faces.new(anillos[0][::-1]); bm.faces.new(anillos[-1])
    bm.verts.index_update(); pesos = {}   # los vértices nuevos no tienen índice hasta actualizarlo
    for i, anillo in enumerate(anillos):
        u = largo[i] / largo[-1]; w2 = max(0.0, min(1.0, (u - 0.3) / 0.3))
        for v in anillo: pesos[v.index] = {'Coleta1': 1 - w2, 'Coleta2': w2}
    pieza('Coleta', bm, M_PELO, 'Coleta1', pesos=pesos)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.047, radius2=0.047, depth=0.03); pieza('Coleta_goma', bm, M_CINTA, 'DEF-head', T(0, 0.15, 1.75) @ Matrix.Rotation(1.35, 4, 'X'))
# mochilas (espalda = +Y; el torso llega a y=0,164): grande con tapa, media y pequeña
for nombre, (w, d, h, zc) in {'Mochila_grande': (0.36, 0.24, 0.52, 1.25), 'Mochila_media': (0.32, 0.2, 0.42, 1.27), 'Mochila_pequena': (0.28, 0.15, 0.32, 1.31)}.items():
    if CHICA: w *= 0.86; d *= 0.92
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

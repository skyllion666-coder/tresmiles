#!/usr/bin/env python3
"""Cima del Gran Vignemale (Pique Longue), a partir de la fotografía de la cima de la ficha (Eva Gl, ya publicada con su crédito): pilar de hormigón gris claro de ~1,2 m
(base cuadrada de ~0,3 m, algo desgastado) sobre una losa baja de hormigón de ~1,3 × 0,9 m, con un bloque plano de piedra parda apoyado en la losa a la izquierda,
pañuelos y banderas atados arriba del pilar (azul, blanco a rayas y rojo, caídos por el lado de la cámara) y alrededor un montón de bloques angulosos pardo-rojizos.
Medidas a ojo con la foto. Unidades: metros. Z arriba; origen en el centro de la losa, a ras de suelo. Frente = -Y.
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
M_ROCAS = [mat('roca_a', (0.21, 0.12, 0.08)), mat('roca_b', (0.27, 0.16, 0.11)), mat('roca_c', (0.17, 0.11, 0.08)), mat('roca_d', (0.30, 0.28, 0.26))]
M_HORM = mat('hormigon', (0.62, 0.61, 0.58)); M_PILAR = mat('pilar', (0.66, 0.65, 0.62)); M_BLOQUE = mat('bloque', (0.25, 0.19, 0.16))
M_AZUL = mat('tela_azul', (0.06, 0.12, 0.62), 0.8); M_ROJA = mat('tela_roja', (0.80, 0.06, 0.07), 0.8); M_BLANCA = mat('tela_blanca', (0.88, 0.86, 0.80), 0.8)
def nuevo(nombre, bm, m, parent):
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nombre, me); bpy.context.collection.objects.link(o); o.data.materials.append(m); o.parent = parent; return o
V = bpy.data.objects.new('Vertice', None); bpy.context.collection.objects.link(V)
def bloque(nombre, sx, sy, sz, pos, rot, m, bisel=0.12):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(sx, sy, sz) * bisel, segments=1, affect='EDGES')
    for v in bm.verts: v.co += Vector((R.uniform(-.08, .08) * sx, R.uniform(-.08, .08) * sy, R.uniform(-.08, .08) * sz))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(pos) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X'), verts=bm.verts)
    return nuevo(nombre, bm, m, V)
# losa de hormigón y pilar
bloque('losa', 1.3, 0.9, 0.2, (0, 0, 0.1), (0, 0, 0.05), M_HORM, 0.05)
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.3, 0.3, 1.2), verts=bm.verts)
bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.02, segments=1, affect='EDGES')
for v in bm.verts:
    if v.co.z > 0.5: v.co.x += R.uniform(-.015, .015); v.co.y += R.uniform(-.015, .015); v.co.z -= R.uniform(0, .03)
bmesh.ops.translate(bm, vec=(0.05, 0.05, 0.2 + 0.6), verts=bm.verts); nuevo('pilar', bm, M_PILAR, V)
# bloque plano de piedra apoyado en la losa, a la izquierda del pilar
bloque('bloque_plano', 0.5, 0.36, 0.2, (-0.38, -0.12, 0.3), (0, 0, 0.1), M_BLOQUE, 0.06)
# pañuelos y banderas atados arriba, caídos por el frente (-Y): tiras estrechas con algo de ondulación
def tela(nombre, m, x, ancho, largo, z0, curva):
    bm = bmesh.new(); n = 8; cols = []
    for i in range(n + 1):
        t = i / n; z = z0 - largo * t; y = -0.17 - curva * math.sin(t * 2.4) - 0.03 * t
        cols.append((bm.verts.new((x - ancho / 2, y, z)), bm.verts.new((x + ancho / 2, y - 0.01 * math.sin(t * 5), z))))
    for i in range(n): bm.faces.new((cols[i][0], cols[i][1], cols[i + 1][1], cols[i + 1][0]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.006)
    bmesh.ops.translate(bm, vec=(0.05, 0.05, 0), verts=bm.verts); return nuevo(nombre, bm, m, V)
tela('tela_azul', M_AZUL, -0.07, 0.10, 0.62, 1.38, 0.04); tela('tela_blanca', M_BLANCA, 0.02, 0.12, 0.7, 1.36, 0.07); tela('tela_roja', M_ROJA, 0.14, 0.11, 0.5, 1.30, 0.06)
tela('tela_azul2', M_AZUL, 0.07, 0.07, 0.4, 1.4, 0.03)
# montón de bloques alrededor (más alto hacia atrás/derecha, bajo delante)
n = 0
for k in range(190):
    a = R.uniform(0, math.tau); r = R.uniform(0.6, 1.5)
    x, y = r * math.cos(a) * 1.15, r * math.sin(a)
    if abs(x) < 0.72 and abs(y) < 0.55: continue
    if y < 0 and abs(x) < 0.95 and r < 1.0: continue   # delante no tapan la losa
    alt = max(0.0, 0.45 * (1 - r / 1.8)) + (0.12 if y > 0 else 0)
    s = R.uniform(0.10, 0.26) * (0.75 if y < 0 else 1.2)
    bloque(f'roca{n}', s * R.uniform(.9, 1.5), s * R.uniform(.8, 1.3), s * R.uniform(.5, .9), (x, y, alt + s * 0.25), (R.uniform(-.5, .5), R.uniform(-.5, .5), R.uniform(0, 3)), R.choice(M_ROCAS)); n += 1
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True)
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
print('OK', OUT, 'caras', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
if PREV:
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x, sc.render.resolution_y = 700, 700
    sc.display.shading.color_type = 'MATERIAL'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
    cam.location = (0.6, -4.2, 1.6); d = Vector((0, 0, 0.65)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = PREV; bpy.ops.render.render(write_still=True)

#!/usr/bin/env python3
"""Cima del Garmo Negro, a partir de una fotografía de la cumbre aportada por el usuario (octubre de 2026; la foto lleva marca de agua de aventurate.com y
no se publica, solo sirve de referencia): un montón de bloques angulosos de roca pardo-rojiza (pizarra/arenisca oxidada) y, arriba a la izquierda,
una laja grande y plana de cara lisa con «PICO GARMO NEGRO 3051» pintado a mano en rojo (así figura en la foto). Medidas a ojo
(montón de ~1,8 m de diámetro y ~0,7 m de alto; laja de ~0,55 × 0,38 m).
Unidades: metros. Z arriba; origen en el centro del montón, a ras de suelo. Frente = -Y. Uso: blender -b --python tools/modelos/cima_garmo.py -- models/cima-garmo.glb [vista.png]"""
import bpy, bmesh, math, sys, random
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-garmo.glb'; PREV = args[1] if len(args) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
R = random.Random(3051)
def mat(nombre, col, rough=0.95, metal=0.0):
    m = bpy.data.materials.new(nombre); m.use_nodes = True; m.diffuse_color = (*col, 1)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
M_ROCAS = [mat('roca_a', (0.32, 0.19, 0.13)), mat('roca_b', (0.38, 0.24, 0.17)), mat('roca_c', (0.26, 0.16, 0.12)), mat('roca_d', (0.42, 0.31, 0.24))]
M_LAJA = mat('laja', (0.46, 0.28, 0.21)); M_PINTURA = mat('pintura_roja', (0.85, 0.12, 0.06), 0.7)
def nuevo(nombre, bm, m, parent):
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nombre, me); bpy.context.collection.objects.link(o); o.data.materials.append(m); o.parent = parent; return o
V = bpy.data.objects.new('Vertice', None); bpy.context.collection.objects.link(V)
def bloque(nombre, sx, sy, sz, pos, rot, m):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(sx, sy, sz) * 0.12, segments=1, affect='EDGES')
    for v in bm.verts: v.co += Vector((R.uniform(-.1, .1) * sx, R.uniform(-.1, .1) * sy, R.uniform(-.1, .1) * sz))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(pos) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X'), verts=bm.verts)
    return nuevo(nombre, bm, m, V)
# montón: bloques angulosos, más grandes y altos hacia el centro; algunos sueltos por el borde
n = 0
for k in range(70):
    a = R.uniform(0, math.tau); r = 0.92 * math.sqrt(R.random()) ** 1.1
    alt = 0.62 * max(0.0, 1 - (r / 0.95) ** 1.6)
    s = R.uniform(0.14, 0.34) * (1.1 - 0.4 * r)
    if -0.65 < r * math.cos(a) < 0.25 and r * math.sin(a) < 0.1: alt = min(alt, 0.12); s *= 0.7   # delante de la laja no tapan el rótulo
    sx, sy, sz = s * R.uniform(0.8, 1.5), s * R.uniform(0.8, 1.4), s * R.uniform(0.5, 0.9)
    bloque(f'bloque{n}', sx, sy, sz, (r * math.cos(a), r * math.sin(a), alt + sz * 0.3 * R.random()),
           (R.uniform(-.5, .5), R.uniform(-.5, .5), R.uniform(0, math.pi)), R.choice(M_ROCAS)); n += 1
# lecho bajo de bloques grandes para que no se vea el suelo entre medias
for k in range(9):
    a = k * math.tau / 9 + R.uniform(-.2, .2); r = R.uniform(0.2, 0.55)
    bloque(f'base{k}', R.uniform(.38, .55), R.uniform(.34, .5), R.uniform(.16, .26), (r * math.cos(a), r * math.sin(a), 0.1), (R.uniform(-.2, .2), R.uniform(-.2, .2), R.uniform(0, 3)), R.choice(M_ROCAS))
# laja con el rótulo: placa gruesa de cara lisa, inclinada hacia atrás y apoyada en lo alto del montón (arriba a la izquierda, mirando al frente)
L = bpy.data.objects.new('laja', None); bpy.context.collection.objects.link(L); L.parent = V
L.location = (-0.2, -0.3, 0.46); L.rotation_euler = (math.radians(-18), 0, math.radians(-6))
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.72, 0.10, 0.50), verts=bm.verts)
bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.02, segments=1, affect='EDGES')
for v in bm.verts:
    if v.co.z > 0.1: v.co.x += 0.02 * (v.co.z)  # lado de arriba algo ladeado, canto irregular
    v.co.z += R.uniform(-.008, .008)
nuevo('laja_roca', bm, M_LAJA, L)
for k, (txt, z, sz) in enumerate((('PICO', 0.15, 0.08), ('GARMO NEGRO', 0.04, 0.062), ('3051', -0.08, 0.08))):
    cu = bpy.data.curves.new(f'txt{k}', 'FONT'); cu.body = txt; cu.size = sz; cu.align_x = 'CENTER'; cu.extrude = 0.0012
    o = bpy.data.objects.new(f'rotulo{k}', cu); bpy.context.collection.objects.link(o)
    o.rotation_euler = (math.pi / 2, 0, math.radians(R.uniform(-3, 3))); o.location = (R.uniform(-.01, .01), -0.052, z)
    bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False)
    xs = [v.co.x for v in o.data.vertices]; o.location.x = -(min(xs) + max(xs)) / 2 + R.uniform(-.01, .01); o.location.y = -0.058
    o.data.materials.clear(); o.data.materials.append(M_PINTURA); o.parent = L
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True)
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
print('OK', OUT, 'caras', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
if PREV:
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x, sc.render.resolution_y = 700, 600
    sc.display.shading.color_type = 'MATERIAL'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
    cam.location = (0.4, -2.6, 1.1); d = Vector((0, 0, 0.35)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = PREV; bpy.ops.render.render(write_still=True)

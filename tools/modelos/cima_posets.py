#!/usr/bin/env python3
"""Vértice geodésico de la cima del Posets, a partir de dos fotografías de la cumbre aportadas por el usuario (octubre de 2026)
y de la reseña del IGN n.º 17999 (pilar de 1,20 m de alto y 0,30 m de diámetro sobre un cuerpo de 1,00 m de ancho y 0,20 m de alto).
En la foto: pilar cilíndrico de hormigón roto por arriba, con tres hierros de la armadura asomando; la mitad baja envuelta en una
funda de cemento gris rota por arriba, con «POSETS 3369» pintado en rojo; base cuadrada de hormigón agrietada; una cinta roja y
amarilla atada arriba y una piedra pintada al pie. Medidas no indicadas en la reseña: estimadas a ojo con la foto.
Unidades: metros. Z arriba; origen en el centro de la base. Uso: blender -b --python tools/modelos/cima_posets.py -- models/cima-posets.glb [vista.png]"""
import bpy, bmesh, math, sys, random
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-posets.glb'; PREV = args[1] if len(args) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
R = random.Random(17999)
def mat(nombre, col, rough=0.9, metal=0.0):
    m = bpy.data.materials.new(nombre); m.use_nodes = True; m.diffuse_color = (*col, 1)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
M_HORM = mat('hormigon', (0.55, 0.52, 0.46)); M_BASE = mat('base', (0.50, 0.47, 0.41)); M_FUNDA = mat('funda', (0.62, 0.64, 0.66))
M_HIERRO = mat('hierro', (0.06, 0.05, 0.05), 0.6, 0.6); M_ROJO = mat('pintura_roja', (0.85, 0.02, 0.01), 0.6)
M_AMAR = mat('amarillo', (0.85, 0.62, 0.02), 0.7); M_PIEDRA = mat('piedra_pintada', (0.55, 0.20, 0.12), 0.8)
M_LOSA = mat('losa_oscura', (0.10, 0.10, 0.10))
def nuevo(nombre, bm, m, parent):
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nombre, me); bpy.context.collection.objects.link(o); o.data.materials.append(m); o.parent = parent; return o
V = bpy.data.objects.new('Vertice', None); bpy.context.collection.objects.link(V)
# base cuadrada agrietada: dos losas separadas por una grieta diagonal
for k, (sgn) in enumerate((1, -1)):
    bm = bmesh.new()
    pts = [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)]
    poly = [(x, y) for x, y in pts if (x - y * 0.3) * sgn >= -0.02] 
    poly = [(-0.5, -0.5), (0.08, -0.5), (-0.05, 0.5), (-0.5, 0.5)] if sgn > 0 else [(0.1, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.03, 0.5)]
    vs = [bm.verts.new((x + R.uniform(-.02, .02), y + R.uniform(-.02, .02), 0.2 - R.uniform(0, .03))) for x, y in poly]
    f = bm.faces.new(vs); r = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=(0, 0, -0.24), verts=[e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); nuevo(f'base{k}', bm, M_BASE, V)
# pilar cilíndrico roto por arriba (borde irregular)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=0.15, radius2=0.15, depth=1.1)
bmesh.ops.translate(bm, vec=(0, 0, 0.2 + 0.55), verts=bm.verts)
for v in bm.verts:
    if v.co.z > 1.2:
        a = math.atan2(v.co.y, v.co.x); v.co.z -= 0.06 + 0.035 * math.sin(a * 3 + 0.7) + R.uniform(0, 0.035)
    v.co.x += R.uniform(-.008, .008); v.co.y += R.uniform(-.008, .008)
nuevo('pilar', bm, M_HORM, V)
# funda gris de la mitad baja, rota por arriba en dientes
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=18, radius1=0.172, radius2=0.172, depth=0.62)
bmesh.ops.translate(bm, vec=(0, 0, 0.2 + 0.31), verts=bm.verts)
for v in bm.verts:
    if v.co.z > 0.6: v.co.z += R.uniform(-0.1, 0.06)
bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.012) if hasattr(bmesh.ops, 'solidify') else None
nuevo('funda', bm, M_FUNDA, V)
# hierros de la armadura que asoman arriba
for k, (x, y, h) in enumerate([(-0.09, 0.03, 0.18), (-0.03, -0.06, 0.27), (0.09, 0.02, 0.24)]):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.008, radius2=0.008, depth=h + 0.2)
    bmesh.ops.translate(bm, vec=(x, y, 1.18 + (h - 0.2) / 2), verts=bm.verts); nuevo(f'hierro{k}', bm, M_HIERRO, V)
# rótulo «POSETS 3369» pintado en rojo en la funda (texto convertido en malla, casi plano)
for k, (txt, z) in enumerate((('POSETS', 0.46), ('3369', 0.37))):
    cu = bpy.data.curves.new(f'txt{k}', 'FONT'); cu.body = txt; cu.size = 0.085; cu.align_x = 'CENTER'; cu.extrude = 0.002
    o = bpy.data.objects.new(f'rotulo{k}', cu); bpy.context.collection.objects.link(o)
    o.rotation_euler = (math.pi / 2, 0, 0); o.location = (0, -0.176, 0.2 + z - 0.2 + 0.2)
    bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False)
    o.data.materials.clear(); o.data.materials.append(M_ROJO); o.parent = V
# cinta roja y amarilla atada arriba, colgando
for k, (dx, m) in enumerate(((-0.02, M_ROJO), (0.0, M_AMAR), (0.02, M_ROJO))):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.02, 0.006, 0.42), verts=bm.verts)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((-0.12 + dx, -0.155, 1.05)) @ Matrix.Rotation(0.25, 4, 'Y'), verts=bm.verts); nuevo(f'cinta{k}', bm, m, V)
# piedra pintada al pie y una losa oscura
for nombre, m, pos, sc in (('piedra_pintada', M_PIEDRA, (-0.28, -0.32, 0.22), (0.11, 0.07, 0.03)), ('losa', M_LOSA, (0.25, -0.38, 0.24), (0.08, 0.06, 0.05))):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1); bmesh.ops.scale(bm, vec=sc, verts=bm.verts); bmesh.ops.translate(bm, vec=pos, verts=bm.verts); nuevo(nombre, bm, m, V)
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True)
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
print('OK', OUT, 'caras', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
if PREV:
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x, sc.render.resolution_y = 500, 800
    sc.display.shading.color_type = 'MATERIAL'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
    cam.location = (0.15, -2.3, 1.0); d = Vector((0, 0, 0.7)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = PREV; bpy.ops.render.render(write_still=True)

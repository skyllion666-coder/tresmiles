#!/usr/bin/env python3
"""Cima de la Punta de Astorg (3.355 m, cresta Maldito–Astorg–Medio, granito de la Maladeta), a partir de las fotos de referencia del usuario (22-10-2026; no se publican):
en lo alto, una torre de dos lajas apiladas —una plana de ~1,35 × 0,85 × 0,42 m que sobresale a un lado y encima otra alta de ~0,95 × 0,6 × 1,45 m con la cara inclinada y una piedrita
en la punta— sobre un montón de bloques angulosos, y a los lados la cresta de granito roto. La escala sale de la foto con una persona de pie sobre la torre.
Las lajas de la torre son de granito dorado (oxidado, con líquenes); el resto, gris con manchas de óxido y líquenes. Los bloques del montón caen con la física de
Blender (tools/modelos/rocas.py) para que se apoyen de forma creíble.
Unidades: metros. Z arriba; origen en la base de la torre, a ras de suelo; la cresta va a lo largo del eje X. Frente = -Y.
Uso: blender -b --python tools/modelos/cima_astorg.py -- models/cima-astorg.glb"""
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rocas
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-astorg.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
R = random.Random(3355)
MAT = rocas.material()
V = bpy.data.objects.new('Vertice', None); bpy.context.collection.objects.link(V)
# suelo provisional para la física: losa plana bajo la cresta (no se exporta)
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(16, 12, 1), verts=bm.verts); bmesh.ops.translate(bm, vec=(0, 0, -0.65), verts=bm.verts)
me = bpy.data.meshes.new('suelo'); bm.to_mesh(me); bm.free(); suelo = bpy.data.objects.new('suelo', me); bpy.context.collection.objects.link(suelo)
# roca madre de la cresta: bloques grandes medio enterrados a lo largo del eje X, algunos de canto como agujas
madre = []
for k, x in enumerate((-2.3, -1.3, 1.4, 2.4)):   # compacto: a escala ×16 la cresta real ya la pone el relieve; esto solo asoma alrededor de la torre
    alto = R.uniform(0.7, 1.1)
    o = rocas.bloque(R, f'cresta{k}', (R.uniform(0.9, 1.3), R.uniform(0.7, 1.0), alto), (x + R.uniform(-.15, .15), R.uniform(-.12, .12), alto * 0.5 - 0.45),
                     (R.uniform(-.25, .25), R.uniform(-.3, .3), R.uniform(-.4, .4)), cortes=9, mat=MAT, oxido=0.12, liquen=0.3)
    madre.append(o)
# montón de bloques que caen sobre la cresta alrededor de la torre
monton = []; k = 0
for capa in range(4):   # en rejilla, sin solaparse (si nacen metidos unos en otros, la física los dispara); estrecho a lo ancho porque la arista es fina
    for x in (-1.65, -1.1, -0.55, 0.0, 0.55, 1.1, 1.65):
        for y in (-0.3, 0.3):
            s = R.uniform(0.26, 0.44)
            o = rocas.bloque(R, f'bloque{k}', (s * R.uniform(1.0, 1.3), s * R.uniform(0.8, 1.0), s * R.uniform(0.55, 0.85)), (x + R.uniform(-.05, .05), y + R.uniform(-.05, .05), 1.2 + capa * 0.8),
                             (R.uniform(0, 3), R.uniform(0, 3), R.uniform(0, 3)), cortes=7, mat=MAT, oxido=0.15, liquen=0.3)
            monton.append(o); k += 1
rocas.asentar(monton, madre + [suelo], pasos=160)
for o in monton[:]:
    if o.location.z < -1.0 or abs(o.location.x) > 3 or abs(o.location.y) > 1.2: bpy.data.objects.remove(o); monton.remove(o)   # los que se caen por la ladera
# torre: laja plana apoyada en lo más alto del montón bajo su huella, y encima la laja alta con la cara inclinada y la piedrita
todo = madre + monton
z0 = max(rocas.apoyo(x, y, todo) for x in (-0.45, 0, 0.45) for y in (-0.3, 0, 0.3))
z0 = max(z0, 0.1)   # sin montón debajo, sobre el suelo
plana = rocas.bloque(R, 'laja_plana', (1.35, 0.85, 0.42), (0.18, 0.0, z0 + 0.17), (0.0, 0.06, 0.25), cortes=3, mat=MAT, base=rocas.DORADO, oxido=0.5, liquen=0.35)
bpy.context.view_layer.update(); zp = rocas.apoyo(0.0, 0.0, [plana])
alta = rocas.bloque(R, 'laja_alta', (0.95, 0.6, 1.7), (-0.12, 0.02, zp + 0.82), (0.0, -0.05, 0.2), cortes=4, mat=MAT, base=rocas.DORADO, oxido=0.55, liquen=0.4)
bm = bmesh.new(); bm.from_mesh(alta.data)   # cara de arriba inclinada (como en la foto: más alta hacia un lado)
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=Vector((0, 0, 0.6)), plane_no=Vector((0.3, 0, 1)).normalized(), clear_outer=True)
bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(alta.data); bm.free()
rocas.pinta(alta, R, rocas.DORADO, 0.55, 0.4)
bpy.context.view_layer.update(); za = rocas.apoyo(-0.3, 0.02, [alta])
rocas.bloque(R, 'piedrita', (0.2, 0.16, 0.12), (-0.3, 0.02, za + 0.05), (0.2, 0.1, 0.5), cortes=5, mat=MAT, oxido=0.2, liquen=0.2)
# todo cuelga de «Vertice»; el suelo provisional se borra
bpy.data.objects.remove(suelo)
for o in bpy.data.objects:
    if o.type == 'MESH': mw = o.matrix_world.copy(); o.parent = V; o.matrix_world = mw
alto_total = max((o.matrix_world @ Vector(c)).z for o in bpy.data.objects if o.type == 'MESH' for c in o.bound_box)
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_colors=True, export_attributes=False)
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
print('OK', OUT, round(os.path.getsize(OUT) / 1024), 'KB', 'caras', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'), 'bloques', len(monton), 'alto', round(alto_total, 2), 'base torre', round(z0, 2))

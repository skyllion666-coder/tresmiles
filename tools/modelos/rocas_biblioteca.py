#!/usr/bin/env python3
"""Biblioteca de rocas por tipo de roca, para que la web las coloque sola sobre el relieve fino de cada cumbre (js/rocas.js).
Cada GLB lleva diez formas de ~1 m, con la base en z = 0 y centradas en x, y: «roca0»–«roca3» bloques angulosos, «roca4»–«roca6» lajas, «roca7»–«roca9» cantos;
textura escaneada (Poly Haven, CC0; ver ~/tresmiles-fuentes/texturas/LEEME.txt) con mapa de normales y relieve real (la altura escaneada deforma la malla).
Tipos: granito (rock_boulder_dry gris y rock_08 ocre), caliza (marble_cliff_01), oscura (seaside_rock), neutra (rock_surface).
Uso: blender -b --python tools/modelos/rocas_biblioteca.py -- <tipo> /tmp/rocas-<tipo>.glb [--movil]   (--movil: texturas a 512 px)
  y después: npx -y @gltf-transform/cli@4 meshopt /tmp/rocas-<tipo>.glb models/rocas-<tipo>[-m].glb --level medium"""
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rocas
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
MOVIL = '--movil' in args; args = [a for a in args if a != '--movil']
TIPO, OUT = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
R = random.Random({'granito': 1, 'caliza': 2, 'oscura': 3, 'neutra': 4}[TIPO])
TAM = '512' if MOVIL else '1k'
TEXS = {'granito': [('rock_boulder_dry', 1.8), ('rock_08', 1.5)], 'caliza': [('marble_cliff_01', 4.3)], 'oscura': [('seaside_rock', 2.0)], 'neutra': [('rock_surface', 2.0)]}[TIPO]
MATS = [(rocas.material_escaneado(f'{TIPO}_{i}', t, tam=TAM), t, lado) for i, (t, lado) in enumerate(TEXS)]
def canto(nombre, r, cortes):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r)
    for v in bm.verts: v.co.x *= R.uniform(1.0, 1.3); v.co.y *= R.uniform(0.85, 1.1); v.co.z *= R.uniform(0.6, 0.8)
    for _ in range(cortes):
        n = Vector((R.uniform(-1, 1), R.uniform(-1, 1), R.uniform(-.6, .6))).normalized()
        g = bm.verts[:] + bm.edges[:] + bm.faces[:]; c = bmesh.ops.bisect_plane(bm, geom=g, plane_co=n * r * R.uniform(.62, .85), plane_no=n, clear_outer=True)
        bmesh.ops.holes_fill(bm, edges=[e for e in c['geom_cut'] if isinstance(e, bmesh.types.BMEdge)], sides=0)
    g = bm.verts[:] + bm.edges[:] + bm.faces[:]; c = bmesh.ops.bisect_plane(bm, geom=g, plane_co=Vector((0, 0, -r * 0.45)), plane_no=Vector((0, 0, -1)), clear_outer=True)   # base plana
    bmesh.ops.holes_fill(bm, edges=[e for e in c['geom_cut'] if isinstance(e, bmesh.types.BMEdge)], sides=0)
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new(nombre, me); bpy.context.collection.objects.link(o); return o
objs = []
for k in range(10):
    m, t, lado = MATS[1 if (len(MATS) > 1 and k in (1, 5, 8)) else 0]
    if k < 4: o = rocas.bloque(R, f'roca{k}', (R.uniform(0.9, 1.2), R.uniform(0.7, 0.95), R.uniform(0.55, 0.8)), cortes=R.randint(5, 8), mat=m, pintar=False, uv=lado)
    elif k < 7: o = rocas.bloque(R, f'roca{k}', (R.uniform(1.2, 1.5), R.uniform(0.8, 1.0), R.uniform(0.22, 0.35)), cortes=R.randint(3, 5), mat=m, pintar=False, uv=lado)
    else: o = canto(f'roca{k}', 0.55, R.randint(2, 4)); o.data.materials.append(m); rocas.uv_caja(o, R, lado)
    bpy.context.view_layer.update()
    zmin = min(v.co.z for v in o.data.vertices); bb = [v.co for v in o.data.vertices]
    cx = (max(v.x for v in bb) + min(v.x for v in bb)) / 2; cy = (max(v.y for v in bb) + min(v.y for v in bb)) / 2
    for v in o.data.vertices: v.co -= Vector((cx, cy, zmin))
    o.location = (k * 2.0, 0, 0)   # separadas solo para verlas; la web usa la geometría (cada malla en su origen)
    rocas.relieve(o, t, 0.035 if k < 7 else 0.03, 2); objs.append(o)
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_colors=False, export_attributes=False, export_image_format='AUTO')
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
print('OK', TIPO, OUT, round(os.path.getsize(OUT) / 1024), 'KB')

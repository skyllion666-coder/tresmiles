#!/usr/bin/env python3
"""Elementos de la cima del Aneto, a partir de dos fotografías de la cumbre aportadas por el usuario (octubre de 2026):
- Cruz de chapa de aluminio remachada (brazos anchos y planos, placa central octogonal con el crismón, medallón en el palo, inscripciones
  «PROTEGE DOMINE PLEBEM TUAM / PER SIGNUM SANCTÆ CRUCIS» y «1876 1951»), sujeta con cuatro vientos de cable y calzada con piedras.
- Columna metálica cilíndrica sobre basamento cuadrado con placa, coronada por una pequeña imagen de la Virgen (oscura).
- Poste-placa metálico rectangular junto a la cruz.
Medidas estimadas a ojo con las fotos (aproximación): cruz ~2,9 m, columna ~2,4 m. Inscripciones no modeladas (ilegibles a la distancia del mapa).
Unidades: metros, Z arriba, origen en el centro de la base. Uso: blender -b --python tools/modelos/cima_aneto.py -- models/cima-aneto.glb [vista.png]"""
import bpy, bmesh, math, sys, random
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-aneto.glb'; PREV = args[1] if len(args) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
R = random.Random(3404)
def mat(n, c, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(n); m.use_nodes = True; m.diffuse_color = (*c, 1)
    b = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal; return m
M_ALU = mat('aluminio', (0.58, 0.59, 0.60), 0.5, 0.15); M_ALU2 = mat('aluminio_oscuro', (0.36, 0.37, 0.38), 0.55, 0.15)   # metalizado bajo: la web no tiene mapa de entorno y el metal puro saldría negro
M_INOX = mat('inox', (0.66, 0.67, 0.70), 0.35, 0.2); M_BRONCE = mat('bronce', (0.10, 0.08, 0.06), 0.6, 0.1)
M_CABLE = mat('cable', (0.10, 0.10, 0.10), 0.6, 0.1); M_PIEDRA = mat('granito', (0.36, 0.33, 0.29), 0.9); M_PIEDRA2 = mat('granito_claro', (0.48, 0.45, 0.40), 0.9)
M_HORM = mat('cemento', (0.42, 0.41, 0.39), 0.85)
def nuevo(n, bm, m, par):
    me = bpy.data.meshes.new(n); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new(n, me); bpy.context.collection.objects.link(o)
    o.data.materials.append(m); o.parent = par; return o
def caja(n, s, p, m, par, rot=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=s, verts=bm.verts)
    if rot: bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(bm, vec=p, verts=bm.verts); return nuevo(n, bm, m, par)
def cil(n, r1, r2, h, p, m, par, seg=16):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=h); bmesh.ops.translate(bm, vec=p, verts=bm.verts); return nuevo(n, bm, m, par)
def raiz(n):
    e = bpy.data.objects.new(n, None); bpy.context.collection.objects.link(e); return e
def piedras(n, par, cx, cy, rad, num, hmax, m):
    bm = bmesh.new()
    for k in range(num):
        a = R.uniform(0, 6.283); d = rad * math.sqrt(R.random()); s = R.uniform(0.12, 0.32)
        g = bmesh.new(); bmesh.ops.create_icosphere(g, subdivisions=1, radius=1)
        for v in g.verts: v.co *= R.uniform(0.8, 1.15)
        bmesh.ops.scale(g, vec=(s * R.uniform(1, 1.5), s, s * R.uniform(0.55, 0.85)), verts=g.verts)
        bmesh.ops.rotate(g, verts=g.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(R.uniform(0, 6.28), 3, 'Z'))
        bmesh.ops.translate(g, vec=(cx + d * math.cos(a), cy + d * math.sin(a), hmax * (1 - d / rad) * R.uniform(0.5, 1) + s * 0.3), verts=g.verts)
        me = bpy.data.meshes.new('t'); g.to_mesh(me); g.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    return nuevo(n, bm, m, par)

# ---------- cruz ----------
C = raiz('Cruz')
H, W, A = 2.9, 2.0, 0.30   # alto, ancho de brazos, ancho de la chapa
caja('palo', (A * 0.85, 0.06, H), (0, 0, H / 2), M_ALU, C)
caja('brazos', (W, 0.06, A * 0.8), (0, 0, H * 0.74), M_ALU, C)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.30, radius2=0.30, depth=0.075)   # placa central octogonal
bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X') @ Matrix.Rotation(math.pi / 8, 3, 'Z'))
bmesh.ops.translate(bm, vec=(0, 0, H * 0.74), verts=bm.verts); nuevo('placa', bm, M_ALU, C)
for a in (0.78, -0.78):   # crismón en relieve (X y P esquemáticas)
    caja(f'x{a}', (0.035, 0.02, 0.42), (0, -0.05, H * 0.74), M_ALU2, C, Matrix.Rotation(a, 3, 'Y'))
caja('rho', (0.035, 0.02, 0.44), (0, -0.05, H * 0.74), M_ALU2, C)
cil('medallon', 0.08, 0.08, 0.03, (0, 0, 0), M_ALU2, C, 14).rotation_euler = (math.pi / 2, 0, 0)
bpy.data.objects['medallon'].location = (0, -0.045, 0.85)
for k, (x, z) in enumerate([(-0.95, 0), (0.95, 0), (0, 0.13), (0, -0.13)]):   # remaches del borde (filas)
    pass
for sx in (-1, 1):   # cuatro vientos de cable desde el palo hasta el suelo
    for sy in (-1, 1):
        a = Vector((0, 0, 1.25)); b = Vector((sx * 1.05, sy * 0.95, 0.02)); d = b - a
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=5, radius1=0.008, radius2=0.008, depth=d.length)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix())
        bmesh.ops.translate(bm, vec=(a + b) / 2, verts=bm.verts); nuevo(f'viento{sx}{sy}', bm, M_CABLE, C)
piedras('calzo', C, 0, 0, 0.75, 34, 0.32, M_PIEDRA); piedras('calzo2', C, 0, 0, 0.6, 12, 0.25, M_PIEDRA2)
# poste-placa al lado
caja('poste_placa', (0.30, 0.10, 1.05), (-1.15, 0.25, 0.52), M_INOX, C); caja('placa_top', (0.36, 0.14, 0.04), (-1.15, 0.25, 1.06), M_INOX, C, Matrix.Rotation(-0.35, 3, 'X'))

# ---------- columna con la Virgen ----------
V = raiz('Columna')
caja('basamento', (0.72, 0.72, 0.28), (0, 0, 0.14), M_INOX, V); caja('placa_bas', (0.36, 0.01, 0.12), (0, -0.365, 0.15), M_BRONCE, V)
cil('fuste', 0.17, 0.17, 1.85, (0, 0, 0.28 + 0.925), M_INOX, V, 24)
cil('collarin', 0.19, 0.19, 0.06, (0, 0, 2.16), M_INOX, V, 24)
cil('peana', 0.10, 0.075, 0.08, (0, 0, 2.23), M_BRONCE, V, 12)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.085, radius2=0.04, depth=0.26)   # manto
bmesh.ops.translate(bm, vec=(0, 0, 2.40), verts=bm.verts); nuevo('virgen_manto', bm, M_BRONCE, V)
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.045); bmesh.ops.translate(bm, vec=(0, 0, 2.56), verts=bm.verts); nuevo('virgen_cabeza', bm, M_BRONCE, V)
piedras('base_col', V, 0, 0, 0.75, 14, 0.12, M_PIEDRA)

for o in bpy.data.objects:
    if o.type == 'MESH':
        for p in o.data.polygons: p.use_smooth = o.name in ('fuste', 'collarin')
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True)
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
print('OK', OUT, sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
if PREV:
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x, sc.render.resolution_y = 900, 560; sc.display.shading.color_type = 'MATERIAL'
    V.location = (2.6, 1.2, 0)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
    cam.location = (0.6, -6.5, 1.7); d = Vector((1.2, 0.5, 1.4)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = PREV; bpy.ops.render.render(write_still=True)

#!/usr/bin/env python3
"""Elementos de la cima del Monte Perdido, a partir de fotografías de la cumbre aportadas por el usuario (octubre de 2026):
- Vértice geodésico del IGN (n.º 14660): pilar roto sobre su base. Medidas de la reseña del IGN: pilar de 1,20 m de alto y 0,30 m
  de diámetro; último cuerpo de 0,20 m de alto y 1,00 m de ancho. En la foto la parte alta está partida en bisel.
- Mojón (montón de piedras de caliza) alargado, de ~4,5 × 3 m y ~1,3 m de alto.
- Buzón de cumbre sobre el mojón: bandeja de acero con 4 patas, caja con cristal debajo, y siluetas de acero corten encima
  (simplificadas: una luna, un sarrio con cuernos y una figura alta), con algunas cintas de colores.
Las medidas del mojón y del buzón están estimadas a ojo con las fotos (aproximación). Unidades: metros. Z arriba; cada objeto tiene
su origen en el centro de su base, para apoyarlo en el relieve.
Uso: blender -b --python tools/modelos/cima_perdido.py -- models/cima-perdido.glb [vista_previa.png]"""
import bpy, bmesh, math, sys, random
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-perdido.glb'; PREV = args[1] if len(args) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
R = random.Random(14660)

def mat(nombre, col, rough=0.85, metal=0.0, alpha=1.0):
    m = bpy.data.materials.new(nombre); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND'
    return m
M_HORM = mat('hormigon', (0.42, 0.41, 0.38)); M_HORM2 = mat('hormigon_base', (0.30, 0.29, 0.27))   # colores en lineal
M_CAL = mat('caliza', (0.24, 0.24, 0.23)); M_CAL2 = mat('caliza_clara', (0.36, 0.355, 0.33))
M_INOX = mat('inox', (0.75, 0.76, 0.78), 0.35, 0.9); M_CORTEN = mat('corten', (0.24, 0.12, 0.07), 0.8, 0.4)
M_VIDRIO = mat('vidrio', (0.75, 0.82, 0.85), 0.1, 0.0, 0.35)
M_CINTAS = [mat(f'cinta{i}', c, 0.9) for i, c in enumerate([(0.75, 0.12, 0.08), (0.10, 0.45, 0.15), (0.15, 0.40, 0.75), (0.85, 0.75, 0.15)])]

def nuevo(nombre, bm, m, parent=None):
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nombre, me); bpy.context.collection.objects.link(o); o.data.materials.append(m)
    if parent: o.parent = parent
    return o
def caja(nombre, sx, sy, sz, pos, m, parent=None, rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(pos) @ (Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')), verts=bm.verts)
    return nuevo(nombre, bm, m, parent)
def cil(nombre, r, h, pos, m, parent=None, seg=8):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    bmesh.ops.translate(bm, vec=pos, verts=bm.verts); return nuevo(nombre, bm, m, parent)
def raiz(nombre):
    e = bpy.data.objects.new(nombre, None); bpy.context.collection.objects.link(e); return e

# ---------- 1. vértice geodésico roto ----------
V = raiz('Vertice')
bm = bmesh.new()   # base de cemento irregular (en la foto, bloque desconchado bajo el último cuerpo)
bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(1.35, 1.25, 0.4), verts=bm.verts); bmesh.ops.translate(bm, vec=(0, 0, 0.12), verts=bm.verts)
bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2)
for v in bm.verts: v.co += Vector((R.uniform(-.07, .07), R.uniform(-.07, .07), R.uniform(-.05, .04) if v.co.z > 0 else 0))
nuevo('base_cemento', bm, M_HORM2, V)
caja('ultimo_cuerpo', 1.0, 1.0, 0.2, Vector((0, 0, 0.42)), M_HORM, V)
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.30, 0.30, 1.20), verts=bm.verts); bmesh.ops.translate(bm, vec=(0, 0, 0.52 + 0.6), verts=bm.verts)
for v in bm.verts:   # rotura en bisel de la parte alta
    if v.co.z > 1.5: v.co.z -= 0.18 * (v.co.x + 0.15) / 0.3 + (0.05 if v.co.y > 0 else 0)
nuevo('pilar', bm, M_HORM, V)

# ---------- 2. mojón de piedras ----------
Mj = raiz('Mojon')
def piedra(bm, centro, s, plano):
    g = bmesh.new(); bmesh.ops.create_icosphere(g, subdivisions=1, radius=1)
    for v in g.verts: v.co *= R.uniform(0.75, 1.15)
    bmesh.ops.scale(g, vec=(s * R.uniform(0.9, 1.4), s * R.uniform(0.8, 1.2), s * plano), verts=g.verts)
    bmesh.ops.rotate(g, verts=g.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(R.uniform(0, 6.28), 3, 'Z') @ Matrix.Rotation(R.uniform(-.3, .3), 3, 'X'))
    bmesh.ops.translate(g, vec=centro, verts=g.verts)
    me = bpy.data.meshes.new('t'); g.to_mesh(me); g.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)
A, B, HM = 2.1, 1.35, 1.5
for clara, mm in ((False, M_CAL), (True, M_CAL2)):
    bm = bmesh.new(); z = 0.0
    while z < HM:
        f = math.sqrt(max(0.0, 1 - (z / HM) ** 2)); n = max(1, int(2 * math.pi * A * f / 0.42))
        for k in range(n):
            if (R.random() < 0.4) != clara: continue
            a = 2 * math.pi * (k + R.random() * 0.6) / n
            for capa in (1.0, 0.72):   # capa exterior y otra algo más adentro para que no se vea hueco
                r = capa * f; s = R.uniform(0.14, 0.34) * (1.25 if z < 0.3 else 1)
                piedra(bm, Vector((A * r * math.cos(a), B * r * math.sin(a), z + R.uniform(-.04, .06))), s, R.uniform(0.45, 0.8))
        z += 0.2
    for k in range(26 if not clara else 8):   # remate de la parte alta
        piedra(bm, Vector((R.uniform(-1.2, 1.2), R.uniform(-0.6, 0.6), HM - 0.05 + R.uniform(-.05, .05))), R.uniform(0.15, 0.3), 0.55)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    nuevo('piedras_claras' if clara else 'piedras', bm, mm, Mj)

# ---------- 3. buzón de cumbre (sobre el mojón) ----------
Bz = raiz('Buzon'); Bz.parent = Mj; Bz.location = (0.1, 0, HM - 0.08)
LX, LY, HL = 1.0, 0.55, 0.62
caja('bandeja', LX, LY, 0.025, Vector((0, 0, HL)), M_CORTEN, Bz)
caja('balda', LX * 0.9, LY * 0.9, 0.02, Vector((0, 0, 0.14)), M_CORTEN, Bz)
for sx in (-1, 1):
    for sy in (-1, 1): cil(f'pata{sx}{sy}', 0.018, HL + 0.08, Vector((sx * (LX / 2 - 0.05), sy * (LY / 2 - 0.05), (HL + 0.08) / 2 - 0.08)), M_INOX, Bz)
caja('caja_marco', 0.36, 0.3, 0.4, Vector((0.12, 0, 0.36)), M_INOX, Bz)
caja('caja_cristal', 0.33, 0.31, 0.37, Vector((0.12, 0, 0.36)), M_VIDRIO, Bz)
def silueta(nombre, pts, x, esc=1.0, grosor=0.012):
    bm = bmesh.new(); vs = [bm.verts.new((x + p[0] * esc, 0, HL + 0.012 + p[1] * esc)) for p in pts]
    f = bm.faces.new(vs); r = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=(0, grosor, 0), verts=[e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return nuevo(nombre, bm, M_CORTEN, Bz)
# luna creciente (izquierda)
luna = [(0.17 * math.cos(t) + 0, 0.17 * math.sin(t) + 0.2) for t in [math.radians(a) for a in range(60, 301, 20)]]
luna += [(0.12 * math.cos(t) + 0.06, 0.12 * math.sin(t) + 0.2) for t in [math.radians(a) for a in range(290, 69, -20)]]
silueta('luna', luna, -0.38)
# sarrio con cuernos (centro)
sarrio = [(-0.2, 0.0), (-0.17, 0.12), (-0.2, 0.2), (-0.1, 0.24), (0.08, 0.24), (0.12, 0.3), (0.1, 0.4), (0.14, 0.44), (0.16, 0.36), (0.19, 0.3), (0.24, 0.26), (0.2, 0.2), (0.13, 0.17), (0.12, 0.0), (0.08, 0.0), (0.06, 0.13), (-0.08, 0.13), (-0.1, 0.0)]
silueta('sarrio', sarrio, -0.05)
# figura alta con travesaños (derecha), coronada por una cabeza de ave
fig = [(-0.07, 0.0), (-0.07, 0.55), (-0.13, 0.62), (-0.05, 0.66), (0.0, 0.74), (0.06, 0.7), (0.12, 0.72), (0.07, 0.62), (0.07, 0.0), (0.03, 0.0), (0.03, 0.5), (-0.03, 0.5), (-0.03, 0.0)]
silueta('figura', fig, 0.33)
caja('travesano1', 0.26, 0.012, 0.03, Vector((0.33, 0.006, HL + 0.25)), M_CORTEN, Bz); caja('travesano2', 0.26, 0.012, 0.03, Vector((0.33, 0.006, HL + 0.42)), M_CORTEN, Bz)
for i in range(6):   # cintas y pañuelos atados a las patas
    sx, sy = (-1, 1)[i % 2], (-1, 1)[(i // 2) % 2]
    caja(f'cinta{i}', 0.05, 0.012, R.uniform(0.12, 0.25), Vector((sx * (LX / 2 - 0.03), sy * (LY / 2 - 0.05), R.uniform(0.2, 0.5))), M_CINTAS[i % 4], Bz, (0, R.uniform(-.3, .3), 0))

# ---------- exportación ----------
for o in bpy.data.objects:
    if o.type == 'MESH':
        bpy.context.view_layer.objects.active = o
        for p in o.data.polygons: p.use_smooth = False
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True)
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
kw = {k: v for k, v in kw.items() if k in opts}
bpy.ops.export_scene.gltf(**kw)
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('OK', OUT, 'caras', tris)
if PREV:
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x, sc.render.resolution_y = 900, 600
    sc.display.shading.color_type = 'MATERIAL'; sc.display.shading.light = 'STUDIO'
    Mj.location = (3.5, 4.0, 0); V.rotation_euler = (0, 0, 0.4)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
    cam.location = (-2.0, -5.5, 2.2); d = Vector((1.8, 2.4, 1.0)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = PREV; bpy.ops.render.render(write_still=True)

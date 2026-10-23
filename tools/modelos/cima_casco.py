#!/usr/bin/env python3
"""Cima del Casco de Marboré (3.006 m, caliza del Marboré), a partir de la foto de la cima de la ficha (img/hitos/casco-cima.jpg):
un hito alto y estrecho de bloques angulosos de caliza gris azulada (alguno pardo), de ~2 m, levantado sobre un montón bajo de piedras más ancho;
arriba, un tubo de metal oxidado cruzado entre las piedras. Alrededor, la cumbre es casi llana: lajas de los estratos y gravilla con bloques sueltos.
Medidas sacadas de la foto (tomando las piedras de las hileras por ~0,2 m): columna de ~0,85 m de ancho que se estrecha a ~0,55 arriba y montón de ~1,7 m de ancho.
Unidades: metros. Z arriba; origen en el centro del hito, a ras de suelo. Frente (la cara de la foto) = -Y.
Piezas: «hito_*» (unido en una malla por material) y «tubo» van juntas; «caidaN» y «bloqueN» son sueltas (la web las asienta en el relieve).
Texturas: caliza_gris y caliza_parda (derivadas de rock_surface de Poly Haven, CC0; ver ~/tresmiles-fuentes/texturas/LEEME.txt).
Uso: blender -b --python tools/modelos/cima_casco.py -- /tmp/cima-casco.glb [vista.png]
  y después: npx -y @gltf-transform/cli@4 meshopt /tmp/cima-casco.glb models/cima-casco.glb --level medium"""
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rocas
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-casco.glb'; PREV = args[1] if len(args) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
R = random.Random(3006)
M_GRIS = rocas.material_escaneado('caliza_gris', 'caliza_gris', rough=0.9, tam='1k', tam_nor='512')
M_PARDA = rocas.material_escaneado('caliza_parda', 'caliza_parda', rough=0.9, tam='512')
V = bpy.data.objects.new('Vertice', None); bpy.context.collection.objects.link(V)

def piedra(nombre, tam, pos, rotz, mat, incl=0.12, cortes=4):
    """Bloque anguloso de caliza (rocas.bloque) con las aristas apenas gastadas."""
    o = rocas.bloque(R, nombre, tam, pos, (R.uniform(-incl, incl), R.uniform(-incl, incl), rotz), cortes=cortes, mat=mat, pintar=False, uv=1.4)
    b = o.modifiers.new('gastada', 'BEVEL'); b.width = min(tam) * 0.12; b.segments = 1; b.limit_method = 'ANGLE'
    return o
color = lambda: M_PARDA if R.random() < 0.15 else M_GRIS
hito = []
def hilera(z, h, r, largo, fondo):
    """Una vuelta de piedras con el lado largo por fuera, a radio r; devuelve cuántas puso."""
    a = R.uniform(0, math.tau); fin = a + math.tau - 0.1; n = 0
    while a < fin:
        L = R.uniform(*largo) * (1 if r > 0.3 else 0.75); f = R.uniform(*fondo); hh = h * R.uniform(0.7, 1.1); da = L * 0.9 / max(r, 0.15)
        ac = a + da / 2; rr = max(0.0, r - f / 2 + R.uniform(-0.03, 0.06))
        hito.append(piedra(f'hito_{len(hito)}', (L, f, hh), (rr * math.cos(ac), rr * math.sin(ac), z + hh / 2 + R.uniform(-0.02, 0.02)), ac + math.pi / 2 + R.uniform(-0.3, 0.3), color()))
        a += da + R.uniform(0.0, 0.08); n += 1
    return n
# — montón bajo y ancho de la base (en la foto sobresale por los lados, sobre todo a la derecha) —
z = 0.0
for k, (r, h) in enumerate(((0.85, 0.16), (0.72, 0.15), (0.6, 0.14))):
    hilera(z, h, r, (0.25, 0.45), (0.25, 0.4)); z += h * 0.85
caidas = []
for k in range(18):   # piedras caídas del montón hacia fuera, apoyadas en la base (más a la derecha, como en la foto)
    a = R.gauss(0.2, 1.2) if k < 10 else R.uniform(0, math.tau); rr = R.uniform(0.85, 1.3); s = R.uniform(0.18, 0.32)
    caidas.append(piedra(f'caida{k}', (s * 1.4, s, s * 0.7), (rr * math.cos(a), rr * math.sin(a), s * 0.3), R.uniform(0, 3), color(), 0.3))   # sueltas: la web apoya cada una en el relieve
# — columna: casi recta, de 0,85 a 0,55 m de ancho —
ALTO = 2.0
while z < ALTO - 0.25:
    t = (z - 0.4) / (ALTO - 0.4); h = R.uniform(0.15, 0.27)
    hilera(z, h, 0.48 - 0.16 * t, (0.24, 0.42), (0.24, 0.36)); z += h * 0.85
# — remate: tres o cuatro bloques más grandes, uno de canto, y el tubo oxidado cruzado —
for k, (x, y, s, rot) in enumerate(((0.05, 0.02, 0.3, 0.3), (-0.12, -0.05, 0.22, 1.2), (0.14, -0.08, 0.2, 2.0))):
    hito.append(piedra(f'hito_{len(hito)}', (s * 1.2, s, s * 0.9), (x, y, z + s * 0.4), rot, color(), 0.25))
hito.append(piedra(f'hito_{len(hito)}', (0.3, 0.2, 0.36), (0.08, 0.04, z + 0.42), 0.4, M_GRIS, 0.15))   # el bloque de arriba del todo, de canto
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.5, radius2=0.14, depth=z); bmesh.ops.translate(bm, vec=(0, 0, z / 2), verts=bm.verts)   # relleno por dentro (se ve oscuro entre las piedras)
me = bpy.data.meshes.new('hito_nucleo'); bm.to_mesh(me); bm.free(); nucleo = bpy.data.objects.new('hito_nucleo', me); bpy.context.collection.objects.link(nucleo); nucleo.data.materials.append(M_GRIS); rocas.uv_caja(nucleo, R, 1.4); hito.append(nucleo)
m_oxido = bpy.data.materials.new('tubo_oxidado'); m_oxido.use_nodes = True; b = next(x for x in m_oxido.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
b.inputs['Base Color'].default_value = (0.11, 0.065, 0.055, 1); b.inputs['Roughness'].default_value = 0.85; b.inputs['Metallic'].default_value = 0.2
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=14, radius1=0.06, radius2=0.06, depth=0.62)
bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.006)
bmesh.ops.transform(bm, matrix=Matrix.Translation((-0.12, -0.16, z + 0.1)) @ Matrix.Rotation(0.5, 4, 'Z') @ Matrix.Rotation(1.15, 4, 'Y'), verts=bm.verts)   # inclinado, sube hacia la izquierda
me = bpy.data.meshes.new('tubo'); bm.to_mesh(me); bm.free(); tubo = bpy.data.objects.new('tubo', me); bpy.context.collection.objects.link(tubo); tubo.data.materials.append(m_oxido)
for p in me.polygons: p.use_smooth = True
alto_hito = z + 0.6
# — bloques sueltos alrededor y lajas planas de los estratos —
sueltos = []
for k in range(16):
    a = R.uniform(0, math.tau); rr = R.uniform(1.3, 2.1); s = R.uniform(0.2, 0.45); plana = R.random() < 0.4
    tam = (s * 1.8, s * 1.3, s * 0.3) if plana else (s * R.uniform(1.0, 1.5), s * R.uniform(0.7, 1.0), s * R.uniform(0.5, 0.8))
    o = rocas.bloque(R, f'bloque{k}', tam, (rr * math.cos(a), rr * math.sin(a), tam[2] * 0.3), (R.uniform(-.15, .15), R.uniform(-.15, .15), R.uniform(0, 3)), cortes=5, mat=color(), pintar=False, uv=1.4)
    sueltos.append(o)
for o in sueltos: rocas.relieve(o, 'rock_surface', 0.03, 1)
# todo aplicado; el hito se une en una malla por material
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.convert(target='MESH')
for mat in (M_GRIS, M_PARDA):
    grupo = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('hito_') and o.data.materials[0] == mat]
    if not grupo: continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in grupo: o.select_set(True)
    bpy.context.view_layer.objects.active = grupo[0]; bpy.ops.object.join(); grupo[0].name = 'hito_' + mat.name
for o in bpy.data.objects:
    if o.type == 'MESH': mw = o.matrix_world.copy(); o.parent = V; o.matrix_world = mw
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_colors=False, export_attributes=False, export_image_format='AUTO')
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
print('OK', OUT, round(os.path.getsize(OUT) / 1024), 'KB', 'caras', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'), 'piedras', len(hito), 'sueltos', len(sueltos), 'alto', round(alto_hito, 2))
if PREV:   # vista como la foto: de frente, un poco por debajo de la parte de arriba, con cielo de niebla
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = 900, 450
    w = bpy.data.worlds.new('niebla'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.76, 0.78, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.6
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=10); me = bpy.data.meshes.new('suelo'); bm.to_mesh(me); bm.free()
    s = bpy.data.objects.new('suelo', me); bpy.context.collection.objects.link(s); s.data.materials.append(M_GRIS); rocas.uv_caja(s, R, 1.4)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 30
    cam.location = (-0.6, -5.2, 1.45); d = Vector((0.6, 0, 1.15)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = PREV; bpy.ops.render.render(write_still=True)

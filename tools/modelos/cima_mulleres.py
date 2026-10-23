#!/usr/bin/env python3
"""Cima del Pico de Mulleres (3.010 m, granito del macizo de la Maladeta), a partir de la foto de la cima de la ficha (img/hitos/mul-cima.jpg):
un mojón grande de lajas de granito gris claro, de ~2,1 m de alto y ~1,5 m de ancho abajo, con los lados casi rectos y la parte de arriba redondeada
con algunas piedras de canto; las lajas van tumbadas, con el lado largo por fuera, y entre ellas quedan huecos oscuros. Alguna es más ocre (oxidada).
En la cara delantera, a ~1,4 m, una piedra parda con «PIC DE / MULLERES / 3009» escrito a rotulador, y a su izquierda otra más pequeña con «PIC MULL».
Alrededor, bloques de granito redondeados por la erosión.
Medidas sacadas de la foto: el mojón ocupa ~430 px de ancho abajo y ~600 px de alto (1,5 m de ancho → ~2,1 m de alto).
Unidades: metros. Z arriba; origen en el centro del mojón, a ras de suelo. Frente (la cara de la foto, con el rótulo) = -Y.
Piezas: «mojon_*» (el mojón, unido en una malla por material) y «placa_*» (las piedras escritas) van juntas; «bloqueN» son sueltas (la web las asienta en el relieve).
Uso: blender -b --python tools/modelos/cima_mulleres.py -- /tmp/cima-mulleres.glb [vista.png]
  y después: npx -y @gltf-transform/cli@4 meshopt /tmp/cima-mulleres.glb models/cima-mulleres.glb --level medium"""
import bpy, bmesh, math, sys, os, random, subprocess
from mathutils import Vector, Matrix
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
import rocas
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-mulleres.glb'; PREV = args[1] if len(args) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
R = random.Random(3010)
M_GRIS = rocas.material_escaneado('granito_gris', 'rock_boulder_dry', tam='1k', tam_nor='512')   # granito gris claro con líquenes (Poly Haven, CC0)
M_OCRE = rocas.material_escaneado('granito_ocre', 'rock_08', tam='512')                          # las lajas oxidadas
V = bpy.data.objects.new('Vertice', None); bpy.context.collection.objects.link(V)

def laja(nombre, tam, pos, rotz, mat, incl=0.06):
    """Laja del mojón: bloque anguloso (rocas.bloque) con las aristas gastadas y el relieve escaneado."""
    o = rocas.bloque(R, nombre, tam, pos, (R.uniform(-incl, incl), R.uniform(-incl, incl), rotz), cortes=3, mat=mat, pintar=False, uv=1.6)
    b = o.modifiers.new('gastada', 'BEVEL'); b.width = min(tam) * 0.3; b.segments = 1; b.limit_method = 'ANGLE'   # granito redondeado por la erosión
    return o

# — el mojón: hileras de lajas alrededor de un núcleo, de abajo arriba —
ALTO = 2.1
radio = lambda z: 0.76 - 0.1 * (z / ALTO) - 0.36 * (z / ALTO) ** 4   # lados casi rectos hasta los dos tercios y arriba redondeado (contorno de la foto)
FRENTE = -math.pi / 2                                                     # ángulo de la cara con el rótulo (-Y)
ZP = 1.36                                                                  # altura del centro de la piedra escrita
mojon = []; z = 0.0; capa = 0
while z < ALTO - 0.2:
    h = R.uniform(0.11, 0.22); r = radio(z + h / 2); a = R.uniform(0, math.tau); fin = a + math.tau - 0.15
    while a < fin:
        L = R.uniform(0.24, 0.58) * (1 if r > 0.45 else 0.8); fondo = R.uniform(0.24, 0.38); da = (L * 0.9) / r
        ac = a + da / 2; dif = (ac - FRENTE + math.pi) % math.tau - math.pi
        hueco_placa = abs(dif) < 0.42 and abs(z + h / 2 - ZP) < 0.24 + h / 2 or abs(dif + 0.62) < 0.22 and abs(z + h / 2 - (ZP - 0.18)) < 0.07 + h / 2
        if not hueco_placa:
            rr = r - fondo / 2 + R.uniform(-0.04, 0.07)   # unas salen más que otras: el contorno no es liso
            mat = M_OCRE if R.random() < 0.06 else M_GRIS
            plana = R.random() < 0.5   # la mitad, lajas planas y más largas; el resto, bloques gruesos
            hh = h * (R.uniform(0.5, 0.7) if plana else R.uniform(0.8, 1.1)); L *= 1.25 if plana else 1
            mojon.append(laja(f'mojon_{len(mojon)}', (L, fondo, hh), (rr * math.cos(ac), rr * math.sin(ac), z + hh / 2 + R.uniform(-0.02, 0.03)), ac + math.pi / 2 + R.uniform(-0.25, 0.25), mat, 0.14))
        a += da + R.uniform(0.0, 0.06)
    z += h * 0.88; capa += 1
# arriba, redondeado: unas piedras de canto y alguna tumbada, más altas en medio
for k in range(9):
    a = R.uniform(0, math.tau); rr = R.uniform(0.0, 0.24); s = R.uniform(0.16, 0.3)
    mojon.append(laja(f'mojon_{len(mojon)}', (s * 1.3, s * R.uniform(0.6, 0.9), s * R.uniform(0.6, 1.0)), (rr * math.cos(a), rr * math.sin(a), z + 0.05 + (0.24 - rr) * 0.4), R.uniform(0, 3), M_GRIS, 0.5))
# núcleo: relleno de piedra por dentro (se ve oscuro por los huecos entre lajas)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=radio(0) - 0.16, radius2=radio(ALTO) - 0.12, depth=ALTO - 0.05)
bmesh.ops.translate(bm, vec=(0, 0, (ALTO - 0.05) / 2), verts=bm.verts); me = bpy.data.meshes.new('mojon_nucleo'); bm.to_mesh(me); bm.free()
nucleo = bpy.data.objects.new('mojon_nucleo', me); bpy.context.collection.objects.link(nucleo); nucleo.data.materials.append(M_GRIS); rocas.uv_caja(nucleo, R, 1.6); mojon.append(nucleo)

# — las piedras escritas: la textura sale de rotulo_piedra.py (letras a rotulador sobre la roca escaneada) —
TMP = os.path.join(os.path.dirname(OUT) or '.', 'rotulos'); os.makedirs(TMP, exist_ok=True)
def placa(nombre, texto, tam, pos, rot, tinte, ancho_img=1024):
    img = os.path.join(TMP, f'{nombre}.jpg'); sx, sy, sz = tam
    subprocess.run(['python3', os.path.join(AQUI, 'rotulo_piedra.py'), f'{rocas.TEX}/web/rock_boulder_dry_diff_1k.jpg', img, texto, str(ancho_img), str(int(ancho_img * sz / sx)), tinte], check=True)
    m = bpy.data.materials.new(nombre); m.use_nodes = True; nt = m.node_tree; b = next(x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(img); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=tam, verts=bm.verts)
    for v in bm.verts:   # cara de delante algo abombada y contorno irregular, como una piedra y no una caja
        v.co.x *= R.uniform(0.9, 1.05); v.co.z *= R.uniform(0.88, 1.05)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(tam) * 0.25, segments=3, affect='EDGES')
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:   # la cara de delante (-Y) lleva la imagen entera; el resto, un trozo del margen (sin letras)
        for l in f.loops:
            x, y, zz = l.vert.co
            if f.normal.y < -0.5: l[uv].uv = (0.5 + x / sx, 0.5 + zz / sz)
            else: l[uv].uv = (0.02 + 0.1 * (0.5 + (x if abs(f.normal.x) < 0.5 else y) / max(sx, sy)), 0.02 + 0.1 * (0.5 + zz / sz))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(pos) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Rotation(rot[1], 4, 'Y'), verts=bm.verts)
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(nombre, me); bpy.context.collection.objects.link(o); o.data.materials.append(m); return o
r = radio(ZP)
placa('placa_mulleres', 'PIC DE|MULLERES|3009', (0.5, 0.3, 0.4), (0.04, -r + 0.06, ZP), (-0.1, 0.1, 0.0), '1.08,0.98,0.86')   # sobresale un poco y mira algo hacia arriba
r = radio(ZP - 0.18)
placa('placa_mull', 'PIC|MULL', (0.3, 0.2, 0.13), ((r - 0.08) * math.cos(FRENTE - 0.62), (r - 0.08) * math.sin(FRENTE - 0.62), ZP - 0.18), (0.0, 0.05, -0.62), '1.25,1.22,1.18', 512)

# — bloques de granito sueltos alrededor, redondeados por la erosión —
sueltos = []
for k in range(12):
    a = R.uniform(0, math.tau); rr = R.uniform(1.35, 2.8); s = R.uniform(0.35, 0.85)
    if math.sin(a) < -0.6 and rr < 2.0: continue   # delante no tapan el rótulo
    o = rocas.bloque(R, f'bloque{k}', (s * R.uniform(1.0, 1.5), s * R.uniform(0.8, 1.1), s * R.uniform(0.5, 0.8)), (rr * math.cos(a), rr * math.sin(a), s * 0.2), (R.uniform(-.2, .2), R.uniform(-.2, .2), R.uniform(0, 3)), cortes=5, mat=M_GRIS, pintar=False, uv=1.8)
    b = o.modifiers.new('gastada', 'BEVEL'); b.width = s * 0.18; b.segments = 2; b.limit_method = 'ANGLE'; sueltos.append(o)

# relieve escaneado (suave en las lajas; las placas casi nada para que se lean las letras); luego se aplica todo y el mojón se une en una malla por material
for o in sueltos: rocas.relieve(o, 'rock_boulder_dry', 0.04, 1)   # las lajas del mojón, solo con el mapa de normales (pesa menos)
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.convert(target='MESH')
for mat in (M_GRIS, M_OCRE):
    grupo = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('mojon_') and o.data.materials[0] == mat]
    if not grupo: continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in grupo: o.select_set(True)
    bpy.context.view_layer.objects.active = grupo[0]; bpy.ops.object.join(); grupo[0].name = 'mojon_' + mat.name
for o in bpy.data.objects:
    if o.type == 'MESH': mw = o.matrix_world.copy(); o.parent = V; o.matrix_world = mw
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_colors=False, export_attributes=False, export_image_format='AUTO')
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
print('OK', OUT, round(os.path.getsize(OUT) / 1024), 'KB', 'caras', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'), 'lajas', len(mojon), 'sueltos', len(sueltos))
if PREV:   # vista como la foto: desde delante y algo a la izquierda, a la altura de los ojos, con sol de mediodía
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = 800, 600
    w = bpy.data.worlds.new('cielo'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.68, 0.9, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    sol = bpy.data.objects.new('sol', bpy.data.lights.new('sol', 'SUN')); sol.data.energy = 4.5; sol.rotation_euler = (0.6, 0.3, 2.4); bpy.context.collection.objects.link(sol)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=8); me = bpy.data.meshes.new('suelo'); bm.to_mesh(me); bm.free()
    s = bpy.data.objects.new('suelo', me); bpy.context.collection.objects.link(s); s.data.materials.append(M_GRIS); rocas.uv_caja(s, R, 1.8)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 28
    cam.location = (0.9, -3.0, 1.75); d = Vector((0.15, 0, 1.15)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = PREV; bpy.ops.render.render(write_still=True)

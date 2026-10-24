"""Piezas comunes de las cimas hechas a partir de las fotos de las fichas (tools/modelos/cima_<id>.py; se importa dentro de Blender).
Mismo método que el Mulleres y el Casco: piedras de rocas.bloque con las aristas gastadas y texturas escaneadas (o derivadas, texturas_derivadas.py),
mojones por hileras alrededor de un núcleo, montones dejando caer cada piedra sobre lo que ya hay debajo, piedras escritas (rotulo_piedra.py)
y, al final, todo lo fijo unido en una malla por material (pocas llamadas de dibujo en la web) y las piedras sueltas aparte («bloqueN»/«caidaN»: la web
las apoya una a una en el relieve y oculta las que caerían en pendiente).
Unidades: metros. Z arriba; origen en el centro de la cima, a ras de suelo. Frente (la cara de la foto) = -Y."""
import bpy, bmesh, math, os, sys, random, subprocess
from mathutils import Vector, Matrix
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
import rocas
R = random.Random(0); V = None

def inicio(semilla):
    global R, V
    bpy.ops.wm.read_factory_settings(use_empty=True)
    R = random.Random(semilla)
    V = bpy.data.objects.new('Vertice', None); bpy.context.collection.objects.link(V)
    return R

def mat(nombre, tex, tam='1k', tam_nor='512', rough=0.88):
    """Material con la textura escaneada o derivada `tex` (color + normales)."""
    return rocas.material_escaneado(nombre, tex, rough=rough, tam=tam, tam_nor=tam_nor)

def mat_liso(nombre, color, rough=0.8, metal=0.0):
    m = bpy.data.materials.new(nombre); m.use_nodes = True; b = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal; return m

def piedra(nombre, tam, pos, rot, m, bisel=0.12, cortes=4, uv=1.5, incl=0.0):
    """Bloque anguloso (rocas.bloque) con las aristas gastadas (`bisel` × su lado menor). `rot` es el giro en Z o (rx, ry, rz)."""
    if not isinstance(rot, (tuple, list)): rot = (R.uniform(-incl, incl), R.uniform(-incl, incl), rot)
    o = rocas.bloque(R, nombre, tam, pos, rot, cortes=cortes, mat=m, pintar=False, uv=uv)
    if bisel:
        b = o.modifiers.new('gastada', 'BEVEL'); b.width = min(tam) * bisel; b.segments = 1; b.limit_method = 'ANGLE'
    return o

def fondo(o):
    bpy.context.view_layer.update(); mw = o.matrix_world
    return min((mw @ v.co).z for v in o.data.vertices)

def soltar(o, sobre, hundir=0.02, suelo=0.0):
    """Baja (o sube) la piedra `o` hasta que se apoye en lo más alto de `sobre` (o en el suelo) bajo su huella."""
    bpy.context.view_layer.update(); mw = o.matrix_world; pts = [mw @ v.co for v in o.data.vertices]
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts); y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
    zb = min(p.z for p in pts); apoyo = suelo
    for fx in (0.2, 0.5, 0.8):
        for fy in (0.2, 0.5, 0.8):
            x, y = x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy
            if sobre: apoyo = max(apoyo, rocas.apoyo(x, y, sobre))
    o.location.z += apoyo - zb - hundir; bpy.context.view_layer.update(); return o

def hilera(lista, prefijo, z, h, r, largo, hondo, color, salta=None, incl=0.12, bisel=0.12, cortes=4, uv=1.5):
    """Una vuelta de piedras alrededor del centro, a radio r, con el lado largo por fuera. `salta(angulo, z)` deja huecos (p. ej. para una placa)."""
    a = R.uniform(0, math.tau); fin = a + math.tau - 0.1
    while a < fin:
        L = R.uniform(*largo) * (1 if r > 0.3 else 0.75); f = R.uniform(*hondo); hh = h * R.uniform(0.7, 1.1); da = L * 0.9 / max(r, 0.15); ac = a + da / 2
        if not (salta and salta(ac, z + hh / 2)):
            rr = max(0.0, r - f / 2 + R.uniform(-0.03, 0.06))
            lista.append(piedra(f'{prefijo}{len(lista)}', (L, f, hh), (rr * math.cos(ac), rr * math.sin(ac), z + hh / 2 + R.uniform(-0.02, 0.02)), ac + math.pi / 2 + R.uniform(-0.3, 0.3), color(), bisel, cortes, uv, incl))
        a += da + R.uniform(0.0, 0.08)

def mojon(lista, prefijo, alto, radio, color, h=(0.13, 0.24), largo=(0.24, 0.42), hondo=(0.24, 0.36), salta=None, z0=0.0, **kw):
    """Mojón de hileras de piedras de abajo arriba; `radio(t)` da el radio a la altura relativa t (0 abajo, 1 arriba). Devuelve la altura alcanzada."""
    z = z0
    while z < alto - 0.15:
        hh = R.uniform(*h); hilera(lista, prefijo, z, hh, radio((z - z0) / (alto - z0)), largo, hondo, color, salta, **kw); z += hh * 0.86
    return z

def nucleo(lista, nombre, alto, r0, r1, m, z0=0.0):
    """Relleno por dentro de un mojón (se ve oscuro entre las piedras)."""
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=r0, radius2=r1, depth=alto - z0); bmesh.ops.translate(bm, vec=(0, 0, z0 + (alto - z0) / 2), verts=bm.verts)
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new(nombre, me); bpy.context.collection.objects.link(o); o.data.materials.append(m); rocas.uv_caja(o, R, 1.5); lista.append(o); return o

def monton(lista, prefijo, n, radio, tam, color, centro=(0.0, 0.0), plano=(0.5, 0.85), sobre=None, concentra=1.0, **kw):
    """Montón de n piedras: cada una cae en un punto al azar (más en el centro con `concentra` > 1) sobre lo que ya hay. tam = (mínimo, máximo) del lado mayor."""
    for k in range(n):
        a = R.uniform(0, math.tau); rr = radio * R.random() ** concentra; s = R.uniform(*tam)
        t = (s, s * R.uniform(0.6, 0.95), s * R.uniform(*plano))
        o = piedra(f'{prefijo}{len(lista)}', t, (centro[0] + rr * math.cos(a), centro[1] + rr * math.sin(a), 5.0), (R.uniform(-0.3, 0.3), R.uniform(-0.3, 0.3), R.uniform(0, math.tau)), color(), **kw)
        soltar(o, (sobre or []) + lista, hundir=0.03 * s); lista.append(o)

def placa(nombre, texto, tam, pos, rot, tex='rock_boulder_dry', tinte='1,1,1', tinta='18,18,20', ancho_img=1024, salida='/tmp', bisel=0.25, irregular=True, grueso=1.0):
    """Piedra con letras pintadas o escritas en la cara de delante (-Y). La textura la hace rotulo_piedra.py fuera de Blender (PIL)."""
    os.makedirs(salida, exist_ok=True); img = os.path.join(salida, f'{nombre}.jpg'); sx, sy, sz = tam
    subprocess.run(['python3', os.path.join(AQUI, 'rotulo_piedra.py'), f'{rocas.TEX}/web/{tex}_diff_1k.jpg', img, texto, str(ancho_img), str(int(ancho_img * sz / sx)), tinte, str(grueso), tinta], check=True, capture_output=True)
    m = bpy.data.materials.new(nombre); m.use_nodes = True; nt = m.node_tree; b = next(x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(img); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=tam, verts=bm.verts)
    if irregular:   # contorno de piedra y no de caja (True: poco; un número: cuánto)
        k = 0.1 if irregular is True else irregular
        for v in bm.verts: v.co.x *= R.uniform(1 - k, 1 + k / 2); v.co.y *= R.uniform(1 - k, 1 + k / 2); v.co.z *= R.uniform(1 - 1.2 * k, 1 + k / 2)
    if bisel: bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(tam) * bisel, segments=3, affect='EDGES')
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:   # la cara de delante lleva la imagen entera; las demás, un trozo del margen (sin letras)
        for l in f.loops:
            x, y, z = l.vert.co
            if f.normal.y < -0.5: l[uv].uv = (0.5 + x / sx, 0.5 + z / sz)
            else: l[uv].uv = (0.02 + 0.1 * (0.5 + (x if abs(f.normal.x) < 0.5 else y) / max(sx, sy)), 0.02 + 0.1 * (0.5 + z / sz))
    if not isinstance(rot, (tuple, list)): rot = (0, 0, rot)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(pos) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Rotation(rot[1], 4, 'Y'), verts=bm.verts)
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(nombre, me); bpy.context.collection.objects.link(o); o.data.materials.append(m); return o

def cerrar(OUT, PREV=None, unir=('hito_',), relieve=None, cam=((0.8, -4.5, 1.6), (0.2, 0, 0.9), 30), cielo=(0.55, 0.68, 0.9), fuerza_cielo=0.9, sol=True, suelo='rock_boulder_dry', res=(800, 600)):
    """Aplica todo, une lo fijo (nombres que empiezan por `unir`) en una malla por material, cuelga todo de «Vertice», exporta y, si se pide, hace una vista.
    relieve = (textura, fuerza): relieve escaneado de verdad en las piedras sueltas (las fijas van solo con el mapa de normales: pesan menos)."""
    if relieve:
        for o in [o for o in bpy.data.objects if o.type == 'MESH' and (o.name.startswith('bloque') or o.name.startswith('caida'))]: rocas.relieve(o, relieve[0], relieve[1], 1)
    for o in [o for o in bpy.data.objects if o.type == 'MESH']:
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.convert(target='MESH')
    for pref in unir:
        mats = {o.data.materials[0] for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(pref)}
        for m in mats:
            grupo = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(pref) and o.data.materials[0] == m]
            bpy.ops.object.select_all(action='DESELECT')
            for o in grupo: o.select_set(True)
            bpy.context.view_layer.objects.active = grupo[0]; bpy.ops.object.join(); grupo[0].name = f'{pref}{m.name}'
    for o in bpy.data.objects:
        if o.type == 'MESH': mw = o.matrix_world.copy(); o.parent = V; o.matrix_world = mw
    kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_colors=False, export_attributes=False, export_image_format='AUTO')
    opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
    mallas = [o for o in bpy.data.objects if o.type == 'MESH']
    alto = max((o.matrix_world @ v.co).z for o in mallas for v in o.data.vertices); ancho = max(max(abs((o.matrix_world @ v.co).x), abs((o.matrix_world @ v.co).y)) for o in mallas if not o.name.startswith(('bloque', 'caida')) for v in o.data.vertices)
    print('OK', OUT, round(os.path.getsize(OUT) / 1024), 'KB', 'caras', sum(len(o.data.polygons) for o in mallas), 'objetos', len(mallas), 'alto', round(alto, 2), 'radio fijo', round(ancho, 2))
    if PREV:
        sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 40; sc.cycles.use_denoising = False; sc.render.resolution_x, sc.render.resolution_y = res
        w = bpy.data.worlds.new('cielo'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (*cielo, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = fuerza_cielo
        if sol:
            s = bpy.data.objects.new('sol', bpy.data.lights.new('sol', 'SUN')); s.data.energy = 4.0; s.rotation_euler = (0.65, 0.3, 2.4); bpy.context.collection.objects.link(s)
        if suelo:
            bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12); me = bpy.data.meshes.new('suelo_vista'); bm.to_mesh(me); bm.free()
            g = bpy.data.objects.new('suelo_vista', me); bpy.context.collection.objects.link(g); g.data.materials.append(mat('suelo_vista', suelo, '512')); rocas.uv_caja(g, R, 1.6)
        c = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(c); sc.camera = c; c.data.lens = cam[2]
        c.location = cam[0]; d = Vector(cam[1]) - c.location; c.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = PREV; bpy.ops.render.render(write_still=True)

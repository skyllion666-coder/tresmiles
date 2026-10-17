#!/usr/bin/env python3
"""Quebrantahuesos (Gypaetus barbatus) en low-poly, con esqueleto y animaciones, para la web.

Uso (Blender sin ventana):
  blender -b --python tools/modelos/quebrantahuesos.py -- models/quebrantahuesos.glb [carpeta_vistas_previas]

Medidas reales aproximadas: envergadura 2,8 m, cuerpo ~1 m, cola larga en cuña.
Eje: el ave mira hacia -Y en Blender (= +Z en glTF), alas a lo largo de X, Z arriba.
Animaciones: «Planeo» (bucle 4 s, casi inmóvil) y «Aleteo» (bucle 2,2 s, lento).
"""
import bpy, bmesh, math, sys
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/quebrantahuesos.glb'
PREV = args[1] if len(args) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
FPS = 30
bpy.context.scene.render.fps = FPS

# ---------- paleta ----------
def srgb(c): return tuple(c)
C_TOP = (0.13, 0.10, 0.08)        # dorso pardo oscuro
C_WING_TOP = (0.11, 0.09, 0.08)
C_STRIPE = (0.36, 0.32, 0.28)     # cobertoras con estrías claras
C_WING_UND = (0.17, 0.13, 0.11)
C_WING_UND2 = (0.42, 0.24, 0.11)
C_ORANGE = (0.80, 0.36, 0.09)     # pecho y vientre anaranjados
C_ORANGE2 = (0.92, 0.55, 0.14)
C_HEAD = (0.93, 0.84, 0.50)
C_BEAK = (0.22, 0.22, 0.23)
C_EYE = (0.85, 0.12, 0.05)
C_BLACK = (0.02, 0.02, 0.02)
C_TAIL = (0.20, 0.17, 0.15)
C_TAIL_UND = (0.38, 0.27, 0.20)

# ---------- huesos (nombre -> índice del grupo de vértices) ----------
BONES = ['body', 'neck', 'head', 'tail'] + [f'wing_{p}.{s}' for s in 'LR' for p in ('arm', 'forearm', 'hand', 'tip')]
GI = {n: i for i, n in enumerate(BONES)}

bm = bmesh.new()
col_l = bm.loops.layers.color.new('Color')
dl = bm.verts.layers.deform.new()

def emit(pts, color, wf):
    """Añade una cara con vértices propios (aspecto facetado), color plano y pesos por vértice."""
    vs = []
    for p in pts:
        v = bm.verts.new(p)
        for g, w in wf(Vector(p)).items():
            if w > 1e-4: v[dl][GI[g]] = w
        vs.append(v)
    try: f = bm.faces.new(vs)
    except ValueError: return
    f.smooth = False
    for l in f.loops: l[col_l] = (*color, 1.0)

def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

# ---------- ala ----------
def ley(x): return -0.14 + 0.40 * (((x - 0.1) / 1.32)) ** 1.9
def chord(x):
    if x <= 0.95: return 0.50 - 0.04 * ((x - 0.1) / 0.85)
    u = (x - 0.95) / 0.47
    return 0.46 - 0.40 * u ** 0.85
def zspan(x): return 0.03 * (x - 0.1) + 0.10 * max(0.0, (x - 0.95) / 0.47) ** 2   # puntas algo levantadas
def camber(t): return 0.035 * math.sin(math.pi * t ** 0.8)

def wing_w(side):
    def f(p):
        x = abs(p.x); w = {}
        root = 1 - smooth(0.10, 0.22, x)
        if root > 0: w['body'] = root
        k = 1 - root
        a = 1 - smooth(0.52, 0.68, x)
        c = smooth(0.52, 0.68, x) - smooth(0.87, 1.03, x)
        h = smooth(0.87, 1.03, x)
        tp = h * smooth(1.15, 1.32, x)
        h -= tp
        for nm, v in (('arm', a), ('forearm', c), ('hand', h), ('tip', tp)):
            if v * k > 0: w[f'wing_{nm}.{side}'] = v * k
        return w
    return f

def build_wing():
    xs = [0.10 + 0.065 * i for i in range(14)] + [0.95]
    st = [(x, chord(x)) for x in xs]
    for j in range(7):                       # siete primarias, cada vez más cortas hacia la punta
        xt = 0.95 + 0.062 * (j + 0.7)
        xn = 0.95 + 0.062 * (j + 1.0)
        st.append((xt, chord(xt) + 0.09 - 0.006 * j))
        st.append((xn, chord(xn) - 0.075))
    st.append((1.42, 0.05))
    ts = [0.0, 0.22, 0.48, 0.74, 1.0]
    def P(x, ch, t, z0):
        return (x, ley(x) + t * ch, zspan(x) + camber(t) + z0)
    quads = []
    for k in range(len(st) - 1):
        (x0, c0), (x1, c1) = st[k], st[k + 1]
        for i in range(len(ts) - 1):
            quads.append((k, i, x0, c0, x1, c1, ts[i], ts[i + 1]))
    out = []
    for k, i, x0, c0, x1, c1, t0, t1 in quads:
        top = [P(x0, c0, t0, 0), P(x1, c1, t0, 0), P(x1, c1, t1, 0), P(x0, c0, t1, 0)]
        bot = [P(x0, c0, t0, -0.012), P(x1, c1, t0, -0.012), P(x1, c1, t1, -0.012), P(x0, c0, t1, -0.012)][::-1]
        # color de la cara superior por fila: borde de ataque oscuro, cobertoras estriadas, remeras oscuras
        if i == 0: ct = C_WING_TOP
        elif i in (1, 2) and 0.2 < x0 < 0.93 and k % 2 == 0: ct = C_STRIPE if i == 1 else (0.24, 0.21, 0.18)
        else: ct = C_WING_TOP
        cb = C_WING_UND2 if i in (0, 1) and x0 < 0.95 else C_WING_UND
        out.append((top, ct)); out.append((bot, cb))
    return out

for side in 'LR':
    sg = 1 if side == 'L' else -1
    for pts, c in build_wing():
        pts = [(sg * p[0], p[1], p[2]) for p in pts]
        if sg < 0: pts = pts[::-1]
        emit(pts, c, wing_w(side))

# ---------- cuerpo, cuello, cabeza, cola ----------
def prim(kind, loc, scale, colorf, wf, rot=None, **kw):
    t = bmesh.new()
    if kind == 'sphere': bmesh.ops.create_uvsphere(t, u_segments=kw.get('u', 10), v_segments=kw.get('v', 7), radius=1.0)
    else: bmesh.ops.create_cone(t, cap_ends=True, segments=kw.get('u', 8), radius1=kw.get('r1', 1.0), radius2=kw.get('r2', 0.0), depth=kw.get('d', 1.0))
    if rot: bmesh.ops.rotate(t, verts=t.verts, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.scale(t, vec=scale, verts=t.verts)
    bmesh.ops.translate(t, vec=loc, verts=t.verts)
    for v in t.verts:
        if kw.get('taper'): kw['taper'](v)
    t.normal_update()
    for f in t.faces:
        emit([tuple(v.co) for v in f.verts], colorf(f), wf)
    t.free()

from mathutils import Matrix
ROT_Y_TO_MINUS = Matrix.Rotation(math.radians(90), 3, 'X')   # eje del cono (Z) -> -Y... se ajusta abajo
ROT_FWD = Matrix.Rotation(math.radians(-90), 3, 'X')         # Z -> -Y... (cono apunta hacia -Y)

def body_taper(v):
    y = v.co.y
    if y > 0: f = 1 - 0.55 * (y / 0.40); v.co.x *= f; v.co.z *= max(f, 0.3)
body_w = lambda p: {'body': 1.0}
def body_col(f):
    n = f.normal
    if n.z > 0.30: return C_TOP
    return C_ORANGE2 if f.calc_center_median().y < -0.12 else C_ORANGE
prim('sphere', (0, 0, 0), (0.16, 0.40, 0.14), body_col, body_w, u=10, v=7, taper=body_taper)

# cuello: cono ancho en el pecho -> estrecho en la cabeza
def neck_w(p):
    t = smooth(-0.34, -0.46, p.y)
    return {'body': 1 - t, 'neck': t} if p.y > -0.46 else {'neck': 1.0}
prim('cone', (0, -0.40, 0.075), (1, 1, 1), lambda f: C_ORANGE2, neck_w, rot=ROT_FWD, r1=0.085, r2=0.050, d=0.16, u=8)

head_w = lambda p: {'head': 1.0}
prim('sphere', (0, -0.50, 0.095), (0.062, 0.075, 0.062), lambda f: C_HEAD, head_w, u=8, v=6)
prim('cone', (0, -0.585, 0.082), (1, 1, 1), lambda f: C_BEAK, head_w, rot=ROT_FWD, r1=0.03, r2=0.006, d=0.10, u=6)
prim('cone', (0, -0.615, 0.058), (1, 1, 1), lambda f: C_BEAK, head_w, rot=Matrix.Rotation(math.radians(200), 3, 'X'), r1=0.010, r2=0.0, d=0.04, u=5)
prim('cone', (0, -0.545, 0.035), (1, 1, 1), lambda f: C_BLACK, head_w, rot=Matrix.Rotation(math.radians(160), 3, 'X'), r1=0.016, r2=0.0, d=0.07, u=5)  # «barba»
for sx in (1, -1):
    prim('sphere', (sx * 0.037, -0.515, 0.100), (0.024, 0.026, 0.020), lambda f: C_BLACK, head_w, u=6, v=4)   # antifaz negro
    prim('sphere', (sx * 0.054, -0.522, 0.104), (0.014, 0.016, 0.014), lambda f: C_EYE, head_w, u=6, v=4)

# cola: cuña larga y puntiaguda, con arista central
tail_ys = [0.26, 0.45, 0.62, 0.90]
tail_hw = [0.08, 0.14, 0.125, 0.0]
def tail_w(p): return {'tail': smooth(0.22, 0.40, p.y), 'body': 1 - smooth(0.22, 0.40, p.y)}
for sg in (1, -1):
    for k in range(3):
        y0, y1, w0, w1 = tail_ys[k], tail_ys[k + 1], tail_hw[k], tail_hw[k + 1]
        top = [(0, y0, 0.012), (sg * w0, y0, 0.0), (sg * w1, y1, 0.0), (0, y1, 0.012 if w1 else 0.0)]
        bot = [(0, y0, 0.0), (sg * w0, y0, -0.012), (sg * w1, y1, -0.012), (0, y1, 0.0)][::-1]
        if sg < 0: top = top[::-1]; bot = bot[::-1]
        emit(top, C_TAIL, tail_w); emit(bot, C_TAIL_UND, tail_w)

# ---------- malla y esqueleto ----------
me = bpy.data.meshes.new('quebrantahuesos_malla')
bm.to_mesh(me); bm.free()
me.color_attributes.active_color = me.color_attributes['Color']
me.color_attributes.render_color_index = 0
me.color_attributes.active_color_index = 0
print('COLORES', [(c.name, c.domain, c.data_type) for c in me.color_attributes])
ob = bpy.data.objects.new('quebrantahuesos', me)
bpy.context.collection.objects.link(ob)
for n in BONES: ob.vertex_groups.new(name=n)
# el orden de grupos debe coincidir con GI: se crean en el mismo orden

mat = bpy.data.materials.new('plumaje'); mat.use_nodes = True
nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
cn = nt.nodes.new('ShaderNodeVertexColor'); cn.layer_name = 'Color'
nt.links.new(cn.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.92
bsdf.inputs['Metallic'].default_value = 0.0
me.materials.append(mat)

arm_d = bpy.data.armatures.new('esqueleto')
arm = bpy.data.objects.new('esqueleto', arm_d)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_d.edit_bones
def bone(name, head, tail, parent=None):
    b = eb.new(name); b.head = head; b.tail = tail
    if parent: b.parent = eb[parent]
    return b
bone('body', (0, 0.15, 0), (0, -0.15, 0))
bone('neck', (0, -0.28, 0.05), (0, -0.42, 0.08), 'body')
bone('head', (0, -0.42, 0.08), (0, -0.56, 0.09), 'neck')
bone('tail', (0, 0.26, 0), (0, 0.90, 0), 'body')
def bpos(x): return Vector((x, ley(x) + 0.25 * chord(x), zspan(x) + 0.02))
for s, sg in (('L', 1), ('R', -1)):
    prev = 'body'
    for nm, a, b in (('arm', 0.10, 0.60), ('forearm', 0.60, 0.95), ('hand', 0.95, 1.20), ('tip', 1.20, 1.42)):
        h, t = bpos(a), bpos(b); h.x *= sg; t.x *= sg
        bone(f'wing_{nm}.{s}', h, t, prev); prev = f'wing_{nm}.{s}'
bpy.ops.object.mode_set(mode='OBJECT')
ob.parent = arm
md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = arm

# ---------- animaciones ----------
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
pb = arm.pose.bones
for b in pb: b.rotation_mode = 'XYZ'

def tip_z():
    dg = bpy.context.evaluated_depsgraph_get()
    e = ob.evaluated_get(dg); m = e.to_mesh()
    vs = [v.co for v in m.vertices]
    zl = max(v.z for v in vs if v.x > 1.0); zr = max(v.z for v in vs if v.x < -1.0)
    e.to_mesh_clear(); return zl, zr

def reset():
    for b in pb: b.rotation_euler = (0, 0, 0); b.location = (0, 0, 0)
    bpy.context.view_layer.update()

# detectar eje y signo que levantan cada ala
reset(); z0 = tip_z(); AX = {}
best = {}
for ax in range(3):
    for s, key in (('L', 0), ('R', 1)):
        reset(); r = [0, 0, 0]; r[ax] = math.radians(20)
        pb[f'wing_arm.{s}'].rotation_euler = r; bpy.context.view_layer.update()
        dz = tip_z()[key] - z0[key]
        if abs(dz) > abs(best.get(s, (0, 0, 0))[2]): best[s] = (ax, 1 if dz > 0 else -1, dz)
reset()
AXL, SL = best['L'][0], best['L'][1]
AXR, SR = best['R'][0], best['R'][1]
print('eje ala L', best['L'], 'R', best['R'])

def make_action(name, frames, keyfn):
    act = bpy.data.actions.new(name)
    arm.animation_data_create(); arm.animation_data.action = act
    for f in range(0, frames + 1, 3):
        reset(); keyfn(f if f < frames else 0, frames)
        for b in pb:
            for path, n in (('rotation_euler', 3), ('location', 3)):
                for i in range(n):
                    v = getattr(b, path)[i]
                    if abs(v) > 1e-6 or f == 0:
                        b.keyframe_insert(path, index=i, frame=f + 1)
    arm.animation_data.action = None
    tr = arm.animation_data.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, 1, act); st.name = name
    return act

def wing_rot(s, nm, ang):
    ax, sg = (AXL, SL) if s == 'L' else (AXR, SR)
    r = [0, 0, 0]; r[ax] = math.radians(ang) * sg
    pb[f'wing_{nm}.{s}'].rotation_euler = r

def aleteo(f, n):
    ph = 2 * math.pi * f / n
    for s in 'LR':
        wing_rot(s, 'arm', 32 * math.sin(ph) + 6)
        wing_rot(s, 'forearm', 20 * math.sin(ph - 0.7))
        wing_rot(s, 'hand', 26 * math.sin(ph - 1.4))
        wing_rot(s, 'tip', 16 * math.sin(ph - 2.0))
    pb['body'].location = (0, 0, -0.05 * math.sin(ph - 0.3))
    pb['tail'].rotation_euler = (math.radians(7 * math.sin(ph - 1.2)), 0, 0)
    pb['head'].rotation_euler = (math.radians(3 * math.sin(ph - 1.0)), 0, 0)

def planeo(f, n):
    ph = 2 * math.pi * f / n
    for s in 'LR':
        o = 0 if s == 'L' else 1.3                              # cada ala algo desfasada
        wing_rot(s, 'arm', 2.5 * math.sin(ph + o) + 4)
        wing_rot(s, 'forearm', 3.5 * math.sin(ph + o - 0.8))
        wing_rot(s, 'hand', 5 * math.sin(2 * ph + o - 1.4))
        wing_rot(s, 'tip', 7 * math.sin(2 * ph + o - 2.2))
    pb['body'].location = (0, 0, 0.012 * math.sin(ph))
    pb['tail'].rotation_euler = (math.radians(3.5 * math.sin(ph - 0.9)), math.radians(2.5 * math.sin(ph)), 0)
    pb['head'].rotation_euler = (0, math.radians(6 * math.sin(ph * 2 + 0.5)), 0)

make_action('Planeo', 120, planeo)
make_action('Aleteo', 66, aleteo)
bpy.ops.object.mode_set(mode='OBJECT')
reset()

# ---------- vistas previas (sin ventana, motor «Workbench») ----------
def preview(dirp):
    import os
    os.makedirs(dirp, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'VERTEX'
    sc.render.resolution_x = 640; sc.render.resolution_y = 420
    sc.world = bpy.data.worlds.new('w'); sc.world.color = (0.62, 0.72, 0.85)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 3.4
    def shot(name, loc, rot):
        cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot]
        sc.render.filepath = os.path.join(dirp, name + '.png'); bpy.ops.render.render(write_still=True)
    def pose(act, frame):
        arm.animation_data.action = bpy.data.actions[act]; sc.frame_set(frame)
    arm.animation_data.action = None
    for t in arm.animation_data.nla_tracks: t.mute = True
    pose('Planeo', 1)
    shot('arriba', (0, -0.1, 6), (0, 0, 0))
    shot('abajo', (0, -0.1, -6), (180, 0, 0))
    shot('frente', (0, -6, 0.3), (90, 0, 0))
    shot('lado', (6, 0, 0.2), (90, 0, 90))
    pose('Aleteo', 1); shot('aleteo_arriba_frente', (0, -6, 0.3), (90, 0, 0))
    pose('Aleteo', 34); shot('aleteo_abajo_frente', (0, -6, 0.3), (90, 0, 0))
    pose('Aleteo', 17); shot('aleteo_medio_frente', (0, -6, 0.3), (90, 0, 0))
    for t in arm.animation_data.nla_tracks: t.mute = False
    arm.animation_data.action = None

if PREV: preview(PREV)

# ---------- exportar ----------
bpy.ops.object.select_all(action='DESELECT')
ob.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
kw = dict(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False, use_selection=True,
          export_animations=True, export_skins=True)
if 'export_nla_strips' in opts: kw['export_nla_strips'] = True
if 'export_animation_mode' in opts: kw['export_animation_mode'] = 'NLA_TRACKS'
if 'export_force_sampling' in opts: kw['export_force_sampling'] = True
if 'export_optimize_animation_size' in opts: kw['export_optimize_animation_size'] = False
if 'export_colors' in opts: kw['export_colors'] = True
if 'export_vertex_color' in opts: kw['export_vertex_color'] = 'ACTIVE'
bpy.ops.export_scene.gltf(**kw)
print('EXPORTADO', OUT, len(me.vertices), 'vértices', len(me.polygons), 'caras')

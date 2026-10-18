#!/usr/bin/env python3
"""Rebeco (Rupicapra pyrenaica), versión 2: proporciones y pelaje según láminas de referencia (macho y hembra en invierno,
macho en verano) y un boceto de comportamiento; las láminas solo se usan como referencia, no se publican.
- Cabeza estrecha y alargada con antifaz (cara crema y banda oscura del ojo al hocico), orejas puntiagudas.
- Cuernos negros casi verticales y paralelos que salen de la frente y se curvan hacia atrás en la punta (ganchudos).
- Cuerpo compacto con la grupa algo alta, patas largas y finas más oscuras abajo, rabo corto oscuro.
- Variantes: macho (cuello grueso, cuernos gruesos y muy ganchudos), hembra (más fina, cuernos finos y menos ganchudos) y
  cría (cabeza proporcionalmente mayor, hocico corto, cuernos cortos). Pelajes: verano (leonado) e invierno (castaño casi negro
  con garganta, mejillas y grupa claras).
Animaciones: Quieto, Alerta, Andar (como antes) y Pastar, Mirar (mira atrás) y Brinco (salto).
Uso: blender -b --python tools/modelos/rebeco2.py -- salida.glb macho|hembra|cria verano|invierno [carpeta_vistas]
Eje: mira hacia -Y (= +Z en glTF), Z arriba, pezuñas en z=0.
"""
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/rebeco.glb'
VAR = args[1] if len(args) > 1 else 'macho'
PEL = args[2] if len(args) > 2 else 'verano'
PREV = args[3] if len(args) > 3 else None
MACHO, CRIA = VAR == 'macho', VAR == 'cria'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30

# ---------- paleta (verano / invierno) ----------
if PEL == 'invierno':
    C_SIDE = (0.15, 0.10, 0.07); C_BACK = (0.065, 0.045, 0.035); C_BELLY = (0.20, 0.15, 0.105)
    C_LEG_UP = (0.11, 0.075, 0.055); C_LEG_LO = (0.20, 0.14, 0.095); C_FACE = (0.86, 0.78, 0.60); C_THROAT = (0.80, 0.70, 0.52)
    C_RUMP = (0.70, 0.62, 0.46); C_EAR = (0.12, 0.09, 0.07); C_CROWN = (0.10, 0.075, 0.055)
else:
    C_SIDE = (0.50, 0.34, 0.19); C_BACK = (0.26, 0.17, 0.10); C_BELLY = (0.70, 0.58, 0.40)
    C_LEG_UP = (0.42, 0.28, 0.15); C_LEG_LO = (0.20, 0.13, 0.08); C_FACE = (0.90, 0.80, 0.58); C_THROAT = (0.92, 0.86, 0.70)
    C_RUMP = (0.90, 0.83, 0.66); C_EAR = (0.52, 0.36, 0.21); C_CROWN = (0.40, 0.27, 0.15)
C_HOOF = (0.04, 0.035, 0.03); C_STRIPE = (0.06, 0.045, 0.035); C_HORN = (0.035, 0.03, 0.028); C_NOSE = (0.03, 0.025, 0.025); C_EYE = (0.02, 0.015, 0.015)
LEGS = [f'leg_{g}{s}_{p}' for g in 'FH' for s in 'LR' for p in ('up', 'lo', 'hoof')]
BONES = ['body', 'neck', 'head', 'tail', 'ear.L', 'ear.R'] + LEGS
GI = {n: i for i, n in enumerate(BONES)}

bm = bmesh.new()
col_l = bm.loops.layers.color.new('Color')
dl = bm.verts.layers.deform.new()

def emit(pts, color, wf):
    vs = []
    for p in pts:
        v = bm.verts.new(p)
        for g, w in wf(Vector(p)).items():
            if w > 1e-4: v[dl][GI[g]] = w
        vs.append(v)
    try: f = bm.faces.new(vs)
    except ValueError: return
    f.smooth = True
    for l in f.loops: l[col_l] = (*color, 1.0)

def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def prim(kind, loc, scale, colorf, wf, rot=None, **kw):
    t = bmesh.new()
    if kind == 'sphere': bmesh.ops.create_uvsphere(t, u_segments=kw.get('u', 9), v_segments=kw.get('v', 6), radius=1.0)
    else: bmesh.ops.create_cone(t, cap_ends=True, segments=kw.get('u', 6), radius1=kw.get('r1', 1.0), radius2=kw.get('r2', 0.0), depth=kw.get('d', 1.0))
    if rot: bmesh.ops.rotate(t, verts=t.verts, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.scale(t, vec=scale, verts=t.verts)
    bmesh.ops.translate(t, vec=loc, verts=t.verts)
    t.normal_update()
    for f in t.faces: emit([tuple(v.co) for v in f.verts], colorf(f), wf)
    t.free()

def seg(a, b, r1, r2, colorf, wf, u=6):
    """Cono entre dos puntos (r1 en a, r2 en b)."""
    a, b = Vector(a), Vector(b); d = b - a; L = d.length
    q = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
    t = bmesh.new()
    bmesh.ops.create_cone(t, cap_ends=True, segments=u, radius1=r1, radius2=r2, depth=L)
    bmesh.ops.rotate(t, verts=t.verts, cent=(0, 0, 0), matrix=q)
    bmesh.ops.translate(t, vec=(a + b) / 2, verts=t.verts)
    t.normal_update()
    for f in t.faces: emit([tuple(v.co) for v in f.verts], colorf(f), wf)
    t.free()

W = lambda name: (lambda p: {name: 1.0})

# ---------- tronco ----------
def torso_col(f):
    n = f.normal; c = sum((v.co for v in f.verts), Vector()) / len(f.verts)
    if n.z > 0.6: return C_BACK
    if n.z < -0.4: return C_BELLY
    if PEL == 'invierno' and n.z < -0.05 and c.y < -0.15: return C_BELLY
    return C_SIDE
body_w = W('body')
ZB = 0.665   # altura del centro del tronco (patas largas)
def torso_shape(v):
    y = v.co.y
    if y < -0.15: v.co.z -= 0.03 * min(1.0, (-0.15 - y) / 0.25) * (1 if v.co.z < ZB else 0.2)   # pecho hondo
    if y > 0.10:
        k = min(1.0, (y - 0.10) / 0.36)
        v.co.x *= (1 - 0.28 * k)
        v.co.z += (0.05 if v.co.z < ZB else 0.03) * k   # grupa algo más alta y vientre recogido
def prim_t(loc, scale, colorf, wf, u, v_):
    t = bmesh.new(); bmesh.ops.create_uvsphere(t, u_segments=u, v_segments=v_, radius=1.0)
    bmesh.ops.scale(t, vec=scale, verts=t.verts); bmesh.ops.translate(t, vec=loc, verts=t.verts)
    for v in t.verts: torso_shape(v)
    t.normal_update()
    for f in t.faces: emit([tuple(v.co) for v in f.verts], colorf(f), wf)
    t.free()
prim_t((0, 0.02, ZB), (0.150, 0.42, 0.180), torso_col, body_w, 16, 10)
prim('sphere', (0, 0.405, ZB + 0.05), (0.06, 0.03, 0.075), lambda f: C_RUMP, body_w, u=10, v=6)    # mancha clara de la grupa
prim('cone', (0, 0.44, ZB + 0.10), (1, 1, 1), lambda f: C_BACK, W('tail'), rot=Matrix.Rotation(math.radians(-110), 3, 'X'), r1=0.02, r2=0.006, d=0.08, u=6)

# cuello (grueso en el macho), con la garganta clara
NR1, NR2 = (0.118, 0.072) if MACHO else (0.098, 0.062)
def neck_w(p):
    t = smooth(-0.33, -0.50, p.y); return {'body': 1 - t, 'neck': t}
def neck_col(f):
    c = sum((v.co for v in f.verts), Vector()) / len(f.verts)
    return C_THROAT if f.normal.z < -0.2 and c.y < -0.40 else (C_BACK if f.normal.z > 0.7 else C_SIDE)
seg((0, -0.30, ZB + 0.08), (0, -0.48, ZB + 0.27), NR1, NR2, neck_col, neck_w, u=10)
# cabeza estrecha y alargada; la cría, más redonda y con el hocico corto
HS = 1.12 if CRIA else 1.0; head_w = W('head')
HX, HY, HZ = 0, -0.53, ZB + 0.31
def hp(x, y, z): return (HX + x * HS, HY + y * HS, HZ + z * HS)
def hs(s): return tuple(a * HS for a in s)
prim('sphere', hp(0, -0.04, 0.0), hs((0.056, 0.085, 0.064)), lambda f: C_CROWN if f.normal.z > 0.55 else C_FACE, head_w, u=10, v=7)   # cráneo
L = 0.7 if CRIA else 1.0
seg(hp(0, -0.08, -0.015), hp(0, -0.08 - 0.15 * L, -0.065), 0.046 * HS, 0.026 * HS, lambda f: C_FACE, head_w, u=10)   # hocico afilado
prim('sphere', hp(0, -0.08 - 0.15 * L - 0.005, -0.068), hs((0.024, 0.02, 0.02)), lambda f: C_NOSE, head_w, u=6, v=4)
for sx in (1, -1):
    # antifaz: banda oscura desde la oreja, por el ojo, hasta la comisura del hocico
    seg(hp(sx * 0.045, -0.01, 0.035), hp(sx * 0.03, -0.075 - 0.13 * L, -0.045), 0.014 * HS, 0.008 * HS, lambda f: C_STRIPE, head_w, u=6)
    prim('sphere', hp(sx * 0.052, -0.055, 0.028), hs((0.011, 0.014, 0.012)), lambda f: C_EYE, head_w, u=6, v=4)
    # orejas puntiagudas, hacia arriba y afuera
    prim('cone', hp(sx * 0.055, 0.035, 0.075), (1, 1, 1), lambda f: C_EAR, W('ear.L' if sx > 0 else 'ear.R'),
         rot=Matrix.Rotation(math.radians(sx * 38), 3, 'Y') @ Matrix.Rotation(math.radians(-12), 3, 'X'), r1=0.026 * HS, r2=0.004, d=0.105 * HS, u=6)
    # cuernos: verticales y paralelos desde la frente, ganchudos hacia atrás (más en el macho; cortos en la cría)
    if CRIA:
        pts = [hp(sx * 0.02, -0.035, 0.055), hp(sx * 0.022, -0.035, 0.095), hp(sx * 0.024, -0.02, 0.112)]; rs = [0.009, 0.007, 0.003]
    else:
        g = 1.0 if MACHO else 0.62; t = 1.0 if MACHO else 0.78
        pts = [hp(sx * 0.021, -0.035, 0.055), hp(sx * 0.023, -0.038, 0.12), hp(sx * 0.025, -0.035, 0.175), hp(sx * 0.027, -0.012 + 0.0 * g, 0.205),
               hp(sx * 0.028, 0.02 * g, 0.205 - 0.01 * g), hp(sx * 0.028, 0.035 * g, 0.18 - 0.012 * g)]
        rs = [x * t for x in (0.0125, 0.011, 0.0095, 0.0075, 0.0055, 0.002)]
    for i in range(len(pts) - 1): seg(pts[i], pts[i + 1], rs[i], rs[i + 1], lambda f: C_HORN, head_w, u=7)

# patas largas y finas: delanteras (codo-rodilla-pezuña) y traseras con corvejón
FY, HY_ = -0.19, 0.24
def leg(grp, sx):
    s = 'L' if sx > 0 else 'R'; nm = lambda p: f'leg_{grp}{s}_{p}'
    if grp == 'F': a, k, f_, h = (sx * 0.085, FY, ZB - 0.07), (sx * 0.085, FY - 0.01, 0.30), (sx * 0.085, FY, 0.055), (sx * 0.085, FY, 0.0)
    else: a, k, f_, h = (sx * 0.085, HY_, ZB - 0.04), (sx * 0.085, HY_ + 0.10, 0.33), (sx * 0.085, HY_ + 0.05, 0.055), (sx * 0.085, HY_ + 0.05, 0.0)
    def w(p):
        t = smooth(k[2] + 0.05, k[2] - 0.05, p.z); t2 = smooth(f_[2] + 0.05, f_[2] - 0.01, p.z)
        return {nm('up'): 1 - t, nm('lo'): t * (1 - t2), nm('hoof'): t2}
    seg(a, k, 0.052 if grp == 'H' else 0.046, 0.026, lambda f: C_LEG_UP, w, u=8)
    seg(k, f_, 0.025, 0.017, lambda f: C_LEG_LO, w, u=7)
    seg(f_, h, 0.019, 0.024, lambda f: C_HOOF, w, u=6)
for g in 'FH':
    for sx in (1, -1): leg(g, sx)
LEGPTS = {'F': lambda: [(0.085, FY, ZB - 0.07), (0.085, FY - 0.01, 0.30), (0.085, FY, 0.055), (0.085, FY, 0.0)],
          'H': lambda: [(0.085, HY_, ZB - 0.04), (0.085, HY_ + 0.10, 0.33), (0.085, HY_ + 0.05, 0.055), (0.085, HY_ + 0.05, 0.0)]}

# ---------- malla y material ----------
me = bpy.data.meshes.new('rebeco_malla')
bm.to_mesh(me); bm.free()
me.color_attributes.active_color = me.color_attributes['Color']
me.color_attributes.render_color_index = 0
me.color_attributes.active_color_index = 0
ob = bpy.data.objects.new('rebeco', me)
bpy.context.collection.objects.link(ob)
for n in BONES: ob.vertex_groups.new(name=n)
mat = bpy.data.materials.new('pelaje'); mat.use_nodes = True
nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
cn = nt.nodes.new('ShaderNodeVertexColor'); cn.layer_name = 'Color'
nt.links.new(cn.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.95; bsdf.inputs['Metallic'].default_value = 0.0
me.materials.append(mat)

# ---------- esqueleto ----------
arm_d = bpy.data.armatures.new('esqueleto_rebeco')
arm = bpy.data.objects.new('esqueleto_rebeco', arm_d)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_d.edit_bones
def bone(name, head, tail, parent=None):
    b = eb.new(name); b.head = head; b.tail = tail
    if parent: b.parent = eb[parent]
for n, h, t, par in (('body', (0, 0.26, ZB), (0, -0.12, ZB), None), ('neck', (0, -0.31, ZB + 0.08), (0, -0.48, ZB + 0.27), 'body'),
                     ('head', (0, -0.48, ZB + 0.27), (0, -0.68, ZB + 0.25), 'neck'), ('tail', (0, 0.42, ZB + 0.09), (0, 0.48, ZB + 0.11), 'body')):
    bone(n, h, t, par)
for sx, s in ((1, 'L'), (-1, 'R')):
    bone(f'ear.{s}', hp(sx * 0.05, 0.035, 0.06), hp(sx * 0.09, 0.04, 0.12), 'head')
    for g in 'FH':
        P = [(sx * p[0], p[1], p[2]) for p in LEGPTS[g]()]
        bone(f'leg_{g}{s}_up', P[0], P[1], 'body')
        bone(f'leg_{g}{s}_lo', P[1], P[2], f'leg_{g}{s}_up')
        bone(f'leg_{g}{s}_hoof', P[2], P[3], f'leg_{g}{s}_lo')
bpy.ops.object.mode_set(mode='OBJECT')
ob.parent = arm
md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = arm

# ---------- animaciones ----------
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
pb = arm.pose.bones
for b in pb: b.rotation_mode = 'XYZ'

def reset():
    for b in pb: b.rotation_euler = (0, 0, 0); b.location = (0, 0, 0)
    bpy.context.view_layer.update()

HOOF_IDX = [v.index for v in me.vertices if any(g.group == GI['leg_FL_hoof'] and g.weight > 0.5 for g in v.groups)]
NOSE_IDX = [v.index for v in me.vertices if v.co.y < min(vv.co.y for vv in me.vertices) + 0.03]
def sel(idx):
    dg = bpy.context.evaluated_depsgraph_get(); e = ob.evaluated_get(dg); m = e.to_mesh()
    vs = [m.vertices[i].co.copy() for i in idx]; e.to_mesh_clear()
    return sum((v for v in vs), Vector()) / len(vs)
def foot(): c = sel(HOOF_IDX); return c.y, c.z

# eje local que balancea la pata hacia delante (-Y) y su signo, medido sobre la malla deformada
reset(); y0 = foot()[0]; best = (0, 1, 0)
for ax in range(3):
    reset(); r = [0, 0, 0]; r[ax] = math.radians(20); pb['leg_FL_up'].rotation_euler = r; bpy.context.view_layer.update()
    dy = foot()[0] - y0
    if abs(dy) > abs(best[2]): best = (ax, -1 if dy > 0 else 1, dy)
reset()
AX, SG = best[0], best[1]     # ángulo positivo = pata hacia delante
print('eje pata', best)

# eje que gira la cabeza a izquierda/derecha y la sube/baja (se mide con la nariz)
def nose(): return sel(NOSE_IDX)
reset(); n0 = nose(); HX = {}
for ax in range(3):
    reset(); r = [0, 0, 0]; r[ax] = math.radians(20); pb['head'].rotation_euler = r; bpy.context.view_layer.update()
    d = nose() - n0
    HX[ax] = d
reset()
YAW = max(range(3), key=lambda a: abs(HX[a].x)); YAWS = 1 if HX[YAW].x > 0 else -1          # +ángulo = nariz a +X (a la izquierda)
PIT = max(range(3), key=lambda a: abs(HX[a].z)); PITS = 1 if HX[PIT].z > 0 else -1          # +ángulo = nariz hacia arriba
print('cabeza yaw', YAW, YAWS, 'pitch', PIT, PITS)
reset(); NX = {}
for ax in range(3):
    reset(); r = [0, 0, 0]; r[ax] = math.radians(20); pb['neck'].rotation_euler = r; bpy.context.view_layer.update(); NX[ax] = nose() - n0
reset()
NYAW = max(range(3), key=lambda a: abs(NX[a].x)); NYAWS = 1 if NX[NYAW].x > 0 else -1
NPIT = max(range(3), key=lambda a: abs(NX[a].z)); NPITS = 1 if NX[NPIT].z > 0 else -1

def rot(name, ax, ang_deg, sg=1):
    r = list(pb[name].rotation_euler); r[ax] = math.radians(ang_deg) * sg; pb[name].rotation_euler = r

def make_action(name, frames, keyfn, step=3):
    act = bpy.data.actions.new(name)
    arm.animation_data_create(); arm.animation_data.action = act
    for f in range(0, frames + 1, step):
        reset(); keyfn(f if f < frames else 0, frames)
        for b in pb:
            for path in ('rotation_euler', 'location'):
                for i in range(3):
                    v = getattr(b, path)[i]
                    if abs(v) > 1e-6 or f == 0: b.keyframe_insert(path, index=i, frame=f + 1)
    arm.animation_data.action = None
    tr = arm.animation_data.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, 1, act); st.name = name

def pata(nm, up, lo):
    rot(f'leg_{nm}_up', AX, up, SG); rot(f'leg_{nm}_lo', AX, lo, SG)

def quieto(f, n):
    ph = 2 * math.pi * f / n
    for nm in ('FL', 'FR', 'HL', 'HR'): pata(nm, 0, 0)
    pb['body'].location = (0, 0, 0.004 * math.sin(ph * 3))
    rot('head', YAW, 22 * math.sin(ph) * (1 if math.sin(ph * 0.5) > -2 else 0), YAWS)
    pb['head'].rotation_euler[PIT] += math.radians(4 * math.sin(ph * 2 + 1)) * PITS
    pb['neck'].rotation_euler[PIT] += math.radians(-3 + 3 * math.sin(ph * 3)) * PITS
    flick = max(0.0, math.sin(ph * 4 - 1.0)) ** 8                       # un par de sacudidas de oreja por ciclo
    rot('ear.L', PIT, -28 * flick, PITS); rot('ear.R', PIT, -28 * (max(0.0, math.sin(ph * 4 - 2.4)) ** 8), PITS)
    pb['tail'].rotation_euler[PIT] = math.radians(8 * math.sin(ph * 4)) * PITS

def alerta(f, n):
    ph = 2 * math.pi * f / n
    for nm in ('FL', 'FR', 'HL', 'HR'): pata(nm, 0, 0)
    pb['body'].location = (0, 0, 0.003 * math.sin(ph * 2))
    pb['neck'].rotation_euler[PIT] = math.radians(18 + 2 * math.sin(ph)) * PITS
    pb['head'].rotation_euler[PIT] = math.radians(-8) * PITS
    rot('head', YAW, 6 * math.sin(ph), YAWS)
    rot('ear.L', PIT, 14, PITS); rot('ear.R', PIT, 14, PITS)

def andar(f, n):
    ph = 2 * math.pi * f / n
    fase = {'FL': 0.0, 'HR': 0.0, 'FR': math.pi, 'HL': math.pi}       # paso en diagonal
    for nm, o in fase.items():
        a = 24 if nm[0] == 'F' else 20
        up = a * math.cos(ph + o)
        lo = (-38 if nm[0] == 'F' else -30) * max(0.0, -math.sin(ph + o))   # se pliega al adelantar la pata
        if nm[0] == 'H': up -= 4
        pata(nm, up, lo)
    pb['body'].location = (0, 0, 0.014 * math.sin(2 * ph + 0.6))
    rot('head', YAW, 4 * math.sin(ph), YAWS)
    pb['neck'].rotation_euler[PIT] = math.radians(2 + 3 * math.sin(2 * ph)) * PITS
    rot('ear.L', PIT, 5 * math.sin(2 * ph), PITS); rot('ear.R', PIT, 5 * math.sin(2 * ph + 1), PITS)
    pb['tail'].rotation_euler[PIT] = math.radians(6 * math.sin(2 * ph)) * PITS

def pastar(f, n):   # cabeza al suelo, mordisquea y da un par de pasos cortos
    ph = 2 * math.pi * f / n
    for nm in ('FL', 'FR', 'HL', 'HR'): pata(nm, 0, 0)
    pata('FL', 6 * max(0.0, math.sin(ph)), -10 * max(0.0, math.sin(ph))); pata('FR', -3, 0)
    pb['neck'].rotation_euler[NPIT] = math.radians(-95) * NPITS
    pb['head'].rotation_euler[PIT] = math.radians(-10 + 5 * math.sin(ph * 6)) * PITS
    rot('head', YAW, 8 * math.sin(ph), YAWS)
    rot('ear.L', PIT, -10 * math.sin(ph * 2), PITS); rot('ear.R', PIT, -10 * math.sin(ph * 2 + 1), PITS)
    pb['tail'].rotation_euler[PIT] = math.radians(10 * math.sin(ph * 5)) * PITS
def mirar(f, n):   # gira el cuello y mira hacia atrás, y vuelve
    ph = math.sin(math.pi * f / n) ** 2
    for nm in ('FL', 'FR', 'HL', 'HR'): pata(nm, 0, 0)
    pb['neck'].rotation_euler[NYAW] = math.radians(58 * ph) * NYAWS
    pb['neck'].rotation_euler[NPIT] = math.radians(10 * ph) * NPITS
    rot('head', YAW, 30 * ph, YAWS)
    rot('ear.L', PIT, 12 * ph, PITS); rot('ear.R', PIT, 12 * ph, PITS)
def brinco(f, n):   # salto: recoge, impulsa con las traseras, vuela con las patas plegadas y cae con las delanteras
    t = f / n
    vuelo = math.sin(math.pi * min(1.0, max(0.0, (t - 0.15) / 0.65)))
    pb['body'].location = (0, 0, 0.28 * vuelo)
    pb['body'].rotation_euler[PIT if False else 0] = 0
    for nm in ('FL', 'FR'): pata(nm, 30 * vuelo - 10 * (1 - vuelo) * (t > 0.8), -70 * vuelo)
    for nm in ('HL', 'HR'): pata(nm, -35 * (t < 0.2) * math.sin(math.pi * t / 0.2) - 25 * vuelo, -40 * vuelo)
    pb['neck'].rotation_euler[NPIT] = math.radians(14 * vuelo) * NPITS
    rot('ear.L', PIT, -15 * vuelo, PITS); rot('ear.R', PIT, -15 * vuelo, PITS)
    pb['tail'].rotation_euler[PIT] = math.radians(20 * vuelo) * PITS
make_action('Pastar', 120, pastar, 4)
make_action('Mirar', 90, mirar, 3)
make_action('Brinco', 30, brinco, 1)
make_action('Quieto', 180, quieto, 4)
make_action('Alerta', 90, alerta, 3)
make_action('Andar', 36, andar, 2)
bpy.ops.object.mode_set(mode='OBJECT')
reset()

# ---------- vistas previas ----------
def preview(dirp):
    import os
    os.makedirs(dirp, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'VERTEX'
    sc.render.resolution_x = 560; sc.render.resolution_y = 420
    sc.world = bpy.data.worlds.new('w'); sc.world.color = (0.62, 0.72, 0.85)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.6
    def shot(name, loc, rot_):
        cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot_]
        sc.render.filepath = os.path.join(dirp, name + '.png'); bpy.ops.render.render(write_still=True)
    for t in arm.animation_data.nla_tracks: t.mute = True
    def pose(act, frame):
        arm.animation_data.action = bpy.data.actions[act]; sc.frame_set(frame)
    pose('Quieto', 1)
    shot('lado', (6, 0, 0.62), (90, 0, 90)); shot('frente', (0, -6, 0.62), (90, 0, 0)); shot('cara', (1.3, -2.2, 1.0), (82, 0, 30)); shot('detras', (0, 6, 0.55), (90, 0, 180))
    shot('tres_cuartos', (4.2, -4.2, 2.6), (64, 0, 45))
    pose('Alerta', 40); shot('alerta', (6, 0, 0.55), (90, 0, 90))
    pose('Pastar', 30); shot('pastar', (6, 0, 0.55), (90, 0, 90))
    pose('Mirar', 45); shot('mirar', (0, 0, 6), (0, 0, 0))
    pose('Brinco', 15); shot('brinco', (6, 0, 0.55), (90, 0, 90))
    pose('Andar', 1); shot('andar_1', (6, 0, 0.55), (90, 0, 90))
    pose('Andar', 10); shot('andar_2', (6, 0, 0.55), (90, 0, 90))
    pose('Andar', 19); shot('andar_3', (6, 0, 0.55), (90, 0, 90))
    for t in arm.animation_data.nla_tracks: t.mute = False
    arm.animation_data.action = None

if PREV: preview(PREV)

# ---------- exportar ----------
bpy.ops.object.select_all(action='DESELECT')
ob.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
kw = dict(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False, use_selection=True, export_animations=True, export_skins=True)
if 'export_nla_strips' in opts: kw['export_nla_strips'] = True
if 'export_animation_mode' in opts: kw['export_animation_mode'] = 'NLA_TRACKS'
if 'export_force_sampling' in opts: kw['export_force_sampling'] = True
if 'export_optimize_animation_size' in opts: kw['export_optimize_animation_size'] = True
if 'export_draco_mesh_compression_enable' in opts: kw['export_draco_mesh_compression_enable'] = False
if 'export_colors' in opts: kw['export_colors'] = True
bpy.ops.export_scene.gltf(**kw)
print('EXPORTADO', OUT, len(me.vertices), 'vértices', len(me.polygons), 'caras')

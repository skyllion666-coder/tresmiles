#!/usr/bin/env python3
"""Quebrantahuesos (Gypaetus barbatus) para la web, versión 3: más detalle, superficie suave, cola en rombo, ojo con anillo rojo y garras,
y más animaciones (planeo vivo, aleteo, virajes a cada lado y alas plegadas) que la web mezcla según el vuelo.
Basado en aves.py (versión 2, que sigue haciendo leonado, negro y alimoche). Solo especie «quebrantahuesos».
--- notas de la versión 2 ---
Rapaces carroñeras del Pirineo en low-poly, con esqueleto y animaciones, para la web (versión 2).
Especies: quebrantahuesos (Gypaetus barbatus), buitre leonado (Gyps fulvus), buitre negro (Aegypius monachus) y alimoche (Neophron percnopterus).
Siluetas y plumajes según láminas de identificación aportadas por el usuario (solo como referencia; no se publican):
- quebrantahuesos: alas largas, estrechas y apuntadas, cola larga en cuña; pecho y vientre anaranjados, cabeza crema con antifaz y «barba» negros, dorso gris pizarra.
- buitre leonado: alas muy anchas y largas con siete «dedos» profundos, cola corta y cuadrada; cobertoras pardo-arena, remeras casi negras, cabeza y collar blanquecinos.
- buitre negro: el mayor; alas anchas, todo pardo muy oscuro, cola corta algo en cuña, cabeza pequeña y piel rosada.
- alimoche: el pequeño (1,6 m); blanco con remeras negras, cara amarilla y cola blanca en cuña.
Uso (Blender sin ventana): blender -b --python tools/modelos/quebrantahuesos3.py -- models/quebrantahuesos-v3.glb quebrantahuesos [carpeta_vistas_previas]
El modelo se construye siempre con 2,84 de envergadura (la web lo escala a la de cada especie).
Eje: el ave mira hacia -Y en Blender (= +Z en glTF), alas a lo largo de X, Z arriba.
Animaciones: «Planeo» (5 s), «Aleteo» (2,2 s), «ViraIzq», «ViraDer» y «Plegado» (2 s, posturas que se mezclan con el planeo).
"""
import bpy, bmesh, math, sys
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/quebrantahuesos.glb'
ESP = args[1] if len(args) > 1 else 'quebrantahuesos'
PREV = args[2] if len(args) > 2 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
FPS = 30
bpy.context.scene.render.fps = FPS

# ---------- paleta y forma por especie ----------
E = {
  'quebrantahuesos': dict(ancho=0.86, dedos=6, prof=0.06, cola='cuna', colaL=0.90, colaW=0.14, cuello=1.0, cabeza=1.0, gorguera=False,
      top=(0.10, 0.10, 0.10), top2=(0.30, 0.29, 0.27), rem_top=(0.07, 0.07, 0.075), und=(0.075, 0.065, 0.06), und2=(0.17, 0.17, 0.18),
      pecho=(0.80, 0.40, 0.10), pecho2=(0.90, 0.55, 0.16), dorso=(0.11, 0.10, 0.10), cab=(0.93, 0.84, 0.55), pico=(0.22, 0.22, 0.23),
      cola_c=(0.10, 0.10, 0.10), cola_u=(0.20, 0.19, 0.18), barba=True, ojo=(0.85, 0.12, 0.05), gor=(0.9, 0.8, 0.5)),
  'leonado': dict(ancho=1.18, dedos=7, prof=0.12, cola='cuadrada', colaL=0.52, colaW=0.13, cuello=0.7, cabeza=0.9, gorguera=True,
      top=(0.42, 0.28, 0.15), top2=(0.52, 0.37, 0.21), rem_top=(0.045, 0.032, 0.024), und=(0.38, 0.24, 0.12), und2=(0.05, 0.036, 0.026),
      pecho=(0.40, 0.25, 0.12), pecho2=(0.46, 0.30, 0.15), dorso=(0.38, 0.25, 0.13), cab=(0.78, 0.74, 0.66), pico=(0.55, 0.50, 0.38),
      cola_c=(0.05, 0.036, 0.026), cola_u=(0.06, 0.045, 0.03), barba=False, ojo=(0.30, 0.18, 0.06), gor=(0.88, 0.85, 0.78)),
  'negro': dict(ancho=1.22, dedos=7, prof=0.11, cola='cuna', colaL=0.56, colaW=0.15, cuello=0.6, cabeza=0.85, gorguera=True,
      top=(0.045, 0.036, 0.028), top2=(0.07, 0.055, 0.042), rem_top=(0.03, 0.024, 0.02), und=(0.04, 0.032, 0.026), und2=(0.035, 0.028, 0.022),
      pecho=(0.045, 0.036, 0.028), pecho2=(0.05, 0.04, 0.03), dorso=(0.04, 0.032, 0.025), cab=(0.42, 0.26, 0.26), pico=(0.30, 0.30, 0.34),
      cola_c=(0.035, 0.028, 0.022), cola_u=(0.04, 0.032, 0.026), barba=False, ojo=(0.15, 0.10, 0.06), gor=(0.08, 0.065, 0.05)),
  'alimoche': dict(ancho=0.92, dedos=6, prof=0.08, cola='cuna', colaL=0.78, colaW=0.16, cuello=0.8, cabeza=0.95, gorguera=False,
      top=(0.78, 0.76, 0.70), top2=(0.66, 0.62, 0.55), rem_top=(0.02, 0.02, 0.02), und=(0.80, 0.78, 0.72), und2=(0.02, 0.02, 0.02),
      pecho=(0.80, 0.78, 0.72), pecho2=(0.84, 0.82, 0.76), dorso=(0.76, 0.74, 0.68), cab=(0.88, 0.66, 0.10), pico=(0.25, 0.22, 0.18),
      cola_c=(0.82, 0.80, 0.74), cola_u=(0.84, 0.82, 0.76), barba=False, ojo=(0.6, 0.35, 0.05), gor=(0.86, 0.84, 0.78)),
}[ESP]
C_BEAK = E['pico']; C_EYE = E['ojo']; C_BLACK = (0.02, 0.02, 0.02); C_HEAD = E['cab']
C_TOP = E['dorso']; C_ORANGE = E['pecho']; C_ORANGE2 = E['pecho2']; C_TAIL = E['cola_c']; C_TAIL_UND = E['cola_u']

# ---------- huesos (nombre -> índice del grupo de vértices) ----------
BONES = ['body', 'neck', 'head', 'tail', 'feet'] + [f'wing_{p}.{s}' for s in 'LR' for p in ('arm', 'forearm', 'hand', 'tip')]
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
    f.smooth = True
    for l in f.loops: l[col_l] = (*color, 1.0)

def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

# ---------- ala ----------
def ley(x): return -0.14 + 0.40 * (((x - 0.1) / 1.32)) ** 1.9
ANCHA = E['ancho'] > 1
XE = 1.08 if ANCHA else 1.16          # donde acaba la mano y empiezan los «dedos» (primarias separadas)
def chord(x):
    A = E['ancho']
    if x <= 0.95: return A * (0.50 - 0.04 * ((x - 0.1) / 0.85)) * (1 + (0.09 if ANCHA else 0.03) * math.sin(math.pi * (x - 0.1) / 0.85))   # borde de fuga abombado en las secundarias
    u = min(1.0, (x - 0.95) / (XE - 0.95))
    return A * 0.46 * (1 - (0.22 if ANCHA else 0.55) * u ** 1.3)
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
    xs = [0.10 + (XE - 0.10) * i / 26 for i in range(27)]
    ts = [0.0, 0.10, 0.22, 0.36, 0.50, 0.64, 0.78, 0.90, 1.0]
    def P(x, ch, t, z0): return (x, ley(x) + t * ch, zspan(x) + camber(t) + z0)
    out = []
    for k in range(len(xs) - 1):
        x0, x1 = xs[k], xs[k + 1]; c0, c1 = chord(x0), chord(x1)
        for i in range(len(ts) - 1):
            t0, t1 = ts[i], ts[i + 1]
            top = [P(x0, c0, t0, 0), P(x1, c1, t0, 0), P(x1, c1, t1, 0), P(x0, c0, t1, 0)]
            bot = [P(x0, c0, t0, -0.012), P(x1, c1, t0, -0.012), P(x1, c1, t1, -0.012), P(x0, c0, t1, -0.012)][::-1]
            tm = (t0 + t1) / 2; cov = tm < 0.5 and x0 < 0.98
            # por encima: cobertoras gris pizarra con el raquis claro (rayitas alternas), remeras casi negras; por debajo: cobertoras muy oscuras y remeras gris plomo
            if cov: ct = E['top2'] if (k % 2 == 0 and 0.1 < tm < 0.45) else E['top']
            else: ct = E['rem_top'] if k % 3 else tuple(c * 1.35 for c in E['rem_top'])
            cb = E['und'] if cov else tuple(a + (b - a) * min(1, (tm - 0.5) * 2) for a, b in zip(E['und'], E['und2']))
            out.append((top, ct)); out.append((bot, cb))
    # «dedos»: primarias separadas que salen del extremo de la mano en abanico (largas y abiertas en los buitres, cortas y juntas en el quebrantahuesos)
    nd = E['dedos']; cE = chord(XE); L0 = {'quebrantahuesos': 0.26, 'leonado': 0.34, 'negro': 0.33, 'alimoche': 0.24}[ESP]
    abre = 0.55 if ANCHA else 0.22
    for j in range(nd):
        u = (j + 0.5) / nd
        tb = (j + 0.03) / nd, (j + 0.97) / nd                     # tramo de la cuerda que ocupa la base del dedo
        L = L0 * ((1.05 - 0.55 * u) if ESP == 'quebrantahuesos' else (0.62 + 0.45 * math.sin(math.pi * min(1, u * 1.15))))
        ang = (u - 0.3) * abre                                    # los de atrás se abren hacia la cola
        bx, by0, by1 = XE, ley(XE) + tb[0] * cE, ley(XE) + tb[1] * cE
        dx, dy = math.cos(ang), math.sin(ang); wb = (by1 - by0)
        segs = 3
        for q in range(segs):
            f0, f1 = q / segs, (q + 1) / segs
            def pt(f, side):   # side 0/1: borde delantero/trasero del dedo; se estrecha hacia la punta
                cy = (by0 + by1) / 2; half = wb / 2 * (1 - 0.45 * f) * (1 + 0.25 * math.sin(math.pi * f))
                return (bx + dx * L * f - dy * (half if side else -half) * 0, cy + dy * L * f + (half if side else -half), zspan(XE) + 0.05 * f * f * L / 0.3)
            top = [pt(f0, 0), pt(f1, 0), pt(f1, 1), pt(f0, 1)]
            bot = [(a[0], a[1], a[2] - 0.01) for a in top][::-1]
            out.append((top, E['rem_top'])); out.append((bot, E['und2']))
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
    y = f.calc_center_median().y   # pecho más claro y anaranjado hacia delante; bajo vientre y calzas más oscuros
    u = max(0.0, min(1.0, (y + 0.30) / 0.55))
    return tuple(a + (b - a) * u for a, b in zip(C_ORANGE2, (0.62, 0.30, 0.09)))
prim('sphere', (0, 0, 0), (0.16, 0.40, 0.14), body_col, body_w, u=18, v=12, taper=body_taper)

# cuello: cono ancho en el pecho -> estrecho en la cabeza
def neck_w(p):
    t = smooth(-0.30, -0.30 - 0.12 * E['cuello'], p.y)
    return {'body': 1 - t, 'neck': t}
CL = E['cuello']
prim('cone', (0, -0.34 - 0.06 * CL, 0.075), (1, 1, 1), lambda f: C_ORANGE2 if ESP == 'quebrantahuesos' else E['pecho'], neck_w, rot=ROT_FWD, r1=0.085, r2=0.050, d=0.16 * CL, u=14)
if E['gorguera']: prim('sphere', (0, -0.36, 0.07), (0.095, 0.06, 0.085), lambda f: E['gor'], body_w, u=10, v=6)   # collar de plumas

head_w = lambda p: {'head': 1.0}
HY = -0.42 - 0.08 * CL; HS = E['cabeza']
prim('sphere', (0, HY, 0.095), (0.062 * HS, 0.075 * HS, 0.062 * HS), lambda f: C_HEAD, head_w, u=14, v=10)
prim('cone', (0, HY - 0.085 * HS, 0.082), (1, 1, 1), lambda f: C_BEAK, head_w, rot=ROT_FWD, r1=0.03 * HS, r2=0.006, d=0.10 * HS, u=6)
prim('cone', (0, HY - 0.115 * HS, 0.058), (1, 1, 1), lambda f: C_BEAK, head_w, rot=Matrix.Rotation(math.radians(200), 3, 'X'), r1=0.010, r2=0.0, d=0.04, u=5)
if E['barba']:
    prim('cone', (0, HY - 0.045, 0.035), (1, 1, 1), lambda f: C_BLACK, head_w, rot=Matrix.Rotation(math.radians(160), 3, 'X'), r1=0.016, r2=0.0, d=0.07, u=5)  # «barba»
for sx in (1, -1):
    if ESP == 'quebrantahuesos':
        prim('sphere', (sx * 0.040, HY - 0.030, 0.098), (0.026, 0.040, 0.018), lambda f: C_BLACK, head_w, u=8, v=5)   # antifaz negro, del ojo hacia el pico
        prim('sphere', (sx * 0.030, HY - 0.070, 0.090), (0.016, 0.026, 0.014), lambda f: C_BLACK, head_w, u=6, v=4)
    prim('sphere', (sx * 0.054 * HS, HY - 0.022, 0.104), (0.013, 0.015, 0.013), lambda f: C_EYE, head_w, u=8, v=6)   # anillo rojo del ojo
    prim('sphere', (sx * 0.064 * HS, HY - 0.024, 0.105), (0.005, 0.006, 0.006), lambda f: (0.95, 0.85, 0.55), head_w, u=6, v=4)   # iris claro
    prim('sphere', (sx * 0.066 * HS, HY - 0.024, 0.105), (0.0035, 0.0035, 0.0035), lambda f: C_BLACK, head_w, u=5, v=4)   # pupila

# cola: cuña larga y puntiaguda, con arista central
TL, TW = E['colaL'], E['colaW']
if E['cola'] == 'cuadrada': tail_ys = [0.26, 0.26 + 0.4 * (TL - 0.26), 0.26 + 0.8 * (TL - 0.26), TL]; tail_hw = [0.08, TW, TW * 1.05, TW * 0.95]
elif ESP == 'quebrantahuesos': tail_ys = [0.26, 0.40, 0.56, 0.72, 0.86, TL + 0.06]; tail_hw = [0.06, 0.115, 0.145, 0.135, 0.085, 0.0]   # rombo: se ensancha y acaba en punta
else: tail_ys = [0.26, 0.26 + 0.3 * (TL - 0.26), 0.26 + 0.58 * (TL - 0.26), TL]; tail_hw = [0.08, TW, TW * 0.9, 0.0]
def tail_w(p): return {'tail': smooth(0.22, 0.40, p.y), 'body': 1 - smooth(0.22, 0.40, p.y)}
# garras recogidas bajo la cola (en vuelo apenas se ven; hueso propio para posarse más adelante)
feet_w = lambda p: {'feet': 1.0}
for sx in (1, -1):
    prim('cone', (sx * 0.045, 0.16, -0.085), (1, 1, 1), lambda f: (0.42, 0.40, 0.38), feet_w, rot=Matrix.Rotation(math.radians(-80), 3, 'X'), r1=0.022, r2=0.012, d=0.13, u=6)   # tarso emplumado
    for dx in (-0.012, 0.0, 0.012):
        prim('cone', (sx * 0.045 + dx, 0.235, -0.092), (1, 1, 1), lambda f: (0.06, 0.06, 0.06), feet_w, rot=Matrix.Rotation(math.radians(-100), 3, 'X'), r1=0.006, r2=0.0, d=0.04, u=4)   # uñas
for sg in (1, -1):
    for k in range(len(tail_ys) - 1):
        y0, y1, w0, w1 = tail_ys[k], tail_ys[k + 1], tail_hw[k], tail_hw[k + 1]
        top = [(0, y0, 0.012), (sg * w0, y0, 0.0), (sg * w1, y1, 0.0), (0, y1, 0.012 if w1 else 0.0)]
        bot = [(0, y0, 0.0), (sg * w0, y0, -0.012), (sg * w1, y1, -0.012), (0, y1, 0.0)][::-1]
        if sg < 0: top = top[::-1]; bot = bot[::-1]
        emit(top, C_TAIL, tail_w); emit(bot, C_TAIL_UND, tail_w)

# ---------- malla y esqueleto ----------
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
me = bpy.data.meshes.new(ESP + '_malla')
bm.to_mesh(me); bm.free()
me.color_attributes.active_color = me.color_attributes['Color']
me.color_attributes.render_color_index = 0
me.color_attributes.active_color_index = 0
print('COLORES', [(c.name, c.domain, c.data_type) for c in me.color_attributes])
ob = bpy.data.objects.new(ESP, me)
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
bone('neck', (0, -0.28, 0.05), (0, HY + 0.08, 0.08), 'body')
bone('head', (0, HY + 0.08, 0.08), (0, HY - 0.06, 0.09), 'neck')
bone('tail', (0, 0.26, 0), (0, max(0.5, TL), 0), 'body')
bone('feet', (0, 0.10, -0.06), (0, 0.24, -0.09), 'body')
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
    zl = max(v.z for v in vs if v.x > 0.9); zr = max(v.z for v in vs if v.x < -0.9)
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

# eje y signo que llevan la punta del ala hacia atrás (+Y): para plegar el ala en flecha
def tip_y():
    dg = bpy.context.evaluated_depsgraph_get()
    e = ob.evaluated_get(dg); m = e.to_mesh()
    vs = [v.co for v in m.vertices]
    yl = sum(v.y for v in vs if v.x > 1.1) / max(1, sum(1 for v in vs if v.x > 1.1)); yr = sum(v.y for v in vs if v.x < -1.1) / max(1, sum(1 for v in vs if v.x < -1.1))
    e.to_mesh_clear(); return yl, yr
reset(); y0 = tip_y(); bestS = {}
for ax in range(3):
    for s, key in (('L', 0), ('R', 1)):
        if ax == (AXL if s == 'L' else AXR): continue
        reset(); r = [0, 0, 0]; r[ax] = math.radians(20)
        pb[f'wing_forearm.{s}'].rotation_euler = r; bpy.context.view_layer.update()
        dy = tip_y()[key] - y0[key]
        if abs(dy) > abs(bestS.get(s, (0, 0, 0))[2]): bestS[s] = (ax, 1 if dy > 0 else -1, dy)
reset()
print('eje plegado L', bestS['L'], 'R', bestS['R'])

def wing_rot(s, nm, ang, flecha=0.0):
    """ang: grados hacia arriba (+) o abajo; flecha: grados hacia atrás (plegado)."""
    ax, sg = (AXL, SL) if s == 'L' else (AXR, SR)
    axs, sgs = bestS[s][0], bestS[s][1]
    r = [0, 0, 0]; r[ax] = math.radians(ang) * sg; r[axs] += math.radians(flecha) * sgs
    pb[f'wing_{nm}.{s}'].rotation_euler = r

def aleteo(f, n):
    # batida lenta y profunda: el brazo manda, la mano llega tarde y en la subida se recoge hacia atrás
    ph = 2 * math.pi * f / n
    for s in 'LR':
        wing_rot(s, 'arm', 36 * math.sin(ph) + 6)
        wing_rot(s, 'forearm', 18 * math.sin(ph - 0.7), 10 * max(0, math.cos(ph - 0.4)))
        wing_rot(s, 'hand', 28 * math.sin(ph - 1.4), 16 * max(0, math.cos(ph - 0.8)))
        wing_rot(s, 'tip', 18 * math.sin(ph - 2.0), 6 * max(0, math.cos(ph - 1.2)))
    pb['body'].location = (0, 0, -0.06 * math.sin(ph - 0.3))
    pb['tail'].rotation_euler = (math.radians(8 * math.sin(ph - 1.2)), 0, 0)
    pb['head'].rotation_euler = (math.radians(4 * math.sin(ph - 1.0)), 0, 0)

def planeo(f, n):
    # planeo vivo: alas casi quietas con pequeñas correcciones, la cola gira para dirigir y la cabeza busca comida a un lado y a otro, mirando abajo
    ph = 2 * math.pi * f / n
    for s in 'LR':
        o = 0 if s == 'L' else 1.3
        wing_rot(s, 'arm', 2.5 * math.sin(ph + o) + 4)
        wing_rot(s, 'forearm', 3.5 * math.sin(ph + o - 0.8), 2 * math.sin(2 * ph + o))
        wing_rot(s, 'hand', 5 * math.sin(2 * ph + o - 1.4), 3 * math.sin(3 * ph + o))
        wing_rot(s, 'tip', 8 * math.sin(2 * ph + o - 2.2))
    pb['body'].location = (0, 0, 0.012 * math.sin(ph))
    pb['tail'].rotation_euler = (math.radians(3.5 * math.sin(ph - 0.9)), math.radians(9 * math.sin(ph)), 0)
    pb['neck'].rotation_euler = (math.radians(10 + 6 * math.sin(2 * ph)), 0, 0)
    pb['head'].rotation_euler = (math.radians(14), math.radians(28 * math.sin(ph) ** 3), math.radians(6 * math.sin(ph)))

def vira(lado):
    # postura de viraje: el ala de dentro algo recogida y baja, la de fuera tendida; la cola se tuerce y la cabeza mira hacia la curva
    sd = 1 if lado == 'L' else -1
    def k(f, n):
        ph = 2 * math.pi * f / n
        dentro, fuera = ('L', 'R') if lado == 'L' else ('R', 'L')
        wing_rot(dentro, 'arm', 1); wing_rot(dentro, 'forearm', -3, 8); wing_rot(dentro, 'hand', -4, 14); wing_rot(dentro, 'tip', 4, 6)
        wing_rot(fuera, 'arm', 6 + 1.5 * math.sin(ph)); wing_rot(fuera, 'forearm', 2); wing_rot(fuera, 'hand', 3 * math.sin(ph)); wing_rot(fuera, 'tip', 9)
        pb['tail'].rotation_euler = (math.radians(4), math.radians(-22 * sd), 0)
        pb['neck'].rotation_euler = (math.radians(12), 0, math.radians(8 * sd))
        pb['head'].rotation_euler = (math.radians(16), math.radians(30 * sd), math.radians(10 * sd))
    return k

def plegado(f, n):
    # alas en flecha para ganar velocidad entre crestas: muñecas hacia delante y manos muy atrás, cola cerrada y algo levantada
    ph = 2 * math.pi * f / n
    for s in 'LR':
        o = 0 if s == 'L' else 1.0
        wing_rot(s, 'arm', 7 + 1.5 * math.sin(ph + o), -6)
        wing_rot(s, 'forearm', -4, 14)
        wing_rot(s, 'hand', -6, 26 + 2 * math.sin(2 * ph + o))
        wing_rot(s, 'tip', 2, 10)
    pb['body'].location = (0, 0, 0.01 * math.sin(ph))
    pb['tail'].rotation_euler = (math.radians(-5), math.radians(3 * math.sin(ph)), 0)
    pb['head'].rotation_euler = (math.radians(4), 0, 0)

make_action('Planeo', 150, planeo)
make_action('Aleteo', 66, aleteo)
make_action('ViraIzq', 60, vira('L'))
make_action('ViraDer', 60, vira('R'))
make_action('Plegado', 60, plegado)
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
    pose('Plegado', 1); shot('plegado_arriba', (0, -0.1, 6), (0, 0, 0))
    pose('ViraIzq', 1); shot('viraizq_arriba', (0, -0.1, 6), (0, 0, 0)); shot('viraizq_frente', (0, -6, 0.3), (90, 0, 0))
    pose('Planeo', 40); cam.data.ortho_scale = 0.9; shot('cabeza', (0.6, -1.0, 0.35), (80, 0, 150)); cam.data.ortho_scale = 3.4
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
if 'export_optimize_animation_size' in opts: kw['export_optimize_animation_size'] = True
if 'export_colors' in opts: kw['export_colors'] = True
if 'export_vertex_color' in opts: kw['export_vertex_color'] = 'ACTIVE'
bpy.ops.export_scene.gltf(**kw)
print('EXPORTADO', OUT, len(me.vertices), 'vértices', len(me.polygons), 'caras')

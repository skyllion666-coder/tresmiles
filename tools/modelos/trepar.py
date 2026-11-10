"""Clips «trepar» y «gatear» para el montañero (se importa desde montanero_anim.py con el esqueleto del Universal Animation Library ya cargado).
No hay trepada en la librería: se calcula aquí. Delante del montañero hay una roca virtual que pasa por sus pies (una pared de 60° para «trepar», una losa
de 15° para «gatear»), y en ella presas que bajan a velocidad constante (como el suelo en un ciclo de andar: en la web el avance lo pone la ruta). Tres
apoyos fijos y uno que se mueve, en el orden del que trepa: mano derecha, pie izquierdo, mano izquierda, pie derecho.
«trepar»: de cara a la roca, con la cadera separada y el pecho más cerca; sube a empujones (cuando empuja la pierna que acaba de apoyarse), carga el peso
sobre el pie que aguanta y ladea hombros y cadera hacia la mano y el pie altos.
«gatear» (crestas y pasos aéreos casi llanos, como el Paso de Mahoma): a cuatro apoyos, el cuerpo tendido sobre la roca, las manos planas delante de los
hombros, los pies de puntera con las rodillas dobladas bajo el cuerpo (sin tocar el suelo) y la cabeza levantada, mirando por dónde va.

Versión del 10-11-2026: la anterior usaba la IK de Blender con polos y `pole_angle = 0`, que en este esqueleto doblaba los dos codos hacia el mismo lado y
las dos rodillas hacia el otro (parecían brazos y piernas al revés), y dejaba manos y pies sin orientar. Ahora la IK de dos huesos se resuelve aquí a mano:
el codo y la rodilla van exactamente hacia donde se les dice y el eje de la articulación queda perpendicular al plano del miembro, así que no se retuercen.
Las manos se apoyan con la palma en la roca y los pies con la puntera. Se escriben fotogramas clave directamente (sin hornear), a 30 fps.
El montañero mira hacia -Y (Blender), z hacia arriba, metros. `hacer(arm, nombre)` devuelve la acción; `MEDIDAS[nombre]` guarda lo más estirado y lo más
doblado que queda cada miembro."""
import bpy, math
from types import SimpleNamespace
from mathutils import Vector, Quaternion, Matrix

FPS = 30
SUBE = 0.22                     # parte del ciclo que tarda cada extremidad en cambiar de presa (4 × 0,22 < 1: nunca hay dos en el aire)
ORDEN = {('mano', 'R'): 0.0, ('pie', 'L'): 0.25, ('mano', 'L'): 0.5, ('pie', 'R'): 0.75}   # cuándo se suelta cada una
# postura de cada clip (u: metros roca arriba desde los pies; n: separación de la roca; x: a los lados). Los polos dicen hacia dónde se doblan el codo y la
# rodilla: (hacia fuera, roca arriba, separándose de la roca, hacia el cielo)
CLIPS = {
    'trepar': dict(
        N=48, PEND=60, VEL=0.30,               # fotogramas del ciclo, pendiente de la roca (grados) y m/s por ella (la web ajusta el ritmo del clip a la velocidad con esta cifra)
        PIE_ALTO=0.44, PIE_X=0.21,             # presa más alta del pie y separación lateral (más abiertos que la cadera: rodillas fuera)
        MANO_ALTO=1.82, MANO_X=0.25,           # presa más alta de la mano
        CADERA_U=0.71, CADERA_N=0.39,          # la cadera, separada de la roca
        EMPUJE=0.6,                            # 1: el cuerpo sube solo mientras empuja la pierna (a escalones); 0: sube de continuo
        VAIVEN=0.045,                          # la cadera se va sobre el pie que aguanta
        INCL=(28, 33, 38, 43),                 # inclinación hacia la roca de cadera, lumbares, dorsales y pecho (grados desde la vertical)
        CUELLO=(24, 4),                        # cuello y cabeza (grados desde la vertical): mira arriba, a la presa de la mano que sube
        PIE_GIRO=(32, -14),                    # el pie: abierto hacia fuera (como la rodilla) y con el talón algo caído
        POLO_MANO=(0.75, 0, 0.3, -0.6),        # codo hacia fuera y abajo, algo separado de la roca
        POLO_PIE=(0.85, 0.15, -0.55, 0)),      # rodilla hacia fuera y hacia la roca
    'gatear': dict(
        N=40, PEND=15, VEL=0.36,
        PIE_ALTO=0.16, PIE_X=0.17,
        MANO_ALTO=1.00, MANO_X=0.21,
        CADERA_U=0.20, CADERA_N=0.57,
        EMPUJE=0.3,
        VAIVEN=0.03,
        INCL=(82, 86, 90, 93),                 # tendido sobre la roca, los hombros algo más bajos que la cadera
        CUELLO=(48, 12),                       # la cabeza levantada: mira hacia delante
        PIE_GIRO=(10, 22),                     # de puntera, con el talón levantado
        POLO_MANO=(0.6, -0.7, 0.3, 0),         # codo hacia atrás y algo hacia fuera
        POLO_PIE=(0.3, 0.8, -0.3, 0)),         # rodilla hacia delante, bajo el cuerpo
}
MEDIDAS = {}
X = Vector((1, 0, 0)); Z = Vector((0, 0, 1)); O = Vector((0, 0.05, 0))

clamp = lambda x, a, b: max(a, min(b, x))
suave = lambda t: (lambda t: t * t * (3 - 2 * t))(clamp(t, 0.0, 1.0))
rx = lambda g: Matrix.Rotation(math.radians(g), 3, 'X'); ry = lambda g: Matrix.Rotation(math.radians(g), 3, 'Y'); rz = lambda g: Matrix.Rotation(math.radians(g), 3, 'Z')

def presa(fase, t0, alto, paso):
    """Altura (u) de la presa de una extremidad y cuánto va de su paso (0 apoyada; 0-1 en el aire). Se suelta en t0, sube `paso` en la roca y vuelve a bajar con ella."""
    w = (fase - t0) % 1.0; bajo = alto - paso * (1 - SUBE)
    if w < SUBE: s = suave(w / SUBE); return bajo + paso * (s - w), s
    return alto - paso * (w - SUBE), 0.0

def empuje(fase):
    """Vaivén del cuerpo roca arriba respecto al avance medio (en pasos): sube mientras empuja la pierna recién apoyada (dos veces por ciclo) y se queda al subir un pie."""
    esc = lambda f: sum(0.5 * suave((2 * f - k + 0.1) / 0.62) for k in range(-3, 4))
    return esc(fase) - fase - (esc(0.0) + 0.02)

def marco(a, b):
    """Matriz con columnas a, b y a×b (a y b unitarios y perpendiculares)."""
    c = a.cross(b); return Matrix(((a.x, b.x, c.x), (a.y, b.y, c.y), (a.z, b.z, c.z)))

def perp(v, eje):
    return (v - eje * v.dot(eje)).normalized()

def giro_propio(q, eje):
    """Ángulo que gira `q` alrededor de `eje` (parte de torsión de la rotación)."""
    v = Vector((q.x, q.y, q.z)); return 2 * math.atan2(v.dot(eje), q.w)

def hacer(arm, nombre='trepar'):
    c = SimpleNamespace(**CLIPS[nombre]); N = c.N; PASO = c.VEL * N / FPS   # lo que avanza en un ciclo: cada mano y cada pie da un paso así
    pend = math.radians(c.PEND); U = Vector((0, -math.cos(pend), math.sin(pend))); NOR = Vector((0, math.sin(pend), math.cos(pend)))
    pared = lambda u, x, n=0.0: O + U * u + X * x + NOR * n
    polo_de = lambda k, sx: X * sx * k[0] + U * k[1] + NOR * k[2] + Z * k[3]
    sc = bpy.context.scene; sc.frame_start, sc.frame_end = 0, N; sc.render.fps = FPS
    arm.animation_data_create(); act = bpy.data.actions.new(nombre); arm.animation_data.action = act
    for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    B = arm.data.bones; R0 = {b.name: b.matrix_local.copy() for b in B}   # reposo (T) en el espacio del esqueleto
    rel = {b.name: (R0[b.parent.name].inverted() @ R0[b.name]) if b.parent else R0[b.name] for b in B}
    cab = lambda n: R0[n].to_translation()
    # miembros: (hueso de arriba, hueso de abajo, extremo), eje de la articulación en reposo (el giro positivo dobla el codo hacia delante y la rodilla hacia atrás)
    MIEMBRO = {}
    for l, sx in (('L', 1), ('R', -1)):
        for nom, hs, eje in (('mano', ('DEF-upper_arm', 'DEF-forearm', 'DEF-hand'), Vector((0, 0, -sx))), ('pie', ('DEF-thigh', 'DEF-shin', 'DEF-foot'), Vector((1, 0, 0)))):
            a, b, cc = (f'{h}.{l}' for h in hs); y1 = (cab(b) - cab(a)); y2 = (cab(cc) - cab(b))
            MIEMBRO[(nom, l)] = dict(h=(a, b, cc), L1=y1.length, L2=y2.length, m1=marco(y1.normalized(), perp(eje, y1.normalized())), m2=marco(y2.normalized(), perp(eje, y2.normalized())), y2=y2.normalized())
    assert cab('DEF-thumb.01.L').y < cab('DEF-hand.L').y, 'el pulgar no mira hacia delante: la palma en reposo no está hacia abajo'
    TALON = cab('DEF-foot.L') - Vector((cab('DEF-toe.L').x, cab('DEF-toe.L').y, 0))   # del apoyo de la puntera (en la suela) al tobillo, en reposo
    HUESOS = ['root', 'DEF-hips', 'DEF-spine.001', 'DEF-spine.002', 'DEF-spine.003', 'DEF-neck', 'DEF-head'] + [f'{h}.{l}' for l in 'LR' for h in
              ('DEF-shoulder', 'DEF-upper_arm', 'DEF-forearm', 'DEF-hand', 'DEF-thigh', 'DEF-shin', 'DEF-foot', 'DEF-toe')]
    previo = {}; estira = {'mano': 0.0, 'pie': 0.0}; dobla = {'mano': 9.0, 'pie': 9.0}; corto = 0
    for f in range(N + 1):
        fase = (f % N) / N; W = {}; base = {}
        def pon(n, D, pos=None):
            """Coloca el hueso n con el giro D respecto al reposo (en el espacio del esqueleto); solo la cadera lleva además posición."""
            P = (W[B[n].parent.name] @ rel[n]) if B[n].parent else rel[n]
            M = (D @ R0[n].to_3x3()).to_4x4(); M.translation = pos if pos is not None else P.to_translation()
            W[n] = M; base[n] = P.inverted() @ M
        junta = lambda n: (W[B[n].parent.name] @ rel[n]).to_translation()   # dónde queda la cabeza del hueso n (su padre ya colocado)
        u = {k: presa(fase, t0, c.MANO_ALTO if k[0] == 'mano' else c.PIE_ALTO, PASO) for k, t0 in ORDEN.items()}
        dm = (u[('mano', 'R')][0] - u[('mano', 'L')][0]) / PASO; dp = (u[('pie', 'R')][0] - u[('pie', 'L')][0]) / PASO   # -0,8 a 0,8: qué mano y qué pie van más altos
        # tronco: cadera separada de la roca y pecho cerca; el peso, sobre el pie que aguanta; la cadera sube del lado del pie alto y los hombros del de la mano alta
        vai = -c.VAIVEN * math.sin(2 * math.pi * (fase - 0.125)); sube_pie = max(u[('pie', 'L')][1], u[('pie', 'R')][1])
        pon('root', Matrix.Identity(3))
        tronco = lambda incl, k: rx(incl) @ rz(9 * dm * k - 5 * dp * (1 - k)) @ ry(7 * dm * k + 6 * dp * (1 - k))   # k: 0 en la cadera, 1 en el pecho
        pon('DEF-hips', tronco(c.INCL[0], 0.0), pared(c.CADERA_U + c.EMPUJE * PASO * empuje(fase), vai, c.CADERA_N + 0.02 * math.sin(math.pi * sube_pie)))
        for n, incl, k in (('DEF-spine.001', c.INCL[1], 0.3), ('DEF-spine.002', c.INCL[2], 0.65), ('DEF-spine.003', c.INCL[3], 1.0)): pon(n, tronco(incl, k))
        pecho = tronco(c.INCL[3], 1.0)
        pon('DEF-neck', rx(c.CUELLO[0]) @ rz(11 * dm)); pon('DEF-head', rx(c.CUELLO[1]) @ rz(20 * dm) @ ry(3 * dm))   # mira a la presa de la mano que avanza
        for (nom, l), (uu, s) in u.items():
            sx = 1 if l == 'L' else -1; mb = MIEMBRO[(nom, l)]; a, b, cc = mb['h']; sep = math.sin(math.pi * s)   # sep: 0 apoyada, 1 a mitad del paso
            if nom == 'mano':
                alta = clamp((uu - (c.MANO_ALTO - PASO * (1 - SUBE))) / (PASO * (1 - SUBE)), 0, 1)
                pon(f'DEF-shoulder.{l}', pecho @ ry(-sx * (4 + 14 * alta)))   # el hombro sube con la mano
                # mano: palma en la roca, dedos hacia arriba y algo hacia dentro; el talón de la mano un poco levantado (más al soltarse)
                g = math.radians(14 + 28 * sep); d0 = (U * math.cos(math.radians(18)) - X * sx * math.sin(math.radians(18))).normalized()
                dedos = (d0 * math.cos(g) - NOR * math.sin(g)).normalized(); palma = perp(-NOR, dedos)
                D3 = marco(dedos, palma) @ marco(Vector((sx, 0, 0)), Vector((0, 0, -1))).transposed()
                obj = pared(uu, sx * (c.MANO_X - 0.03 * sep), 0.10 * sep) - dedos * 0.10 - palma * 0.02   # la muñeca: detrás de las yemas, que son las que tocan
                polo = polo_de(c.POLO_MANO, sx)
            else:
                # pie: la puntera en la presa, abierto hacia fuera (como la rodilla); en el aire, la puntera cae
                D3 = rz(sx * c.PIE_GIRO[0]) @ rx(c.PIE_GIRO[1] + 30 * sep)
                obj = pared(uu, sx * (c.PIE_X + 0.02 * sep), 0.13 * sep) + D3 @ TALON
                polo = polo_de(c.POLO_PIE, sx)
            J = junta(a); v = obj - J; d = v.length; tope = (mb['L1'] + mb['L2']) * 0.985
            if d > tope: corto += 1; v = v * (tope / d); d = tope; obj = J + v   # fuera de alcance: se queda corta (no debe pasar: ver MEDIDAS)
            estira[nom] = max(estira[nom], d / (mb['L1'] + mb['L2'])); dobla[nom] = min(dobla[nom], d / (mb['L1'] + mb['L2']))
            dr = v / d; p = perp(polo, dr); x1 = (mb['L1'] ** 2 - mb['L2'] ** 2 + d * d) / (2 * d); h = math.sqrt(max(mb['L1'] ** 2 - x1 * x1, 0.0))
            codo = J + dr * x1 + p * h; eje = p.cross(dr)   # el eje de giro del codo o la rodilla, perpendicular al plano del miembro
            D1 = marco((codo - J).normalized(), eje) @ mb['m1'].transposed(); D2 = marco((obj - codo).normalized(), eje) @ mb['m2'].transposed()
            if nom == 'mano':   # la torsión entre el antebrazo y la mano se reparte: el antebrazo gira con ella (pronación), para que la muñeca no se estrangule
                D2 = D2 @ Matrix.Rotation(0.6 * giro_propio((D2.transposed() @ D3).to_quaternion(), mb['y2']), 3, mb['y2'])
            pon(a, D1); pon(b, D2); pon(cc, D3)
            if nom == 'pie': pon(f'DEF-toe.{l}', D3)
        for n in HUESOS:
            pb = arm.pose.bones[n]; q = base[n].to_quaternion()
            if n in previo and q.dot(previo[n]) < 0: q.negate()   # sin saltos de signo entre fotogramas
            previo[n] = q.copy(); pb.rotation_quaternion = q; pb.keyframe_insert('rotation_quaternion', frame=f)
            if n in ('root', 'DEF-hips'): pb.location = base[n].to_translation(); pb.keyframe_insert('location', frame=f)
    for fc in act.fcurves:
        for k in fc.keyframe_points: k.interpolation = 'LINEAR'
    MEDIDAS[nombre] = dict(brazo_max=estira['mano'], brazo_min=dobla['mano'], pierna_max=estira['pie'], pierna_min=dobla['pie'], cortos=corto)
    print(nombre + ': brazo de {:.0%} a {:.0%} de su largo, pierna de {:.0%} a {:.0%}; fuera de alcance {} veces'.format(dobla['mano'], estira['mano'], dobla['pie'], estira['pie'], corto))
    act.use_fake_user = True
    return act

"""Clip «trepar» para el montañero (se importa desde montanero_anim.py con el esqueleto del Universal Animation Library ya cargado).
No hay trepada en la librería: se hace con IK. Delante del montañero hay una pared virtual de 60° y en ella presas que bajan a velocidad constante
(como el suelo en un ciclo de andar: en la web el avance lo pone la ruta). Cada mano y cada pie se agarra arriba, baja con la presa y, al llegar abajo,
se suelta y vuelve a subir en arco, separándose de la roca; orden de escalador: mano derecha, pie izquierdo, mano izquierda, pie derecho.
El tronco se inclina hacia la pared y la cabeza mira arriba. Se hornea a fotogramas clave (`trepar`, 48 fotogramas, 1,6 s a 30 fps) y se quitan IK y objetivos.
El montañero mira hacia -Y (Blender), z hacia arriba, metros."""
import bpy, math
from mathutils import Vector, Quaternion

N = 48
PEND = math.radians(60)
DES = Vector((0, math.cos(PEND), -math.sin(PEND)))   # dirección pared abajo (hacia el montañero y hacia abajo)

def en_pared(z, x, off):
    """Punto de la pared a la altura z (la pared pasa por y = off en z = 0 y sube alejándose hacia -Y)."""
    return Vector((x, off - z / math.tan(PEND), z))

def ciclo(fase, t0, sube=0.25):
    """Posición de la extremidad en el ciclo (0 = abajo, 1 = arriba) y separación de la pared; fase en [0, 1); t0: inicio de su subida."""
    u = (fase - t0) % 1.0
    if u < sube: s = u / sube; s = s * s * (3 - 2 * s); return s, math.sin(math.pi * s)
    return 1 - (u - sube) / (1 - sube), 0.0

def hacer(arm):
    sc = bpy.context.scene; sc.frame_start, sc.frame_end = 0, N; sc.render.fps = 30
    arm.animation_data_create(); arm.animation_data.action = None
    for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    bpy.context.view_layer.update()
    vacios = []
    def vacio(nombre):
        e = bpy.data.objects.new(nombre, None); sc.collection.objects.link(e); vacios.append(e); return e
    # IK de brazos y piernas, con polos: codos hacia fuera y abajo, rodillas hacia delante y fuera
    obj, polo = {}, {}
    for lado, sx in (('L', 1), ('R', -1)):
        for miembro, hueso, p in (('mano', f'DEF-forearm.{lado}', (0.55 * sx, 0.1, 0.95)), ('pie', f'DEF-shin.{lado}', (0.35 * sx, -0.7, 0.55))):
            o, q = vacio(f'{miembro}_{lado}'), vacio(f'polo_{miembro}_{lado}'); q.location = p
            c = arm.pose.bones[hueso].constraints.new('IK'); c.target = o; c.pole_target = q; c.chain_count = 2
            c.pole_angle = 0.0
            obj[(miembro, lado)] = o; polo[(miembro, lado)] = q
    # orden: mano D 0, pie I 0.25, mano I 0.5, pie D 0.75
    t0 = {('mano', 'R'): 0.0, ('pie', 'L'): 0.25, ('mano', 'L'): 0.5, ('pie', 'R'): 0.75}
    rango = {'mano': (1.0, 1.42), 'pie': (0.06, 0.44)}
    hips, sp, neck, head = (arm.pose.bones[n] for n in ('DEF-hips', 'DEF-spine.002', 'DEF-neck', 'DEF-head'))
    for f in range(N + 1):
        fase = (f % N) / N; sc.frame_set(f)
        # tronco hacia la pared, con un pequeño vaivén lateral hacia la mano que sube
        lado_mano = 1 if ((fase + 0.75) % 1) < 0.5 else -1
        hips.rotation_quaternion = Quaternion((1, 0, 0), math.radians(32)) @ Quaternion((0, 1, 0), math.radians(4 * math.sin(2 * math.pi * fase)))
        hips.location = (0.02 * math.sin(2 * math.pi * fase), -0.06, 0.0)
        sp.rotation_quaternion = Quaternion((1, 0, 0), math.radians(8))
        neck.rotation_quaternion = Quaternion((1, 0, 0), math.radians(-22)); head.rotation_quaternion = Quaternion((1, 0, 0), math.radians(-12)) @ Quaternion((0, 1, 0), math.radians(10 * math.sin(2 * math.pi * fase)))
        for pb in (hips, sp, neck, head):
            pb.keyframe_insert('rotation_quaternion', frame=f)
        hips.keyframe_insert('location', frame=f)
        for (miembro, lado), o in obj.items():
            s, sep = ciclo(fase, t0[(miembro, lado)])
            z0, z1 = rango[miembro]; z = z0 + (z1 - z0) * s
            x = (0.24 if miembro == 'mano' else 0.14) * (1 if lado == 'L' else -1)
            p = en_pared(z, x, 0.04 if miembro == 'pie' else 0.08) + Vector((0, 0.10 * sep, 0.04 * sep))   # al subir se separa de la roca
            o.location = p; o.keyframe_insert('location', frame=f)
    for e in vacios:
        for fc in (e.animation_data.action.fcurves if e.animation_data and e.animation_data.action else []):
            for k in fc.keyframe_points: k.interpolation = 'LINEAR'
    # hornear (y borrar las acciones auxiliares: la de los fotogramas a mano del tronco y las de los objetivos)
    aux = [arm.animation_data.action] + [e.animation_data.action for e in vacios if e.animation_data and e.animation_data.action]
    bpy.context.view_layer.objects.active = arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.nla.bake(frame_start=0, frame_end=N, only_selected=False, visual_keying=True, clear_constraints=True, use_current_action=False, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    act = arm.animation_data.action; act.name = 'trepar'; act.use_fake_user = True
    for e in vacios: bpy.data.objects.remove(e)
    for a in aux:
        if a is not act: bpy.data.actions.remove(a)
    return act

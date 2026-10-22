"""Generador de rocas de granito para las cimas (se importa desde los scripts tools/modelos/cima_*.py, dentro de Blender).
- `bloque(R, nombre, (sx, sy, sz), ...)`: bloque anguloso como el granito diaclasado: una caja cortada por varios planos al azar cerca de las esquinas
  (caras planas y aristas vivas, sin la forma de «cubo biselado»), con un poco de desplazamiento y sombreado plano.
- Color por vértice (atributo «Col», sale en el glTF como COLOR_0): gris del granito con manchas de óxido ocre y de líquenes amarillo-verdosos y oscuros
  mediante ruido 3D, para que pese poco (sin texturas). El material es blanco y three.js multiplica por el color del vértice.
- `asentar(objs, suelo, pasos)`: deja caer los bloques con la física de Blender (cuerpos rígidos) para que se apoyen unos en otros de forma creíble y fija su posición final.
- `apoyo(x, y, objs)`: altura de lo más alto bajo un punto (rayo hacia abajo), para colocar piezas encima del montón."""
import bpy, bmesh, math
from mathutils import Vector, Matrix, noise

def material(nombre='granito', rough=0.92):
    m = bpy.data.materials.get(nombre) or bpy.data.materials.new(nombre); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Base Color'].default_value = (1, 1, 1, 1); b.inputs['Roughness'].default_value = rough
    ca = m.node_tree.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'; m.node_tree.links.new(ca.outputs['Color'], b.inputs['Base Color'])
    return m

# paletas (lineales): granito gris, granito dorado (más oxidado, como las lajas de la Astorg), óxido, liquen amarillo-verdoso y liquen oscuro
GRIS = (0.17, 0.17, 0.16); DORADO = (0.30, 0.22, 0.12); OXIDO = (0.34, 0.17, 0.07); LIQUEN = (0.36, 0.34, 0.12); OSCURO = (0.05, 0.05, 0.05)
mezcla = lambda a, b, t: tuple(x + (y - x) * t for x, y in zip(a, b))
liso = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(max(0.0, min(1.0, (x - a) / (b - a))))

def pinta(o, R, base=GRIS, oxido=0.35, liquen=0.25, var=0.12):
    """Color por esquina de cara: tono base con variación, óxido en manchas grandes, liquen en manchas pequeñas, algo más oscuro hacia abajo."""
    me = o.data; at = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    sem = Vector((R.uniform(0, 100), R.uniform(0, 100), R.uniform(0, 100))); k = R.uniform(-var, var)
    zmin = min(v.co.z for v in me.vertices); zmax = max(v.co.z for v in me.vertices) or 1
    for poly in me.polygons:
        for li in poly.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co
            c = tuple(min(1.0, x * (1 + k)) for x in base)
            n1 = noise.noise(p * 1.6 + sem); n2 = noise.noise(p * 5.0 + sem * 2); n3 = noise.noise(p * 11.0 - sem)
            c = mezcla(c, OXIDO, oxido * liso(0.0, 0.45, n1))
            c = mezcla(c, LIQUEN, min(1.0, liquen * 1.8) * liso(0.15, 0.45, n2))
            c = mezcla(c, OSCURO, 0.7 * liquen * liso(0.25, 0.55, n3))
            sombra = 0.8 + 0.2 * liso(zmin, zmax, p.z) if zmax > zmin else 1
            c = tuple(x * sombra * (0.94 + 0.12 * (n3 * 0.5 + 0.5)) for x in c)
            at.data[li].color = (*c, 1.0)
    me.color_attributes.active_color = at

def bloque(R, nombre, tam, pos=(0, 0, 0), rot=(0, 0, 0), cortes=7, mat=None, base=GRIS, oxido=0.35, liquen=0.25, coleccion=None):
    sx, sy, sz = tam
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if max(tam) > 0.9: bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)   # los grandes, con más vértices para el desplazamiento
    for _ in range(cortes):   # plano que corta una esquina o arista: normal hacia fuera al azar, a una distancia entre el 30 y el 48 % del tamaño
        n = Vector((R.uniform(-1, 1), R.uniform(-1, 1), R.uniform(-1, 1))).normalized()
        d = 0.5 * (abs(n.x) * sx + abs(n.y) * sy + abs(n.z) * sz) * R.uniform(0.62, 0.92)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        r = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=n * d, plane_no=n, clear_outer=True)
        borde = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        if borde:
            try: bmesh.ops.holes_fill(bm, edges=borde, sides=0)
            except Exception: pass
    for v in bm.verts: v.co += Vector((R.uniform(-.025, .025) * sx, R.uniform(-.025, .025) * sy, R.uniform(-.025, .025) * sz))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    o = bpy.data.objects.new(nombre, me); (coleccion or bpy.context.collection).objects.link(o)
    o.location = pos; o.rotation_euler = rot; o.data.materials.append(mat or material())
    pinta(o, R, base, oxido, liquen); return o

def asentar(objs, pasivos=(), pasos=140):
    """Cuerpos rígidos: `objs` caen y se asientan sobre `pasivos` (y entre sí); luego se fija la posición final y se quita la física."""
    sc = bpy.context.scene
    if not sc.rigidbody_world: bpy.context.view_layer.objects.active = objs[0]; bpy.ops.rigidbody.world_add()
    w = sc.rigidbody_world; w.substeps_per_frame = 20; w.solver_iterations = 20; w.point_cache.frame_start = 1; w.point_cache.frame_end = pasos + 1
    if not w.collection: w.collection = bpy.data.collections.new('RigidBodyWorld')
    for o, tipo in [(o, 'ACTIVE') for o in objs] + [(o, 'PASSIVE') for o in pasivos]:
        if o.name not in w.collection.objects: w.collection.objects.link(o)
        rb = o.rigid_body; rb.type = tipo; rb.collision_shape = 'CONVEX_HULL';   # los bloques son convexos; el suelo provisional es una caja
        rb.friction = 0.95; rb.restitution = 0.0
        rb.linear_damping = 0.6; rb.angular_damping = 0.9; rb.collision_margin = 0.002
        if tipo == 'ACTIVE': rb.mass = max(0.1, o.dimensions.x * o.dimensions.y * o.dimensions.z * 2600)
    for f in range(1, pasos + 1): sc.frame_set(f)
    for o in objs:
        M = o.matrix_world.copy(); o.select_set(True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.visual_transform_apply()
    for o in list(objs) + list(pasivos):
        mw = o.matrix_world.copy(); bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.rigidbody.object_remove(); o.matrix_world = mw
    sc.frame_set(1)

def apoyo(x, y, objs, z0=20.0):
    """Altura del punto más alto de `objs` bajo (x, y)."""
    dg = bpy.context.evaluated_depsgraph_get(); mejor = -1e9
    for o in objs:
        inv = o.matrix_world.inverted(); a = inv @ Vector((x, y, z0)); b = inv @ Vector((x, y, -20)); d = (b - a).normalized()
        ok, loc, nrm, idx = o.ray_cast(a, d)
        if ok: mejor = max(mejor, (o.matrix_world @ loc).z)
    return mejor

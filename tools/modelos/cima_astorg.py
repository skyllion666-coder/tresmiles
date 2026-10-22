#!/usr/bin/env python3
"""Cima de la Punta de Astorg (3.355 m, cresta Maldito–Astorg–Medio, granito de la Maladeta), copiada de la foto de referencia del usuario (22-10-2026; no se publica).
Lo que hay en la foto (medidas sacadas de la foto en la que una persona está de pie encima):
- un bloque alto y grueso, de pie como una lápida (~1 m de ancho, ~0,6 de grueso, ~1,85 de alto), algo inclinado a la izquierda: la parte de arriba es más alta a
  la izquierda y baja hacia la derecha, con un hombro y una muesca arriba a la derecha; encima, a la izquierda, una piedrita puntiaguda;
- una laja gruesa (~1,3 × 0,7 × 0,38 m) apoyada en diagonal DELANTE de la parte baja del bloque, subiendo hacia la derecha y sobresaliendo por ese lado;
- debajo, un montón de bloques angulosos de granito gris claro con líquenes.
El granito lleva texturas de roca escaneadas (Poly Haven, CC0): color, mapa de normales y, en Blender, la altura para deformar de verdad la superficie
(rock_08, ocre-pardo moteado, en el bloque y la laja; rock_boulder_dry, gris claro, en el montón). Ver ~/tresmiles-fuentes/texturas/LEEME.txt.
El contorno del bloque se dibuja a mano a partir de la foto (no es una forma al azar). Los bloques del montón caen con la física de Blender (tools/modelos/rocas.py).
Unidades: metros. Z arriba; origen en el centro del montón, a ras de suelo. Frente (la cara de la foto) = -Y; la cresta va a lo largo del eje X.
Las piezas del montón se llaman «bloqueN» (la web las asienta una a una en el relieve); las de la torre, «torre_*» (se mueven juntas).
Uso: blender -b --python tools/modelos/cima_astorg.py -- /tmp/cima-astorg.glb
  y después comprimir la malla (el Blender del sistema no trae Draco): npx -y @gltf-transform/cli@4 meshopt /tmp/cima-astorg.glb models/cima-astorg.glb --level medium
  (la web lo lee con el MeshoptDecoder de vendor/three/libs)."""
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rocas
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/cima-astorg.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
R = random.Random(3355)
M_OCRE = rocas.material_escaneado('granito_ocre', 'rock_08')            # granito ocre-pardo moteado (Poly Haven, CC0; 1,5 m de lado)
M_GRIS = rocas.material_escaneado('granito_gris', 'rock_boulder_dry', tam='512')   # piedra gris clara (Poly Haven, CC0; 1,8 m de lado)
V = bpy.data.objects.new('Vertice', None); bpy.context.collection.objects.link(V)
T = lambda x, y, z: Matrix.Translation((x, y, z))

def prisma(nombre, perfil, grueso, mat, M=Matrix.Identity(4), bisel=0.025):
    """Pieza de caras planas a partir de su contorno de frente (x, z), con grosor en Y; la cara de detrás algo distinta para que no parezca recortada."""
    bm = bmesh.new()
    fr = [bm.verts.new((x, -grueso / 2 + R.uniform(-.015, .015), z)) for x, z in perfil]
    tr = [bm.verts.new((x * 0.97 + R.uniform(-.03, .03), grueso / 2 + R.uniform(-.04, .04), z * (0.97 if z > 0.3 else 1) + R.uniform(-.03, .03))) for x, z in perfil]
    bm.faces.new(fr[::-1]); bm.faces.new(tr)
    for i in range(len(perfil)):
        j = (i + 1) % len(perfil); bm.faces.new((fr[i], fr[j], tr[j], tr[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bisel, segments=1, affect='EDGES')
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nombre, me); bpy.context.collection.objects.link(o); o.data.materials.append(mat); rocas.uv_caja(o, R, 1.5); return o

# — montón de bloques grises (caen con la física) —
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(10, 10, 1), verts=bm.verts); bmesh.ops.translate(bm, vec=(0, 0, -0.5), verts=bm.verts)
me = bpy.data.meshes.new('suelo'); bm.to_mesh(me); bm.free(); suelo = bpy.data.objects.new('suelo', me); bpy.context.collection.objects.link(suelo)
monton = []; k = 0
for capa in range(2):
    for x in (-0.95, 0.0, 0.95):
        for y in (-0.75, 0.0, 0.75):
            s = R.uniform(0.42, 0.7)
            monton.append(rocas.bloque(R, f'bloque{k}', (s * R.uniform(1.0, 1.4), s * R.uniform(0.75, 1.05), s * R.uniform(0.55, 0.85)), (x + R.uniform(-.06, .06), y + R.uniform(-.06, .06), 0.6 + capa * 0.95),
                                       (R.uniform(-.5, .5), R.uniform(-.5, .5), R.uniform(0, 3)), cortes=4, mat=M_GRIS, pintar=False, uv=1.8)); k += 1
rocas.asentar(monton, [suelo], pasos=150)
z0 = max(rocas.apoyo(x, y, monton) for x in (-0.4, 0.0, 0.4) for y in (-0.25, 0.0, 0.25)) - 0.08   # la torre se encaja un poco en lo más alto del montón
# — torre —
LADEO = Matrix.Rotation(0.06, 4, 'Y')   # algo inclinada a la izquierda
perfil = [(-0.48, 0.0), (0.45, 0.0), (0.42, 0.9), (0.47, 1.3), (0.48, 1.42), (0.36, 1.46), (0.33, 1.55), (0.08, 1.76), (-0.12, 1.86), (-0.36, 1.88), (-0.5, 1.8), (-0.53, 1.2), (-0.5, 0.5)]
alto = prisma('torre_bloque', perfil, 0.6, M_OCRE, T(0, 0.05, z0) @ LADEO)
laja = rocas.bloque(R, 'torre_laja', (1.25, 0.7, 0.38), (0.33, -0.52, z0 + 0.6), (0.04, -0.42, 0.06), cortes=3, mat=M_OCRE, pintar=False, uv=1.5)
bpy.context.view_layer.update()
zt = rocas.apoyo(-0.3, 0.05, [alto])
prisma('torre_piedra', [(-0.13, 0.0), (0.14, 0.0), (0.08, 0.14), (0.0, 0.3), (-0.09, 0.16)], 0.2, M_GRIS, T(-0.28, 0.05, zt - 0.03) @ Matrix.Rotation(0.12, 4, 'Y'), bisel=0.01)   # piedrita puntiaguda
# — bloques de apoyo alrededor del pie de la torre (caen sobre el montón con la torre fija) —
apoyos = []
for x, y in ((-0.75, -0.75), (0.0, -0.95), (0.75, -0.95), (-0.95, 0.1), (0.95, 0.15), (0.0, 0.85)):
    s = R.uniform(0.3, 0.5)
    apoyos.append(rocas.bloque(R, f'bloque{k}', (s * R.uniform(1.0, 1.3), s * R.uniform(0.8, 1.0), s * R.uniform(0.55, 0.8)), (x, y, z0 + 1.4), (R.uniform(-.4, .4), R.uniform(-.4, .4), R.uniform(0, 3)),
                               cortes=4, mat=M_GRIS, pintar=False, uv=1.8)); k += 1
torre = [o for o in bpy.data.objects if o.name.startswith('torre_')]
rocas.asentar(apoyos, monton + torre + [suelo], pasos=120)
monton += apoyos
for o in monton[:]:
    if o.location.z < -0.5 or abs(o.location.x) > 2.2 or abs(o.location.y) > 2.2: bpy.data.objects.remove(o); monton.remove(o)
bpy.data.objects.remove(suelo)
# relieve real de la superficie (después de la física y de colocar la torre): más fino en la torre, que es lo que se ve de cerca
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    if o.name in ('torre_bloque', 'torre_laja'): rocas.relieve(o, 'rock_08', 0.045, 3)
    elif o.name == 'torre_piedra': rocas.relieve(o, 'rock_08', 0.02, 2)
    else: rocas.relieve(o, 'rock_boulder_dry', 0.035, 2)
for o in bpy.data.objects:
    if o.type == 'MESH': mw = o.matrix_world.copy(); o.parent = V; o.matrix_world = mw
alto_total = max((o.matrix_world @ v.co).z for o in bpy.data.objects if o.type == 'MESH' for v in o.data.vertices)
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_colors=False, export_attributes=False, export_image_format='AUTO')
opts = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in opts})
print('OK', OUT, round(os.path.getsize(OUT) / 1024), 'KB', 'bloques', len(monton), 'alto', round(alto_total, 2), 'pie de la torre', round(z0, 2))

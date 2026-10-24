#!/usr/bin/env python3
"""Apunta en data/terrain/cumbres/detalles.json el modelo de Blender de una cima (models/cima-<id>.glb), anclado al punto más alto del relieve fino (MDT05 a 1 m).
Uso: python3 tools/modelos/registra_cima.py <id> <huella m> "<qué hay en la cima, según la foto>" [--giro rad (si no, hacia el lado más abierto)] [--sueltas regex] [--foto img/hitos/x.jpg]"""
import json, gzip, sys, os, argparse
import numpy as np
a = argparse.ArgumentParser(); a.add_argument('id'); a.add_argument('huella', type=float); a.add_argument('ref'); a.add_argument('--giro', type=float, default=None)
a.add_argument('--sueltas', default='^(bloque|caida)\\d'); a.add_argument('--foto', default=''); a.add_argument('--escala', type=float, default=16); a.add_argument('--allana', type=float, default=None)   # radio de la base fija del modelo (m): la web allana el relieve debajo
o = a.parse_args()
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'); P = os.path.join(ROOT, 'data/terrain/cumbres/detalles.json')
det = json.load(open(P)); d = det[o.id]
H = np.frombuffer(gzip.open(os.path.join(ROOT, 'data/terrain/cumbres', d['archivo'])).read(), '<u2').reshape(d['n'], d['n']) / 10
j, i = np.unravel_index(H.argmax(), H.shape); x = d['x0'] + i * d['paso']; z = d['z0'] + j * d['paso']
if o.giro is None:   # el frente del modelo (y la cámara de «Ver la cima de cerca») hacia el lado más abierto: donde el relieve baja más entre 20 y 95 m
    import math
    def alto(th): return max(H[int(np.clip(j + r * math.cos(th), 0, d['n'] - 1)), int(np.clip(i + r * math.sin(th), 0, d['n'] - 1))] for r in range(20, 96, 5))
    o.giro = round(min((k * math.pi / 8 for k in range(16)), key=alto), 3)
caida = {r: round(float(H.max() - min(H[j, min(i + r, d['n'] - 1)], H[j, max(i - r, 0)], H[min(j + r, d['n'] - 1), i], H[max(j - r, 0), i])), 1) for r in (3, 6, 10)}
d.update(modelo=f'models/cima-{o.id}.glb', escalaModelo=o.escala, ref=f'Coordenada de la ficha; MDT05 del IGN a 1 m. Cima: {o.ref}, según la foto de la cima de la ficha{" (" + o.foto + ")" if o.foto else ""}.',
         elementos=[dict(nodo='Vertice', x=round(float(x), 2), z=round(float(z), 2), giro=o.giro, ancla=True, huella=o.huella, **({'allana': o.allana} if o.allana else {}), ref=f'Máximo del MDT05 ({H.max():.1f} m).', sueltas=o.sueltas)])
json.dump(det, open(P, 'w'), ensure_ascii=False, indent=1)
print(o.id, 'máx', H.max(), 'giro', o.giro, 'caída máxima a 3/6/10 m:', caida)

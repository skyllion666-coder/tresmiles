#!/usr/bin/env python3
"""Completa el relieve fino de una cima de la frontera (data/terrain/cumbres/<id>-cima.bin.gz) con el RGE ALTI del IGN de Francia
(Géoplateforme, servicio de altimetría, recurso ign_rge_alti_wld; Licence Ouverte Etalab 2.0). El MDT05 solo cubre España y build_cimas*.py
rellena los huecos con la altura media, de modo que una cumbre en la frontera queda aplanada (Gran Facha: 2948 m en la ficha, 2985 con el RGE ALTI).
Se piden alturas cada `paso` m (el servicio limita las peticiones: lotes de 150 puntos con pausa), se interpolan a 1 m y se usan donde superan
al MDT05 en más de ~1–4 m (fundido suave). Después: python3 tools/modelos/registra_cima.py <id> ... --maximo.
Uso: python3 tools/relieve_francia.py <id> [paso=2]"""
import json, math, gzip, subprocess, time, sys, os
import numpy as np
from scipy.ndimage import zoom, gaussian_filter
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); os.chdir(ROOT)
pid = sys.argv[1]; paso = int(sys.argv[2]) if len(sys.argv) > 2 else 2
meta = json.load(open('data/terrain/meta.json'))
latC = meta['lat0'] - ((meta['nrows'] - 1) * meta['step']) / 2
mLat = 111132.0; mLon = 111320.0 * math.cos(math.radians(latC))
W = (meta['ncols'] - 1) * meta['step'] * mLon; D = (meta['nrows'] - 1) * meta['step'] * mLat
fromXZ = lambda x, z: (meta['lon0'] + (x + W / 2) / mLon, meta['lat0'] - (z + D / 2) / mLat)
d = json.load(open('data/terrain/cumbres/detalles.json'))[pid]; n = d['n']
ks = np.arange(0, n, paso); X, Z = np.meshgrid(d['x0'] + ks * d['paso'], d['z0'] + ks * d['paso']); lon, lat = fromXZ(X, Z)
lon, lat = lon.ravel(), lat.ravel(); out = []
for a in range(0, len(lon), 150):
    u = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true&lon=' + '|'.join(f'{v:.6f}' for v in lon[a:a + 150]) + '&lat=' + '|'.join(f'{v:.6f}' for v in lat[a:a + 150])
    for k in range(8):
        r = subprocess.run(['curl', '-s', '-m', '60', u], capture_output=True, text=True)
        try: out += json.loads(r.stdout)['elevations']; break
        except Exception: time.sleep(5 * (k + 1))
    else: raise SystemExit('el servicio no responde: ' + r.stdout[:200])
    time.sleep(1.2)
F = np.array(out, 'f8').reshape(len(ks), len(ks))
if (F < 0).any(): raise SystemExit('el RGE ALTI no tiene dato en parte de la ventana')
F = zoom(F, paso, order=3)[:n, :n]
ruta = f'data/terrain/cumbres/{d["archivo"]}'; H = np.frombuffer(gzip.open(ruta).read(), '<u2').reshape(n, n) / 10
w = np.clip((F - H - 1) / 3, 0, 1); w = gaussian_filter(w * w * (3 - 2 * w), 1.5); V = H * (1 - w) + F * w
gzip.open(ruta, 'wb', 9).write(np.round(V * 10).astype('<u2').tobytes())
print(pid, 'máx MDT05', H.max(), '→', round(V.max(), 1), '; usa el RGE ALTI en', round(float((w > 0.5).mean()) * 100), '% de la ventana')

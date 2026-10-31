#!/usr/bin/env python3
"""Prepara un paquete de zona (data/paquetes/<id>/, tools/build_paquete.py) para «Mis zonas» de la app:
  - añade a su index.json el recuadro (`caja`: x0, z0, x1, z1 en metros de la web), para que la app sepa cuándo está cerca;
  - lo comprime en ~/envios/paquetes/<id>.zip (sin recomprimir: las piezas ya van en webp y gzip);
  - y lo apunta en el catálogo data/paquetes.json (nombre, descripción, tamaño, versión y la dirección de su Release de GitHub
    «paquete-<id>-<versión>», que hay que crear con: gh release create paquete-<id>-<v> ~/envios/paquetes/<id>.zip).
Uso: python3 tools/publicar_paquete.py balaitus "Balaitús" "Desde La Sarra por Respomuso y la Gran Diagonal, y por los ibones de Arriel" [versión]"""
import json, os, sys, zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
pid, nombre, detalle = sys.argv[1:4]; version = int(sys.argv[4]) if len(sys.argv) > 4 else 1
D = os.path.join(ROOT, 'data/paquetes', pid); I = os.path.join(D, 'index.json'); idx = json.load(open(I))
L = idx['lado']
idx['caja'] = [min(p['x0'] for p in idx['piezas']), min(p['z0'] for p in idx['piezas']), max(p['x0'] for p in idx['piezas']) + L, max(p['z0'] for p in idx['piezas']) + L]
json.dump(idx, open(I, 'w'), separators=(',', ':'))
out = os.path.expanduser(f'~/envios/paquetes/{pid}.zip'); os.makedirs(os.path.dirname(out), exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_STORED) as z:
    for f in sorted(os.listdir(D)):
        if not f.startswith('.'): z.write(os.path.join(D, f), f)
mb = round(os.path.getsize(out) / 1e6)
C = os.path.join(ROOT, 'data/paquetes.json'); cat = json.load(open(C)) if os.path.exists(C) else []
cat = [c for c in cat if c['id'] != pid] + [{'id': pid, 'cumbre': idx['cumbre'], 'nombre': nombre, 'detalle': detalle, 'mb': mb, 'version': version, 'caja': idx['caja'],
                                             'url': f'https://github.com/skyllion666-coder/tresmiles/releases/download/paquete-{pid}-{version}/{pid}.zip'}]
json.dump(sorted(cat, key=lambda c: c['nombre']), open(C, 'w'), ensure_ascii=False, indent=1)
print(out, mb, 'MB · catálogo:', len(cat), 'paquetes')

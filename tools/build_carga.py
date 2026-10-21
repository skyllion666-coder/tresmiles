#!/usr/bin/env python3
"""Maqueta de la pantalla de carga: relieve del macizo de la Maladeta-Aneto (7,2 × 5 km, 64 × 44 muestras) en bytes de 0 a 255 → js/carga-datos.js.
Las alturas salen de tools/datos/carga_aneto_raw.json (se muestrea con geo.heightAt en la web, con el relieve de detalle de ?directo#aneto cargado).
La cumbre (a: altura, x, z relativos) se marca en la maqueta. Uso: python3 tools/build_carga.py"""
import json, base64, os
r = json.load(open(os.path.join(os.path.dirname(__file__), 'datos/carga_aneto_raw.json')))
h = r['h']; lo, hi = min(h), max(h)
b = bytes(round(255 * (v - lo) / (hi - lo)) for v in h)
d = {'nx': r['nx'], 'nz': r['nz'], 'W': r['W'], 'H': r['H'], 'h': base64.b64encode(b).decode(), 'ax': round(r['a'][1], 4), 'az': round(r['a'][2], 4), 'ah': round((r['a'][0] - lo) / (hi - lo), 4)}
open(os.path.join(os.path.dirname(__file__), '../js/carga-datos.js'), 'w').write('window.CARGA_DATOS = ' + json.dumps(d, separators=(',', ':')) + ';\n')
print('js/carga-datos.js', len(b), 'bytes de relieve')

#!/usr/bin/env python3
"""Añade a data/peaks.json las cumbres del inventario verificado (~/Tresmiles/data/inventario.json) que aún no están en la web,
con una ficha básica (nombre, altitud, macizo, situación, clase y nombres alternativos; sin ruta ni fotos). Las que ya existen
se reconocen por las coordenadas: cada pico de la web se asigna a la cumbre del inventario más cercana (cimas vecinas a pocos cientos de metros no se confunden) y no se tocan. Se puede repetir: no duplica.
Uso: python3 tools/build_fichas_basicas.py [ruta/al/inventario.json]"""
import json, math, os, re, sys, unicodedata
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
INV = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Tresmiles/data/inventario.json')
PK = os.path.join(ROOT, 'data/peaks.json')
inv = json.load(open(INV))['cumbres']; data = json.load(open(PK)); picos = data['picos']
MACIZO = {'ANE': 'ane', 'POS': 'pos', 'PER': 'per', 'PRD': 'prd', 'BAC': 'bac', 'VIG': 'vig', 'BAL': 'bal', 'INF': 'bal', 'MUN': 'per'}
dist = lambda a, b: math.hypot((a['lat'] - b['lat']) * 111000, (a['lon'] - b['lon']) * 82000)
slug = lambda t: re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFD', t).encode('ascii', 'ignore').decode().lower())).strip('-')
def num(v):   # 3247.8 -> «3.247,8»
    s = f'{v:,.1f}'.rstrip('0').rstrip('.') if v != int(v) else f'{int(v):,}'
    return s.replace(',', 'X').replace('.', ',').replace('X', '.')
ids = {p['id'] for p in picos}; nuevos = []
ya = {min(inv, key=lambda c: dist(c, p))['id'] for p in picos if not p.get('basica')}
for c in inv:
    if c['id'] in ya or any(p.get('inv') == c['id'] for p in picos): continue
    base = slug(c['nombre']) or c['id'].lower(); pid = base
    if pid in ids: pid = f"{base}-{c['id'].lower()}"
    ids.add(pid)
    alts = [a for a in c['nombres_alternativos'] if a and a != c['nombre']]
    ofi = c.get('nombre_oficial_aragon') or ''
    nombres = [n for n in dict.fromkeys(alts + ([ofi] if ofi and ofi != c['nombre'] else [])) if n]
    cl = c['clasificacion']; alt = c['altitud_m']; sit = c['situacion']
    mac = {'ane': 'Aneto–Maladeta', 'pos': 'Posets–Eriste', 'per': 'Monte Perdido–Taillón', 'prd': 'Perdiguero', 'bac': 'Bachimala', 'vig': 'Vignemale · Gavarnie', 'bal': 'Valle de Tena · Balaitús–Infiernos'}[MACIZO[c['sector']]]
    donde = {'Aragón': 'en territorio aragonés', 'frontera Aragón–Francia': 'en la frontera entre Aragón y Francia', 'frontera Aragón–Cataluña': 'en el límite entre Aragón y Cataluña'}[sit]
    tipo = {'principal': 'Cumbre', 'secundaria': 'Cima secundaria', 'discutida': 'Cima discutida'}[cl]
    txt = f"{tipo} de {num(alt)} m del macizo {mac}, {donde}."
    if cl == 'secundaria': txt += ' Figura en los catálogos de tresmiles, pero no es la cumbre principal de su macizo.'
    if cl == 'discutida': txt += ' No todos los catálogos la consideran un tresmil independiente: su altitud o su prominencia están en discusión.'
    txt += ' Es una ficha básica: todavía no tiene ruta, fotografías ni recorrido en el mapa.'
    otras = [f"{num(v)} m ({k})" for k, v in c['altitudes_otras_fuentes'].items()]
    if alt != int(alt): otras.insert(0, f'medida de {num(alt)} m')
    nuevos.append({'id': pid, 'nombre': c['nombre'], 'alias': ' · '.join(alts[:3]), 'altitud': int(round(alt)), 'otras': '; '.join(otras),
                   'macizo': MACIZO[c['sector']], 'frontera': sit != 'Aragón', 'situacion': sit.replace('frontera ', 'Frontera ') if sit != 'Aragón' else 'Aragón',
                   'lat': c['lat'], 'lon': c['lon'], 'descripcion': txt, 'clase': cl, 'nombres': ' · '.join(nombres), 'basica': True, 'inv': c['id']})
for n in nuevos: picos.append(n); data['activos'].append(n['id'])
json.dump(data, open(PK, 'w'), ensure_ascii=False, indent=1)
print(f'{len(nuevos)} cumbres añadidas; total {len(picos)}')

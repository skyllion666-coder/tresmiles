#!/usr/bin/env python3
"""Peligro de aludes: lee el boletín diario de AEMET del Pirineo navarro y aragonés (PDF) → data/aludes.json, para la ficha de cada cumbre.

{fecha (elaborado), valido (día del pronóstico), temporada (bool), macizos: {Jacetania: {nivel 1–5, problemas [..]}, …}, situacion, evolucion, iso0, iso10, url}
Fuera de temporada (de mayo a noviembre) AEMET publica solo un aviso: temporada = false.
Uso: python3 tools/aludes.py [boletín.pdf]   (sin argumento lo descarga). Necesita pdftotext (poppler-utils)."""
import json, os, re, subprocess, sys, tempfile, urllib.request, datetime as dt
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
URL = 'https://www.aemet.es/documentos/es/eltiempo/prediccion/montana/boletin_peligro_aludes/BPA_Pirineo_Nav_Ara.pdf'
MACIZOS = ['Navarra', 'Jacetania', 'Gállego', 'Sobrarbe', 'Ribagorza']
NIVELES = {'Débil': 1, 'Limitado': 2, 'Notable': 3, 'Fuerte': 4, 'Muy fuerte': 5}
PROBLEMAS = ['Nieve reciente', 'Placas de viento', 'Capas débiles persistentes', 'Nieve húmeda', 'Deslizamientos basales', 'Sin problema evidente']
MESES = {m: i + 1 for i, m in enumerate('enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split())}

def fecha_es(txt, anio=None):
    m = re.search(r'(\d{1,2}) de (' + '|'.join(MESES) + r')(?: de (\d{4}))?', txt)
    if not m: return None
    return dt.date(int(m.group(3) or anio or dt.date.today().year), MESES[m.group(2)], int(m.group(1))).isoformat()

def lee(pdf):
    txt = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout
    lineas = [l.strip() for l in txt.splitlines() if l.strip()]
    plano = ' '.join(lineas)
    out = {'url': URL, 'leido': dt.datetime.now().isoformat(timespec='minutes')}
    cab = re.search(r'Pirineo Navarro y Aragonés\s+\w+, (\d{1,2} de \w+ de \d{4})', plano)
    if not cab:   # aviso de fuera de temporada
        out.update(temporada=False, fecha=fecha_es(plano), aviso=re.sub(r'\s+', ' ', plano.split('Grupo de Predicción')[0]).strip()[:600])
        return out
    out['temporada'] = True; out['fecha'] = fecha_es(cab.group(1))
    v = re.search(r'Pronóstico hasta las 24 horas del \w+, día (\d{1,2} de \w+)', plano)
    out['valido'] = fecha_es(v.group(1), int(out['fecha'][:4])) if v else None
    if out['valido'] and out['valido'] < out['fecha']: out['valido'] = fecha_es(v.group(1), int(out['fecha'][:4]) + 1)   # pronóstico del 31-12 para el 1-1
    # tabla: en el orden del texto, cada macizo va seguido de su nivel; los problemas, entre el nivel anterior y el suyo
    ini = next(i for i, l in enumerate(lineas) if l.startswith('Macizo'))
    fin = next(i for i, l in enumerate(lineas) if l.startswith('Estado del manto'))
    macizos, actual, probs = {}, None, set()
    for l in lineas[ini + 1:fin]:
        for p in PROBLEMAS:
            if l.startswith(p): probs.add(p)
        if l in MACIZOS: actual = l
        niv = next((n for n in sorted(NIVELES, key=len, reverse=True) if re.fullmatch(n, l, re.I)), None)
        if niv and actual:
            macizos[actual] = {'nivel': NIVELES[niv], 'problemas': [p for p in PROBLEMAS if p in probs]}
            actual, probs = None, set()
    out['macizos'] = macizos
    m = re.search(r'Evolución del manto y peligro de aludes para [^\n]*?\n(.*?)\n', '\n'.join(lineas))
    if m: out['situacion'] = m.group(1).strip()
    m = re.search(r'Evolución para el \w+ día \d+\s+(.*?)(?:\(Información|Escala europea)', plano)
    if m: out['evolucion'] = m.group(1).strip()
    for k, pat in (('iso0', r'isoterma de 0 ºC: ([\d.]+) m'), ('iso10', r'isoterma de -10 ºC: ([\d.]+) m')):
        m = re.search(pat, plano)
        if m: out[k] = int(m.group(1).replace('.', ''))
    return out

if __name__ == '__main__':
    if len(sys.argv) > 1: pdf = sys.argv[1]
    else:
        pdf = tempfile.mktemp(suffix='.pdf')
        urllib.request.urlretrieve(URL, pdf)
    d = lee(pdf)
    if len(sys.argv) > 2 and sys.argv[2] == '-':
        print(json.dumps(d, ensure_ascii=False, indent=1)); sys.exit()
    json.dump(d, open(os.path.join(ROOT, 'data/aludes.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print(d.get('fecha'), 'temporada' if d['temporada'] else 'fuera de temporada', {k: v['nivel'] for k, v in d.get('macizos', {}).items()})

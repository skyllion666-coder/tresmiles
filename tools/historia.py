#!/usr/bin/env python3
"""Primera ascensión de los tresmiles principales según la ficha (infobox) de sus artículos de Wikipedia en castellano, inglés y francés
→ tools/datos/historia.json (lo lee tools/ficha_naturaleza.py, que lo pasa a data/naturaleza.json).
Busca el artículo por el nombre (API de búsqueda de es.wikipedia), sigue los enlaces a en/fr y lee el campo de la ficha
(es «primera ascensión», en «first_ascent», fr «première ascension»). No escribe nada a mano: si las fuentes difieren, se guardan todas.
Uso: python3 tools/historia.py [id ...]
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.join(AQUI, '..')
UA = {'User-Agent': 'tresmiles-mapa/1.0 (mapa de montaña sin ánimo de lucro)'}


def api(lang, **q):
    q.update(format='json', formatversion=2)
    url = f'https://{lang}.wikipedia.org/w/api.php?' + urllib.parse.urlencode(q)
    for i in range(4):
        try:
            d = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()); time.sleep(0.5); return d
        except Exception as e:
            print('  reintento', e, file=sys.stderr); time.sleep(4 * (i + 1))
    return {}


CAMPO = {'es': r'primera[ _]ascensi[oó]n', 'en': r'first[ _]ascent', 'fr': r'premi[eè]re[ _]ascension'}


def limpia(t):
    t = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', t, flags=re.S)
    t = re.sub(r'\{\{(?:[Ff]echa|[Dd]ate|[Ss]tart date)[^|}]*\|([^}]*)\}\}', lambda m: ' '.join(x for x in m.group(1).split('|') if '=' not in x), t)
    t = re.sub(r'\{\{[^{}]*\}\}', '', t)
    t = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', t)
    t = re.sub(r"<br\s*/?>", '; ', t); t = re.sub(r'<[^>]+>', '', t); t = t.replace("'''", '').replace("''", '')
    return re.sub(r'\s+', ' ', t).strip(' ;,')


def campo(lang, titulo):
    d = api(lang, action='query', prop='revisions', rvprop='content', rvslots='main', titles=titulo, redirects=1)
    pg = (d.get('query', {}).get('pages') or [{}])[0]
    txt = ((pg.get('revisions') or [{}])[0].get('slots', {}).get('main', {}) or {}).get('content', '')
    m = re.search(r'\|\s*' + CAMPO[lang] + r'\s*=\s*(.+)', txt, flags=re.I)
    v = limpia(m.group(1)) if m else ''
    return v or None, pg.get('title')


GENERICO = r'^(pico|pic|tuca|tuc|punta|pointe|picos|pics|monte|mont|cima|tozal|soum|el|la|los|las|de|del|d|dera|des|du|le|les)$'
def clave(t):
    t = unicodedata.normalize('NFD', t.lower()); t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    t = re.sub(r'\(.*?\)', ' ', t)
    return ' '.join(w for w in re.findall(r"[a-z]+", t) if not re.match(GENERICO, w))


def busca(p):
    """artículo de es.wikipedia cuyo título es el nombre (o un alias) de la cumbre, sin las palabras genéricas (pico, tuca…)"""
    nombres = {clave(n) for n in [p['nombre']] + re.split(r'\s*[·/]\s*', (p.get('alias') or '') + ' · ' + (p.get('nombres') or '')) if n.strip()}
    nombres.discard('')
    d = api('es', action='query', list='search', srsearch=f'{p["nombre"]} Pirineo', srlimit=8)
    for r in d.get('query', {}).get('search', []):
        if clave(r['title']) in nombres: return r['title']
    return None


def contenidos(lang, titulos):
    """wikitexto de varios artículos en una sola consulta (lotes de 40): {título pedido: (título real, texto)}"""
    out = {}
    for i in range(0, len(titulos), 40):
        lote = titulos[i:i + 40]
        d = api(lang, action='query', prop='revisions', rvprop='content', rvslots='main', titles='|'.join(lote), redirects=1)
        q = d.get('query', {}); real = {x['from']: x['to'] for x in q.get('redirects', []) + q.get('normalized', [])}
        txt = {pg.get('title'): ((pg.get('revisions') or [{}])[0].get('slots', {}).get('main', {}) or {}).get('content', '') for pg in q.get('pages', [])}
        for t in lote:
            r = real.get(t, t); r = real.get(r, r); out[t] = (r, txt.get(r, ''))
        time.sleep(2)
    return out


def del_texto(lang, txt):
    m = re.search(r'\|[ \t]*' + CAMPO[lang] + r'[ \t]*=[ \t]*([^\n]*)', txt or '', flags=re.I)
    if not m: return None
    v = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', m.group(1))   # los enlaces fuera antes de cortar por «|»
    prof, corte = 0, len(v)
    for i, ch in enumerate(v):   # el valor acaba en el primer «|» que no esté dentro de {{ }}
        if v.startswith('{{', i): prof += 1
        elif v.startswith('}}', i): prof -= 1
        elif ch == '|' and prof <= 0: corte = i; break
    v = limpia(v[:corte])
    return v if v and not re.fullmatch(r'(unknown|desconocid[oa]|inconnue?|\?|-)', v, flags=re.I) else None


if __name__ == '__main__':
    ids = set(sys.argv[1:])
    picos = [p for p in json.load(open(os.path.join(RAIZ, 'data', 'peaks.json')))['picos'] if p['clase'] == 'principal' and (not ids or p['id'] in ids)]
    sal = os.path.join(AQUI, 'datos', 'historia.json')
    res = json.load(open(sal)) if os.path.exists(sal) else {}
    tit = {}
    for p in picos:   # 1) el artículo de cada cumbre (una búsqueda por cumbre, despacio)
        t = busca(p); time.sleep(1.5)
        if t: tit[p['id']] = t
    es = contenidos('es', sorted(set(tit.values())))
    # 2) enlaces a en y fr, en lotes
    ll = {}
    ts = sorted(set(r for r, _ in es.values()))
    for i in range(0, len(ts), 40):
        d = api('es', action='query', prop='langlinks', titles='|'.join(ts[i:i + 40]), lllimit='max', redirects=1)
        for pg in d.get('query', {}).get('pages', []):
            ll[pg.get('title')] = {l['lang']: l['title'] for l in pg.get('langlinks', []) if l['lang'] in ('en', 'fr')}
        time.sleep(2)
    otros = {lg: contenidos(lg, sorted({v[lg] for v in ll.values() if lg in v})) for lg in ('en', 'fr')}
    for p in picos:
        t = tit.get(p['id'])
        if not t: continue
        real, txt = es[t]; o = {}
        v = del_texto('es', txt)
        if v: o['es'] = dict(t=v, art=real)
        for lg in ('en', 'fr'):
            t2 = ll.get(real, {}).get(lg)
            if t2:
                r2, x2 = otros[lg].get(t2, (t2, ''))
                v = del_texto(lg, x2)
                if v: o[lg] = dict(t=v, art=r2)
        if o: res[p['id']] = o
        elif p['id'] in res and not ids: del res[p['id']]
        print(p['id'], '|', real, '|', json.dumps(o, ensure_ascii=False)[:200], flush=True)
    json.dump(res, open(sal, 'w'), ensure_ascii=False, indent=0)

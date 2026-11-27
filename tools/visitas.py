#!/usr/bin/env python3
"""Resumen de las visitas de Tresmiles (GoatCounter) por Telegram a Frank.

- Lee la API de GoatCounter con la clave de solo lectura (~/.secretos/goatcounter-api.txt, «tresmiles», Read statistics).
- La cuenta es compartida con la Bolsa de Horas: solo se mira la ruta «/tresmiles» y los eventos «tresmiles-vez-…».
- Cuenta: total (el mismo número que enseña la web), visitas de los últimos N días por día y comparadas con los N anteriores,
  móvil/ordenador, Android/iPhone, países, de dónde llegan (las apps como WhatsApp no dicen de dónde vienen: salen «directas»),
  cuántas llegan por un enlace de cumbre (c/<id>, botón «Compartir»), cuántas veces vuelve la gente (tramos de index.html)
  y las cumbres más miradas (eventos «tresmiles-cumbre-<id>» de openPeak en js/main.js, una vez por cumbre y visita).
Uso: tools/visitas.py [días, por defecto 4] [--prueba]   (--prueba: lo imprime sin mandarlo). Programado en cron lunes y jueves 9:30.
"""
import collections, datetime, json, os, sys, time, urllib.error, urllib.parse, urllib.request

CASA = os.path.expanduser('~')
API = 'https://skyllion.goatcounter.com/api/v0'
CLAVE = open(f'{CASA}/.secretos/goatcounter-api.txt').read().strip()
BOT = f'{CASA}/deepseek-bot'   # el bot que usa avisar-frank (igual que tools/buzon.py)
VISITAS_ANTES = 141            # como en js/main.js: las de Tresmiles anteriores al 24-10-2026, guardadas como páginas sueltas
PRUEBA = '--prueba' in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith('--')]
DIAS = int(args[0]) if args else 4
TRAMOS = ['1', '2', '3-5', '6-10', '11-20', '21+']


def api(ruta, **q):
    url = f'{API}/{ruta}?' + urllib.parse.urlencode(q, doseq=True)
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {CLAVE}', 'Content-Type': 'application/json'})
    for intento in range(6):   # la API limita las peticiones seguidas (429): esperar y repetir
        try: return json.load(urllib.request.urlopen(req, timeout=60))
        except urllib.error.HTTPError as e:
            if e.code != 429 or intento == 5: raise
            time.sleep(10 * (intento + 1))


def caminos():
    todos, despues = [], None
    while True:
        q = {'limit': 200, **({'after': despues} if despues else {})}
        d = api('paths', **q); todos += d['paths']
        if not d.get('more'): return todos
        despues = d['paths'][-1]['id']


def iso(d): return d.strftime('%Y-%m-%dT%H:%M:%SZ')


def main():
    ps = caminos()
    principal = next(p['id'] for p in ps if p['path'] == '/tresmiles')
    veces = {p['path'].removeprefix('tresmiles-vez-'): p['id'] for p in ps if p['event'] and p['path'].startswith('tresmiles-vez-')}
    hoy = datetime.datetime.now(datetime.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) + datetime.timedelta(days=1)
    ini, ini_ant = hoy - datetime.timedelta(days=DIAS), hoy - datetime.timedelta(days=2 * DIAS)

    def visitas(a, b, ids):
        d = api('stats/hits', start=iso(a), end=iso(b), include_paths=ids, daily='true')
        por_dia = collections.Counter()
        for h in d['hits']:
            for s in h['stats']: por_dia[s['day']] += s['daily']
        return por_dia

    def lista(pagina, n=6):
        d = api(f'stats/{pagina}', start=iso(ini), end=iso(hoy), include_paths=[principal], limit=n)
        return [(s.get('name') or s.get('id') or '', s['count']) for s in d.get('stats', []) if s['count']]

    total = int(str(urllib.request.urlopen('https://skyllion.goatcounter.com/counter/%2Ftresmiles.json?start=2026-10-01', timeout=30).read().decode()).split('"count":"')[1].split('"')[0].replace('.', '').replace(',', '') or 0) + VISITAS_ANTES
    dias = visitas(ini, hoy, [principal]); n = sum(dias.values())
    n_ant = sum(visitas(ini_ant, ini, [principal]).values())
    pct = lambda x: f'{round(100 * x / n)} %' if n else '-'
    fmt = lambda x: f'{x:,}'.replace(',', '.')

    L = [f'📊 Tresmiles · visitas de los últimos {DIAS} días', '']
    L.append(f'Total en la web: {fmt(total)}')
    L.append(f'Estos {DIAS} días: {fmt(n)}' + (f' (los {DIAS} anteriores: {fmt(n_ant)})' if n_ant or n else ''))
    for k in sorted(dias):
        if k >= f'{hoy:%Y-%m-%d}': continue   # «hoy» es el final del rango (mañana a las 0 h UTC)
        L.append(f'  {datetime.date.fromisoformat(k):%d-%m}: {dias[k]}')
    tam = dict(lista('sizes')); movil = tam.get('phone', 0) + tam.get('tablet', 0)
    L += ['', f'📱 Móvil o tablet: {pct(movil)} · 💻 ordenador: {pct(n - movil if n >= movil else 0)}']
    L.append('Sistemas: ' + ', '.join(f'{k.replace("iOS", "iPhone")} {v}' for k, v in lista('systems')))
    PAISES = {'Spain': 'España', 'France': 'Francia', 'United States': 'EE. UU.', 'Italy': 'Italia', 'Germany': 'Alemania', 'United Kingdom': 'Reino Unido', 'Portugal': 'Portugal', 'Andorra': 'Andorra', 'Netherlands': 'Países Bajos', 'Belgium': 'Bélgica', 'Switzerland': 'Suiza'}
    L.append('Países: ' + ', '.join(f'{PAISES.get(k, k)} {v}' for k, v in lista('locations')))
    refs = lista('toprefs', 20)
    directas = sum(v for k, v in refs if not k)
    cumbre = sum(v for k, v in refs if '/c/' in k)
    otras = [(k, v) for k, v in refs if k and '/c/' not in k and 'tresmiles' not in k]
    L += ['', f'🔗 Directas (WhatsApp, Telegram, favoritos…: no dicen de dónde vienen): {directas}']
    if cumbre: L.append(f'Por un enlace de cumbre («Compartir»): {cumbre}')
    if otras: L.append('Desde otras webs: ' + ', '.join(f'{k} {v}' for k, v in otras[:6]))
    if veces:
        d = api('stats/hits', start=iso(ini), end=iso(hoy), include_paths=list(veces.values()))   # una sola petición: viene un «hit» por tramo
        por = {h['path'].removeprefix('tresmiles-vez-'): h['count'] for h in d['hits']}
        tot = sum(por.values())
        if tot:
            nuevas, vuelven = por.get('1', 0), tot - por.get('1', 0)
            L += ['', f'🔁 Primera vez: {nuevas} · vuelven: {vuelven}']
            L.append('  ' + ' · '.join(f'{t}.ª vez: {por[t]}' if t in ('1', '2') else f'{t} veces: {por[t]}' for t in TRAMOS if por.get(t)))
    cumbres = [p['id'] for p in ps if p['event'] and p['path'].startswith('tresmiles-cumbre-')]
    vistas = collections.Counter()
    for i in range(0, len(cumbres), 80):   # en tandas, para no hacer la dirección demasiado larga
        d = api('stats/hits', start=iso(ini), end=iso(hoy), include_paths=cumbres[i:i + 80], limit=100)
        for h in d['hits']: vistas[(h.get('title') or h['path']).removeprefix('Tresmiles: ').removeprefix('tresmiles-cumbre-')] += h['count']
    if vistas:
        L += ['', f'⛰️ Cumbres más miradas ({sum(vistas.values())} fichas abiertas):']
        L += [f'  {i}. {k}: {v}' for i, (k, v) in enumerate(vistas.most_common(10), 1)]
    texto = '\n'.join(L)
    print(texto)
    if PRUEBA: return
    token, chat = open(f'{BOT}/token').read().strip(), open(f'{BOT}/dueno').read().strip()
    datos = urllib.parse.urlencode({'chat_id': chat, 'text': texto}).encode()
    print('Telegram:', json.load(urllib.request.urlopen(f'https://api.telegram.org/bot{token}/sendMessage', datos, timeout=60)).get('ok'))


main()

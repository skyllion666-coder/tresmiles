#!/usr/bin/env python3
"""Mira el buzón tresmilespirineo@gmail.com (lo que manda la gente con «Colabora» de las fichas) y avisa a Frank por Telegram.

- Lee por IMAP con la contraseña de aplicación (~/.secretos/tresmiles-gmail-app.txt), sin marcar nada como leído.
- Por cada correo nuevo «Foto o comentario: <cima> [<id>]» (o «Photo or comment»): guarda el texto y las fotos en
  ~/tresmiles-fuentes/aportes/<fecha>-<id>-<n>/, revisa cada foto con tools/aportacion.py --prueba (GPS, distancia a la cima,
  caras, tamaño) y manda a Telegram un resumen con las fotos. NO publica nada: se publica a mano, con el ok de Frank:
      tools/aportacion.py foto <archivo> <cima> "<autor>" "<pie>" --en "<pie en inglés>" [--fecha …]
- Otros correos de personas (no avisos automáticos de Google, MEGA…) se avisan con una línea.
- Lo ya avisado se apunta en ~/tresmiles-fuentes/aportes/vistos.json (por Message-ID).
Uso: tools/buzon.py [--prueba | --marcar-todo] (--prueba: dice lo que haría, sin mandar a Telegram ni apuntar nada;
--marcar-todo: apunta como visto todo lo que hay, sin avisar). Programado en cron 9:00 y 20:00.
"""
import imaplib, email, email.header, email.utils, json, os, re, subprocess, sys, datetime, io

CASA = os.path.expanduser('~')
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = f'{CASA}/tresmiles-fuentes/aportes'
VISTOS = f'{DIR}/vistos.json'
CUENTA = 'tresmilespirineo@gmail.com'
BOT = f'{CASA}/deepseek-bot'   # el bot que usa avisar-frank
PRUEBA = '--prueba' in sys.argv
MARCAR = '--marcar-todo' in sys.argv
AUTOMATICOS = re.compile(r'no-?reply|noreply|google\.com|mega\.(nz|io)|accounts\.|notifications?@|mailer|windscribe|facebookmail|meta\.com', re.I)


def deco(s):
    return ''.join(t.decode(c or 'utf-8', 'replace') if isinstance(t, bytes) else t for t, c in email.header.decode_header(s or ''))


def texto(msg):
    for p in msg.walk():
        if p.get_content_type() == 'text/plain' and not p.get_filename():
            return p.get_payload(decode=True).decode(p.get_content_charset() or 'utf-8', 'replace')
    for p in msg.walk():
        if p.get_content_type() == 'text/html' and not p.get_filename():
            h = p.get_payload(decode=True).decode(p.get_content_charset() or 'utf-8', 'replace')
            return re.sub(r'<[^>]+>', ' ', re.sub(r'<br\s*/?>|</p>|</div>', '\n', h, flags=re.I))
    return ''


def campo(t, *claves):
    for c in claves:
        m = re.search(rf'^\s*{c}[^:\n]*:[ \t]*(.*)$', t, re.I | re.M)
        if m and m.group(1).strip():
            return m.group(1).strip()
    return ''


def telegram(metodo, datos, archivos=None):
    if PRUEBA:
        print(f'  [prueba] Telegram {metodo}: {str(datos)[:300]}'); return True
    import urllib.request, uuid
    token, chat = open(f'{BOT}/token').read().strip(), open(f'{BOT}/dueno').read().strip()
    datos = {'chat_id': chat, **datos}
    lim = uuid.uuid4().hex; cuerpo = io.BytesIO()
    for k, v in datos.items():
        cuerpo.write(f'--{lim}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for k, (nombre, contenido) in (archivos or {}).items():
        cuerpo.write(f'--{lim}\r\nContent-Disposition: form-data; name="{k}"; filename="{nombre}"\r\nContent-Type: image/jpeg\r\n\r\n'.encode())
        cuerpo.write(contenido); cuerpo.write(b'\r\n')
    cuerpo.write(f'--{lim}--\r\n'.encode())
    req = urllib.request.Request(f'https://api.telegram.org/bot{token}/{metodo}', cuerpo.getvalue(), {'Content-Type': f'multipart/form-data; boundary={lim}'})
    try:
        return json.load(urllib.request.urlopen(req, timeout=120)).get('ok', False)
    except Exception as e:
        print('  Telegram falló:', e); return False


def miniatura(ruta):
    """JPEG de como mucho 2048 px para Telegram (el límite de sendPhoto es 10 MB)."""
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(ruta)).convert('RGB'); im.thumbnail((2048, 2048))
    b = io.BytesIO(); im.save(b, 'JPEG', quality=88); return b.getvalue()


def main():
    os.makedirs(DIR, exist_ok=True)
    vistos = json.load(open(VISTOS)) if os.path.exists(VISTOS) else {}
    M = imaplib.IMAP4_SSL('imap.gmail.com')
    M.login(CUENTA, open(f'{CASA}/.secretos/tresmiles-gmail-app.txt').read().strip())
    M.select('INBOX', readonly=True)
    desde = (datetime.date.today() - datetime.timedelta(days=30)).strftime('%d-%b-%Y')
    _, ids = M.search(None, f'(SINCE {desde})')
    nuevos = otros = 0
    for num in ids[0].split():
        _, d = M.fetch(num, '(BODY.PEEK[])')   # PEEK: no lo marca como leído
        msg = email.message_from_bytes(d[0][1])
        mid = msg.get('Message-ID') or f'{msg.get("Date")}|{msg.get("From")}'
        if mid in vistos:
            continue
        if MARCAR:
            vistos[mid] = {'fecha': msg.get('Date'), 'tipo': 'marcado', 'asunto': deco(msg.get('Subject'))}
            continue
        asunto, de = deco(msg.get('Subject')), deco(msg.get('From'))
        nombre_de, dir_de = email.utils.parseaddr(de)
        fecha = email.utils.parsedate_to_datetime(msg.get('Date')).astimezone()
        m = re.search(r'(?:Foto o comentario|Photo or comment)\s*:\s*(.*?)\s*\[([a-z0-9-]+)\]', asunto, re.I)
        if not m:
            if not AUTOMATICOS.search(dir_de):
                otros += 1
                print(f'Otro correo: {dir_de} · {asunto}')
                telegram('sendMessage', {'text': f'✉️ Tresmiles · correo nuevo en el buzón\nDe: {nombre_de or dir_de} <{dir_de}>\nAsunto: {asunto}\n{texto(msg).strip()[:600]}'})
            vistos[mid] = {'fecha': fecha.isoformat(), 'tipo': 'otro' if not AUTOMATICOS.search(dir_de) else 'automatico', 'asunto': asunto}
            continue
        nuevos += 1
        cima_nombre, cima = m.group(1), m.group(2)
        t = texto(msg)
        autor = campo(t, 'Nombre o apodo', 'Name or nickname') or nombre_de or dir_de
        suya = campo(t, r'¿La foto es tuya', 'Is the photo yours')
        cuando = campo(t, 'Fecha de la foto', 'Date of the photo')
        comentario = campo(t, 'Comentario sobre la cima', 'Comment about the summit')
        carpeta = f'{DIR}/{fecha:%Y-%m-%d}-{cima}'
        n = 1
        while os.path.exists(f'{carpeta}-{n}'):
            n += 1
        carpeta = f'{carpeta}-{n}'; os.makedirs(carpeta)
        open(f'{carpeta}/correo.txt', 'w').write(f'De: {de}\nFecha: {fecha:%Y-%m-%d %H:%M}\nAsunto: {asunto}\n\n{t}')
        fotos, revision = [], []
        for p in msg.walk():
            fn = p.get_filename()
            if not fn or not (p.get_content_maintype() == 'image' or re.search(r'\.(jpe?g|png|heic|webp)$', fn, re.I)):
                continue
            fn = re.sub(r'[^\w.-]', '_', deco(fn)); ruta = f'{carpeta}/{len(fotos) + 1}-{fn}'
            open(ruta, 'wb').write(p.get_payload(decode=True)); fotos.append(ruta)
            r = subprocess.run([sys.executable, f'{RAIZ}/tools/aportacion.py', 'foto', ruta, cima, autor, comentario or 'pie', '--prueba'],
                               capture_output=True, text=True, timeout=300)
            revision.append(f'Foto {len(fotos)}: ' + ' / '.join(l.strip() for l in (r.stdout + r.stderr).strip().splitlines()[-4:]))
        print(f'Aportación: {autor} · {cima} · {len(fotos)} foto(s) → {carpeta}')
        resumen = (f'📸 Tresmiles · aportación nueva por correo\n'
                   f'De: {nombre_de or dir_de} <{dir_de}> · {fecha:%d-%m-%Y %H:%M}\n'
                   f'Cima: {cima_nombre} [{cima}]\nQuiere salir como: «{autor}»\n'
                   f'¿Es suya?: {suya or "(no lo dice)"} · Fecha: {cuando or "(no la dice)"}\n'
                   f'Comentario: {comentario or "(ninguno)"}\n' + ('\n'.join(revision) if revision else 'Sin fotos (solo comentario).') +
                   f'\n\nGuardado en {carpeta}. Di «ok» a Claude para publicarlo.')
        if fotos:
            grupo = fotos[:10]
            media = [{'type': 'photo', 'media': f'attach://f{i}'} for i in range(len(grupo))]
            media[0]['caption'] = resumen[:1024]
            ok = telegram('sendMediaGroup', {'media': json.dumps(media, ensure_ascii=False)},
                          {f'f{i}': (os.path.basename(f) + '.jpg', miniatura(f)) for i, f in enumerate(grupo)})
            if len(resumen) > 1024:
                telegram('sendMessage', {'text': resumen})
        else:
            ok = telegram('sendMessage', {'text': resumen})
        if ok:
            vistos[mid] = {'fecha': fecha.isoformat(), 'tipo': 'aportacion', 'cima': cima, 'autor': autor, 'carpeta': carpeta}
    M.logout()
    if not PRUEBA:
        json.dump(vistos, open(VISTOS, 'w'), ensure_ascii=False, indent=1)
    print(f'{datetime.datetime.now():%Y-%m-%d %H:%M} aportaciones nuevas: {nuevos} · otros correos de personas: {otros}')


if __name__ == '__main__':
    main()

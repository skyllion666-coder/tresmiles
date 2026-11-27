// Versión de la app y aviso de actualizaciones (data/app.json: la última versión oficial de la APK, con su fecha y novedades).
// - En la web (Android y ordenador): debajo del botón de descarga, «Versión 0.44 · 27 nov 2026 · Qué hay de nuevo»; durante 14 días después
//   de una versión nueva, etiqueta «¡Nuevo!» en el botón y un aviso abajo, que desaparecen en cuanto la persona lo cierra o lo abre.
// - Dentro de la app: la APK lleva su propio data/app.json (el de cuando se compiló) y pide a la web el actual; si hay una versión más nueva,
//   aviso «Hay una versión nueva de la app» con el botón de descargar. Si lo cierra, vuelve a salir a los 7 días mientras no se actualice.
// Al sacar una versión oficial nueva: cambiar data/app.json (version, code, fecha, tamaños y novedades) ANTES de compilar la APK.
const DIAS_NUEVO = 14, DIAS_RECORDAR = 7;

export function iniciaNovedades({ t, EN_INGLES, store, EN_APP, SIN_APK, APK_URL, APK_MIN_URL, datoJson }) {
  if (SIN_APK && !EN_APP) return;   // iPhone: no hay app que ofrecer
  const en = EN_INGLES;
  const fecha = (s) => new Date(s + 'T12:00').toLocaleDateString(en ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function panel(a) {
    let p = document.getElementById('novedades-app');
    if (!p) { p = document.createElement('div'); p.id = 'novedades-app'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); document.body.appendChild(p); }
    const lista = (en ? a.novedades_en : a.novedades) ?? a.novedades ?? [];
    p.innerHTML = `<div class="nov-caja">
      <button type="button" class="nov-cerrar" aria-label="${en ? 'Close' : 'Cerrar'}">×</button>
      <h3>${en ? `What's new in the app ${esc(a.version)}` : `Novedades de la app ${esc(a.version)}`}</h3>
      <p class="nov-fecha">${fecha(a.fecha)}</p>
      <ul>${lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="nov-bajar"><a class="nov-btn" href="${APK_URL}">${en ? 'Download the app' : 'Descargar la app'} <small>${a.mb} MB</small></a>
        <a class="nov-ligera" href="${APK_MIN_URL}">${en ? 'Light version' : 'Versión ligera'} <small>${a.mb_minima} MB</small></a></p>
      <p class="nov-nota">${en ? 'It installs over the version you have: nothing is lost.' : 'Se instala encima de la que tienes: no se pierde nada.'}</p>
    </div>`;
    const cierra = () => { p.hidden = true; removeEventListener('keydown', tecla); };
    const tecla = (e) => { if (e.key === 'Escape') cierra(); };
    p.querySelector('.nov-cerrar').onclick = cierra;
    p.onclick = (e) => { if (e.target === p) cierra(); };
    addEventListener('keydown', tecla);
    p.hidden = false;
  }

  function aviso(html, alCerrar, alAbrir) {
    const d = document.createElement('div');
    d.id = 'aviso-app'; d.setAttribute('role', 'status');
    d.innerHTML = `${html}<button type="button" class="aviso-ver">${en ? "What's new" : 'Qué hay de nuevo'}</button><button type="button" class="aviso-x" aria-label="${en ? 'Close' : 'Cerrar'}">×</button>`;
    const quita = () => { d.classList.remove('visible'); setTimeout(() => d.remove(), 400); };
    d.querySelector('.aviso-x').onclick = () => { alCerrar(); quita(); };
    d.querySelector('.aviso-ver').onclick = () => { alAbrir(); quita(); };
    document.body.appendChild(d);
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('visible')));
  }

  if (EN_APP) {
    (async () => {
      const mia = await fetch('data/app.json').then((r) => r.json()).catch(() => null);   // la que lleva la APK
      const ult = await datoJson('data/app.json').catch(() => null);                    // la de la web (o la última guardada)
      if (!mia || !ult || !(ult.code > mia.code)) return;
      const [v, cuando] = (store.get('tresmiles-app-aviso') || '').split(':');
      if (+v === ult.code && Date.now() - +cuando < DIAS_RECORDAR * 864e5) return;
      const marca = () => store.set('tresmiles-app-aviso', `${ult.code}:${Date.now()}`);
      setTimeout(() => aviso(`<span class="aviso-txt"><b>${en ? `New app version ${esc(ult.version)}` : `Hay una versión nueva de la app: ${esc(ult.version)}`}</b>
        <a class="aviso-bajar" href="${APK_URL}">${en ? 'Download' : 'Descargar'}</a></span>`, marca, () => { marca(); panel(ult); }), 4000);
    })();
    return;
  }

  (async () => {
    const a = await datoJson('data/app.json').catch(() => null);
    if (!a) return;
    const btn = document.getElementById('descarga-app'), lig = document.getElementById('descarga-minima');
    if (btn?.querySelector('small')) btn.querySelector('small').textContent = `${en ? 'works offline' : 'sin conexión'} · ${a.mb} MB`;
    if (lig?.querySelector('small')) lig.querySelector('small').textContent = `${a.mb_minima} MB`;
    const ver = document.createElement('p');
    ver.className = 'app-version';
    ver.innerHTML = `${en ? 'Version' : 'Versión'} ${esc(a.version)} · ${fecha(a.fecha)} · <button type="button">${en ? "What's new" : 'Qué hay de nuevo'}</button>`;
    (lig ?? btn)?.after(ver);
    const reciente = Date.now() - new Date(a.fecha + 'T00:00').getTime() < DIAS_NUEVO * 864e5;
    const visto = store.get('tresmiles-app-visto') === a.version;
    const marca = () => { store.set('tresmiles-app-visto', a.version); btn?.querySelector('.nuevo')?.remove(); };
    ver.querySelector('button').onclick = () => { marca(); panel(a); };
    if (!reciente || visto) return;
    btn?.insertAdjacentHTML('afterbegin', `<span class="nuevo">${en ? 'New!' : '¡Nuevo!'}</span>`);
    setTimeout(() => aviso(`<span class="aviso-txt"><b>${en ? `New app version ${esc(a.version)}:` : `Nueva versión ${esc(a.version)} de la app:`}</b> ${esc(en ? a.resumen_en : a.resumen)}</span>`,
      marca, () => { marca(); panel(a); }), 3500);
  })();
}

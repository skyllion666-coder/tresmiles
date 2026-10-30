// Selector de cumbres (el del inicio y el del mapa): buscador sin tildes que mira también los nombres alternativos,
// macizos plegados de oeste a este con su número, principales primero y secundarias plegadas dentro de cada macizo.
import { t as tr, EN_INGLES } from './i18n.js?v=7';   // «tr»: aquí «t» es nombre de variable en muchas funciones
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => new Intl.NumberFormat(EN_INGLES ? 'en-GB' : 'es-ES', { useGrouping: 'always' }).format(n);

// texto comparable: sin tildes ni diéresis, sin apóstrofos ni guiones, en minúsculas; devuelve también la posición de cada letra en el original
function plano(t) {
  const s = String(t ?? ''); let out = ''; const pos = [];
  for (let i = 0; i < s.length; i++) {
    let c = s[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (/[’'´`·\-–—/().,«»"]/.test(c)) c = ' ';
    for (const ch of c) { if (ch === ' ' && (out === '' || out.endsWith(' '))) continue; out += ch; pos.push(i); }
  }
  return { t: out, pos };
}
const norm = (t) => plano(t).t.trim();
// marca en el nombre la parte que coincide con la búsqueda
function marca(nombre, q) {
  const { t, pos } = plano(nombre), k = t.indexOf(q);
  if (!q || k < 0) return esc(nombre);
  const a = pos[k], b = pos[k + q.length - 1] + 1;
  return `${esc(nombre.slice(0, a))}<mark>${esc(nombre.slice(a, b))}</mark>${esc(nombre.slice(b))}`;
}

// capas: qué cumbres se ven (en el mapa y en la lista)
const CAPAS = [['tres', EN_INGLES ? '3,000ers' : 'Tresmiles'], ['menos', 'Menos de 3.000'], ['todos', 'Todas']];   // «Tresmiles» no va al diccionario: es también el nombre de la web

const ATAJOS = [['subidos', 'Mis subidos'], ['pend', 'Pendientes'], ['cerca', 'Cercanas'], ['altas', 'Más altas']];

export function crearSelector(root, { picos, macizos, activa = () => null, hecho = () => false, pasa = () => true, filtrado = () => false, quitarFiltros = null, capa = null, cercania = null, elegir }) {
  const nombreMacizo = Object.fromEntries(macizos.map((m) => [m.id, m.nombre]));
  // índice de búsqueda por cumbre: nombre, otros nombres y macizo
  const idx = new Map(picos.map((p) => {
    const otros = [...String(p.alias ?? '').split('·'), ...String(p.nombres ?? '').split('·')].map((s) => s.trim()).filter(Boolean);
    return [p.id, { n: norm(p.nombre), otros: otros.map((o) => ({ o, n: norm(o) })), m: norm(nombreMacizo[p.macizo]) }];
  }));
  // macizos de oeste a este (como se recorre el Pirineo en el mapa)
  const lonMedia = (id) => { const ps = picos.filter((p) => p.macizo === id); return ps.reduce((s, p) => s + p.lon, 0) / (ps.length || 1); };
  const orden = macizos.filter((m) => picos.some((p) => p.macizo === m.id)).sort((a, b) => lonMedia(a.id) - lonMedia(b.id));
  const abiertos = new Set(), secAbiertas = new Set();   // lo que el usuario despliega se recuerda mientras dure la visita
  const esPrincipal = (p) => !p.clase || p.clase === 'principal';

  root.classList.add('sel');
  root.innerHTML = `<div class="sel-cab"><span class="sel-tit">Cumbres</span><button type="button" class="sel-x" aria-label="Cerrar el selector"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div>
    <div class="sel-busca"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m15 15 5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><input type="search" placeholder="Buscar cumbre" autocomplete="off" spellcheck="false" enterkeyhint="go" aria-label="Buscar cumbre por nombre"><button type="button" class="sel-borra" aria-label="Borrar la búsqueda" hidden>×</button></div>
    ${capa ? `<div class="sel-capa" role="radiogroup" aria-label="Qué cumbres ver">${CAPAS.map(([v, t]) => `<button type="button" role="radio" data-capa="${v}">${t}</button>`).join('')}</div>` : ''}
    <div class="sel-atajos" role="group" aria-label="Atajos">${ATAJOS.filter(([v]) => v !== 'cerca' || cercania).map(([v, t]) => `<button type="button" data-atajo="${v}" aria-pressed="false">${t}</button>`).join('')}</div>
    <p class="sel-filtro" hidden></p>
    <div class="sel-lista" role="listbox" aria-label="Cumbres"></div>`;
  const q = root.querySelector('input'), lista = root.querySelector('.sel-lista'), borra = root.querySelector('.sel-borra'), filtroEl = root.querySelector('.sel-filtro');

  const fila = (p, extra = '', nombreHTML = esc(p.nombre)) => {
    const on = p.activo !== false, h = hecho(p.id);
    return on
      ? `<button type="button" role="option" class="sel-pico${h ? ' hecho' : ''}${esPrincipal(p) ? '' : ' sec'}" data-id="${p.id}" aria-selected="${activa() === p.id}"><span class="sel-n">${nombreHTML}${h ? '<i class="sel-flag" aria-label="subido"></i>' : ''}${extra}</span><span class="sel-alt">${fmt(p.altitud)} m</span></button>`
      : `<span class="sel-pico prox"><span class="sel-n">${nombreHTML}${extra}</span><span class="sel-alt">Próximamente</span></span>`;
  };
  const etiqueta = (p) => (p.clase === 'discutida' ? '<small class="sel-tag">discutida</small>' : '');

  function porMacizos() {
    const act = activa(), actM = act && picos.find((p) => p.id === act)?.macizo;
    return orden.map((m) => {
      const ps = picos.filter((p) => p.macizo === m.id && pasa(p)).sort((a, b) => b.altitud - a.altitud);
      if (!ps.length) return '';
      const pri = ps.filter(esPrincipal), sec = ps.filter((p) => !esPrincipal(p)), sub = ps.filter((p) => hecho(p.id)).length;
      const abre = abiertos.has(m.id) || (actM === m.id && !abiertos.has('-' + m.id));
      const abreSec = secAbiertas.has(m.id) || (act && sec.some((p) => p.id === act));
      return `<details class="sel-maz" data-m="${m.id}"${abre ? ' open' : ''}><summary><span class="sel-mn">${esc(m.nombre)}</span>${sub ? `<span class="sel-sub" title="Subidas">${sub}<i class="sel-flag" aria-hidden="true"></i></span>` : ''}<span class="sel-num" aria-label="${ps.length} cumbres">${ps.length}</span></summary>
        <div class="sel-ps">${pri.map((p) => fila(p)).join('')}${sec.length ? `<details class="sel-sec" data-m="${m.id}"${abreSec ? ' open' : ''}><summary>Cimas secundarias <span>${sec.length}</span></summary>${sec.map((p) => fila(p, etiqueta(p))).join('')}</details>` : ''}</div></details>`;
    }).join('');
  }

  function porBusqueda(f) {
    const pal = f.split(' ').filter(Boolean), res = [];
    for (const p of picos) {
      if (!pasa(p)) continue;
      const ix = idx.get(p.id), todo = `${ix.n} ${ix.otros.map((o) => o.n).join(' ')} ${ix.m}`;
      if (!pal.every((w) => todo.includes(w))) continue;
      // orden: empieza por lo buscado › palabra que empieza › dentro del nombre › otro nombre › macizo
      let s, via = null;
      const empiezaPal = (t) => (' ' + t).includes(' ' + f);
      if (ix.n.startsWith(f)) s = 0; else if (empiezaPal(ix.n)) s = 1; else if (ix.n.includes(f)) s = 2;
      else {
        const o = ix.otros.find((x) => x.n.startsWith(f) || empiezaPal(x.n)) || ix.otros.find((x) => x.n.includes(f) || pal.every((w) => x.n.includes(w)));
        if (o) { s = 3; via = o.o; } else s = 4;
      }
      res.push({ p, s, via });
    }
    res.sort((a, b) => a.s - b.s || (esPrincipal(b.p) - esPrincipal(a.p)) || b.p.altitud - a.p.altitud);
    if (!res.length) return `<p class="sel-vacio">${tr('Ninguna cumbre coincide con «{q}».', { q: esc(q.value.trim()) })}${filtrado() ? tr(' Prueba a quitar los filtros.') : ''}</p>`;
    return `<p class="sel-cuenta">${res.length === 1 ? '1 cumbre' : `${res.length} cumbres`}</p>` + res.map(({ p, via }) => {
      const otro = via ? `<small class="sel-via">${tr('también «{n}»', { n: marca(via, f) })}</small>` : '';
      return fila(p, `${etiqueta(p)}<small class="sel-mz">${esc(nombreMacizo[p.macizo])}</small>${otro}`, marca(p.nombre, f));
    }).join('');
  }

  // atajos: lista plana ordenada (mis subidas, las que faltan, las más cercanas al centro del mapa, las más altas)
  let atajo = null;
  function porAtajo() {
    let ps = picos.filter((p) => pasa(p) && p.activo !== false);
    let nota = () => '';
    if (atajo === 'subidos') { ps = ps.filter((p) => hecho(p.id)).sort((a, b) => b.altitud - a.altitud); }
    else if (atajo === 'pend') { ps = ps.filter((p) => !hecho(p.id) && esPrincipal(p)).sort((a, b) => b.altitud - a.altitud); }
    else if (atajo === 'cerca') { const d = new Map(ps.map((p) => [p.id, cercania(p)])); ps = ps.filter((p) => esPrincipal(p) || (d.get(p.id) ?? 1e9) < 6).sort((a, b) => d.get(a.id) - d.get(b.id)).slice(0, 25); nota = (p) => ` · a ${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(d.get(p.id))} km`; }
    else if (atajo === 'altas') { ps = ps.filter((p) => esPrincipal(p)).sort((a, b) => b.altitud - a.altitud).slice(0, 25); }
    const titulo = { subidos: 'Mis subidos', pend: 'Pendientes', cerca: 'Las más cercanas al centro del mapa', altas: 'Las más altas' }[atajo];
    if (!ps.length) return `<p class="sel-vacio">${atajo === 'subidos' ? 'Todavía no has marcado ninguna cumbre como subida.' : 'No hay cumbres que mostrar con la capa y los filtros actuales.'}</p>`;
    return `<p class="sel-cuenta">${titulo}: ${ps.length}</p>` + ps.map((p) => fila(p, `${etiqueta(p)}<small class="sel-mz">${esc(nombreMacizo[p.macizo])}${nota(p)}</small>`)).join('');
  }

  let tPinta = 0;
  function pinta() {
    const f = norm(q.value); tPinta = performance.now();
    for (const b of root.querySelectorAll('[data-atajo]')) b.setAttribute('aria-pressed', String(b.dataset.atajo === atajo));
    borra.hidden = !q.value;
    root.classList.toggle('buscando', !!f);
    const n = picos.filter(pasa).length;
    if (capa) {
      for (const b of root.querySelectorAll('[data-capa]')) b.setAttribute('aria-checked', b.dataset.capa === capa.get());
      q.placeholder = n === 1 ? tr('Buscar entre 1 cumbre') : tr('Buscar entre las {n} cumbres', { n });
    }
    filtroEl.hidden = !filtrado();
    if (filtrado()) filtroEl.innerHTML = `${tr('Con filtros: {n} de {t} cumbres', { n, t: picos.length })}${quitarFiltros ? ` · <button type="button" class="sel-quita">${tr('Quitar filtros')}</button>` : ''}`;
    lista.innerHTML = f ? porBusqueda(f) : atajo ? porAtajo() : (porMacizos() || '<p class="sel-vacio">Ninguna cumbre con estos filtros.</p>');
  }
  function alAbrir() {
    q.value = ''; pinta(); lista.scrollTop = 0;
    const sel = lista.querySelector('[aria-selected="true"]');
    if (sel) requestAnimationFrame(() => sel.scrollIntoView({ block: 'center' }));
  }

  q.addEventListener('input', pinta);
  borra.addEventListener('click', () => { q.value = ''; pinta(); q.focus(); });
  q.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { const b = lista.querySelector('button[data-id]'); if (b) elegir(b.dataset.id); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); lista.querySelector('button[data-id], summary')?.focus(); }
  });
  lista.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault(); e.stopPropagation();
    const items = [...lista.querySelectorAll('button[data-id], summary')].filter((el) => el.offsetParent);
    const i = items.indexOf(document.activeElement), j = i + (e.key === 'ArrowDown' ? 1 : -1);
    if (j < 0) q.focus(); else items[Math.min(j, items.length - 1)]?.focus();
  });
  lista.addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) elegir(b.dataset.id); });
  root.querySelector('.sel-capa')?.addEventListener('click', (e) => { const b = e.target.closest('[data-capa]'); if (b && b.dataset.capa !== capa.get()) { capa.set(b.dataset.capa); pinta(); } });
  root.querySelector('.sel-atajos')?.addEventListener('click', (e) => { const b = e.target.closest('[data-atajo]'); if (!b) return; atajo = atajo === b.dataset.atajo ? null : b.dataset.atajo; pinta(); lista.scrollTop = 0; });
  filtroEl.addEventListener('click', (e) => { if (e.target.closest('.sel-quita')) { quitarFiltros(); pinta(); } });
  // recordar qué macizos se despliegan o se pliegan
  lista.addEventListener('toggle', (e) => {
    const d = e.target, m = d.dataset?.m; if (!m || performance.now() - tPinta < 150) return;   // los que abre el propio repintado no cuentan
    if (d.classList.contains('sel-sec')) { d.open ? secAbiertas.add(m) : secAbiertas.delete(m); return; }
    if (d.open) { abiertos.add(m); abiertos.delete('-' + m); requestAnimationFrame(() => d.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); }
    else { abiertos.delete(m); abiertos.add('-' + m); }
  }, true);

  return { pinta, alAbrir, input: q, cerrar: root.querySelector('.sel-x') };
}

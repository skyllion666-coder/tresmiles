// «Palabras de la montaña»: todas las palabras del glosario (data/glosario.json) en una ventana, por familias, con buscador.
// Cada palabra lleva ejemplos reales del mapa: cumbres y lugares cuyo nombre la contiene (Tozal del Mallo, Foz de Biniés…); al tocarlos se va allí.
// Se crea la primera vez que se abre. Las fichas usan el mismo archivo (js/glosario.js) y su tarjeta tiene un enlace aquí.
const quitaTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function crearEnciclopedia({ enIngles = false, cumbres = () => [], lugares = () => [], abrirCumbre, verLugar }) {
  let dlg = null, datos = null;
  const T = enIngles ? {
    tit: 'Mountain words', cerrar: 'Close', buscar: 'Search a word…', todas: 'All', pir: 'Pyrenees', pirT: 'Word of the Pyrenees or of Aragon',
    intro: 'The words used to describe the terrain of the Aragonese Pyrenees, with their meaning. Those marked «Pyrenees» are local words that are kept in place names. In the summit pages these words are underlined: tap them to see what they mean.',
    ej: 'On the map:', fuente: 'Source:', pend: 'Reviewed definition; source pending.', prob: 'Probable: still to be confirmed.', nada: 'No word matches the search.',
    pie: 'Definitions written for Tresmiles from the sources linked under each word (mostly Aragonario, the Spanish–Aragonese dictionary of the Government of Aragon). The dictionary is being expanded with documented sources; if you see a mistake, tell us (Contribute, in any summit page).',
  } : {
    tit: 'Palabras de la montaña', cerrar: 'Cerrar', buscar: 'Busca una palabra…', todas: 'Todas', pir: 'Pirineo', pirT: 'Palabra del Pirineo o de Aragón',
    intro: 'Las palabras con las que se describe el terreno del Pirineo aragonés, con lo que significan. Las marcadas «Pirineo» son palabras de aquí, que se conservan en los nombres de los lugares. En las fichas de las cumbres estas palabras salen subrayadas: tócalas para ver qué significan.',
    ej: 'En el mapa:', fuente: 'Fuente:', pend: 'Definición revisada; fuente pendiente.', prob: 'Probable: falta confirmarlo.', nada: 'Ninguna palabra coincide con la búsqueda.',
    pie: 'Definiciones redactadas para Tresmiles a partir de las fuentes enlazadas en cada palabra (sobre todo Aragonario, el diccionario castellano–aragonés del Gobierno de Aragón). El diccionario se está ampliando con fuentes documentadas; si ves un error, dínoslo (Colabora, en cualquier ficha).',
  };

  // ejemplos reales: nombres del mapa que contienen la palabra (como palabra entera); primero los que empiezan por ella
  function ejemplos(g) {
    const formas = g.es.map((w) => quitaTildes(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:e?s)?');
    const re = new RegExp(`(?<![\\p{L}])(${formas.join('|')})(?![\\p{L}])`, 'iu'), no = (g.no ?? []).map(quitaTildes);
    const vale = (n) => { const q = quitaTildes(n), m = re.exec(q); return m && !no.some((x) => q.includes(x)) ? (m.index === 0 ? 0 : 1) : -1; };
    const out = [], vistos = new Set();
    const cands = [
      ...cumbres().map((p) => ({ tipo: 'c', id: p.id, nombre: p.nombre, alt: p.altitud ?? 0, r: vale(p.nombre) })),
      ...lugares().map(([nombre, lon, lat]) => ({ tipo: 'l', nombre, lon, lat, alt: 0, r: vale(nombre) })),
    ].filter((x) => x.r >= 0 && !/\d|sin nombre/i.test(x.nombre))   // fuera nombres de relleno de OSM («Cima 234», «Cima Sin Nombre»).sort((a, b) => a.r - b.r || (a.tipo === 'l') - (b.tipo === 'l') || b.alt - a.alt);
    for (const x of cands) { const k = quitaTildes(x.nombre); if (vistos.has(k)) continue; vistos.add(k); out.push(x); if (out.length >= 4) break; }
    return out;
  }

  function construye() {
    dlg = document.createElement('dialog'); dlg.id = 'palabras'; dlg.setAttribute('aria-label', T.tit);
    const cats = datos.categorias.filter((c) => datos.terminos.some((g) => g.cat === c.id));
    const ord = (a, b) => quitaTildes(enIngles ? a.te : a.t).localeCompare(quitaTildes(enIngles ? b.te : b.t));
    dlg.innerHTML = `<form method="dialog"><button class="about-close" aria-label="${T.cerrar}">×</button></form>
      <div class="pal-body"><h2>${T.tit}</h2><p class="pal-intro">${T.intro}</p>
      <div class="pal-filtros"><input type="search" class="pal-buscar" placeholder="${T.buscar}" aria-label="${T.buscar}" autocomplete="off">
      <div class="pal-chips" role="group"><button type="button" class="chip is-on" data-cat="">${T.todas} <small>${datos.terminos.length}</small></button>${cats.map((c) => `<button type="button" class="chip" data-cat="${c.id}">${escH(enIngles ? c.te : c.t)} <small>${datos.terminos.filter((g) => g.cat === c.id).length}</small></button>`).join('')}</div></div>
      ${cats.map((c) => `<section class="pal-cat" data-cat="${c.id}"><h3>${escH(enIngles ? c.te : c.t)}</h3>${datos.terminos.filter((g) => g.cat === c.id).sort(ord).map((g) => {
        const ej = ejemplos(g);
        return `<article class="pal" id="pal-${g.id}" data-q="${escH(quitaTildes([g.t, g.te, ...g.es, ...g.en, g.d, g.de].join(' ')))}">
          <h4>${escH(enIngles ? (g.te.includes('(') || g.te === g.t ? g.te : `${g.te} · ${g.t}`) : g.t)}${g.pir ? ` <span class="pal-pir" title="${T.pirT}">${T.pir}</span>` : ''}</h4>
          <p>${escH(enIngles ? g.de : g.d)}</p>
          ${g.fuentes?.length ? `<p class="pal-fu">${T.fuente} ${g.fuentes.map((x) => `<a href="${escH(x.u)}" target="_blank" rel="noopener">${escH(x.n)}</a>`).join(' · ')}${g.fiab === 'probable' ? ` · ${T.prob}` : ''}</p>` : `<p class="pal-fu">${g.fiab === 'probable' ? T.prob : T.pend}</p>`}
          ${ej.length ? `<p class="pal-ej">${T.ej} ${ej.map((x) => x.tipo === 'c' ? `<button type="button" data-cumbre="${escH(x.id)}">${escH(x.nombre)}</button>` : `<button type="button" data-lon="${x.lon}" data-lat="${x.lat}">${escH(x.nombre)}</button>`).join(' · ')}</p>` : ''}
        </article>`;
      }).join('')}</section>`).join('')}
      <p class="pal-nada" hidden>${T.nada}</p><p class="ruta-credito">${T.pie}</p></div>`;
    document.body.appendChild(dlg);
    const buscar = dlg.querySelector('.pal-buscar');
    let cat = '';
    const filtra = () => {
      const q = quitaTildes(buscar.value.trim()); let n = 0;
      for (const s of dlg.querySelectorAll('.pal-cat')) {
        let k = 0;
        for (const a of s.querySelectorAll('.pal')) { const ok = (!cat || s.dataset.cat === cat) && (!q || a.dataset.q.includes(q)); a.hidden = !ok; k += ok; }
        s.hidden = !k; n += k;
      }
      dlg.querySelector('.pal-nada').hidden = n > 0;
    };
    buscar.addEventListener('input', filtra);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) { dlg.close(); return; }
      const ch = e.target.closest('.chip');
      if (ch) { cat = ch.dataset.cat; dlg.querySelectorAll('.pal-chips .chip').forEach((b) => b.classList.toggle('is-on', b === ch)); filtra(); return; }
      const c = e.target.closest('[data-cumbre]'); if (c) { dlg.close(); abrirCumbre?.(c.dataset.cumbre); return; }
      const l = e.target.closest('[data-lon]'); if (l) { dlg.close(); verLugar?.(+l.dataset.lon, +l.dataset.lat, l.textContent); }
    });
  }

  async function abrir(id) {
    if (!datos) datos = await fetch(`data/glosario.json?dv=${window.DATOS_V || 0}`).then((r) => r.json());
    if (!dlg) construye();
    const buscar = dlg.querySelector('.pal-buscar');
    if (id) { buscar.value = ''; dlg.querySelector('.pal-chips .chip[data-cat=""]').click(); }
    dlg.showModal();
    const a = id && dlg.querySelector(`#pal-${CSS.escape(id)}`);
    dlg.querySelectorAll('.pal.is-sel').forEach((x) => x.classList.remove('is-sel'));
    if (a) { a.classList.add('is-sel'); a.scrollIntoView({ block: 'center' }); } else dlg.querySelector('.pal-body').scrollTop = 0;
  }
  return { abrir, abierto: () => !!dlg?.open, cerrar: () => dlg?.close() };
}

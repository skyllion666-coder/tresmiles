// Glosario de las fichas: las palabras de montaña del texto (glera, faja, collado, rimaya…) salen subrayadas y, al tocarlas,
// se abre debajo del párrafo una tarjeta con lo que significan (data/glosario.json). Solo la primera vez que sale cada término en la ficha,
// y nunca dentro de un enlace. En inglés busca las palabras inglesas y los nombres locales que se quedan (ibón, tuca, faja…).
export function crearGlosario({ url = 'data/glosario.json', enIngles = false, cerrar = 'Cerrar', todas = null } = {}) {
  let terminos = null, re = null, busca = null, pendiente = null;
  const carga = fetch(`${url}?dv=${window.DATOS_V || 0}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
    terminos = d?.terminos ?? [];
    const forma = new Map();   // palabra en minúsculas → término
    for (const g of terminos) if (g.ficha !== false) for (const w of (enIngles ? [...g.en, ...g.es] : g.es)) forma.set(w.toLowerCase(), g);
    const alt = [...forma.keys()].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:e?s)?');
    re = alt.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${alt.join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
    busca = (w) => { w = w.toLowerCase(); return forma.get(w) ?? forma.get(w.replace(/e?s$/, '')) ?? forma.get(w.replace(/s$/, '')); };
    if (pendiente) { marca(pendiente); pendiente = null; }
  }).catch((e) => { console.warn('glosario:', e); terminos = []; });

  // envuelve los términos de los párrafos `.gl-txt` de `raiz`
  function marca(raiz) {
    if (!terminos) { pendiente = raiz; return; }
    if (!re) return;
    const vistos = new Set();
    for (const el of raiz.querySelectorAll('.gl-txt')) {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('a, .gl') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      const nodos = []; for (let n; (n = w.nextNode());) nodos.push(n);
      for (const n of nodos) {
        const s = n.nodeValue; re.lastIndex = 0; let m, ult = 0, frag = null;
        while ((m = re.exec(s))) {
          const g = busca(m[1]); if (!g || vistos.has(g.id) || g.no?.some((x) => s.startsWith(x, m.index))) continue;   // «no»: nombres propios que no son el término (Hoz de Jaca es un pueblo)
          vistos.add(g.id); frag ??= document.createDocumentFragment();
          frag.append(s.slice(ult, m.index));
          const b = document.createElement('span'); b.className = 'gl'; b.dataset.gl = g.id; b.tabIndex = 0; b.setAttribute('role', 'button'); b.textContent = m[1];
          frag.append(b); ult = m.index + m[1].length;
        }
        if (frag) { frag.append(s.slice(ult)); n.replaceWith(frag); }
      }
    }
  }

  // tocar un término: abre (o cierra) su tarjeta debajo del párrafo
  function abre(b) {
    const g = terminos?.find((x) => x.id === b.dataset.gl); if (!g) return;
    const raiz = b.closest('.gl-txt'), abierta = raiz.nextElementSibling?.classList.contains('gl-card') ? raiz.nextElementSibling : null;
    document.querySelectorAll('.gl-card').forEach((c) => c.remove());
    document.querySelectorAll('.gl.is-open').forEach((x) => { x.classList.remove('is-open'); x.setAttribute('aria-expanded', 'false'); });
    if (abierta?.dataset.gl === g.id) return;
    const c = document.createElement('div'); c.className = 'gl-card'; c.dataset.gl = g.id; c.setAttribute('role', 'note');
    const tit = enIngles ? (g.te.includes('(') || g.te === g.t ? g.te : `${g.te} · ${g.t}`) : g.t;   // en inglés, también la palabra de aquí
    c.innerHTML = `<button type="button" class="gl-x" aria-label="${cerrar}">×</button><b></b><p></p>${todas ? `<button type="button" class="gl-todas">${enIngles ? 'All mountain words' : 'Todas las palabras de la montaña'} →</button>` : ''}`;
    c.querySelector('.gl-todas')?.addEventListener('click', () => todas(g.id));   // «Palabras de la montaña» (js/enciclopedia.js), con esta palabra señalada
    c.querySelector('b').textContent = tit; c.querySelector('p').textContent = enIngles ? g.de : g.d;
    raiz.after(c); b.classList.add('is-open'); b.setAttribute('aria-expanded', 'true');
    c.querySelector('.gl-x').addEventListener('click', () => { c.remove(); b.classList.remove('is-open'); b.setAttribute('aria-expanded', 'false'); b.focus({ preventScroll: true }); });
    const r = c.getBoundingClientRect(), cont = c.closest('.ficha-body') ?? c.parentElement, rc = cont.getBoundingClientRect();
    if (r.bottom > rc.bottom) cont.scrollBy({ top: r.bottom - rc.bottom + 12, behavior: 'smooth' });   // que se vea entera
  }
  function escucha(raiz) {
    raiz.addEventListener('click', (e) => { const b = e.target.closest('.gl'); if (b) { e.stopPropagation(); abre(b); } });
    raiz.addEventListener('keydown', (e) => { const b = e.target.closest?.('.gl'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abre(b); } });
  }
  return { marca, escucha, carga };
}

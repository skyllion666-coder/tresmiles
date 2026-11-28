// Ayuda de manejo y ventana «Acerca de» con pestañas (Cómo se usa · El proyecto · Datos y fuentes · Fotos y rutas).
// - abrir(pestaña, sección): rellena «Acerca de» (main.js buildAbout), lo reparte en pestañas por sus títulos <h3> y añade la ayuda.
// - primeraVez(capa): la primera vez que se enciende una capa (huellas, sendas, nieve, mapa plano, dónde estoy) sale una tarjeta corta con sus colores.
// - bienvenida(): en la app, tres tarjetas la primera vez (descargar la zona, dónde estoy, SOS).
// Textos en español e inglés aquí mismo (no pasan por i18n.js).
import { EN_INGLES } from './i18n.js?v=57';

const L = (es, en) => (EN_INGLES ? en : es);
const PEST = 'tresmiles-acerca-pest';

// a qué pestaña va cada apartado de «Acerca de» (por su título); lo que no está aquí va a «Datos y fuentes»
const REPARTO = {
  'App para Android': 'proyecto', 'Android app': 'proyecto', 'Direcciones de la web': 'proyecto', 'Website addresses': 'proyecto',
  'Visitas': 'proyecto', 'Visits': 'proyecto', 'Seguridad': 'proyecto', 'Safety': 'proyecto', 'Diagnóstico de la app': 'proyecto',
  'Fotografías de las cumbres': 'fotos', 'Summit photographs': 'fotos', 'Recorrido y hitos': 'fotos', 'Routes and waypoints': 'fotos',
  'Fotografías de los hitos': 'fotos', 'Waypoint photographs': 'fotos',
  'Por dónde pasa la gente': null, 'Where people go': null,   // ahora está en «Cómo se usa»
};
const PESTANAS = [['uso', L('Cómo se usa', 'How to use it')], ['proyecto', L('El proyecto', 'The project')], ['fuentes', L('Datos y fuentes', 'Data and sources')], ['fotos', L('Fotos y rutas', 'Photos and routes')]];

// muestras de color para las leyendas
const linea = (c, extra = '') => `<i class="ay-m ay-linea" style="--c:${c}${extra}"></i>`;
const rayas = (c) => `<i class="ay-m ay-rayas" style="--c:${c}"></i>`;
const mancha = (c) => `<i class="ay-m ay-mancha" style="--c:${c}"></i>`;
const MUESTRA = {
  subida: linea('#ffa930'), bajada: rayas('#ffa930'), verde: linea('#5be36f'), flecha: '<i class="ay-m ay-flecha">➤</i>',
  senda: linea('#fff4d6'), pista: linea('#d9a866'), ferrata: linea('#ff5a3c'),
  calorPoco: mancha('rgba(255,120,30,.55)'), calorMucho: mancha('#ffe14a'), calorGrad: '<i class="ay-m ay-grad"></i>', carretera: mancha('#8a9bb0'), pistaCalor: mancha('#d8c08a'),
  nieve: mancha('#eef3fb'), p30: mancha('#fad63c'), p35: mancha('#f59628'), p40: mancha('#e23c28'), p45: mancha('#963ca0'),
};

// tarjetas de «la primera vez»
const AVISOS = {
  calor: {
    t: L('Por dónde pasa la gente', 'Where people go'),
    h: L(`<p>Los caminos «calientes»: por donde ha pasado gente con GPS.</p><ul class="ay-ley"><li>${MUESTRA.calorPoco} Naranja tenue: pocas trazas (a veces, una persona que se perdió)</li><li>${MUESTRA.calorMucho} Amarillo: paso muy pisado</li><li>${MUESTRA.carretera} Carreteras · ${MUESTRA.pistaCalor} pistas (GPS en el coche)</li><li>${MUESTRA.verde} La ruta de ejemplo se pinta en verde</li></ul><p>Toca un camino para ver cuánta gente pasa. <b>No dice si un paso es seguro.</b></p>`,
      `<p>The “hot” paths: where people have passed with a GPS.</p><ul class="ay-ley"><li>${MUESTRA.calorPoco} Faint orange: few traces (sometimes one person who got lost)</li><li>${MUESTRA.calorMucho} Yellow: a well-trodden way</li><li>${MUESTRA.carretera} Roads · ${MUESTRA.pistaCalor} dirt tracks (GPS in the car)</li><li>${MUESTRA.verde} The example route turns green</li></ul><p>Tap a path to see how many people go that way. <b>It does not say whether a passage is safe.</b></p>`),
  },
  sendas: {
    t: L('Sendas y pistas', 'Paths and tracks'),
    h: L(`<p>Todos los caminos de OpenStreetMap, para ver por dónde se puede ir además de la ruta:</p><ul class="ay-ley"><li>${MUESTRA.senda} Blanco: sendas</li><li>${MUESTRA.pista} Ocre: pistas</li><li>${MUESTRA.ferrata} Rojo: vías ferratas</li></ul><p>Se ven al acercarte (desde muy lejos no se dibujan).</p>`,
      `<p>All the paths in OpenStreetMap, to see where you can go besides the route:</p><ul class="ay-ley"><li>${MUESTRA.senda} White: footpaths</li><li>${MUESTRA.pista} Ochre: dirt tracks</li><li>${MUESTRA.ferrata} Red: via ferratas</li></ul><p>They appear as you zoom in (not from very far away).</p>`),
  },
  nieve: {
    t: L('Nieve ahora', 'Snow now'),
    h: L(`<p>${MUESTRA.nieve} En blanco, la nieve que ve el satélite Sentinel-2 en su última pasada sin nubes (la fecha sale junto al botón).</p><p>Dice si hay nieve, no cómo está: puede estar dura o helada. Con nieve, crampones y piolet.</p>`,
      `<p>${MUESTRA.nieve} In white, the snow seen by the Sentinel-2 satellite on its latest cloud-free pass (the date is shown by the button).</p><p>It shows whether there is snow, not its condition: it may be hard or icy. With snow, take crampons and an ice axe.</p>`),
  },
  plano: {
    t: L('Mapa plano', 'Flat map'),
    h: L(`<ul class="ay-ley"><li><b>Relieve · IGN · Foto</b>: cambia el fondo del mapa.</li><li><b>Pendiente</b>: colorea las laderas: ${MUESTRA.p30} 30° ${MUESTRA.p35} 35° ${MUESTRA.p40} 40° ${MUESTRA.p45} 45° o más (donde más fácil es resbalar y donde caen los aludes).</li><li>Gira con dos dedos como el 3D; la brújula pone el norte arriba.</li><li><b>3D</b>: vuelve al relieve en el mismo sitio.</li></ul>`,
      `<ul class="ay-ley"><li><b>Relieve · IGN · Foto</b>: changes the map background.</li><li><b>Pendiente</b> (slope): colours the slopes: ${MUESTRA.p30} 30° ${MUESTRA.p35} 35° ${MUESTRA.p40} 40° ${MUESTRA.p45} 45° or more (where slips and avalanches are likeliest).</li><li>Rotate with two fingers as in 3D; the compass puts north up.</li><li><b>3D</b>: back to the terrain at the same spot.</li></ul>`),
  },
  ubicacion: {
    t: L('Dónde estoy', 'Where am I'),
    h: L(`<p>El punto azul es tu posición (GPS) y el cono, hacia dónde mira el móvil.</p><ul class="ay-ley"><li>1.er toque: te sigue con el norte arriba.</li><li>2.º toque: el mapa gira contigo (lo de delante del móvil, delante en el mapa).</li><li>3.er toque: apagar.</li></ul><p>Funciona sin cobertura.</p>`,
      `<p>The blue dot is your position (GPS) and the cone, where the phone is pointing.</p><ul class="ay-ley"><li>1st tap: follows you with north up.</li><li>2nd tap: the map turns with you.</li><li>3rd tap: off.</li></ul><p>Works without coverage.</p>`),
  },
};

export function crearAyuda({ EN_APP, store, dialogo, cuerpo, rellenar }) {
  // ——— «Cómo se usa» ———
  const icono = (id) => document.querySelector(`#${id} svg`)?.outerHTML ?? '';
  const visible = (id) => { const b = document.getElementById(id); return b && !b.hidden; };
  const boton = (id, nombre, texto, probar = true) => (probar ? visible(id) : document.getElementById(id)) ? `<li><span class="ay-ico">${icono(id)}</span><div><b>${nombre}</b> ${texto}${probar ? ` <button type="button" class="ay-probar" data-probar="${id}">${L('Probar', 'Try it')}</button>` : ''}</div></li>` : '';
  const tactil = matchMedia('(hover: none)').matches;

  function htmlUso() {
    const s = [];
    s.push(`<p class="ay-ind">${[['mover', L('Moverse', 'Moving')], ['botones', L('Botones', 'Buttons')], ['lineas', L('Líneas y colores', 'Lines and colours')], ['ficha', L('La ficha', 'Summit card')], ...(EN_APP ? [['app', L('Sin cobertura', 'No coverage')]] : []), ['problemas', L('Problemas', 'Problems')]].map(([k, n]) => `<a href="#ay-${k}" data-ir="${k}">${n}</a>`).join('')}</p>`);
    s.push(`<h3 id="ay-mover">${L('Moverse por el mapa', 'Moving around the map')}</h3><ul>`
      + (tactil ? L('<li><b>Un dedo</b>: arrastra para moverte.</li><li><b>Dos dedos</b>: pellizca para acercarte y gíralos para girar la vista; súbelos o bájalos a la vez para inclinarla.</li>', '<li><b>One finger</b>: drag to move.</li><li><b>Two fingers</b>: pinch to zoom and twist to rotate; slide both up or down to tilt.</li>')
        : L('<li><b>Botón izquierdo</b>: arrastra para moverte. <b>Botón derecho</b>: girar e inclinar. <b>Rueda</b>: acercarte.</li>', '<li><b>Left button</b>: drag to move. <b>Right button</b>: rotate and tilt. <b>Wheel</b>: zoom.</li>'))
      + L(`<li><b>Toca una cumbre</b> para abrir su ficha y ver su ruta; toca cualquier otro punto y te dice el pico más cercano.</li><li>Las flechas curvas de abajo giran la vista (mantenlas pulsadas para girar sin parar); la <b>brújula</b> pone el norte arriba.</li><li>${visible('btn-home') ? icono('btn-home') : ''} La casita vuelve a la vista de todo el Pirineo; <b>Explorar las cumbres</b> abre la lista para buscar una.</li></ul>`,
        `<li><b>Tap a summit</b> to open its card and see its route; tap anywhere else and it tells you the nearest peak.</li><li>The curved arrows at the bottom rotate the view (hold them to keep turning); the <b>compass</b> puts north up.</li><li>${visible('btn-home') ? icono('btn-home') : ''} The house button goes back to the whole Pyrenees; <b>Explore the summits</b> opens the list to find one.</li></ul>`));
    s.push(`<h3 id="ay-botones">${L('Los botones de la derecha', 'The buttons on the right')}</h3><ul class="ay-botones">`
      + boton('btn-filters', L('Filtros:', 'Filters:'), L('por macizo, altitud y dificultad, y tus tresmiles subidos o pendientes.', 'by massif, altitude and difficulty, and the 3,000ers you have climbed or not.'))
      + boton('btn-vuelo', L('Volar por la ruta:', 'Fly along the route:'), L('con una cumbre abierta, la cámara recorre la ruta de ejemplo de principio a fin.', 'with a summit open, the camera travels the example route from start to finish.'))
      + boton('btn-light', L('Luz:', 'Light:'), L('cambia la hora del día (mañana, mediodía, tarde), la hora real (con el tiempo de verdad) o «Claro», una luz de mapa sin nubes ni nieve para estudiar el terreno.', 'changes the time of day (morning, midday, afternoon), the real time (with the real weather) or “Clear”, a map-like light without clouds or snow to study the terrain.'))
      + boton('btn-calor', L('Por dónde pasa la gente (caminos calientes):', 'Where people go (hot paths):'), L('ilumina por donde ha pasado gente con GPS. Mira abajo sus colores.', 'lights up where people have passed with a GPS. See its colours below.'))
      + boton('btn-plano', L('Mapa plano:', 'Flat map:'), L('el mismo sitio en 2D, con los fondos del IGN, relieve o foto aérea y las pendientes en colores.', 'the same spot in 2D, with IGN, terrain or aerial backgrounds and slopes in colour.'))
      + boton('btn-sendas', L('Sendas y pistas:', 'Paths and tracks:'), L('todos los caminos de OpenStreetMap encima del relieve.', 'all the OpenStreetMap paths on the terrain.'))
      + boton('btn-nieve', L('Nieve ahora:', 'Snow now:'), L('la nieve que ve el satélite estos días.', 'the snow the satellite sees these days.'))
      + boton('btn-sound', L('Sonido:', 'Sound:'), L('viento, agua y pájaros según dónde mires.', 'wind, water and birds depending on where you look.'))
      + boton('btn-pantalla', L('Pantalla completa.', 'Full screen.'), '')
      + `</ul>`);
    s.push(`<h3 id="ay-lineas">${L('Qué es cada línea y cada color', 'What each line and colour means')}</h3>`
      + L(`<p class="ay-sub">La ruta de la cumbre abierta</p><ul class="ay-ley"><li>${MUESTRA.subida} Subida: línea naranja continua.</li><li>${MUESTRA.bajada} Bajada: a rayas (si se baja por el mismo camino, no se pinta aparte).</li><li>${MUESTRA.flecha} Las flechas blancas marcan el sentido de la marcha.</li><li>${linea('#5ad1ff')} Otras subidas: otras líneas de color, con su nombre encima (salen en la ficha, en «Otras subidas»).</li><li>${MUESTRA.verde} Con las huellas encendidas, la ruta se pinta en verde para no confundirse.</li></ul>`,
        `<p class="ay-sub">The route of the open summit</p><ul class="ay-ley"><li>${MUESTRA.subida} Way up: solid orange line.</li><li>${MUESTRA.bajada} Way down: dashed (if it comes back the same way, it is not drawn separately).</li><li>${MUESTRA.flecha} The white arrows show the direction of travel.</li><li>${linea('#5ad1ff')} Other ways up: other coloured lines, with their name on top (listed in the card under “Other ways up”).</li><li>${MUESTRA.verde} With the footprints on, the route turns green so as not to mix them up.</li></ul>`)
      + L(`<p class="ay-sub">Sendas y pistas ${icono('btn-sendas')}</p><ul class="ay-ley"><li>${MUESTRA.senda} Las líneas blancas son las sendas: los caminos a pie de OpenStreetMap.</li><li>${MUESTRA.pista} Ocre: pistas por donde pueden ir coches.</li><li>${MUESTRA.ferrata} Rojo: vías ferratas.</li></ul>`,
        `<p class="ay-sub">Paths and tracks ${icono('btn-sendas')}</p><ul class="ay-ley"><li>${MUESTRA.senda} The white lines are footpaths from OpenStreetMap.</li><li>${MUESTRA.pista} Ochre: dirt tracks cars can use.</li><li>${MUESTRA.ferrata} Red: via ferratas.</li></ul>`)
      + L(`<p class="ay-sub">Caminos calientes: por dónde pasa la gente ${icono('btn-calor')}</p><ul class="ay-ley"><li>${MUESTRA.calorGrad} Brillan los sitios por donde ha pasado gente con GPS: <b>naranja tenue</b> si son pocas trazas y <b>amarillo</b> si son muchas.</li><li>${MUESTRA.carretera} Azul grisáceo: carreteras · ${MUESTRA.pistaCalor} arena: pistas (mucha gente graba el GPS también en el coche).</li><li>Toca un camino y te dice si es <b>muy frecuentado, frecuentado, poco o muy poco</b>, con las cifras: trazas completas (las que la gente sube como públicas) y puntos sueltos (de las privadas, que no dejan saber cuántas personas son).</li></ul><p>Sirve para ver los caminos más pisados, por ejemplo para volver a una senda conocida si te sales de la ruta. <b>No dice si un paso es seguro</b>: hay trazas por glaciares, neveros y canales, y de gente que se perdió. Un brillo tenue puede ser una sola persona. Sale de las trazas GPS públicas de <a href="https://www.openstreetmap.org/traces" target="_blank" rel="noopener">© OpenStreetMap</a>.</p>`,
        `<p class="ay-sub">Hot paths: where people go ${icono('btn-calor')}</p><ul class="ay-ley"><li>${MUESTRA.calorGrad} Places where people have passed with a GPS glow: <b>faint orange</b> for a few traces and <b>yellow</b> for many.</li><li>${MUESTRA.carretera} Greyish blue: roads · ${MUESTRA.pistaCalor} sand: dirt tracks (many people also record GPS in the car).</li><li>Tap a path and it tells you whether it is <b>very busy, used, rarely or very rarely used</b>, with the figures: full traces (public uploads) and loose points (from private ones, which do not tell how many people they are).</li></ul><p>It helps you spot the most trodden paths, for example to get back to a known trail if you leave your route. <b>It does not say whether a passage is safe</b>: there are traces across glaciers, snowfields and gullies, and from people who got lost. A faint glow can be a single person. Made from the public GPS traces on <a href="https://www.openstreetmap.org/traces" target="_blank" rel="noopener">© OpenStreetMap</a>.</p>`)
      + L(`<p class="ay-sub">Nieve y pendientes</p><ul class="ay-ley"><li>${MUESTRA.nieve} Con «Nieve ahora», el blanco es la nieve vista por el satélite (no dice si está dura o helada).</li><li>${MUESTRA.p30}${MUESTRA.p35}${MUESTRA.p40}${MUESTRA.p45} En el mapa plano, «Pendiente» colorea las laderas de 30°, 35°, 40° y 45° o más.</li></ul>`,
        `<p class="ay-sub">Snow and slopes</p><ul class="ay-ley"><li>${MUESTRA.nieve} With “Snow now”, white is the snow seen by the satellite (not whether it is hard or icy).</li><li>${MUESTRA.p30}${MUESTRA.p35}${MUESTRA.p40}${MUESTRA.p45} On the flat map, “Slope” colours slopes of 30°, 35°, 40° and 45° or more.</li></ul>`)
      + L(`<p class="ay-sub">Las cumbres</p><ul class="ay-ley"><li><i class="ay-m ay-pin"></i> Círculo con foto: tresmil con ficha completa (ruta, hitos y fotos). Un punto pequeño: cumbre con ficha sencilla.</li><li>Las de menos de 3.000 m se ven eligiendo «Menos de 3.000» o «Todas» en la lista de cumbres.</li></ul>`,
        `<p class="ay-sub">The summits</p><ul class="ay-ley"><li><i class="ay-m ay-pin"></i> Circle with a photo: a 3,000er with a full card (route, waypoints and photos). A small dot: a summit with a simple card.</li><li>Summits below 3,000 m appear when you choose “Below 3,000” or “All” in the summit list.</li></ul>`));
    s.push(`<h3 id="ay-ficha">${L('La ficha de una cumbre', 'The summit card')}</h3>` + L(`<ul><li>Altitud, desnivel, dificultad y tiempos de la ruta de ejemplo, con su <b>perfil</b>: pasa el dedo por él y un punto recorre la ruta en el mapa.</li><li><b>Tiempo</b> en la cumbre para los próximos días, <b>nieve</b> del satélite y <b>agua</b> en la subida (fuentes de OpenStreetMap).</li><li><b>Otras subidas</b>: por dónde sube la gente según las trazas GPS.</li><li><b>Zona en alta calidad</b>: ortofoto de 25 cm y relieve fino para ver la zona como es.</li><li>«He subido este tresmil»: lo apuntas y luego lo filtras en Filtros.</li><li>La flecha de arriba recoge la ficha para ver el recorrido; la × la cierra.</li></ul>`,
      `<ul><li>Altitude, ascent, difficulty and times of the example route, with its <b>profile</b>: run your finger along it and a dot follows the route on the map.</li><li><b>Weather</b> at the summit for the coming days, <b>snow</b> from the satellite and <b>water</b> on the way up (OpenStreetMap springs).</li><li><b>Other ways up</b>: where people go up according to GPS traces.</li><li><b>High-quality area</b>: 25 cm aerial imagery and fine terrain to see the area as it is.</li><li>“I have climbed this 3,000er”: mark it and filter by it later in Filters.</li><li>The arrow at the top folds the card to see the route; the × closes it.</li></ul>`));
    if (EN_APP) s.push(`<h3 id="ay-app">${L('En la app: para ir a la montaña', 'In the app: for the mountains')}</h3><ul class="ay-botones">`
      + `<li class="ay-consejo">${L('<b>Antes de salir, con wifi:</b> descarga tu zona en «Mis zonas» (en «El proyecto») o desde la ficha de la cumbre. Así tienes la foto aérea y el relieve fino sin cobertura.', '<b>Before you go, on wifi:</b> download your area in “My areas” (under “The project”) or from the summit card. That way you have the aerial photo and fine terrain without coverage.')}</li>`
      + boton('btn-ubicacion', L('Dónde estoy:', 'Where am I:'), L('tu posición con el GPS y hacia dónde miras. 1.er toque, norte arriba; 2.º, el mapa gira contigo; 3.º, apagar.', 'your GPS position and where you are facing. 1st tap, north up; 2nd, the map turns with you; 3rd, off.'), false)
      + boton('btn-pan-aqui', L('Qué montañas veo:', 'Which mountains can I see:'), L('el horizonte desde donde estás, con el nombre de cada cumbre. Desde ahí, la <b>Cámara</b> pone los nombres sobre lo que ves (si no casa, «Encajar» o arrastra la línea).', 'the skyline from where you are, with each summit’s name. From there, the <b>Camera</b> puts the names over what you see (if it does not match, “Fit” or drag the line).'), false)
      + boton('btn-seguridad', L('SOS:', 'SOS:'), L('envía tu posición por WhatsApp o SMS, llama al 112 y te dice si llegas abajo antes de que anochezca.', 'sends your position by WhatsApp or SMS, calls 112 and tells you whether you will get down before dark.'), false)
      + boton('btn-calidad', L('HD:', 'HD:'), L('más detalle en el relieve; en móviles modestos puede ir más lento.', 'more terrain detail; on modest phones it may be slower.'), false)
      + `</ul>`);
    s.push(`<h3 id="ay-problemas">${L('Si algo no va', 'If something does not work')}</h3>` + L(`<ul><li><b>La web no carga</b> (sobre todo los fines de semana, por los bloqueos del fútbol): usa la dirección de reserva <a href="https://skyllion666-coder.github.io/tresmiles/">skyllion666-coder.github.io/tresmiles</a>.</li><li><b>Una zona no se descarga</b>: la ficha te ofrece bajar el archivo .zip y abrirlo tú.</li><li><b>Va lento</b>: apaga capas que no uses y cierra otras pestañas o aplicaciones.</li><li><b>El GPS o la brújula fallan</b>: sal a cielo abierto, aleja el móvil de metales y mueve el móvil en forma de ocho.</li></ul><p class="ay-nota">Esta web no sustituye a una guía, a un parte de condiciones ni a la experiencia en montaña.</p>`,
      `<ul><li><b>The website does not load</b> (especially at weekends, because of football blocking): use the backup address <a href="https://skyllion666-coder.github.io/tresmiles/">skyllion666-coder.github.io/tresmiles</a>.</li><li><b>An area will not download</b>: the card offers the .zip file to download and open yourself.</li><li><b>It is slow</b>: turn off layers you do not use and close other tabs or apps.</li><li><b>GPS or compass fail</b>: go into the open, keep the phone away from metal and move it in a figure of eight.</li></ul><p class="ay-nota">This website does not replace a guidebook, a conditions report or mountain experience.</p>`));
    return s.join('');
  }

  // ——— pestañas ———
  function organiza() {
    const grupos = { proyecto: [], fuentes: [], fotos: [] };
    let dest = 'proyecto', plegar = false, actual = null;
    for (const n of [...cuerpo.children]) {
      if (n.tagName === 'H3') {
        const k = n.textContent.trim(); dest = k in REPARTO ? REPARTO[k] : 'fuentes';
        plegar = dest === 'fuentes' || dest === 'fotos';
        if (dest && plegar) { actual = document.createElement('details'); actual.className = 'ab-pl'; actual.innerHTML = `<summary>${n.innerHTML}</summary>`; grupos[dest].push(actual); n.remove(); continue; }
        actual = null;
      }
      if (!dest) { n.remove(); continue; }
      if (plegar && actual) actual.appendChild(n); else grupos[dest].push(n);
    }
    cuerpo.textContent = '';
    const nav = document.createElement('div'); nav.className = 'ab-tabs'; nav.setAttribute('role', 'tablist');
    nav.innerHTML = PESTANAS.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="false">${n}</button>`).join('');
    cuerpo.appendChild(nav);
    for (const [k] of PESTANAS) {
      const p = document.createElement('section'); p.className = 'ab-panel'; p.dataset.tab = k; p.setAttribute('role', 'tabpanel'); p.hidden = true;
      if (k === 'uso') p.innerHTML = htmlUso();
      else {
        if (k === 'fotos') p.insertAdjacentHTML('beforeend', `<input type="search" class="ab-buscar" placeholder="${L('Buscar una cumbre o un autor…', 'Search for a summit or an author…')}" aria-label="${L('Buscar en los créditos', 'Search the credits')}"><p class="ab-nada" hidden>${L('Nada con ese nombre.', 'Nothing with that name.')}</p>`);
        if (k === 'fuentes') p.insertAdjacentHTML('beforeend', `<p class="ay-nota">${L('De dónde sale cada cosa del mapa. Toca un apartado para abrirlo.', 'Where everything on the map comes from. Tap a section to open it.')}</p>`);
        grupos[k].forEach((n) => p.appendChild(n));
      }
      cuerpo.appendChild(p);
    }
  }
  const sinTilde = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function pestana(k) {
    cuerpo.querySelectorAll('.ab-tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === k));
    cuerpo.querySelectorAll('.ab-panel').forEach((p) => { p.hidden = p.dataset.tab !== k; });
    cuerpo.scrollTop = 0;
    if (k !== 'uso') store.set(PEST, k);
  }
  cuerpo.addEventListener('click', (e) => {
    const tb = e.target.closest('.ab-tabs [role=tab]'); if (tb) { pestana(tb.dataset.tab); return; }
    const ir = e.target.closest('[data-ir]'); if (ir) { e.preventDefault(); irA(ir.dataset.ir); return; }
    const pr = e.target.closest('[data-probar]'); if (pr) {
      const b = document.getElementById(pr.dataset.probar); dialogo.close();
      if (b && b.getAttribute('aria-pressed') !== 'true') b.click();
      if (b) { b.classList.add('show-tip'); setTimeout(() => b.classList.remove('show-tip'), 2000); }
    }
  });
  cuerpo.addEventListener('input', (e) => {
    if (!e.target.matches('.ab-buscar')) return;
    const q = sinTilde(e.target.value.trim()), panel = e.target.closest('.ab-panel'); let n = 0;
    panel.querySelectorAll('li').forEach((li) => { const ok = !q || sinTilde(li.textContent).includes(q); li.hidden = !ok; if (ok) n++; });
    panel.querySelectorAll('details').forEach((d) => { const hay = [...d.querySelectorAll('li')].some((li) => !li.hidden); d.hidden = !!q && !hay; if (q) d.open = hay; });
    panel.querySelector('.ab-nada').hidden = !q || n > 0;
  });
  function irA(sec) { const h = cuerpo.querySelector(`#ay-${sec}`); if (h) cuerpo.scrollTop = h.offsetTop - (cuerpo.querySelector('.ab-tabs')?.offsetHeight ?? 0) - 8; }

  function abrir(k, sec) {
    rellenar(); organiza();
    pestana(k ?? store.get(PEST) ?? 'proyecto');
    if (!dialogo.open) dialogo.showModal();
    if (sec) requestAnimationFrame(() => irA(sec));
  }

  // ——— tarjetas de «la primera vez» ———
  let tarjeta = null;
  function primeraVez(k) {
    const a = AVISOS[k]; if (!a || store.get(`tresmiles-visto-${k}`)) return;
    store.set(`tresmiles-visto-${k}`, '1');
    tarjeta?.remove();
    const el = tarjeta = document.createElement('div'); el.className = 'ay-aviso'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', a.t);
    el.innerHTML = `<b class="ay-av-t">${a.t}</b>${a.h}<div class="ay-av-bs"><button type="button" class="ay-mas">${L('Más ayuda', 'More help')}</button><button type="button" class="ay-ok">${L('Entendido', 'Got it')}</button></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-on'));
    const fuera = () => { el.classList.remove('is-on'); setTimeout(() => el.remove(), 300); if (tarjeta === el) tarjeta = null; };
    el.querySelector('.ay-ok').addEventListener('click', fuera);
    el.querySelector('.ay-mas').addEventListener('click', () => { fuera(); abrir('uso', k === 'ubicacion' ? 'app' : 'lineas'); });
  }

  // ——— bienvenida de la app (la primera vez) ———
  function bienvenida() {
    if (!EN_APP || store.get('tresmiles-bienvenida-app')) return Promise.resolve();
    const pasos = [
      [L('Descarga tu zona antes de salir', 'Download your area before you go'), L('Con wifi, en casa: abre la cumbre y pulsa «Descargar la zona en alta calidad», o entra en «Mis zonas» (en «Acerca de»). Así en la montaña tienes la foto aérea y el relieve fino sin cobertura.', 'On wifi, at home: open the summit and tap “Download the area in high quality”, or go to “My areas” (under “About”). That way you have the aerial photo and fine terrain in the mountains without coverage.'), 'M12 3v12M7 10l5 5 5-5M4 20h16'],
      [L('Dónde estoy', 'Where am I'), L('El botón de la diana pone tu posición con el GPS, también sin cobertura. Tócalo otra vez y el mapa gira contigo.', 'The target button shows your GPS position, also without coverage. Tap it again and the map turns with you.'), 'M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13zM12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22'],
      [L('SOS y luz que queda', 'SOS and daylight left'), L('El botón SOS envía tu posición por WhatsApp o SMS, llama al 112 y te dice si llegas abajo antes de que anochezca. Y si te pierdes con la app, el botón «?» de arriba lo explica todo.', 'The SOS button sends your position by WhatsApp or SMS, calls 112 and tells you whether you will get down before dark. And if you get lost in the app, the “?” button at the top explains everything.'), 'M12 3 2.5 20h19zM12 10v4.5M12 17.2v.3'],
    ];
    return new Promise((res) => {
      const el = document.createElement('div'); el.className = 'ay-bienv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
      let i = 0;
      const pinta = () => {
        const [tt, tx, d] = pasos[i];
        el.innerHTML = `<div class="ay-bv-c"><svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><h2>${tt}</h2><p>${tx}</p>
          <div class="ay-bv-puntos">${pasos.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
          <div class="ay-av-bs"><button type="button" class="ay-saltar">${L('Saltar', 'Skip')}</button><button type="button" class="ay-ok">${i < pasos.length - 1 ? L('Siguiente', 'Next') : L('Empezar', 'Start')}</button></div></div>`;
      };
      const fin = () => { store.set('tresmiles-bienvenida-app', '1'); el.remove(); res(); };
      el.addEventListener('click', (e) => { if (e.target.closest('.ay-saltar')) fin(); else if (e.target.closest('.ay-ok')) { if (++i < pasos.length) pinta(); else fin(); } });
      pinta(); document.body.appendChild(el);
    });
  }

  return { abrir, primeraVez, bienvenida, L };
}

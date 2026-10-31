// Idiomas de la web: español (el original) e inglés. El texto en español es la clave: t('Acerca de') → «About» en inglés.
// Con variables: t('Panorama desde {n}', { n: nombre }). La página estática se traduce al arrancar recorriendo sus textos y atributos.
// El idioma: ?lang=es|en, si no el elegido con el botón ES | EN (localStorage), si no el del navegador (español → es; cualquier otro → en).
const guardado = (() => { try { return localStorage.getItem('tresmiles-lang'); } catch { return null; } })();
const pedido = (/[?&]lang=(es|en)\b/.exec(location.search) || [])[1];
export const LANG = pedido || guardado || (/^es\b/i.test(navigator.language || 'es') ? 'es' : 'en');
export const EN_INGLES = LANG === 'en';
document.documentElement.lang = LANG;

export function cambiaIdioma(l) { try { localStorage.setItem('tresmiles-lang', l); } catch { /* sin almacenamiento */ } const u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.href); }

const EN = {
  // — cabecera, portada e introducción —
  'Acerca de': 'About', 'Tresmiles, volver al inicio': 'Tresmiles, back to the start', 'Pirineo aragonés': 'Aragonese Pyrenees',
  'En el corazón del Pirineo aragonés': 'In the heart of the Aragonese Pyrenees', 'Los tresmiles': 'The 3,000ers',
  'Una vista de pájaro a las cumbres que superan los 3.000 metros. Elige a dónde quieres ir.': 'A bird’s-eye view of the summits above 3,000 metres. Choose where you want to go.',
  'Elegir cumbre': 'Choose a summit', 'Explorar todo el mapa': 'Explore the whole map', 'Creado por SKYLLION (FRANK)': 'Created by SKYLLION (FRANK)',
  'Descargar la app para Android': 'Download the Android app', 'sin conexión · 385 MB': 'works offline · 385 MB',
  'Ver introducción': 'Watch the intro', 'Saltar introducción': 'Skip intro', 'Introducción': 'Intro', 'Toca para activar el sonido': 'Tap to turn the sound on',
  'del Pirineo aragonés': 'of the Aragonese Pyrenees', 'Mapa 3D del Pirineo aragonés': '3D map of the Aragonese Pyrenees',
  'Esta página necesita JavaScript y WebGL para mostrar el mapa 3D.': 'This page needs JavaScript and WebGL to show the 3D map.',
  'Cargando el relieve…': 'Loading the terrain…', 'Preparando el mapa…': 'Preparing the map…',
  'Está tardando más de lo normal. Sigue en marcha: comprueba tu conexión.': 'This is taking longer than usual. It is still going: check your connection.',
  'No se ha podido iniciar el mapa 3D. Comprueba que tu navegador admite WebGL.': 'The 3D map could not start. Check that your browser supports WebGL.',
  // — ayudas de manejo —
  'Arrastra': 'Drag', 'para moverte': 'to move around', 'Rueda': 'Scroll', 'para acercarte': 'to zoom in',
  'Mantén pulsado el botón izquierdo y arrastra · Botón derecho: girar': 'Hold the left button and drag · Right button: rotate',
  'Desliza con un dedo · Dos dedos: girar y acercar': 'Swipe with one finger · Two fingers: rotate and zoom',
  'Gira la rueda del ratón sobre el relieve': 'Turn the mouse wheel over the terrain', 'Pellizca para acercarte': 'Pinch to zoom in',
  // — botones del mapa —
  'Navegación del mapa': 'Map navigation', 'Vista general': 'Overview', 'Cumbres': 'Summits', 'Explorar las cumbres': 'Explore the summits', 'Explorar el {n}': 'Explore {n}',
  'Filtros': 'Filters', 'Volar por la ruta': 'Fly along the route', 'Detener': 'Stop', 'Activar el sonido ambiente': 'Turn on the ambient sound',
  'Silenciar el sonido y los efectos': 'Mute the sound and effects', 'Activar el sonido y los efectos': 'Turn on the sound and effects',
  'Cambiar la luz: {n}': 'Change the light: {n}', 'Cambiar la luz: mañana': 'Change the light: morning', 'Mañana': 'Morning', 'Mediodía': 'Midday', 'Tarde': 'Evening', 'Hora real': 'Real time',
  'Brújula: pulsa para orientar al norte': 'Compass: tap to face north',
  'Girar la vista a la izquierda (mantén pulsado para girar sin parar)': 'Rotate the view left (hold to keep rotating)',
  'Girar la vista a la derecha (mantén pulsado para girar sin parar)': 'Rotate the view right (hold to keep rotating)',
  'Dónde estoy': 'Where am I', 'Qué montañas veo desde aquí': 'Which mountains can I see from here', 'HD': 'HD',
  'Calidad alta: desactivada': 'High quality: off', 'Calidad alta: {n}': 'High quality: {n}', 'activada': 'on', 'desactivada': 'off',
  '¿Volver a la calidad normal? (gasta menos batería; la app se recarga)': 'Back to normal quality? (uses less battery; the app reloads)',
  '¿Activar la calidad alta? Se ve como en el ordenador, pero el móvil trabaja más y gasta más batería. La app se recarga.': 'Turn on high quality? It looks like on a computer, but the phone works harder and uses more battery. The app reloads.',
  'Cargando la zona…': 'Loading the area…', '{n} visitas': '{n} visits', 'Visitas a la web (GoatCounter, sin cookies)': 'Visits to the website (GoatCounter, no cookies)',
  // — filtros y «mis tresmiles» —
  'Altitud mínima:': 'Minimum altitude:', 'Macizo': 'Massif', 'Dificultad': 'Difficulty', 'Quitar filtros': 'Clear filters', 'Pendientes': 'To do', 'Subidos': 'Climbed',
  'Mis tresmiles ·': 'My 3,000ers ·', 'Se guardan en este móvil.': 'They are saved on this device.', 'Guardar copia': 'Save a backup', 'Recuperar copia': 'Restore a backup',
  '{n} tresmiles importados': '{n} 3,000ers imported', 'Ese archivo no es una copia de tus tresmiles': 'That file is not a backup of your 3,000ers',
  'He subido esta cumbre': 'I have climbed this summit', 'He subido este tresmil': 'I have climbed this 3,000er', 'Subido · banderín puesto': 'Climbed · flag planted',
  '{n} de {t} tresmiles subidos': '{n} of {t} 3,000ers climbed', '{n} de {t} cumbres de menos de 3.000 m subidas': '{n} of {t} summits under 3,000 m climbed',
  // — ficha —
  'Ficha': 'Info', 'Ficha de la cumbre': 'Summit info', 'Abrir la ficha': 'Open the info', 'Cerrar': 'Close', 'Cerrar la ficha': 'Close the info',
  'Recoger la ficha para ver el recorrido': 'Fold the info to see the route', '← Anterior': '← Previous', 'Siguiente →': 'Next →',
  'Próximamente': 'Coming soon', '{n}: próximamente': '{n}: coming soon', '{n}, {a} metros. Abrir ficha': '{n}, {a} metres. Open the info', '{n}, {a} metros. Próximamente': '{n}, {a} metres. Coming soon',
  'altitud sin datos': 'no altitude data', 'Frontera Aragón–Francia': 'Aragon–France border', 'Clase': 'Type', 'Cima discutida': 'Disputed summit', 'Cima secundaria': 'Secondary summit',
  'Pueblo más cercano': 'Nearest village', 'Valle o pueblo de acceso': 'Access valley or village', 'Mejor época': 'Best season', 'Otras cifras': 'Other figures',
  'Ver la cima de cerca': 'See the summit up close', 'Ruta normal': 'Normal route', 'En una ruta de Wikiloc': 'On a Wikiloc route', 'Información': 'Information',
  'Mostrar la ruta en el mapa': 'Show the route on the map', 'Ocultar la ruta del mapa': 'Hide the route from the map', 'Inicio del recorrido': 'Start of the route',
  'Paso de Mahoma': 'Mahoma Pass', 'Dominio público': 'Public domain',
  'Altitud': 'Altitude', 'Desnivel': 'Elevation gain', 'Acceso': 'Access', 'Grado': 'Grade', 'Época': 'Season',
  // dificultades, tipos de hito y macizos (vienen de los datos)
  'Moderada': 'Moderate', 'Alta': 'High', 'Muy alta': 'Very high',
  // — refugios y tiempo —
  'Refugio guardado': 'Staffed hut', 'Refugio libre': 'Unstaffed hut', 'Guardado': 'Staffed', 'Libre': 'Unstaffed', '{n} plazas': '{n} beds', 'Web del refugio': 'Hut website', 'web': 'website',
  'a {d} km en línea recta': '{d} km in a straight line', 'Refugios cercanos': 'Nearby huts', 'Refugios de': 'Huts from',
  'Los guardados suelen pedir reserva: confirma fechas y plazas con el refugio antes de ir.': 'Staffed huts usually require booking: confirm dates and beds with the hut before you go.',
  'El tiempo en la cumbre': 'Weather at the summit', 'Cargando la previsión…': 'Loading the forecast…', 'No se ha podido cargar la previsión (hace falta conexión).': 'The forecast could not be loaded (a connection is needed).',
  'Hoy': 'Today', 'isocero': 'freezing lvl', 'sensación {n} °C': 'feels like {n} °C', 'Viento del {d}, {v} km/h, rachas de {r}': 'Wind from the {d}, {v} km/h, gusts of {r}', 'Ver este tiempo en el mapa': 'Show this weather on the map', 'En el mapa: {l}.': 'On the map: {l}.', 'En el mapa, {d}: {l}.': 'On the map, {d}: {l}.', 'Ver ese día en el mapa': 'Show that day on the map', 'Parecidas': 'Similar', 'Cómo llegar al inicio': 'Getting to the start', 'La ruta empieza en el {n} ({a} m), al que se llega a pie.': 'The route starts at {n} ({a} m), reached on foot.', 'La ruta empieza a {a} m de altitud.': 'The route starts at {a} m.', 'Cómo llegar en coche': 'Directions by car', 'Ver en OpenStreetMap': 'View on OpenStreetMap', 'En verano, la pista de los Llanos del Hospital a La Besurta se cierra a los coches y hay autobús desde Benasque y los Llanos del Hospital. Consulta fechas y horarios en el Ayuntamiento de Benasque.': 'In summer the track from Llanos del Hospital to La Besurta is closed to cars and there is a bus from Benasque and Llanos del Hospital. Check dates and times with Benasque town council.', 'En Semana Santa, verano y puentes, la carretera a la Pradera de Ordesa se cierra a los coches y hay autobús desde Torla. Consulta fechas y horarios en el Parque Nacional de Ordesa y Monte Perdido.': 'At Easter, in summer and on long weekends the road to the Pradera de Ordesa is closed to cars and there is a bus from Torla. Check dates and times with the Ordesa y Monte Perdido National Park.', 'subida': 'ascent', 'bajada': 'descent', 'en total, sin paradas': 'total, without stops', 'Tiempos estimados con el método MIDE (4 km/h en llano, 400 m/h de subida y 600 m/h de bajada). Varían mucho con la forma física, la nieve y el tiempo.': 'Times estimated with the MIDE method (4 km/h on the flat, 400 m/h ascending, 600 m/h descending). They vary a lot with fitness, snow and weather.', 'Cómo llegar': 'Getting there', 'Cómo llegar en coche a {l}': 'Directions by car to {l}', 'Peligro de aludes': 'Avalanche danger', 'Con nieve, consulta antes de salir el boletín de peligro de aludes de AEMET para el Pirineo navarro y aragonés, que se publica cada día en temporada.': 'With snow, check the AEMET avalanche bulletin for the Navarre and Aragonese Pyrenees before setting out; it is published daily in season.', 'Fuera de temporada (AEMET publica el boletín de diciembre a mayo). Si hay nieve, el peligro de aludes existe igualmente.': 'Out of season (AEMET publishes the bulletin from December to May). If there is snow, avalanche danger still exists.', 'Boletín de peligro de aludes (AEMET)': 'Avalanche bulletin (AEMET)', 'Escala europea de peligro de aludes': 'European avalanche danger scale', '1 débil, 2 limitado, 3 notable, 4 fuerte, 5 muy fuerte.': '1 low, 2 moderate, 3 considerable, 4 high, 5 very high.', 'tormenta con rayos': 'thunderstorm with lightning', 'lluvia': 'rain', 'nieve': 'snow', 'lluvia débil': 'light rain', 'aguanieve': 'sleet', 'lluvia fuerte': 'heavy rain', 'nieve débil': 'light snow', 'nevada fuerte': 'heavy snowfall', 'niebla en la cima': 'fog on the summit', 'sol': 'sunshine', 'algunas nubes': 'some clouds', 'cielo cubierto': 'overcast sky', 'viento del {d}': 'wind from the {d}', 'Rachas máximas': 'Maximum gusts',
  'Cota de nieve aproximada: isocero a mediodía': 'Approximate snow line: freezing level at midday', 'Previsión de': 'Forecast from',
  'para el punto de la cumbre, con la temperatura calculada a {a} m. Viento en km/h; la «isocero» es la altura a la que el aire está a 0 °C a mediodía. Es orientativa: en montaña el tiempo cambia rápido; consulta también la predicción de montaña de AEMET.': 'for the summit point, with the temperature calculated at {a} m. Wind in km/h; the “freezing level” is the height at which the air is at 0 °C at midday. It is a guide only: mountain weather changes fast; also check the AEMET mountain forecast.',
  'Despejado': 'Clear', 'Casi despejado': 'Mostly clear', 'Nubes y claros': 'Partly cloudy', 'Cubierto': 'Overcast', 'Niebla': 'Fog', 'Niebla con escarcha': 'Freezing fog', 'Llovizna': 'Drizzle', 'Llovizna intensa': 'Heavy drizzle',
  'Llovizna helada': 'Freezing drizzle', 'Lluvia débil': 'Light rain', 'Lluvia': 'Rain', 'Lluvia fuerte': 'Heavy rain', 'Lluvia helada': 'Freezing rain', 'Nieve débil': 'Light snow', 'Nieve': 'Snow', 'Nieve fuerte': 'Heavy snow',
  'Granizo menudo': 'Snow grains', 'Chubascos': 'Showers', 'Chubascos fuertes': 'Heavy showers', 'Chubascos de nieve': 'Snow showers', 'Chubascos de nieve fuertes': 'Heavy snow showers', 'Tormenta': 'Thunderstorm', 'Tormenta con granizo': 'Thunderstorm with hail',
  'Refugio': 'Hut', 'Paso': 'Pass', 'Vivac': 'Bivouac', 'Cima': 'Summit', 'Ibón': 'Tarn', 'Barranco': 'Gorge', 'Lugar': 'Place',
  'Valle de Tena · Balaitús–Infiernos': 'Tena Valley · Balaitús–Infiernos', 'Valle de Chistau': 'Chistau Valley', 'Monte Perdido–Taillón': 'Monte Perdido–Taillón',
  'Foto:': 'Photo:', 'vía': 'via', 'su ficha de Wikiloc': 'their Wikiloc page', ' y ': ' and ', ' · km {k} del recorrido': ' · km {k} of the route',
  'Zona': 'Area', 'Situación': 'Location', 'Aragón': 'Aragon', 'Curiosidad': 'Did you know', 'Ver el panorama desde la cima': 'See the panorama from the summit',
  'Ficha sencilla.': 'Basic info.', 'Información orientativa.': 'For guidance only.',
  'Nombre, altitud y posición proceden de OpenStreetMap y pueden variar según la fuente. Antes de salir, consulta una guía o un mapa actual y la previsión del tiempo: la montaña implica riesgo.': 'Name, altitude and position come from OpenStreetMap and may vary by source. Before heading out, check an up-to-date guide or map and the weather forecast: mountains involve risk.',
  'Las cifras proceden de guías y fichas de ruta y varían según la fuente. Antes de salir, contrasta con una guía actual, el estado de la ruta y la previsión del tiempo: la alta montaña implica riesgo.': 'The figures come from guidebooks and route descriptions and vary by source. Before heading out, check an up-to-date guide, the route conditions and the weather forecast: high mountains involve risk.',
  'Texto de Wikipedia en {l}': 'Text from the {l} Wikipedia', 'Texto traducido al inglés de Wikipedia en {l}': 'Text translated into English from the {l} Wikipedia', 'Texto traducido al castellano de Wikipedia en {l}': 'Text translated into Spanish from the {l} Wikipedia', 'aragonés': 'Aragonese', 'catalán': 'Catalan', 'castellano': 'Spanish',
  'artículo': 'article', 'licencia CC BY-SA 4.0. Sus autores están en el historial del artículo.': 'CC BY-SA 4.0 licence. Its authors are listed in the article history.',
  'Recorrido en el mapa': 'Route on the map', 'distancia': 'distance', 'desnivel acumulado': 'total ascent', 'punto más alto': 'highest point', 'Perfil de altura': 'Elevation profile',
  'Ver el recorrido a pantalla completa': 'See the route full screen', 'Ver desde la antecima': 'View from the fore-summit', 'Ver desde un lateral': 'View from the side',
  'Vista opcional de detalle de la arista entre la antecima y la cumbre. Relieve: MDT05 del IGN; los bloques de granito son una aproximación visual.': 'Optional close-up of the ridge between the fore-summit and the summit. Terrain: IGN MDT05; the granite blocks are a visual approximation.',
  'Descargar el GPX ↓': 'Download the GPX ↓', 'Recorrido trazado por los senderos de': 'Route traced on the paths of',
  '(licencia ODbL), con altitudes del modelo Copernicus GLO-30. Es orientativo y no sustituye a un GPS ni a un mapa: comprueba el estado de los caminos antes de salir.': '(ODbL licence), with altitudes from the Copernicus GLO-30 model. It is for guidance only and does not replace a GPS or a map: check the state of the paths before you set out.',
  'Tozal de Guara desde Santa Cilia de Panzano (S-5)': 'Tozal de Guara from Santa Cilia de Panzano (S-5)',
  'Descargar el GPX y ver la ruta completa en Wikiloc ↗': 'Download the GPX and see the full route on Wikiloc ↗',
  'Vista previa del recorrido sobre el mapa. El track original, para descargar, está en la ficha de Wikiloc. El trazado está simplificado y colocado sobre un modelo de relieve: es orientativo y no sustituye a un GPS ni a un mapa.': 'Preview of the route on the map. The original track, to download, is on its Wikiloc page. The line is simplified and laid over a terrain model: it is for guidance only and does not replace a GPS or a map.',
  '{n} de {t} cumbres': '{n} of {t} summits',
  // — selector de cumbres —
  'Cerrar el selector': 'Close the selector', 'Qué cumbres ver': 'Which summits to show', 'Menos de 3.000': 'Below 3,000', 'Más altas': 'Highest',
  'Por dónde pasa la gente': 'Where people go', 'Muy poco frecuentado: una o dos trazas, puede ser alguien que se perdió': 'Very rarely used: one or two traces, it may be someone who got lost', 'Poco frecuentado': 'Rarely used', 'Otras subidas': 'Other ways up', 'Cabaña o abrigo': 'Hut or shelter', 'Por dónde sube la gente, según las trazas GPS públicas de OpenStreetMap. Toca una para verla en el mapa.': 'Where people go up, according to the public GPS traces on OpenStreetMap. Tap one to see it on the map.', 'Desde {d}': 'From {d}', 'por {l}': 'via {l}', 'de subida': 'up', 'Muy poco frecuentada': 'Very rarely used', 'Poco frecuentada': 'Rarely used', 'Frecuentada': 'Used', 'Muy frecuentada': 'Very busy', 'como la ruta de ejemplo': 'like the example route', 'Pasa por hielo o nieve: crampones y piolet': 'Crosses ice or snow: crampons and ice axe', 'Tramo muy empinado (más de 30°): puede haber trepada': 'Very steep section (over 30°): there may be scrambling', 'Calculadas automáticamente: son orientativas, no reseñas. Una variante poco frecuentada puede ser una bajada de emergencia o de alguien que se perdió. Antes de ir, consulta una guía.': 'Calculated automatically: for guidance only, not route descriptions. A rarely used variant may be an emergency descent or someone who got lost. Check a guidebook before you go.', 'Frecuentado': 'Used', 'Paso muy frecuentado': 'Very busy route', '{t} trazas completas y {p} puntos sueltos (GPS de OpenStreetMap)': '{t} full traces and {p} loose points (OpenStreetMap GPS)', 'carretera': 'road', 'pista': 'dirt track', 'discutida': 'disputed', 'Cimas secundarias': 'Secondary summits', 'Las más cercanas al centro del mapa': 'Closest to the centre of the map', 'Las más altas': 'The highest',
  'Ninguna cumbre con estos filtros.': 'No summits with these filters.', 'Todavía no has marcado ninguna cumbre como subida.': 'You have not marked any summit as climbed yet.',
  'Ninguna cumbre coincide con «{q}».': 'No summit matches “{q}”.', ' Prueba a quitar los filtros.': ' Try clearing the filters.',
  'Con filtros: {n} de {t} cumbres': 'Filtered: {n} of {t} summits', 'también «{n}»': 'also “{n}”',
  'Todas': 'All', 'Mis subidos': 'My climbed', 'Cercanas': 'Nearby', 'Atajos': 'Shortcuts', 'Buscar entre 1 cumbre': 'Search 1 summit', 'Buscar entre las {n} cumbres': 'Search the {n} summits',
  'No hay cumbres que mostrar con la capa y los filtros actuales.': 'There are no summits to show with the current layer and filters.',
  'Perfil de altura de la ruta, de {a} a {b} metros en {k} kilómetros. Desliza el dedo para ver un punto concreto en el mapa.': 'Elevation profile of the route, from {a} to {b} metres over {k} kilometres. Slide your finger to see a point on the map.',
  // — panorama —
  'Cerrar el panorama': 'Close the panorama', 'Panorama': 'Panorama', 'Lista': 'List', 'Brújula': 'Compass', 'Cámara': 'Camera', 'Ver ficha': 'Open info',
  'Por rumbo': 'By bearing', 'Por distancia': 'By distance', 'Por altura': 'By height', 'Ordenar': 'Sort',
  'Panorama desde {n}': 'Panorama from {n}', 'tu posición': 'your position', 'Calculando lo que se ve desde aquí…': 'Working out what can be seen from here…', 'Calculando lo que se ve desde la cima…': 'Working out what can be seen from the summit…',
  'Desde aquí no se ve ninguna cumbre de la lista.': 'No summit on the list can be seen from here.',
  'Sin cumbre con nombre': 'No named summit', 'Rumbo {n}': 'Bearing {n}', 'Brújula no disponible': 'Compass not available',
  'No has dado permiso para usar los sensores del móvil.': 'You have not given permission to use the phone sensors.',
  'Buscando la brújula…': 'Looking for the compass…', 'Sujeta el móvil en vertical, mirando al horizonte.': 'Hold the phone upright, facing the horizon.',
  'Este móvil no da la brújula': 'This phone has no compass', 'Prueba en un móvil con sensores, o desliza con el dedo.': 'Try a phone with sensors, or swipe with your finger.',
  '{v} cumbres con nombre a la vista.': '{v} named summits in view.',
  '{v} cumbres con nombre a la vista: en el panorama van las {n} principales; todas están en la lista.': '{v} named summits in view: the panorama shows the {n} main ones; all of them are in the list.',
  'Orientativo: calculado con el relieve de 120 m, sin nubes ni bosque. Alturas exageradas ×{x} para que se lean. Las cumbres lejanas pueden faltar o sobrar. La brújula del móvil puede errar 10-20° si no está calibrada.': 'For guidance only: worked out with a 120 m terrain model, without clouds or forest. Heights exaggerated ×{x} so they can be read. Distant summits may be missing or extra. The phone compass can be off by 10–20° if it is not calibrated.',
  // — cámara —
  'Montañas por la cámara': 'Mountains through the camera', 'Cerrar la cámara': 'Close the camera',
  'Sujeta el móvil en vertical y apunta a las montañas. Si la línea no casa, arrástrala con el dedo; pellizca para el zoom.': 'Hold the phone upright and point it at the mountains. If the line does not match, drag it with your finger; pinch to zoom.',
  'No se puede abrir la cámara (¿falta el permiso?). La silueta y los nombres siguen funcionando con la brújula.': 'The camera cannot be opened (missing permission?). The skyline and names still work with the compass.',
  'Este móvil no da la brújula: no se puede saber hacia dónde apuntas.': 'This phone has no compass: it cannot tell where you are pointing.',
  // — dónde estoy —
  'Seguir mi posición con la brújula': 'Follow my position with the compass', 'Girar el mapa con el móvil': 'Turn the map with the phone', 'Volver a seguir mi posición': 'Follow my position again', 'Te sigo otra vez, con el norte arriba.': 'Following you again, with north up.', 'Te sigo otra vez: el mapa gira con el móvil.': 'Following you again: the map turns with the phone.', 'El mapa gira contigo: lo que tienes delante en el móvil es lo que tienes delante en el monte.': 'The map turns with you: what is ahead on the phone is what is ahead on the mountain.', 'Norte arriba': 'North up', 'Apagar la ubicación': 'Turn off location',
  'Sin permiso de ubicación: actívalo en los ajustes de la app.': 'No location permission: turn it on in the app settings.',
  'El GPS tarda en responder: sal a cielo abierto y vuelve a probar.': 'The GPS is slow to respond: go out into the open and try again.',
  'No se ha podido saber dónde estás.': 'Your position could not be found.', 'Sin permiso para la brújula.': 'No permission for the compass.',
  'Este móvil no da la ubicación.': 'This phone does not provide a location.', 'Buscando tu posición…': 'Looking for your position…',
  'Aún no sé dónde estás: espera a que el GPS te encuentre.': 'I do not know where you are yet: wait for the GPS to find you.',
  'Siguiendo tu posición: la vista gira con el móvil.': 'Following your position: the view turns with the phone.',
  'Has movido el mapa: ya no te sigo (toca el botón para volver).': 'You moved the map: no longer following you (tap the button to go back).',
  'Estás fuera del mapa, a {d} km en línea recta {p}.': 'You are outside the map, {d} km in a straight line from {p}.',
  'Estás fuera del mapa, a {d} km de su borde.': 'You are outside the map, {d} km from its edge.',
  ' El tresmil más cercano es {n}, a {d} km en línea recta.': ' The nearest 3,000er is {n}, {d} km away in a straight line.',
  'Estás aquí (precisión ±{m} m{alt}){p}.': 'You are here (accuracy ±{m} m{alt}){p}.', ' · altitud GPS {a} m': ' · GPS altitude {a} m', ' · a {d} km {p}': ' · {d} km from {p}',
};

export function t(es, v) {
  let r = EN_INGLES ? (EN[es] ?? es) : es;
  if (v) r = r.replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? m));
  return r;
}

function traduceTexto(n) { const s = n.nodeValue.trim(); if (s && EN[s] && EN[s] !== s) n.nodeValue = n.nodeValue.replace(s, EN[s]); }

// la página estática: textos y atributos que estén en el diccionario
export function traducePagina(raiz = document.body) {
  if (!EN_INGLES) return;
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) traduceTexto(n);
  for (const el of [raiz, ...raiz.querySelectorAll('[aria-label],[title],[placeholder],[alt]')]) if (el.getAttribute)
    for (const a of ['aria-label', 'title', 'placeholder', 'alt']) { const s = el.getAttribute(a); if (s && s in EN) el.setAttribute(a, EN[s]); }
}

// al cargar el módulo (antes que main.js): la página estática y el botón ES | EN de la cabecera; cine.js (no es módulo) usa window.tresmilesT
window.tresmilesT = t;
traducePagina();
// lo que la web pinta después (fichas, selector, panorama, avisos…): cada texto o atributo nuevo que esté tal cual en el diccionario se traduce al aparecer
if (EN_INGLES) new MutationObserver((ms) => {
  for (const m of ms) {
    if (m.type === 'childList') for (const n of m.addedNodes) { if (n.nodeType === 1) traducePagina(n); else if (n.nodeType === 3) traduceTexto(n); }
    else if (m.type === 'characterData') traduceTexto(m.target);
    else if (m.type === 'attributes') { const s = m.target.getAttribute(m.attributeName); if (s && EN[s] && EN[s] !== s) m.target.setAttribute(m.attributeName, EN[s]); }
  }
}).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder', 'alt'] });
{
  const cab = document.querySelector('header.top'), ab = document.querySelector('#btn-about');
  if (cab && ab) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'textbtn'; b.id = 'btn-idioma';
    b.textContent = EN_INGLES ? 'ES' : 'EN'; b.lang = EN_INGLES ? 'es' : 'en';
    b.setAttribute('aria-label', EN_INGLES ? 'Ver en español' : 'View in English');
    b.addEventListener('click', () => cambiaIdioma(EN_INGLES ? 'es' : 'en'));
    ab.before(b);
  }
}

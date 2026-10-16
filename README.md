# Tresmiles del Pirineo aragonés

Explorador 3D de las cumbres que superan los 3.000 m en el Pirineo aragonés, inspirado en la experiencia de
«mapa para explorar» (vuelo aéreo, puntos sobre el terreno y ficha lateral), con contenido, código y diseño propios.

**Estado actual:** primera cumbre completa, el **Balaitús**. Los datos de las otras once ya están preparados
(`data/peaks.json`) y se activan siguiendo los pasos de «Añadir más cumbres».

## Cómo verlo en local

Necesita un servidor HTTP (los módulos ES y `fetch()` no funcionan abriendo `index.html` con doble clic).

```bash
cd ~/tresmiles
tools/serve.sh            # o: python3 -m http.server 8765 --bind 127.0.0.1
# abre http://127.0.0.1:8765/
```

- Enlace directo a una cumbre (salta la introducción): `http://127.0.0.1:8765/#balaitus`
- Vista de desarrollo con todas las cumbres que caen dentro del terreno cargado: `?todos`
- Requiere un navegador con WebGL (Chrome, Firefox, Edge, Safari recientes).

## Cómo usarlo

| Acción | Ratón | Pantalla táctil |
|---|---|---|
| Moverse | arrastrar con el botón izquierdo | un dedo |
| Acercar / alejar | rueda | pellizcar |
| Girar | botón derecho | dos dedos |
| Abrir una ficha | pulsar el punto de la cumbre, o elegirla en el selector inferior | igual |
| Orientar al norte | pulsar la brújula | igual |
| Cambiar la luz | botón del sol (mañana, mediodía, tarde) | igual |

Con **dos o más** cumbres activas aparece además el botón de **filtros** (macizo, altitud mínima y dificultad).

## Cómo publicarlo

Es un sitio **estático** (sin compilación): se publica copiando la carpeta tal cual. Pesa unos 16 MB
(unos 35 MB con las doce cumbres).

- **GitHub Pages**: crea un repositorio, sube el contenido de `tresmiles/` (sin `analisis/` si no quieres publicarlo) y
  en *Settings → Pages* elige la rama `main` y la carpeta `/ (root)`. El archivo `.nojekyll` ya está incluido.
- **Netlify Drop** (`app.netlify.com/drop`) o **Cloudflare Pages**: arrastra la carpeta; no hay comando de compilación
  ni carpeta de salida (publica la raíz).
- **Cualquier hosting**: sube la carpeta por FTP/SFTP. Conviene activar la compresión gzip/brotli para `.bin`, `.js` y `.json`.

Al publicar, mantén visibles los créditos («Acerca de» ya los incluye): las fotos exigen atribución y la
imagen de satélite (CC BY 4.0) también.

## Estructura

```
index.html            página única
css/style.css         estilos (responsive; ficha lateral en escritorio, hoja inferior en móvil)
js/main.js            aplicación: cámara, vuelos, marcadores, ficha, filtros, selector, luz
js/terrain.js         relieve por bloques con nivel de detalle y texturas en dos resoluciones
js/geo.js             lon/lat → metros locales, altura bilineal, exageración vertical (×1,3)
js/sky.js             cielo y nubes
js/vida.js            agua de los ibones, aves planeando y sonido ambiente (Web Audio)
data/peaks.json       fichas de las 12 cumbres y lista de las activas ("activos")
data/fotos.json       autor, licencia y enlace de cada foto
data/lagos.json       contornos y nombres de ibones de la zona del Balaitús (OpenStreetMap, ODbL)
data/terrain/         alturas (u16, decímetros) y texturas Sentinel-2 (512 px y 1536 px por bloque)
img/peaks/            fotos (Wikimedia Commons)
vendor/three/         three.js (MIT) y OrbitControls
fonts/                Cormorant Garamond y Barlow (SIL OFL)
tools/                scripts de preparación de datos
analisis/             análisis de la web de referencia (capturas y resumen)
```

## Añadir más cumbres

1. En `data/peaks.json`, añade el `id` de la cumbre a `"activos"` (por ejemplo `"aneto"`).
2. Si cae fuera del terreno cargado, amplía el relieve. El actual cubre la zona occidental (bloques 0–3 × 0–2);
   para los doce picos basta `python3 tools/build_terrain.py 0 9 0 3` (necesita el proyecto `~/Tresmiles` con sus datos).
3. Para renovar las fotos y sus créditos: `python3 tools/fetch_photos.py`.

Cada cumbre tiene `vista` opcional (`theta`, `phi`, `r`) para ajustar el ángulo del vuelo de cámara.

## Datos, fuentes y licencias

- **Cumbres**: nombres y altitudes oficiales de la Orden VMV/914/2020 (BOA n.º 192) del Gobierno de Aragón,
  contrastados con tresmiles.es (CC0), Buyse (1993) y UIAA (1995). Inventario completo en `~/Tresmiles/data/inventario.json`.
- **Rutas, desniveles y dificultades**: resumen propio a partir de guías y fichas públicas. Son **cifras orientativas**:
  varían según la fuente y la época; contrástalas antes de salir a la montaña.
- **Relieve**: Copernicus DEM GLO-30, © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018,
  proporcionado por la Unión Europea y la ESA. Exageración vertical ×1,3 (el modelo es de superficie, por lo que
  las cumbres salen unas decenas de metros más bajas que las cifras oficiales).
- **Imagen**: Sentinel-2 cloudless 2016 de EOX IT Services GmbH, CC BY 4.0 (datos modificados de Copernicus Sentinel).
- **Fotos**: Wikimedia Commons, con autor y licencia en `data/fotos.json` y en la propia ficha. La foto de Tempestades
  es del macizo del Aneto (no existe una foto libre del pico) y así se indica.
- **Tipografías**: Cormorant Garamond y Barlow (SIL OFL 1.1). **Software**: three.js (MIT).

## Relación con la web de referencia

Se analizó la estructura, el diseño y la técnica de `explore.ownprimland.com` (ver `analisis/ANALISIS.md`) para
reproducir el tipo de experiencia: vuelo sobre el terreno, tutorial de arrastrar y acercar, puntos de interés,
ficha lateral y selector inferior. No se ha copiado ningún texto, imagen, código ni recurso de esa web; el terreno,
las fotos, los textos, la paleta y el código son propios o de licencia libre.

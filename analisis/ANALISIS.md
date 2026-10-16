# Análisis de la web de referencia (explore.ownprimland.com)

Capturado con Chrome + Playwright el 2026-10-16. Solo se analiza estructura, diseño y técnica;
no se copia ningún texto, imagen, código ni asset de la web original.

## Estructura / flujo
1. Portada: vuelo aéreo sobre el terreno 3D con nubes animadas; logo centrado, botón «Inquire» arriba a la derecha.
2. Intro: título (H1 en mayúsculas espaciadas), subtítulo en serif, botón «Explore the map» y «Start without audio».
3. Explorador: cámara cenital sobre el relieve. Tutorial «Drag to move» → «Scroll to zoom».
4. Puntos de interés (círculos blancos con punto central) sobre el mapa. Al pulsar uno, la cámara se acerca y se abre
   un panel lateral derecho (cabecera verde + foto + título serif + texto).
5. Controles: desplegable inferior «Explore Primland» (icono casa), brújula abajo a la izquierda, botón de sol (estación/luz) abajo a la derecha.
6. Móvil: pide girar a vertical; el explorador es a pantalla completa (la página no hace scroll, es un único canvas).

## Técnica
- Nuxt 3 (Vue) + Tailwind (clases utilitarias) + three.js (WebGL) con Draco (`draco_decoder.wasm`).
- Terreno: `elevation.glb` + texturas KTX2 (verano/otoño, versión desktop/mobile), árboles instanciados (treeA/B/C, helechos), nubes con textura de ruido.
- Audio ambiente `ambient.mp3` opcional. Analítica y cookies de terceros (no se replican).

## Diseño
- Tipografías: Centra (sans, UI en mayúsculas con tracking), Inferi (serif, títulos/cuerpo), Petit Serif. (Propietarias: usaremos alternativas libres.)
- Paleta: verde #456a4b, crema #fffbe7, beige #f7d9bb, marrón/acento #a8611a, crema claro #fffdf3, gris-verde #798d73.
- Estilo: contenido sobrio, mucho aire, textos pequeños en mayúsculas, paneles crema, cabecera verde.

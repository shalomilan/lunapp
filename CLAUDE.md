# lunapp — salida de la luna

## Objetivo

App personal para ir a un lugar (default: Rosedal de Palermo, CABA) y **ver la luna cuando sale**: saber cuándo, por dónde y qué días vale la pena ir. El acimut se usa con la brújula del celular o una analógica. Uso propio; después familia/allegados. Sin fines de lucro.

Inspiración: https://meteogram.es/luna/ (qué datos muestra y cómo). No se scrapea: las efemérides se calculan localmente.

Usuario objetivo de la v1: Ilan, que conoce la terminología (acimut, verdadero/magnético, topocéntrico). Simplificar para gente con menos contexto queda para después.

## Decisiones

- **Formato:** un único `index.html` autocontenido, mobile-first, en GitHub Pages (HTTPS). No es app nativa. PWA queda para después.
- **Idioma de la UI:** español.
- **Sin brújula en pantalla.** Se muestra el acimut en grados.
- **Acimut:** siempre verdadero y magnético. Aclarar en la UI que algunas apps de brújula marcan verdadero (iPhone con "Norte verdadero") y otras magnético.
- **Trayectoria de salida:** además de la hora y el acimut de salida, tabla con hora / acimut / altura cada 5–10 min durante la primera hora o más. Es la herramienta principal para un horizonte con árboles y edificios.
- **Horizonte:** la UI no tiene campo de horizonte; todo se calcula para horizonte plano (0°). El panel Ayuda lo aclara; la explicación para estimar grados está en un desplegable chico arriba de la tabla de cada día (puño ≈ 10°, tres dedos ≈ 5°, meñique ≈ 1°, ±30%; mejor con inclinómetro) y a leer en la tabla del día cuándo la altura supera el obstáculo. El núcleo sigue soportando `horizonDeg`.
- **Vista principal:** header "La luna hoy" con la luna ilustrada (no foto; mares rotados 180° en el hemisferio sur), el nombre de la fase, % iluminado y edad. Sin hora de salida ni estado actual en el header: eso vive en la tarjeta del día. Ayuda: botón ícono (i) en la barra del lugar; el panel se abre arriba del buscador. Debajo, una fila por día con símbolo de fase, salida (hora + dirección) y puesta; cada fila se despliega para ver el detalle. El fondo de cada fila sigue la fase: más claro (plateado) hacia la llena, más oscuro hacia la nueva; la llena tiene además un borde dorado y las etiquetas "llena"/"nueva". Nada de estrellas ni "recomendados" en la UI.
- **Puntos cardinales:** 8 direcciones (N, NE, E, SE, S, SO, O, NO). Sin la tercera letra.
- **Puntaje de días (solo en el núcleo, no se muestra):** puntaje continuo = fracción iluminada × gaussiana asimétrica de la altura del sol en la salida visible (pico 0°; σ 8° del lado diurno, 15° del nocturno). "Recomendado" si el puntaje es ≥ 0,6. Esto da 2–3 días por lunación, alrededor de la llena. Aparte, se marca como "no observable" cuando la fracción es < 3%, o < 35% con el sol arriba. Son heurísticas a calibrar en el campo y viven en `DEFAULT_CRITERIA` (`src/luna.js`).
- **Ubicación:** búsqueda con Photon (OpenStreetMap: encuentra parques y puntos de interés) y GPS (botón ícono junto al buscador), en el panel Lugar. Buscador y mapa siempre visibles (sin botones para ocultarlos); el mapa sirve para ajustar el punto exacto tocando o arrastrando. Una flecha dorada apunta a la próxima salida: su largo sigue al zoom (≈38% del mapa) con tope de 1000 m; la etiqueta va en una esquina. Capas sin API key: Satélite (Esri World Imagery + calles, default), Calles (Esri), Oscuro (Esri Dark Gray), OpenStreetMap. CARTO pide API key desde 2026: no usar. Se asume que siempre hay internet. Default: Obelisco, -34.60371, -58.38163. Orden de la página: header, barra del lugar con un (i) chico al costado (ayuda cerrada por default; abre arriba del buscador), buscador ("Lugar o dirección"), tarjeta "Próxima salida" desplegada sin tabla, mapa, tabla "Recorrido tras la salida" de ese día, y lista de días (cerradas; cada una con su tabla adentro). Favoritos: botón ícono (marcador) junto al buscador, alterna guardar/quitar.
- **Favoritos:** en `localStorage` del dispositivo. Nunca en el repo, que es público.
- **Rango:** siempre desde hoy hasta el fin del mes siguiente, sin filtros.
- **Declinación magnética:** se calcula con el WMM y no se muestra como campo; solo una nota que explica V y M.

## Datos por día (zona horaria del lugar)

- Salida y puesta de la luna.
- Acimut de salida (verdadero y magnético) + punto cardinal (p. ej. NE 59°).
- Trayectoria post-salida, columnas en este orden: +min, altura, V, M, hora.
- Hora y altura máxima (tránsito).
- Fracción iluminada del disco (%).
- Fase (nombre) y edad (días desde la luna nueva).
- Distancia topocéntrica (km) y tamaño angular.
- Cielo al salir la luna: puesta del sol, y si sale de día, en crepúsculo o de noche.
- Días sin salida o sin puesta: mostrarlo explícitamente.

## Diseño técnico

- **Cálculo:** `astronomy-engine` (JS, sin dependencias). Nada de scraping.
- **Declinación magnética:** WMM (p. ej. npm `geomagnetism`, verificar que traiga WMM2025) incrustado.
- **Bundle:** `npm run build` → esbuild a IIFE, todo inline en `index.html` (incluido Leaflet y su CSS). Fuente en `src/`.
- **Geocoding y zona horaria:** Photon (`photon.komoot.io`, sin key) para buscar; zona horaria de las coordenadas con Open-Meteo forecast (`timezone=auto`), con la del dispositivo como fallback.
- **Núcleo testeable:** una función `luna(lat, lon, tz, fecha, horizonte)` en un módulo separado de la UI, validada en Node antes de tocar la UI.
- **API de astronomy-engine a verificar contra la documentación** (todavía no probada): `SearchRiseSet`, `SearchAltitude` (centro del disco sin refracción, mientras que `SearchRiseSet` usa el borde superior con refracción: documentar la diferencia), `Illumination`, `MoonPhase`, `SearchMoonQuarter`/`NextMoonQuarter`, `GeoVector`, `ObserverVector` (distancia topocéntrica = |GeoVector − ObserverVector| × AU), `Horizon`, `Equator`.

## Trampas conocidas

- Medianoche local en una zona horaria arbitraria: usar `Intl` con la zona del lugar, no la del dispositivo.
- Días sin salida o sin puesta; un mismo día puede tener una sola salida o ninguna.
- Zonas con media hora (Mumbai) y cercanas a la línea de fecha (Auckland).
- 2025–2026 está cerca del lunasticio mayor: los acimuts de salida llegan a extremos (declinación lunar ≈ ±28,5°). Es un buen caso de prueba.

## Validación

- Script automático contra la API JSON de USNO. timeanddate solo como chequeo manual.
- Tolerancias: ±1 min en horarios, ±0,5° en acimut.
- Casos: Buenos Aires (principal), Quito, Ushuaia y Tromsø (incluir días sin salida a propósito), Auckland, Mumbai.
- Los eventos (v2) se chequean contra fechas conocidas: superlunas de 2026 (3 ene, 24 nov, 24 dic), eclipse lunar total del 3 mar 2026, eclipse solar total del 12 ago 2026, eclipse lunar total del 31 dic 2028.

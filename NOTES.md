# Notas de trabajo

## Estado

- 2026-10-26: núcleo `src/luna.js` (`luna`, `lunaRange`) validado con `npm run validate` contra USNO (horarios) y JPL Horizons (acimut, horizonte elevado, iluminación, distancia). Resultados en `validation/report.md`; las respuestas de las APIs quedan cacheadas en `validation/cache/`. Todavía no hay repo en git ni en GitHub.
- La declinación magnética del WMM2025 en el Rosedal es −10,3° (O), no ~8° como decía el brief original.
- El criterio binario de "recomendado" se reemplazó por un puntaje continuo (ver CLAUDE.md). Recomendados en los próximos 60 días: 23/11 (0,68), 24/11 (0,90), 23/12 (0,99) y 24/12 (0,73). Calibrar los σ con las primeras salidas al Rosedal.

## Próximos pasos (v1)

1. ~~Dependencias.~~
2. ~~Núcleo + validación.~~
3. ~~`index.html` mobile-first~~ (2026-10-26). Fuente: `src/index.html` + `src/app.js`; `npm run build` genera `index.html` en la raíz con todo inline (~140 KB). Todavía no está probado en un celular real.
   - 2026-10-26: rediseño (header ilustrado, lista compacta desplegable, luna llena marcada, Photon + mapa Leaflet). Sacados de la UI: fecha/días, declinación, puntaje y recomendados.
4. Bundle inline, repo en GitHub, GitHub Pages, prueba en el celular.

## Backlog (después de v1)

- **Eventos (v2):** próximas lunas llenas y nuevas; superluna (umbral tipo Nolle ≈ 361.400 km, mostrar el umbral usado: no hay una definición única); luna azul (segunda llena del mes calendario local); eclipses lunares (total/parcial/penumbral) y solares con visibilidad local; perigeo y apogeo. API: `SearchLunarApsis`/`NextLunarApsis`, `SearchLunarEclipse`/`NextLunarEclipse`, `SearchGlobalSolarEclipse`, `SearchLocalSolarEclipse`.
- **Referencias locales para orientarse:** el mapa ya muestra una línea hacia la próxima salida, que permite ubicarla respecto de calles y edificios. Falta: línea por día (al desplegar una fila) y quizás la trayectoria completa.
- **UI para no expertos:** preferencia "mi brújula marca verdadero/magnético" y un solo número grande.
- **Modo rojo** (visión nocturna): idea no pedida, a confirmar.
- **PWA instalable** (`manifest.json`, `sw.js`, íconos).
- **README con la metodología de validación** (tabla de errores contra USNO), si el repo se va a mostrar.

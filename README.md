# Salida de la luna

App web para saber cuándo y por dónde sale la luna desde un lugar concreto, pensada para el celular. Un solo `index.html` publicado en GitHub Pages.

- Salida, puesta y fase de cada día, desde hoy hasta el fin del mes siguiente.
- Dirección de salida en grados respecto del norte verdadero (V) y del magnético (M), para usar con una brújula.
- Recorrido de la luna en la primera hora y media, para estimar cuándo asoma por encima de árboles o edificios.
- Mapa con una flecha hacia la próxima salida y búsqueda de lugares.

Las efemérides se calculan en el dispositivo con [astronomy-engine](https://github.com/cosinekitty/astronomy). La declinación magnética sale del modelo WMM2025.

## Validación

El núcleo de cálculo (`src/luna.js`) se contrasta contra USNO (horarios) y JPL Horizons (posición) en seis lugares: Buenos Aires, Quito, Ushuaia, Tromsø, Auckland y Mumbai, incluidos días sin salida ni puesta. Errores máximos en 30 días:

| Magnitud | Referencia | Error máximo |
|---|---|---|
| Salida, puesta y tránsito | USNO | 0,51 min (redondeo de USNO al minuto) |
| Acimut de salida y puesta | JPL Horizons | 0,001° |
| Altura sobre un horizonte de 5° | JPL Horizons | 0,002° |

Detalle en [validation/report.md](validation/report.md).

## Desarrollo

```bash
npm install
npm run validate   # compara contra USNO y JPL Horizons (usa validation/cache/)
npm run build      # genera index.html con todo inline
```

El código fuente está en `src/`. El `index.html` de la raíz es el resultado del build y es lo que publica GitHub Pages: hay que regenerarlo antes de cada commit que toque `src/`.

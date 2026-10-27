# Validación del núcleo de cálculo

Generado por `npm run validate` el 2026-10-27T02:19Z. Rango: 30 días desde 2026-10-27 (hora local de cada lugar). Horizonte 0°.

- **Horarios** (salida, puesta y tránsito de la luna) contra la API de USNO (`rstt/oneday`, en UTC). USNO redondea al minuto, así que ±0,5 min es ruido de redondeo.
- **Acimut, iluminación y distancia topocéntrica** contra JPL Horizons (refractado), en los instantes que calcula el núcleo.
- Convenciones de USNO que no son errores: no lista el tránsito superior si la luna está bajo el horizonte todo el día, y lista "Lower Transit" (ignorado aquí) cuando es circumpolar.
- La iluminación del núcleo es geocéntrica y la de Horizons topocéntrica: diferencias < 1 pp son esperables. La distancia difiere ~50 km (≈0,014%) por la corrección de tiempo-luz de Horizons.
- Tolerancias: ±1 min en horarios, ±0.5° en acimut.

## Horarios vs USNO (minutos, nuestro − USNO)

| Lugar | Salidas n | máx | media | Puestas n | máx | media | Tránsitos n | máx | media | Fuera de tolerancia | Sin par (nuestros / USNO) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Buenos Aires (Rosedal) | 29 | 0.44 | 0.25 | 29 | 0.46 | 0.27 | 29 | 0.48 | 0.30 | 0 | 0 / 0 |
| Quito | 29 | 0.49 | 0.21 | 29 | 0.48 | 0.30 | 29 | 0.50 | 0.26 | 0 | 0 / 0 |
| Ushuaia | 28 | 0.51 | 0.29 | 29 | 0.50 | 0.27 | 29 | 0.49 | 0.30 | 0 | 0 / 0 |
| Tromsø | 14 | 0.47 | 0.17 | 14 | 0.50 | 0.28 | 22 | 0.45 | 0.23 | 0 | 0 / 0 |
| Auckland | 29 | 0.45 | 0.21 | 29 | 0.48 | 0.34 | 29 | 0.49 | 0.22 | 0 | 0 / 0 |
| Mumbai | 29 | 0.48 | 0.24 | 29 | 0.48 | 0.25 | 29 | 0.47 | 0.26 | 0 | 0 / 0 |

## Posición vs JPL Horizons

| Lugar | Eventos | Acimut máx (°) | Acimut media (°) | Elevación aparente en el evento (°) | Iluminación máx (pp) | Distancia máx (km) |
|---|---|---|---|---|---|---|
| Buenos Aires (Rosedal) | 58 | 0.001 | 0.000 | -0.224 a -0.197 | 0.777 | 51.3 |
| Quito | 58 | 0.001 | 0.000 | -0.224 a -0.197 | 0.835 | 51.3 |
| Ushuaia | 57 | 0.001 | 0.000 | -0.224 a -0.197 | 0.660 | 51.3 |
| Tromsø | 28 | 0.001 | 0.001 | -0.218 a -0.200 | 0.488 | 51.4 |
| Auckland | 58 | 0.001 | 0.000 | -0.223 a -0.197 | 0.771 | 51.1 |
| Mumbai | 58 | 0.001 | 0.000 | -0.224 a -0.197 | 0.857 | 51.3 |

## Horizonte elevado (5°) vs JPL Horizons

En la "salida visible" calculada para un horizonte de 5°, el borde superior debe estar a 5° de altura aparente: la elevación del centro según Horizons tiene que ser 5° − semidiámetro. Tolerancia ±0.05°.

| Lugar | n | Diferencia máx (°) | Diferencia media (°) |
|---|---|---|---|
| Buenos Aires (Rosedal) | 29 | 0.0015 | 0.0009 |
| Quito | 29 | 0.0015 | 0.0010 |
| Ushuaia | 28 | 0.0015 | 0.0007 |
| Tromsø | 12 | 0.0012 | 0.0007 |
| Auckland | 29 | 0.0015 | 0.0009 |
| Mumbai | 29 | 0.0014 | 0.0010 |

## Días sin salida o sin puesta

- **Buenos Aires (Rosedal)**: sin salida 2026-10-30; sin puesta 2026-11-14.
- **Quito**: sin salida 2026-11-01; sin puesta 2026-11-16.
- **Ushuaia**: sin salida 2026-10-28, 2026-11-25; sin puesta 2026-11-11.
- **Tromsø**: sin salida 2026-10-27, 2026-10-28, 2026-10-29, 2026-10-30, 2026-10-31, 2026-11-03, 2026-11-09, 2026-11-10, 2026-11-11, 2026-11-12, 2026-11-13, 2026-11-14, 2026-11-15, 2026-11-23, 2026-11-24, 2026-11-25; sin puesta 2026-10-27, 2026-10-28, 2026-10-29, 2026-10-30, 2026-10-31, 2026-11-09, 2026-11-10, 2026-11-11, 2026-11-12, 2026-11-13, 2026-11-14, 2026-11-15, 2026-11-19, 2026-11-23, 2026-11-24, 2026-11-25.
- **Auckland**: sin salida 2026-10-30; sin puesta 2026-11-14.
- **Mumbai**: sin salida 2026-11-01; sin puesta 2026-11-17.

## Anomalías

Ninguna.

# Financiación: petición de condiciones a entidades

Plantilla del correo a bancos y financieras para obtener condiciones reales de financiación (2026-09-28). Los datos pedidos son exactamente los que consume `FinancingInstrument` (`src/modules/engines/financial/types.ts`) y los que cargará el futuro adaptador `own` de financiación (tabla por organización, CSV/API, `FINANCING_PROVIDER_MODE=own,demo`). Los corchetes se rellenan antes de enviar.

## Correo

**Asunto:** Fincax · condiciones de financiación para operaciones de inversión inmobiliaria en Sevilla

Estimado/a [nombre],

Le escribo desde Fincax, [inmobiliaria / consultora de inversión] con sede en Sevilla. Estamos a punto de lanzar FlippIA, una plataforma de análisis de inversión inmobiliaria dirigida a inversores profesionales y family offices que operan en la ciudad. Convierte una dirección en una tesis de inversión completa: estrategias posibles (reforma y venta, alquiler, cambio de uso, división, rehabilitación energética), escenarios, riesgos y, en el centro, la estructura de financiación que hace viable cada operación.

Le escribimos porque queremos que las condiciones de financiación que aparecen en cada análisis sean reales y estén firmadas por entidades concretas, no estimaciones de mercado. Cada operación que la plataforma considere viable mostrará al inversor los productos con los que puede financiarla, con el nombre de la entidad que los ofrece y las condiciones exactas. Nos gustaría que [entidad] fuera una de ellas.

**Lo que le pedimos**

Las condiciones actuales de los productos con los que trabajan operaciones de inversión, en el detalle que indicamos en el anexo. Son seis productos; si alguno no lo comercializan, indicárnoslo es igual de útil, porque la plataforma descartará esa vía con su entidad en lugar de suponerla.

1. Hipoteca de inversor para vivienda (compra para alquilar o reforma ligera).
2. Hipoteca para local, oficina o edificio entero.
3. Préstamo puente o de compra, reforma y venta a corto plazo.
4. Préstamo de rehabilitación o promotor con disposiciones por certificaciones de obra.
5. Línea de obra sin garantía hipotecaria.
6. Financiación de vivienda con destino a uso turístico, si la contemplan.

Para que las respuestas sean concretas, adjuntamos dos casos reales sobre los que les agradeceríamos una oferta indicativa por escrito, con fecha y plazo de validez:

- **Caso A**: piso de 90 m² en Triana. Precio de compra 210.000 €, reforma 45.000 €, inversor particular, venta prevista a los doce meses.
- **Caso B**: local comercial de 120 m² en el Casco Antiguo. Precio de compra 180.000 €, obra de cambio de uso a vivienda 90.000 €, sociedad limitada, alquiler tras la obra.

**Lo que ofrecemos a cambio**

- Operaciones ya analizadas: cada solicitud que les llegue a través de la plataforma vendrá con valoración, comprobación urbanística, presupuesto de obra y escenarios de estrés ya hechos, con las fuentes citadas.
- Presencia en cada informe de inversión (Deal Passport) donde su producto sea la vía elegida, con su nombre y condiciones.
- Un punto de contacto único para actualizar condiciones cuando cambien, con la periodicidad que ustedes indiquen.

Las condiciones que nos faciliten se usan únicamente dentro de la plataforma para los análisis de nuestros usuarios; no se publican ni se comparan públicamente con las de otras entidades.

Si le parece bien, propongo una llamada de treinta minutos la semana que viene para resolver dudas y concretar el formato. Dígame qué día le encaja.

Un cordial saludo,

[Nombre y apellidos]
[Cargo] · Fincax
[Teléfono] · [correo] · [web]

## Anexo: datos que necesitamos por producto

| Dato               | Detalle                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Importe máximo     | % sobre tasación o compra (LTV), % sobre coste total con obra (LTC) o importe fijo. Mínimo y máximo absolutos                  |
| Tipo de interés    | Fijo (%) o variable (índice y diferencial). Índice y fecha del Euríbor que aplican                                             |
| Plazo y carencia   | Plazo máximo en meses; meses de carencia (solo intereses) si existe                                                            |
| Comisiones         | Apertura, estudio, tasación, cancelación anticipada (%)                                                                        |
| Disposición        | Todo en la compra, o por certificaciones de obra (indicar porcentaje inicial)                                                  |
| Perfil admitido    | Particular, profesional o sociedad; requisitos de ingresos o patrimonio; si el alquiler previsto cuenta como ingreso           |
| Usos admitidos     | Vivienda, local, oficina, edificio entero, suelo. Exclusiones: uso turístico, cambio de uso sin licencia, activo con inquilino |
| Garantías          | Hipoteca sobre el activo, aval personal, pignoración, otras                                                                    |
| Requisitos previos | Licencia concedida, presupuesto de contratista, tasación, preventas o fondos propios mínimos                                   |
| Plazos             | Tiempo de respuesta habitual y validez de la oferta                                                                            |

Si prefieren enviarnos sus fichas de producto y una oferta indicativa para los dos casos, es suficiente: nosotros extraemos los datos.

## Notas de envío

- Dirigirlo a una persona con nombre, no a un buzón genérico; personalizar el primer párrafo con algo de esa entidad en Sevilla.
- Si hay una operación cerrada con la entidad, mencionarla en la primera línea.
- Preguntas específicas por producto (para la llamada): LTV en segunda vivienda y si el alquiler previsto cuenta como ingreso (1); LTV terciario, si exigen sociedad y si financian un local a convertir antes de la licencia (2); LTC, solo intereses con bullet a la venta, cancelación y obra por certificaciones (3); carencia en obra, licencia previa, preventas o fondos propios (4); importe, plazo y presupuesto de contratista (5); si financian uso turístico y con qué LTV (6).
- Una oferta indicativa por escrito con fecha y validez es lo que permite registrar la condición como `VERIFIED`; una condición de mercado conocida queda como `INFERRED`.

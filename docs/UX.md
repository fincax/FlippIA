# UX

## Principio

Máxima potencia interna, mínima complejidad externa. Nunca 50 botones porque haya 50 capacidades.

## Home

Command bar central ("¿Qué quieres descubrir?"), cuatro acciones contextuales, tres claims. Sin foto de edificio, sin "revolucionamos el sector".

## Análisis

Streaming de tareas por dominio con estados (pendiente, en curso, ✓, omitido, fallo), progreso y resultado "He encontrado N posibles futuros". Cadencia de presentación de 110 ms por evento (los motores son más rápidos que el ojo); sin cadenas de razonamiento privadas.

## Deal Room

Overview (tesis, 4 futuros, escenario base, Opportunity Gap, DNA, evidencia, Haz magia) · Estrategias (ranking explicado, comprobaciones, hipótesis con semáforo) · Escenarios (switcher, comparación, curva de caja, costes, what-if → aplicar a base / guardar) · Finanzas (precio máximo, desglose completo con fórmulas, capital stack) · Riesgo (tornado de estrés, hallazgos adversariales) · Urbanismo (planeamiento, hallazgos, comprobaciones, snapshot normativo con fechas y fuentes) · Arquitectura (alternativas y presupuestos por capítulo) · Mercado (valoración, mapa, comparables usados/descartados) · Evidencia (estado de fuentes, evidencias agrupadas) · Passport (imprimible, revisiones humanas) · Actividad (timeline + runs) · LIA (Ask this property).

## Estados

- Empty states que enseñan ("Todavía no estás vigilando ninguna zona…").
- Errores útiles ("No hemos podido consultar esta fuente; el resto del análisis continúa").
- Semáforo de evidencia y badge DEMO en todo lo sintético.
- Confianza siempre con factores; scores siempre con componentes y pesos.

## Móvil

Barra inferior (Pulse, Deals, Radar, Watch, DNA); cabecera compacta; tablas con scroll horizontal; command bar y LIA priorizados.

## Accesibilidad

Semántica (nav, main, tablas con thead), labels en inputs, `aria-current`, `role="status"/"alert"`, foco visible por tokens, contraste AA en tokens oscuros y claros, `prefers-reduced-motion` respetado.

## Copy

Directo. "He encontrado tres alternativas." / "Esta necesita revisión." / "El precio máximo para mantener tu objetivo es X." Sin emojis.

# UX

## Principio

Máxima potencia interna, mínima complejidad externa. Nunca 50 botones porque haya 50 capacidades.

## Gramática visual

CITY → ASSET → POSSIBILITY → DECISION. Ver `design-system/README.md` (tokens, tipografía, motion) y
`DESIGN_DEPENDENCIES.md` (lo que el diseño no puede resolver sin cambios funcionales).

## Home

Pantalla completa: "Dame una dirección." sobre una Sevilla abstracta (`CityCanvas`, parcelario esquemático y determinista, sin foto). Command bar (`FlippIACommand`, la misma lógica de siempre) con cuatro acciones numeradas y tres claims. Sin "revolucionamos el sector".

## Análisis (FlippIA Scan)

La ciudad se cierra sobre el barrio y la parcela a medida que avanza el trabajo real (CIUDAD → BARRIO → PARCELA → ACTIVO). Dos paneles: capas del activo (ACTIVO · MERCADO · URBANISMO · ARQUITECTURA · FINANCIACIÓN · RIESGO · SALIDA · SÍNTESIS, encendidas por los estados reales de las tareas) e Intelligence Stream (log monoespaciado con marcas de tiempo de cliente). Estados: pendiente, en curso, completado, omitido, fallo. Cadencia de presentación de 110 ms por evento; sin cadenas de razonamiento privadas. Resultado: "He encontrado N posibles futuros", N siempre dinámico.

## Deal Room

Overview (HE ENCONTRADO · N · FUTUROS POSIBLES, tesis con SHOW EVIDENCE, árbol de posibilidades, Opportunity Gap con palancas, vista explosionada VALOR · FINANCIACIÓN · REFORMA · ARQUITECTURA · URBANISMO · ACTIVO, escenario base, DNA, evidencia, Haz magia) · Estrategias (matriz de comparación capital · plazo · retorno · riesgo · complejidad, después la capa técnica: ranking explicado, comprobaciones, estrés, hipótesis con semáforo) · Escenarios (switcher, comparación, curva de caja, costes, what-if → aplicar a base / guardar) · Finanzas (precio máximo, desglose completo con fórmulas, capital stack) · Riesgo (Risk Mode: supervivencia, capital en riesgo, tornado de estrés, hallazgos adversariales) · Urbanismo (Urban Digital Layer + Urban Check con estados de evidencia, envolvente conceptual, hallazgos, comprobaciones, snapshot normativo con fechas y fuentes) · Arquitectura (Architecture Lab: lo que es ↔ lo que podría ser, y por alternativa PLAN/MODEL · STRATEGY · COST · VALUE · REGULATION) · Mercado (valoración, mapa, comparables usados/descartados) · Evidencia (estado de fuentes, evidencias agrupadas) · Passport (imprimible, revisiones humanas) · Actividad (timeline + runs) · LIA (Ask this property).

## Radar y cartera

Radar como control de tráfico aéreo: plan de vuelo (criterios del Investor DNA o del objetivo dicho), scope (`RadarScope`: la ciudad con anillos, barrido y un blip por activo del Radar Engine, posición esquemática por microzona) y tablero de tiras («En criterio» / «No cumplen (todavía)») con precio, descuento as-is, beneficio rápido, ROE, capital, plazo, score y motivos. Cartera: dossiers numerados con estado, vía principal, beneficio, ROE, DNA y riesgo.

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

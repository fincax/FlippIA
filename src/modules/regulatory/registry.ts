import type { Jurisdiction, Regulation, RegulationVersion } from "./types";

/**
 * Seed regulatory registry. Entries are references to official sources with
 * dates; they are NOT the full text. The Regulatory Intelligence Engine
 * ingests documents on top of this catalogue. Every entry carries a
 * verification status so the UI never presents a reference as certain when
 * it has only been identified, not verified.
 *
 * verificationStatus:
 *  - VERIFIED: publication and effective dates cross-checked against the gazette.
 *  - INFERRED: identified as in force; dates from secondary knowledge, pending check.
 *  - REVIEW_REQUIRED: known to exist / be evolving; needs a human check before relying on it.
 */
const INGESTED = "2026-01-10T00:00:00.000Z";

export const JURISDICTIONS = {
  EU: { level: "eu", code: "EU", label: "Unión Europea" } satisfies Jurisdiction,
  ES: { level: "country", code: "ES", label: "España" } satisfies Jurisdiction,
  AND: { level: "region", code: "ES-AN", label: "Andalucía" } satisfies Jurisdiction,
  SE_PROV: { level: "province", code: "ES-SE", label: "Provincia de Sevilla" } satisfies Jurisdiction,
  SEVILLA: { level: "municipality", code: "41091", label: "Sevilla" } satisfies Jurisdiction,
} as const;

function v(partial: Omit<RegulationVersion, "ingestedAt" | "regulationId" | "id"> & { id?: string }, regulationId: string): RegulationVersion {
  return { id: partial.id ?? `${regulationId}.v${partial.version}`, regulationId, ingestedAt: INGESTED, ...partial };
}

function reg(r: Omit<Regulation, "versions"> & { versions: Array<Omit<RegulationVersion, "ingestedAt" | "regulationId" | "id"> & { id?: string }> }): Regulation {
  return { ...r, versions: r.versions.map((x) => v(x, r.id)) };
}

export const REGULATORY_REGISTRY: Regulation[] = [
  // ── EU ───────────────────────────────────────────────────────────────────
  reg({
    id: "reg.eu.epbd-2024",
    shortName: "Directiva (UE) 2024/1275 (EPBD)",
    jurisdiction: JURISDICTIONS.EU,
    topics: ["energy", "building_code"],
    assetUses: [],
    versions: [
      {
        version: "2024",
        title: "Directiva (UE) 2024/1275 relativa a la eficiencia energética de los edificios (refundición)",
        publicationDate: "2024-05-08",
        effectiveFrom: "2024-05-28",
        status: "in_force",
        sourceUrl: "https://eur-lex.europa.eu/eli/dir/2024/1275/oj",
        sourceName: "DOUE",
        verificationStatus: "INFERRED",
        summary: "Trayectoria de renovación del parque edificado, normas mínimas de eficiencia y edificios de cero emisiones. Transposición nacional pendiente/parcial.",
        keyPoints: ["Objetivos de reducción de consumo de energía primaria en residencial (2030/2035).", "Refuerzo de certificados de eficiencia energética y pasaportes de renovación."],
      },
    ],
  }),
  reg({
    id: "reg.eu.str-data-2024",
    shortName: "Reglamento (UE) 2024/1028",
    jurisdiction: JURISDICTIONS.EU,
    topics: ["tourism"],
    assetUses: ["residential"],
    versions: [
      {
        version: "2024",
        title: "Reglamento (UE) 2024/1028 sobre recogida e intercambio de datos de alquileres de corta duración",
        publicationDate: "2024-04-29",
        effectiveFrom: "2026-05-20",
        status: "in_force",
        sourceUrl: "https://eur-lex.europa.eu/eli/reg/2024/1028/oj",
        sourceName: "DOUE",
        verificationStatus: "INFERRED",
        summary: "Registro y número de identificación obligatorios para alojamientos de corta estancia ofrecidos en plataformas.",
        keyPoints: ["Número de registro obligatorio para anunciar alquileres de corta duración."],
      },
    ],
  }),
  // ── España ───────────────────────────────────────────────────────────────
  reg({
    id: "reg.es.suelo.rdl7-2015",
    shortName: "TRLSRU (RDL 7/2015)",
    jurisdiction: JURISDICTIONS.ES,
    topics: ["planning", "land_use", "ite_iee"],
    assetUses: [],
    versions: [
      {
        version: "2015",
        title: "Real Decreto Legislativo 7/2015, texto refundido de la Ley de Suelo y Rehabilitación Urbana",
        publicationDate: "2015-10-31",
        effectiveFrom: "2015-11-01",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/rdlg/2015/10/30/7/con",
        sourceName: "BOE",
        verificationStatus: "INFERRED",
        summary: "Marco estatal de suelo, deberes de conservación y rehabilitación, informe de evaluación de edificios.",
        keyPoints: ["Deber legal de conservación.", "Informe de Evaluación de Edificios (IEE) para edificios de determinada antigüedad."],
      },
    ],
  }),
  reg({
    id: "reg.es.cte.rd314-2006",
    shortName: "CTE (RD 314/2006)",
    jurisdiction: JURISDICTIONS.ES,
    topics: ["building_code", "fire_safety", "accessibility", "energy", "habitability"],
    assetUses: [],
    versions: [
      {
        version: "2006-consolidado",
        title: "Real Decreto 314/2006, Código Técnico de la Edificación (texto consolidado)",
        publicationDate: "2006-03-28",
        effectiveFrom: "2006-03-29",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/rd/2006/03/17/314/con",
        sourceName: "BOE",
        verificationStatus: "INFERRED",
        summary: "Exigencias básicas de seguridad (SE, SI), habitabilidad (HS, HR, HE) y utilización/accesibilidad (SUA). Aplica a obra nueva y a intervenciones en edificios existentes según su alcance.",
        keyPoints: ["DB-SI seguridad en caso de incendio: sectorización y evacuación en cambios de uso.", "DB-SUA: accesibilidad en intervenciones.", "DB-HE: eficiencia energética; actualizado por RD 732/2019."],
      },
    ],
  }),
  reg({
    id: "reg.es.loe.ley38-1999",
    shortName: "LOE (Ley 38/1999)",
    jurisdiction: JURISDICTIONS.ES,
    topics: ["building_code", "licence"],
    assetUses: [],
    versions: [
      {
        version: "1999",
        title: "Ley 38/1999, de Ordenación de la Edificación",
        publicationDate: "1999-11-06",
        effectiveFrom: "2000-05-06",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/l/1999/11/05/38/con",
        sourceName: "BOE",
        verificationStatus: "INFERRED",
        summary: "Agentes de la edificación, proyecto, dirección de obra y garantías. Determina cuándo una intervención requiere proyecto.",
        keyPoints: ["Art. 2: intervenciones que alteran configuración arquitectónica requieren proyecto (cambio de uso característico incluido)."],
      },
    ],
  }),
  reg({
    id: "reg.es.lau.ley29-1994",
    shortName: "LAU (Ley 29/1994)",
    jurisdiction: JURISDICTIONS.ES,
    topics: ["tenancy"],
    assetUses: ["residential", "commercial"],
    versions: [
      {
        version: "2023",
        title: "Ley 29/1994, de Arrendamientos Urbanos (consolidada tras la Ley 12/2023)",
        publicationDate: "1994-11-25",
        effectiveFrom: "2023-05-26",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/l/1994/11/24/29/con",
        sourceName: "BOE",
        verificationStatus: "INFERRED",
        summary: "Régimen de arrendamiento de vivienda y uso distinto. Duración mínima, prórrogas, actualización de renta.",
        keyPoints: ["Arrendamiento de vivienda: 5 años (7 si persona jurídica) de prórroga obligatoria.", "Limitación de actualización de renta y zonas tensionadas según Ley 12/2023."],
      },
    ],
  }),
  reg({
    id: "reg.es.vivienda.ley12-2023",
    shortName: "Ley 12/2023 de Vivienda",
    jurisdiction: JURISDICTIONS.ES,
    topics: ["housing", "tenancy"],
    assetUses: ["residential"],
    versions: [
      {
        version: "2023",
        title: "Ley 12/2023, de 24 de mayo, por el derecho a la vivienda",
        publicationDate: "2023-05-25",
        effectiveFrom: "2023-05-26",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/l/2023/05/24/12/con",
        sourceName: "BOE",
        verificationStatus: "INFERRED",
        summary: "Zonas de mercado residencial tensionado, grandes tenedores, límites a la renta en zonas declaradas. Andalucía no ha declarado zonas tensionadas a fecha de ingesta.",
        keyPoints: ["Índice de referencia de precios de alquiler.", "Gastos de gestión inmobiliaria a cargo del arrendador."],
      },
    ],
  }),
  reg({
    id: "reg.es.itp-ajd.rdl1-1993",
    shortName: "ITP-AJD (RDL 1/1993)",
    jurisdiction: JURISDICTIONS.ES,
    topics: ["tax.acquisition"],
    assetUses: [],
    versions: [
      {
        version: "1993",
        title: "Real Decreto Legislativo 1/1993, texto refundido del Impuesto sobre Transmisiones Patrimoniales y Actos Jurídicos Documentados",
        publicationDate: "1993-10-20",
        effectiveFrom: "1993-10-21",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/rdlg/1993/09/24/1/con",
        sourceName: "BOE",
        verificationStatus: "INFERRED",
        summary: "Marco estatal del ITP y AJD. Los tipos aplicables en Andalucía los fija la normativa autonómica de tributos cedidos.",
        keyPoints: ["Base imponible: valor de referencia catastral si es superior al precio (desde 2022)."],
      },
    ],
  }),
  reg({
    id: "reg.es.irpf.ley35-2006",
    shortName: "IRPF (Ley 35/2006)",
    jurisdiction: JURISDICTIONS.ES,
    topics: ["tax.exit"],
    assetUses: [],
    versions: [
      {
        version: "2025",
        title: "Ley 35/2006, del Impuesto sobre la Renta de las Personas Físicas (escala del ahorro vigente 2025)",
        publicationDate: "2006-11-29",
        effectiveFrom: "2025-01-01",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/l/2006/11/28/35/con",
        sourceName: "BOE",
        verificationStatus: "INFERRED",
        summary: "Ganancias patrimoniales por transmisión de inmuebles tributan en la base del ahorro: 19/21/23/27/30 %.",
        keyPoints: ["Tramos del ahorro: hasta 6.000 € 19 %; hasta 50.000 € 21 %; hasta 200.000 € 23 %; hasta 300.000 € 27 %; resto 30 %."],
      },
    ],
  }),
  reg({
    id: "reg.es.iva.ley37-1992",
    shortName: "IVA (Ley 37/1992)",
    jurisdiction: JURISDICTIONS.ES,
    topics: ["tax.acquisition", "tax.works"],
    assetUses: [],
    versions: [
      {
        version: "1992",
        title: "Ley 37/1992, del Impuesto sobre el Valor Añadido",
        publicationDate: "1992-12-29",
        effectiveFrom: "1993-01-01",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/l/1992/12/28/37/con",
        sourceName: "BOE",
        verificationStatus: "INFERRED",
        summary: "IVA 10 % en entregas de vivienda nueva; 21 % en locales; obras de renovación en vivienda al 10 % si cumplen requisitos (art. 91).",
        keyPoints: ["Art. 91.Uno.2.10º: tipo reducido en obras de renovación y reparación de viviendas con condiciones (materiales < 40 %)."],
      },
    ],
  }),
  reg({
    id: "reg.es.haciendas-locales.rdl2-2004",
    shortName: "TRLHL (RDL 2/2004)",
    jurisdiction: JURISDICTIONS.ES,
    topics: ["tax.local", "tax.works", "tax.exit"],
    assetUses: [],
    versions: [
      {
        version: "2021",
        title: "Real Decreto Legislativo 2/2004, texto refundido de la Ley Reguladora de las Haciendas Locales (IBI, ICIO, IIVTNU; plusvalía modificada por RDL 26/2021)",
        publicationDate: "2004-03-09",
        effectiveFrom: "2021-11-10",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/rdlg/2004/03/05/2/con",
        sourceName: "BOE",
        verificationStatus: "INFERRED",
        summary: "Marco de IBI, ICIO y plusvalía municipal (IIVTNU). El RDL 26/2021 fija los métodos objetivo y real tras la STC 182/2021.",
        keyPoints: ["IIVTNU: no se devenga sin incremento de valor real.", "ICIO: tipo máximo 4 % sobre coste real de la obra."],
      },
    ],
  }),
  reg({
    id: "reg.es.cee.rd390-2021",
    shortName: "CEE (RD 390/2021)",
    jurisdiction: JURISDICTIONS.ES,
    topics: ["energy"],
    assetUses: [],
    versions: [
      {
        version: "2021",
        title: "Real Decreto 390/2021, procedimiento básico para la certificación de la eficiencia energética de los edificios",
        publicationDate: "2021-06-02",
        effectiveFrom: "2021-06-03",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/rd/2021/06/01/390/con",
        sourceName: "BOE",
        verificationStatus: "INFERRED",
        supersedes: "RD 235/2013",
        summary: "Certificado de eficiencia energética obligatorio en venta y alquiler.",
        keyPoints: ["Certificado obligatorio antes de anunciar venta o alquiler."],
      },
    ],
  }),
  reg({
    id: "reg.es.lph.ley49-1960",
    shortName: "LPH (Ley 49/1960)",
    jurisdiction: JURISDICTIONS.ES,
    topics: ["horizontal_property", "change_of_use", "subdivision", "tourism"],
    assetUses: [],
    versions: [
      {
        version: "2025",
        title: "Ley 49/1960, de Propiedad Horizontal (consolidada; art. 17.12 modificado por Ley Orgánica 1/2025)",
        publicationDate: "1960-07-23",
        effectiveFrom: "2025-04-03",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/l/1960/07/21/49/con",
        sourceName: "BOE",
        verificationStatus: "REVIEW_REQUIRED",
        summary: "División de pisos, cambios de uso y limitaciones estatutarias. La comunidad puede prohibir o condicionar el uso turístico (mayoría de 3/5), y desde abril de 2025 se requiere autorización previa de la junta para iniciar actividad turística.",
        keyPoints: ["Art. 10.3.b: división material de pisos requiere autorización administrativa y acuerdo de la junta (3/5).", "Art. 17.12: aprobación expresa de la junta para vivienda de uso turístico."],
      },
    ],
  }),
  // ── Andalucía ────────────────────────────────────────────────────────────
  reg({
    id: "reg.es.and.lista.ley7-2021",
    shortName: "LISTA (Ley 7/2021)",
    jurisdiction: JURISDICTIONS.AND,
    topics: ["planning", "zoning", "land_use", "licence", "responsible_declaration", "change_of_use", "building_parameters"],
    assetUses: [],
    versions: [
      {
        version: "2021",
        title: "Ley 7/2021, de 1 de diciembre, de impulso para la sostenibilidad del territorio de Andalucía (LISTA)",
        publicationDate: "2021-12-03",
        effectiveFrom: "2021-12-23",
        status: "in_force",
        sourceUrl: "https://www.juntadeandalucia.es/boja/2021/233/1",
        sourceName: "BOJA",
        verificationStatus: "INFERRED",
        supersedes: "Ley 7/2002 (LOUA)",
        summary: "Marco urbanístico andaluz: instrumentos de ordenación, licencias, declaración responsable y comunicación previa, disciplina.",
        keyPoints: ["Art. 137–138: actos sujetos a licencia frente a declaración responsable.", "Cambios de uso: sujetos a licencia salvo supuestos de declaración responsable si no alteran la configuración."],
      },
    ],
  }),
  reg({
    id: "reg.es.and.rglista.d550-2022",
    shortName: "RGLISTA (Decreto 550/2022)",
    jurisdiction: JURISDICTIONS.AND,
    topics: ["planning", "licence", "responsible_declaration", "change_of_use", "subdivision"],
    assetUses: [],
    versions: [
      {
        version: "2022",
        title: "Decreto 550/2022, de 29 de noviembre, Reglamento General de la LISTA",
        publicationDate: "2022-12-12",
        effectiveFrom: "2023-01-01",
        status: "in_force",
        sourceUrl: "https://www.juntadeandalucia.es/boja/2022/236/1",
        sourceName: "BOJA",
        verificationStatus: "INFERRED",
        supersedes: "Decreto 60/2010 (RDUA)",
        summary: "Desarrollo reglamentario de la LISTA: régimen de licencias, declaraciones responsables, parcelaciones y disciplina.",
        keyPoints: ["Título sobre intervención administrativa: procedimientos de licencia y declaración responsable."],
      },
    ],
  }),
  reg({
    id: "reg.es.and.tributos-cedidos.ley5-2021",
    shortName: "Tributos cedidos Andalucía (Ley 5/2021)",
    jurisdiction: JURISDICTIONS.AND,
    topics: ["tax.acquisition"],
    assetUses: [],
    versions: [
      {
        version: "2021",
        title: "Ley 5/2021, de 20 de octubre, de Tributos Cedidos de la Comunidad Autónoma de Andalucía",
        publicationDate: "2021-10-26",
        effectiveFrom: "2021-10-27",
        status: "in_force",
        sourceUrl: "https://www.juntadeandalucia.es/boja/2021/206/1",
        sourceName: "BOJA",
        verificationStatus: "INFERRED",
        supersedes: "Decreto Legislativo 1/2018",
        summary: "Tipo general del ITP 7 % y AJD 1,2 % en Andalucía; tipos reducidos para jóvenes, VPO, familias numerosas y otros supuestos.",
        keyPoints: ["ITP general 7 %.", "AJD general 1,2 %.", "Tipos reducidos condicionados: no se aplican automáticamente."],
      },
    ],
  }),
  reg({
    id: "reg.es.and.vft.d28-2016",
    shortName: "VFT Andalucía (Decreto 28/2016)",
    jurisdiction: JURISDICTIONS.AND,
    topics: ["tourism"],
    assetUses: ["residential"],
    versions: [
      {
        version: "2024",
        title: "Decreto 28/2016, de viviendas con fines turísticos (modificado por Decreto 31/2024)",
        publicationDate: "2024-02-02",
        effectiveFrom: "2024-02-22",
        status: "in_force",
        sourceUrl: "https://www.juntadeandalucia.es/boja/2024/24/1",
        sourceName: "BOJA",
        verificationStatus: "INFERRED",
        summary: "Requisitos de viviendas con fines turísticos; habilita a los ayuntamientos a limitar o condicionar por razones urbanísticas.",
        keyPoints: ["Licencia de ocupación / primera utilización y requisitos de equipamiento.", "Los municipios pueden limitar el número de VFT por zona."],
      },
    ],
  }),
  reg({
    id: "reg.es.and.patrimonio.ley14-2007",
    shortName: "LPHA (Ley 14/2007)",
    jurisdiction: JURISDICTIONS.AND,
    topics: ["heritage", "protection"],
    assetUses: [],
    versions: [
      {
        version: "2007",
        title: "Ley 14/2007, de 26 de noviembre, del Patrimonio Histórico de Andalucía",
        publicationDate: "2007-12-19",
        effectiveFrom: "2008-01-19",
        status: "in_force",
        sourceUrl: "https://www.juntadeandalucia.es/boja/2007/248/1",
        sourceName: "BOJA",
        verificationStatus: "INFERRED",
        summary: "Régimen de protección de bienes inscritos y de entornos; autorizaciones de la Consejería competente para intervenciones en BIC y entornos.",
        keyPoints: ["Intervenciones en bienes inscritos y entornos requieren autorización cultural previa a la licencia."],
      },
    ],
  }),
  reg({
    id: "reg.es.and.accesibilidad.d293-2009",
    shortName: "Accesibilidad Andalucía (Decreto 293/2009)",
    jurisdiction: JURISDICTIONS.AND,
    topics: ["accessibility"],
    assetUses: [],
    versions: [
      {
        version: "2009",
        title: "Decreto 293/2009, reglamento de accesibilidad en infraestructuras, urbanización, edificación y transporte en Andalucía",
        publicationDate: "2009-07-21",
        effectiveFrom: "2009-09-21",
        status: "in_force",
        sourceUrl: "https://www.juntadeandalucia.es/boja/2009/140/1",
        sourceName: "BOJA",
        verificationStatus: "INFERRED",
        summary: "Condiciones de accesibilidad en edificación; aplica junto con CTE DB-SUA en cambios de uso y obras.",
        keyPoints: ["Itinerarios accesibles y condiciones en locales de pública concurrencia."],
      },
    ],
  }),
  // ── Sevilla ──────────────────────────────────────────────────────────────
  reg({
    id: "reg.es.sevilla.pgou-2006",
    shortName: "PGOU Sevilla (TR 2006)",
    jurisdiction: JURISDICTIONS.SEVILLA,
    topics: ["planning", "zoning", "land_use", "building_parameters", "change_of_use", "subdivision", "protection"],
    assetUses: [],
    versions: [
      {
        version: "2006-TR",
        title: "Texto Refundido del Plan General de Ordenación Urbanística de Sevilla (aprobación definitiva 19/07/2006)",
        publicationDate: "2006-12-16",
        effectiveFrom: "2006-12-17",
        status: "in_force",
        sourceUrl: "https://www.urbanismosevilla.org/",
        sourceName: "Gerencia de Urbanismo y Medio Ambiente de Sevilla / BOP Sevilla",
        verificationStatus: "INFERRED",
        summary: "Ordenación estructural y pormenorizada: zonas de ordenanza (Centro Histórico, Suburbana, Manzana Cerrada, Edificación Abierta, etc.), usos compatibles, alturas y condiciones de parcela. Con múltiples modificaciones puntuales posteriores.",
        keyPoints: ["Normas Urbanísticas: condiciones particulares por zona de ordenanza.", "Compatibilidad de usos: el uso residencial en planta baja está condicionado según zona.", "Superficie mínima de vivienda y condiciones de habitabilidad remiten a normativa sectorial."],
      },
    ],
  }),
  reg({
    id: "reg.es.sevilla.pepch",
    shortName: "Planes Especiales de Protección del Conjunto Histórico (Sevilla)",
    jurisdiction: JURISDICTIONS.SEVILLA,
    topics: ["heritage", "protection", "building_parameters"],
    assetUses: [],
    versions: [
      {
        version: "sectores",
        title: "Planes Especiales de Protección de los sectores del Conjunto Histórico de Sevilla (catálogos por sector)",
        effectiveFrom: "2000-01-01",
        status: "in_force",
        sourceUrl: "https://www.urbanismosevilla.org/",
        sourceName: "Gerencia de Urbanismo y Medio Ambiente de Sevilla",
        verificationStatus: "REVIEW_REQUIRED",
        summary: "Niveles de protección (A, B, C, D) por edificio catalogado en cada sector del Conjunto Histórico; determinan intervenciones admisibles.",
        keyPoints: ["Protección A/B: intervenciones muy limitadas; C/D: reforma con conservación de elementos.", "Consultar catálogo del sector antes de plantear demoliciones o cambios de uso."],
      },
    ],
  }),
  reg({
    id: "reg.es.sevilla.oroa",
    shortName: "Ordenanza de Obras y Actividades (Sevilla)",
    jurisdiction: JURISDICTIONS.SEVILLA,
    topics: ["licence", "responsible_declaration", "change_of_use"],
    assetUses: [],
    versions: [
      {
        version: "vigente",
        title: "Ordenanza reguladora de Obras y Actividades del Ayuntamiento de Sevilla (OROA), con modificaciones",
        effectiveFrom: "2012-03-01",
        status: "in_force",
        sourceUrl: "https://www.urbanismosevilla.org/",
        sourceName: "Ayuntamiento de Sevilla / BOP Sevilla",
        verificationStatus: "REVIEW_REQUIRED",
        summary: "Procedimientos municipales: obras sujetas a declaración responsable frente a licencia, documentación exigible, actividades.",
        keyPoints: ["Reforma interior sin afección estructural: declaración responsable en la mayoría de supuestos.", "Cambio de uso a vivienda: licencia con proyecto."],
      },
    ],
  }),
  reg({
    id: "reg.es.sevilla.ordenanza-icio",
    shortName: "Ordenanza fiscal ICIO (Sevilla)",
    jurisdiction: JURISDICTIONS.SEVILLA,
    topics: ["tax.works"],
    assetUses: [],
    versions: [
      {
        version: "2025",
        title: "Ordenanza fiscal reguladora del Impuesto sobre Construcciones, Instalaciones y Obras del Ayuntamiento de Sevilla (ejercicio 2025)",
        effectiveFrom: "2025-01-01",
        status: "in_force",
        sourceUrl: "https://www.sevilla.org/",
        sourceName: "Ayuntamiento de Sevilla / BOP Sevilla",
        verificationStatus: "REVIEW_REQUIRED",
        summary: "Tipo de gravamen del ICIO y bonificaciones (rehabilitación, accesibilidad, eficiencia energética) en Sevilla.",
        keyPoints: ["Tipo estimado 4 % (máximo legal); verificar tipo y bonificaciones vigentes."],
      },
    ],
  }),
  reg({
    id: "reg.es.sevilla.vft-pgou",
    shortName: "Regulación municipal de viviendas turísticas (Sevilla)",
    jurisdiction: JURISDICTIONS.SEVILLA,
    topics: ["tourism", "change_of_use", "zoning"],
    assetUses: ["residential"],
    versions: [
      {
        version: "2025",
        title: "Modificación puntual del PGOU de Sevilla para la regulación urbanística de las viviendas de uso turístico",
        effectiveFrom: "2025-01-01",
        status: "unverified",
        sourceUrl: "https://www.urbanismosevilla.org/",
        sourceName: "Gerencia de Urbanismo y Medio Ambiente de Sevilla",
        verificationStatus: "REVIEW_REQUIRED",
        summary: "Limitación del número de viviendas de uso turístico por barrio (umbral de saturación) y condiciones de implantación. Estado de tramitación y vigencia pendientes de verificación con fuente oficial.",
        keyPoints: ["Posible saturación por barrio: comprobar antes de asumir explotación turística.", "Uso turístico tratado como uso terciario en determinadas zonas."],
      },
    ],
  }),
];

export function findRegulation(id: string): Regulation | undefined {
  return REGULATORY_REGISTRY.find((r) => r.id === id);
}

export function listRegulations(): Regulation[] {
  return [...REGULATORY_REGISTRY];
}

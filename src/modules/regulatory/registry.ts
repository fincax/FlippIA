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
/** Revisión de las citas municipales de Sevilla (boletín, número y fecha por versión). */
const REVIEWED = "2026-09-28T00:00:00.000Z";

export const JURISDICTIONS = {
  EU: { level: "eu", code: "EU", label: "Unión Europea" } satisfies Jurisdiction,
  ES: { level: "country", code: "ES", label: "España" } satisfies Jurisdiction,
  AND: { level: "region", code: "ES-AN", label: "Andalucía" } satisfies Jurisdiction,
  SE_PROV: { level: "province", code: "ES-SE", label: "Provincia de Sevilla" } satisfies Jurisdiction,
  SEVILLA: { level: "municipality", code: "41091", label: "Sevilla" } satisfies Jurisdiction,
  DOS_HERMANAS: { level: "municipality", code: "41038", label: "Dos Hermanas" } satisfies Jurisdiction,
  ALCALA_DE_GUADAIRA: {
    level: "municipality",
    code: "41004",
    label: "Alcalá de Guadaíra",
  } satisfies Jurisdiction,
} as const;

type VersionInput = Omit<RegulationVersion, "ingestedAt" | "regulationId" | "id"> & {
  id?: string;
  ingestedAt?: string;
};

function v(partial: VersionInput, regulationId: string): RegulationVersion {
  return {
    id: partial.id ?? `${regulationId}.v${partial.version}`,
    regulationId,
    ingestedAt: INGESTED,
    ...partial,
  };
}

function reg(r: Omit<Regulation, "versions"> & { versions: VersionInput[] }): Regulation {
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
        summary:
          "Trayectoria de renovación del parque edificado, normas mínimas de eficiencia y edificios de cero emisiones. Transposición nacional pendiente/parcial.",
        keyPoints: [
          "Objetivos de reducción de consumo de energía primaria en residencial (2030/2035).",
          "Refuerzo de certificados de eficiencia energética y pasaportes de renovación.",
        ],
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
        title:
          "Reglamento (UE) 2024/1028 sobre recogida e intercambio de datos de alquileres de corta duración",
        publicationDate: "2024-04-29",
        effectiveFrom: "2026-05-20",
        status: "in_force",
        sourceUrl: "https://eur-lex.europa.eu/eli/reg/2024/1028/oj",
        sourceName: "DOUE",
        verificationStatus: "INFERRED",
        summary:
          "Registro y número de identificación obligatorios para alojamientos de corta estancia ofrecidos en plataformas.",
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
        summary:
          "Marco estatal de suelo, deberes de conservación y rehabilitación, informe de evaluación de edificios.",
        keyPoints: [
          "Deber legal de conservación.",
          "Informe de Evaluación de Edificios (IEE) para edificios de determinada antigüedad.",
        ],
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
        summary:
          "Exigencias básicas de seguridad (SE, SI), habitabilidad (HS, HR, HE) y utilización/accesibilidad (SUA). Aplica a obra nueva y a intervenciones en edificios existentes según su alcance.",
        keyPoints: [
          "DB-SI seguridad en caso de incendio: sectorización y evacuación en cambios de uso.",
          "DB-SUA: accesibilidad en intervenciones.",
          "DB-HE: eficiencia energética; actualizado por RD 732/2019.",
        ],
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
        summary:
          "Agentes de la edificación, proyecto, dirección de obra y garantías. Determina cuándo una intervención requiere proyecto.",
        keyPoints: [
          "Art. 2: intervenciones que alteran configuración arquitectónica requieren proyecto (cambio de uso característico incluido).",
        ],
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
        summary:
          "Régimen de arrendamiento de vivienda y uso distinto. Duración mínima, prórrogas, actualización de renta.",
        keyPoints: [
          "Arrendamiento de vivienda: 5 años (7 si persona jurídica) de prórroga obligatoria.",
          "Limitación de actualización de renta y zonas tensionadas según Ley 12/2023.",
        ],
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
        summary:
          "Zonas de mercado residencial tensionado, grandes tenedores, límites a la renta en zonas declaradas. Andalucía no ha declarado zonas tensionadas a fecha de ingesta.",
        keyPoints: [
          "Índice de referencia de precios de alquiler.",
          "Gastos de gestión inmobiliaria a cargo del arrendador.",
        ],
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
        title:
          "Real Decreto Legislativo 1/1993, texto refundido del Impuesto sobre Transmisiones Patrimoniales y Actos Jurídicos Documentados",
        publicationDate: "1993-10-20",
        effectiveFrom: "1993-10-21",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/rdlg/1993/09/24/1/con",
        sourceName: "BOE",
        verificationStatus: "INFERRED",
        summary:
          "Marco estatal del ITP y AJD. Los tipos aplicables en Andalucía los fija la normativa autonómica de tributos cedidos.",
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
        title:
          "Ley 35/2006, del Impuesto sobre la Renta de las Personas Físicas (escala del ahorro vigente 2025)",
        publicationDate: "2006-11-29",
        effectiveFrom: "2025-01-01",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/l/2006/11/28/35/con",
        sourceName: "BOE",
        verificationStatus: "INFERRED",
        summary:
          "Ganancias patrimoniales por transmisión de inmuebles tributan en la base del ahorro: 19/21/23/27/30 %.",
        keyPoints: [
          "Tramos del ahorro: hasta 6.000 € 19 %; hasta 50.000 € 21 %; hasta 200.000 € 23 %; hasta 300.000 € 27 %; resto 30 %.",
        ],
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
        summary:
          "IVA 10 % en entregas de vivienda nueva; 21 % en locales; obras de renovación en vivienda al 10 % si cumplen requisitos (art. 91).",
        keyPoints: [
          "Art. 91.Uno.2.10º: tipo reducido en obras de renovación y reparación de viviendas con condiciones (materiales < 40 %).",
        ],
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
        title:
          "Real Decreto Legislativo 2/2004, texto refundido de la Ley Reguladora de las Haciendas Locales (IBI, ICIO, IIVTNU; plusvalía modificada por RDL 26/2021)",
        publicationDate: "2004-03-09",
        effectiveFrom: "2021-11-10",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/rdlg/2004/03/05/2/con",
        sourceName: "BOE",
        verificationStatus: "INFERRED",
        summary:
          "Marco de IBI, ICIO y plusvalía municipal (IIVTNU). El RDL 26/2021 fija los métodos objetivo y real tras la STC 182/2021.",
        keyPoints: [
          "IIVTNU: no se devenga sin incremento de valor real.",
          "ICIO: tipo máximo 4 % sobre coste real de la obra.",
        ],
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
        title:
          "Real Decreto 390/2021, procedimiento básico para la certificación de la eficiencia energética de los edificios",
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
        title:
          "Ley 49/1960, de Propiedad Horizontal (consolidada; art. 17.12 modificado por Ley Orgánica 1/2025)",
        publicationDate: "1960-07-23",
        effectiveFrom: "2025-04-03",
        status: "in_force",
        sourceUrl: "https://www.boe.es/eli/es/l/1960/07/21/49/con",
        sourceName: "BOE",
        verificationStatus: "REVIEW_REQUIRED",
        summary:
          "División de pisos, cambios de uso y limitaciones estatutarias. La comunidad puede prohibir o condicionar el uso turístico (mayoría de 3/5), y desde abril de 2025 se requiere autorización previa de la junta para iniciar actividad turística.",
        keyPoints: [
          "Art. 10.3.b: división material de pisos requiere autorización administrativa y acuerdo de la junta (3/5).",
          "Art. 17.12: aprobación expresa de la junta para vivienda de uso turístico.",
        ],
      },
    ],
  }),
  // ── Andalucía ────────────────────────────────────────────────────────────
  reg({
    id: "reg.es.and.lista.ley7-2021",
    shortName: "LISTA (Ley 7/2021)",
    jurisdiction: JURISDICTIONS.AND,
    topics: [
      "planning",
      "zoning",
      "land_use",
      "licence",
      "responsible_declaration",
      "change_of_use",
      "building_parameters",
    ],
    assetUses: [],
    versions: [
      {
        version: "2021",
        title:
          "Ley 7/2021, de 1 de diciembre, de impulso para la sostenibilidad del territorio de Andalucía (LISTA)",
        publicationDate: "2021-12-03",
        effectiveFrom: "2021-12-23",
        status: "in_force",
        sourceUrl: "https://www.juntadeandalucia.es/boja/2021/233/1",
        sourceName: "BOJA",
        verificationStatus: "INFERRED",
        supersedes: "Ley 7/2002 (LOUA)",
        summary:
          "Marco urbanístico andaluz: instrumentos de ordenación, licencias, declaración responsable y comunicación previa, disciplina.",
        keyPoints: [
          "Art. 137–138: actos sujetos a licencia frente a declaración responsable.",
          "Cambios de uso: sujetos a licencia salvo supuestos de declaración responsable si no alteran la configuración.",
        ],
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
        sourceName: "BOJA núm. 236, 12/12/2022",
        verificationStatus: "REVIEW_REQUIRED",
        supersedes: "Decreto 60/2010 (RDUA)",
        summary:
          "Desarrollo reglamentario de la LISTA: régimen de licencias, declaraciones responsables, parcelaciones y disciplina. La fecha de entrada en vigor registrada es orientativa: su disposición final fija un plazo desde la publicación que no se ha cotejado desde el repositorio; para cualquier análisis de 2024 en adelante el reglamento está en vigor.",
        keyPoints: [
          "Título sobre intervención administrativa: procedimientos de licencia y declaración responsable.",
        ],
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
        sourceName: "BOJA núm. 206, 26/10/2021",
        verificationStatus: "REVIEW_REQUIRED",
        supersedes: "Decreto Legislativo 1/2018",
        summary:
          "Tipo general del ITP 7 % y AJD 1,2 % en Andalucía; tipos reducidos para jóvenes, VPO, familias numerosas y otros supuestos. El tipo general del 7 % se aplicaba ya desde el Decreto-ley 7/2021 (BOJA 28/04/2021); la fecha exacta de entrada en vigor de la Ley 5/2021 (disposición final) no se ha cotejado desde el repositorio, sin efecto sobre los tipos aplicados a análisis de 2022 en adelante.",
        keyPoints: [
          "ITP general 7 %.",
          "AJD general 1,2 %.",
          "Tipos reducidos condicionados: no se aplican automáticamente.",
        ],
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
        summary:
          "Requisitos de viviendas con fines turísticos; habilita a los ayuntamientos a limitar o condicionar por razones urbanísticas.",
        keyPoints: [
          "Licencia de ocupación / primera utilización y requisitos de equipamiento.",
          "Los municipios pueden limitar el número de VFT por zona.",
        ],
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
        summary:
          "Régimen de protección de bienes inscritos y de entornos; autorizaciones de la Consejería competente para intervenciones en BIC y entornos.",
        keyPoints: [
          "Intervenciones en bienes inscritos y entornos requieren autorización cultural previa a la licencia.",
        ],
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
        title:
          "Decreto 293/2009, reglamento de accesibilidad en infraestructuras, urbanización, edificación y transporte en Andalucía",
        publicationDate: "2009-07-21",
        effectiveFrom: "2009-09-21",
        status: "in_force",
        sourceUrl: "https://www.juntadeandalucia.es/boja/2009/140/1",
        sourceName: "BOJA",
        verificationStatus: "INFERRED",
        summary:
          "Condiciones de accesibilidad en edificación; aplica junto con CTE DB-SUA en cambios de uso y obras.",
        keyPoints: ["Itinerarios accesibles y condiciones en locales de pública concurrencia."],
      },
    ],
  }),
  // ── Sevilla ──────────────────────────────────────────────────────────────
  // Citas comprobadas el 2026-09-28 contra las páginas oficiales de la Gerencia
  // de Urbanismo, la Agencia Tributaria de Sevilla y el índice del BOP. Ninguna
  // pasa a VERIFIED hasta que el boletín citado se haya abierto y cotejado.
  reg({
    id: "reg.es.sevilla.pgou-2006",
    shortName: "PGOU Sevilla (TR 2006)",
    jurisdiction: JURISDICTIONS.SEVILLA,
    topics: [
      "planning",
      "zoning",
      "land_use",
      "building_parameters",
      "change_of_use",
      "subdivision",
      "protection",
    ],
    assetUses: [],
    versions: [
      {
        version: "2006-TR",
        title:
          "Texto Refundido del Plan General de Ordenación Urbanística de Sevilla (revisión aprobada definitivamente el 19/07/2006; Texto Refundido aprobado por el Pleno el 15/03/2007)",
        sourceDate: "2007-03-15",
        publicationDate: "2008-12-16",
        effectiveFrom: "2008-12-16",
        status: "in_force",
        sourceUrl:
          "https://www.urbanismosevilla.org/areas/planeamiento-desarrollo-urbanistico/pgou-vigente-1",
        sourceName:
          "BOP Sevilla núm. 290, 16/12/2008 (acuerdo plenario, memoria justificativa y Normas Urbanísticas íntegras); aprobación definitiva de la revisión: BOJA núm. 174, 07/09/2006",
        ingestedAt: REVIEWED,
        verificationStatus: "INFERRED",
        summary:
          "Ordenación estructural y pormenorizada: zonas de ordenanza (Centro Histórico, Suburbana, Manzana Cerrada, Edificación Abierta, etc.), usos compatibles, alturas y condiciones de parcela. La revisión del PGOU se aprobó definitivamente por Resolución de 19/07/2006 de la Consejería de Obras Públicas y Transportes (BOJA 174, 07/09/2006); el Texto Refundido, aprobado por el Pleno el 15/03/2007, se publicó íntegramente con sus Normas Urbanísticas en el BOP 290 de 16/12/2008. Más de cuarenta modificaciones puntuales posteriores; la MP 44 (2022) regula las viviendas de uso turístico.",
        keyPoints: [
          "Normas Urbanísticas: condiciones particulares por zona de ordenanza.",
          "Compatibilidad de usos: el uso residencial en planta baja está condicionado según zona.",
          "Superficie mínima de vivienda y condiciones de habitabilidad remiten a normativa sectorial.",
          "Comprobar las modificaciones puntuales vigentes sobre la parcela (registro de MP en la web de la Gerencia).",
        ],
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
        title:
          "Planes Especiales de Protección de los sectores del Conjunto Histórico de Sevilla (catálogos por sector)",
        effectiveFrom: "2000-01-01",
        status: "in_force",
        sourceUrl:
          "https://www.urbanismosevilla.org/areas/planeamiento-desarrollo-urbanistico/carta-de-servicios/planeamiento-urbanistico/planes-especiales",
        sourceName:
          "Gerencia de Urbanismo y Medio Ambiente de Sevilla (cada plan de sector con su aprobación definitiva y publicación en BOP Sevilla propias)",
        ingestedAt: REVIEWED,
        verificationStatus: "REVIEW_REQUIRED",
        summary:
          "Niveles de protección (A, B, C, D) por edificio catalogado en cada sector del Conjunto Histórico; determinan intervenciones admisibles. Los sectores se aprobaron uno a uno entre los años noventa y la década de 2010, con fecha y boletín distintos por sector: la fecha de vigencia registrada es un mínimo común, no la de cada plan. Algunos sectores (por ejemplo Catedral y el subsector 8.1 Encarnación) siguen sin plan especial aprobado.",
        keyPoints: [
          "Protección A/B: intervenciones muy limitadas; C/D: reforma con conservación de elementos.",
          "Consultar catálogo del sector antes de plantear demoliciones o cambios de uso.",
          "Sector sin plan especial aprobado: obras en entornos BIC con autorización de la Consejería de Cultura.",
        ],
      },
    ],
  }),
  reg({
    id: "reg.es.sevilla.pepch-entornos-bic-2026",
    shortName: "Modificación de los Planes Especiales del Conjunto Histórico: entornos BIC (Sevilla, 2026)",
    jurisdiction: JURISDICTIONS.SEVILLA,
    topics: ["heritage", "protection"],
    assetUses: [],
    versions: [
      {
        version: "2026",
        title:
          "Modificación de determinados Planes Especiales y Catálogos de Protección del Conjunto Histórico de Sevilla (20 sectores) para la regulación de los entornos de Bienes de Interés Cultural",
        sourceDate: "2026-04-16",
        effectiveFrom: "2026-04-16",
        status: "pending",
        sourceUrl: "https://www.juntadeandalucia.es/boja/2026/99/35",
        sourceName:
          "Orden de 15/05/2026 de la Consejería de Cultura (BOJA núm. 99, 26/05/2026), que delega en el Ayuntamiento la autorización de obras en entornos BIC y cita la aprobación definitiva plenaria de 16/04/2026; informe de la Comisión Provincial de Patrimonio Histórico de 04/02/2026",
        ingestedAt: REVIEWED,
        verificationStatus: "REVIEW_REQUIRED",
        summary:
          "Modifica planimetría, ordenanzas y catálogo de veinte sectores (San Gil-Alameda, San Luis, Santa Paula-Santa Lucía, San Bartolomé, San Lorenzo-San Vicente, Los Humeros, Macarena, San Bernardo, Arenal, Casa de la Moneda, Plaza de Armas, Triana, San Julián-Cruz Roja, La Trinidad, San Roque-La Florida, Prado de San Sebastián, Porvenir, La Palmera, Histórico y Puerto) únicamente para regular la protección de los entornos de BIC. Los niveles de protección por edificio no cambian. Publicación de la aprobación definitiva en el BOP y fecha exacta de entrada en vigor pendientes de comprobar: hasta entonces se registra como pendiente.",
        keyPoints: [
          "En los veinte sectores, las obras en entornos de BIC pasan a autorizarse por el Ayuntamiento (competencia delegada), con las condiciones de la modificación.",
          "Los niveles A/B/C/D del catálogo de cada sector siguen vigentes.",
          "Comprobar en la ficha de la parcela si está dentro de un entorno BIC (capa heritageSurroundings del adaptador urbanístico).",
        ],
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
        version: "2018",
        title: "Ordenanza Reguladora de Obras y Actividades del Ayuntamiento de Sevilla (OROA) y anexos",
        publicationDate: "2018-01-12",
        effectiveFrom: "2018-01-12",
        effectiveUntil: "2025-04-28",
        status: "superseded",
        supersededBy: "reg.es.sevilla.oroa.v2025",
        sourceUrl:
          "https://www.urbanismosevilla.org/areas/licencias/ordenanzas/ordenanza-reguladora-de-obras-y-actividades",
        sourceName:
          "BOP Sevilla núm. 9, 12/01/2018 (aprobación definitiva); anexos modificados por acuerdo de 31/07/2018",
        ingestedAt: REVIEWED,
        verificationStatus: "INFERRED",
        summary:
          "Texto original de la OROA: procedimientos municipales de licencia y declaración responsable para obras y actividades, documentación exigible y control. La fecha de vigencia registrada es la de publicación; la entrada en vigor exacta depende de su disposición final.",
        keyPoints: [
          "Reforma interior sin afección estructural: declaración responsable en la mayoría de supuestos.",
          "Cambio de uso a vivienda: licencia con proyecto.",
        ],
      },
      {
        version: "2025",
        title:
          "Modificación de la Ordenanza Reguladora de Obras y Actividades del Ayuntamiento de Sevilla (OROA) y sus anexos, adaptada a la LISTA y al Decreto 550/2022",
        sourceDate: "2025-04-24",
        publicationDate: "2025-04-29",
        effectiveFrom: "2025-04-29",
        status: "in_force",
        supersedes: "reg.es.sevilla.oroa.v2018",
        sourceUrl:
          "https://www.urbanismosevilla.org/areas/licencias/ordenanzas/modificacion-de-la-ordenanza-reguladora-de-obras-y-actividades-del-ayuntamiento-de-sevilla-oroa",
        sourceName: "BOP Sevilla núm. 80, 29/04/2025 (aprobación definitiva por el Pleno de 24/04/2025)",
        ingestedAt: REVIEWED,
        verificationStatus: "INFERRED",
        summary:
          "Adapta la OROA a la Ley 7/2021 (LISTA) y a su reglamento (Decreto 550/2022): amplía los supuestos sujetos a declaración responsable, regula el control posterior de obras y actividades, incorpora a los colegios profesionales y a las Entidades Certificadoras Urbanísticas en la tramitación y simplifica el procedimiento (ventanilla única y administración electrónica). La fecha de vigencia registrada es la de publicación; la entrada en vigor exacta depende de su disposición final.",
        keyPoints: [
          "Más obras y actividades por declaración responsable: comprobar en el Anexo el régimen de cada actuación antes de fijar plazos.",
          "Cambio de uso: comprobar en el Anexo si el supuesto concreto va por licencia con proyecto o por declaración responsable tras la modificación de 2025.",
          "Certificados de Entidad Certificadora Urbanística admitidos en la tramitación: pueden acortar plazos, con coste.",
        ],
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
        title:
          "Ordenanza fiscal reguladora del Impuesto sobre Construcciones, Instalaciones y Obras del Ayuntamiento de Sevilla (ejercicio 2025)",
        effectiveFrom: "2025-01-01",
        effectiveUntil: "2025-12-31",
        status: "superseded",
        supersededBy: "reg.es.sevilla.ordenanza-icio.v2026",
        sourceUrl:
          "https://www.sevilla.org/servicios/agencia-tributaria-de-sevilla/ordenanzas-fiscales/ordenanzas_2025",
        sourceName: "Agencia Tributaria de Sevilla / BOP Sevilla",
        verificationStatus: "REVIEW_REQUIRED",
        summary:
          "Tipo de gravamen del ICIO y bonificaciones (rehabilitación, accesibilidad, eficiencia energética) en Sevilla, ejercicio 2025.",
        keyPoints: ["Tipo 4 % (máximo legal)."],
      },
      {
        version: "2026",
        title:
          "Ordenanza fiscal reguladora del Impuesto sobre Construcciones, Instalaciones y Obras del Ayuntamiento de Sevilla (ejercicio 2026)",
        publicationDate: "2025-12-15",
        effectiveFrom: "2026-01-01",
        status: "in_force",
        supersedes: "reg.es.sevilla.ordenanza-icio.v2025",
        sourceUrl:
          "https://www.sevilla.org/servicios/agencia-tributaria-de-sevilla/informacion-tributaria/informacion-i-c-i-o/ordenanza-icio-2026-para-informacion-icio.pdf",
        sourceName:
          "Agencia Tributaria de Sevilla (texto de la ordenanza 2026); aprobación definitiva de las ordenanzas fiscales 2026 publicada en el BOP Sevilla de 15/12/2025",
        ingestedAt: REVIEWED,
        verificationStatus: "INFERRED",
        summary:
          "Tipo de gravamen del 4 % (art. 7), el máximo que permite el art. 102.3 del TRLHL, sobre el coste real y efectivo de la obra. Bonificaciones potestativas: 80 % en rehabilitación de edificios protegidos por el planeamiento con niveles A, B y C (reforma menor y parcial); 75 % en instalaciones solares térmicas o fotovoltaicas para autoconsumo; hasta el 95 % en obras sobre los pabellones de la Exposición de 1929; bonificación por accesibilidad sin el antiguo requisito de no percibir subvención. Las bonificaciones se solicitan y no se aplican de oficio.",
        keyPoints: [
          "Tipo de gravamen: 4 % del presupuesto de ejecución material (art. 7).",
          "Rehabilitación de edificio protegido A/B/C: bonificación del 80 % en reforma menor y parcial; solicitarla con la licencia.",
          "Autoconsumo solar: bonificación del 75 % sobre la parte de la obra dedicada a la instalación.",
          "La tasa por prestación de servicios urbanísticos se regula en otra ordenanza fiscal (no incluida aquí).",
        ],
      },
    ],
  }),
  reg({
    id: "reg.es.sevilla.vft-pgou",
    shortName: "MP 44 del PGOU: viviendas de uso turístico como hospedaje (Sevilla)",
    jurisdiction: JURISDICTIONS.SEVILLA,
    topics: ["tourism", "change_of_use", "zoning"],
    assetUses: ["residential"],
    versions: [
      {
        version: "MP44-2022",
        title:
          "Modificación Puntual 44 del Texto Refundido del PGOU de Sevilla (arts. 6.3.1, 6.5.1, 6.5.19 y otros): las viviendas de uso turístico pasan a regularse como uso terciario de hospedaje",
        sourceDate: "2022-04-28",
        effectiveFrom: "2022-06-07",
        status: "in_force",
        sourceUrl:
          "https://www.urbanismosevilla.org/areas/licencias/circulares-interpretativas/viviendas-de-usos-turisticos/m-p-44-del-t-r-del-pgou-de-los-articulos-6-3-1-6-5-1-6-5-19-y-otros-1/view",
        sourceName:
          "Gerencia de Urbanismo y Medio Ambiente de Sevilla (aprobación definitiva 28/04/2022; normativa publicada en BOP Sevilla, en vigor desde el 07/06/2022)",
        ingestedAt: REVIEWED,
        verificationStatus: "INFERRED",
        summary:
          "Adapta las Normas Urbanísticas a la Ley 13/2011 de Turismo de Andalucía: una vivienda de uso turístico deja de ser uso residencial y queda sujeta a las condiciones del uso terciario de hospedaje y a su compatibilidad con el uso residencial (acceso, situación en el edificio, zona de ordenanza). Confirmada por el TSJ de Andalucía en sentencia de 13/11/2023 (recurso 513/2022). El Registro de Turismo suspende la inscripción de actividades iniciadas después del 08/06/2022 que no acrediten la conformidad urbanística.",
        keyPoints: [
          "Una VUT nueva necesita cumplir las condiciones del uso hospedaje: comprobar viabilidad urbanística antes de asumir explotación turística.",
          "Las inscritas antes del 07/06/2022 conservan su régimen; las posteriores sin documento urbanístico no obtienen número de registro.",
          "El número máximo por barrio se regula aparte (límite del 10 %, acuerdo plenario de 2024).",
        ],
      },
    ],
  }),
  reg({
    id: "reg.es.sevilla.vut-limite-10",
    shortName: "Límite del 10 % de viviendas de uso turístico por barrio (Sevilla)",
    jurisdiction: JURISDICTIONS.SEVILLA,
    topics: ["tourism", "zoning"],
    assetUses: ["residential"],
    versions: [
      {
        version: "2024",
        title:
          "Acuerdo del Pleno del Ayuntamiento de Sevilla de 17/10/2024 por el que se limita el número máximo de viviendas de uso turístico al 10 % de las viviendas familiares de cada uno de los 108 barrios (Decreto 31/2024 de la Junta de Andalucía)",
        sourceDate: "2024-10-17",
        publicationDate: "2024-10-28",
        effectiveFrom: "2024-10-29",
        status: "in_force",
        sourceUrl: "https://www.urbanismosevilla.org/paginas/limitacion-de-viviendas-de-uso-turistico",
        sourceName:
          "BOP Sevilla núm. 210, 28/10/2024 (aprobación definitiva; aprobación inicial por urgencia el 21/03/2024)",
        ingestedAt: REVIEWED,
        verificationStatus: "INFERRED",
        summary:
          "Ningún barrio puede superar el 10 % de viviendas de uso turístico sobre su parque de viviendas familiares. Al entrar en vigor ya lo superaban once barrios del Casco Antiguo y Triana (Santa Cruz, Arenal, Alfalfa, San Bartolomé, Feria, Encarnación-Regina, Santa Catalina, San Lorenzo, San Gil, San Vicente y Triana Casco Antiguo), donde no se admiten nuevas inscripciones. El umbral se revisa por barrio y puede bajar.",
        keyPoints: [
          "Barrio saturado: sin nuevas inscripciones en el Registro de Turismo de Andalucía; la estrategia de explotación turística no es viable.",
          "El adaptador urbanístico público lee la capa de barrios saturados de IDE Sevilla; el dato de la capa manda sobre la lista anterior.",
          "Umbral revisable por barrio: comprobar el estado actual antes de cerrar una compra con tesis turística.",
        ],
      },
    ],
  }),
  // ── Dos Hermanas ─────────────────────────────────────────────────────────
  // Búsqueda de geoservicios el 2026-09-30: el Ayuntamiento no publica capas de
  // planeamiento (ArcGIS REST / WFS); el PGOU se difunde en PDF en su web.
  reg({
    id: "reg.es.doshermanas.pgou-2002",
    shortName: "PGOU Dos Hermanas (2002, adaptado a la LOUA en 2008)",
    jurisdiction: JURISDICTIONS.DOS_HERMANAS,
    topics: ["planning", "zoning", "land_use", "building_parameters", "change_of_use", "subdivision"],
    assetUses: [],
    versions: [
      {
        version: "2002",
        title:
          "II Plan General de Ordenación Urbanística de Dos Hermanas (aprobación definitiva 26/07/2002) y su Adaptación Parcial a la Ley 7/2002 (Pleno de 07/11/2008), con las innovaciones y modificaciones posteriores",
        sourceDate: "2002-07-26",
        publicationDate: "2002-08-07",
        effectiveFrom: "2002-08-07",
        status: "in_force",
        sourceUrl:
          "https://www.doshermanas.es/concejalias/urbanismo/Instrumentos-Ordenacion-Urbanistica/pgou/",
        sourceName:
          "BOP Sevilla núm. 182, 07/08/2002 (aprobación definitiva de 26/07/2002); Adaptación Parcial a la LOUA aprobada por el Pleno el 07/11/2008; documentos en la web del Ayuntamiento de Dos Hermanas",
        ingestedAt: "2026-09-30T00:00:00.000Z",
        verificationStatus: "REVIEW_REQUIRED",
        summary:
          "Instrumento de planeamiento general vigente en Dos Hermanas: clasificación y calificación del suelo, ordenanzas por zona, usos y parámetros de edificación. Sin geoservicio público: la calificación de una parcela concreta debe consultarse en los planos del PGOU (PDF) o en la Concejalía de Urbanismo. Más de diez innovaciones y modificaciones posteriores (por ejemplo, Innovación 8 «Antiguo Hipervalme», BOJA 106/2008; reordenación de equipamientos docentes, BOJA 96/2016): comprobar las que afectan a la parcela. Las fechas citadas proceden de la web municipal y del BOJA y no se han cotejado contra el BOP desde el repositorio.",
        keyPoints: [
          "Calificación, altura y usos de la parcela: planos del PGOU y ordenanzas de zona; no hay capa consultable en línea.",
          "Comprobar en el registro municipal de instrumentos las innovaciones vigentes sobre la parcela.",
          "Licencias y declaración responsable: ordenanza municipal de obras no incluida en el registro (laguna declarada).",
        ],
      },
    ],
  }),
  // ── Alcalá de Guadaíra ───────────────────────────────────────────────────
  // Búsqueda de geoservicios el 2026-09-30: sin capas de planeamiento publicadas;
  // texto refundido del PGOU 94 en PDF en la web municipal; nuevo PGOU en tramitación.
  reg({
    id: "reg.es.alcala-guadaira.pgou-1994",
    shortName: "PGOU Alcalá de Guadaíra (1994, adaptado a la LOUA en 2009)",
    jurisdiction: JURISDICTIONS.ALCALA_DE_GUADAIRA,
    topics: ["planning", "zoning", "land_use", "building_parameters", "change_of_use", "subdivision"],
    assetUses: [],
    versions: [
      {
        version: "1994-TR2023",
        title:
          "Revisión-Adaptación del Plan General Municipal de Ordenación de Alcalá de Guadaíra (aprobación definitiva por Resolución de 21/03/1994), Adaptación Parcial a la LOUA (Pleno de 16/07/2009) y Texto Refundido de las Normas Urbanísticas actualizado (septiembre de 2023)",
        sourceDate: "1994-03-21",
        effectiveFrom: "1994-03-21",
        status: "in_force",
        sourceUrl: "https://www.juntadeandalucia.es/boja/1994/43/9",
        sourceName:
          "BOJA núm. 43 de 1994 (Resolución de 21/03/1994); Adaptación Parcial a la LOUA de 16/07/2009 y Texto Refundido del PGOU 94 actualizado (sept. 2023) en la web del Ayuntamiento de Alcalá de Guadaíra; modificación sobre instalaciones solares: Orden de 31/03/2023, BOJA núm. 143, 26/07/2023",
        ingestedAt: "2026-09-30T00:00:00.000Z",
        verificationStatus: "REVIEW_REQUIRED",
        summary:
          "Planeamiento general vigente en Alcalá de Guadaíra: el PGOU de 1994 con su adaptación parcial a la LOUA y las modificaciones posteriores, refundidas por el Ayuntamiento en septiembre de 2023. Sin geoservicio público: la calificación de una parcela debe consultarse en los planos del texto refundido (PDF) o en el Servicio de Urbanismo. Hay un nuevo PGOU en tramitación (aprobación inicial acordada por el Pleno; fecha y estado actual pendientes de cotejo) que no se aplica hasta su aprobación definitiva y publicación. La fecha de vigencia registrada es la de la resolución de aprobación, no la de su publicación (día pendiente de cotejo).",
        keyPoints: [
          "Calificación, altura y usos: texto refundido del PGOU 94 (sept. 2023) y sus planos; no hay capa consultable en línea.",
          "Nuevo PGOU en tramitación: no aplicable; puede cambiar la ordenación de la parcela a medio plazo.",
          "Licencias y declaración responsable: ordenanza municipal no incluida en el registro (laguna declarada).",
        ],
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

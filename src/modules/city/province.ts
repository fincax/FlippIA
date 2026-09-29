import { normalizeText } from "./registry";

/**
 * Municipalities of the province of Sevilla other than the capital. FlippIA
 * covers the city of Sevilla today: an address in any of these must be told
 * so, never analysed with Sevilla's PGOU, ordinances or microzones. Names
 * only (INE codes are added with the municipality's own CityProfile).
 */
export const SEVILLA_PROVINCE_MUNICIPALITIES: readonly string[] = [
  "Aguadulce",
  "Alanís",
  "Albaida del Aljarafe",
  "Alcalá de Guadaíra",
  "Alcalá del Río",
  "Alcolea del Río",
  "Algámitas",
  "Almadén de la Plata",
  "Almensilla",
  "Arahal",
  "Aznalcázar",
  "Aznalcóllar",
  "Badolatosa",
  "Benacazón",
  "Bollullos de la Mitación",
  "Bormujos",
  "Brenes",
  "Burguillos",
  "Cañada Rosal",
  "Camas",
  "Cantillana",
  "Carmona",
  "Carrión de los Céspedes",
  "Casariche",
  "Castilblanco de los Arroyos",
  "Castilleja de Guzmán",
  "Castilleja de la Cuesta",
  "Castilleja del Campo",
  "Cazalla de la Sierra",
  "Constantina",
  "Coria del Río",
  "Coripe",
  "El Castillo de las Guardas",
  "El Coronil",
  "El Cuervo de Sevilla",
  "El Garrobo",
  "El Madroño",
  "El Palmar de Troya",
  "El Pedroso",
  "El Real de la Jara",
  "El Ronquillo",
  "El Rubio",
  "El Saucejo",
  "El Viso del Alcor",
  "Écija",
  "Espartinas",
  "Estepa",
  "Fuentes de Andalucía",
  "Gelves",
  "Gerena",
  "Gilena",
  "Gines",
  "Guadalcanal",
  "Guillena",
  "Herrera",
  "Huévar del Aljarafe",
  "Isla Mayor",
  "La Algaba",
  "La Campana",
  "La Lantejuela",
  "La Luisiana",
  "La Puebla de Cazalla",
  "La Puebla de los Infantes",
  "La Puebla del Río",
  "La Rinconada",
  "La Roda de Andalucía",
  "Las Cabezas de San Juan",
  "Las Navas de la Concepción",
  "Lebrija",
  "Lora de Estepa",
  "Lora del Río",
  "Los Corrales",
  "Los Molares",
  "Los Palacios y Villafranca",
  "Mairena del Alcor",
  "Mairena del Aljarafe",
  "Marchena",
  "Marinaleda",
  "Martín de la Jara",
  "Montellano",
  "Morón de la Frontera",
  "Olivares",
  "Osuna",
  "Palomares del Río",
  "Paradas",
  "Pedrera",
  "Peñaflor",
  "Pilas",
  "Pruna",
  "Salteras",
  "San Juan de Aznalfarache",
  "San Nicolás del Puerto",
  "Sanlúcar la Mayor",
  "Santiponce",
  "Tocina",
  "Tomares",
  "Umbrete",
  "Utrera",
  "Valencina de la Concepción",
  "Villamanrique de la Condesa",
  "Villanueva de San Juan",
  "Villanueva del Ariscal",
  "Villanueva del Río y Minas",
  "Villaverde del Río",
  "Dos Hermanas",
];

/** Single-word names that are also streets, squares or common words in Sevilla: only a locality position counts for them. */
const AMBIGUOUS = new Set(
  [
    "Camas",
    "Carmona",
    "Osuna",
    "Marchena",
    "Écija",
    "Lebrija",
    "Utrera",
    "Estepa",
    "Paradas",
    "Pilas",
    "Brenes",
    "Herrera",
    "Gines",
    "Tocina",
    "Gelves",
    "Arahal",
    "Pruna",
    "Coripe",
    "Pedrera",
    "Gilena",
    "Gerena",
    "Olivares",
    "Salteras",
    "Umbrete",
    "Tomares",
    "Bormujos",
    "Guillena",
    "Burguillos",
    "Montellano",
    "Santiponce",
    "Cantillana",
    "Constantina",
    "Marinaleda",
    "Espartinas",
    "Badolatosa",
    "Casariche",
    "Alanís",
    "Aguadulce",
    "Peñaflor",
    "Guadalcanal",
    "Benacazón",
    "Almensilla",
    "Aznalcóllar",
    "Aznalcázar",
    "Algámitas",
  ].map(normalizeText),
);

const STREET_WORDS =
  /(?:calle|c\/|avenida|avda\.?|av\.?|plaza|pza\.?|paseo|ronda|puerta|camino|carretera|glorieta|barriada|bda\.?|duque de|conde de|marqués de|marques de|de)\s*$/i;

/**
 * Municipality of the province named in a free-text address, when it is not
 * the covered city. Multi-word names match anywhere; ambiguous single words
 * only in a locality position (after a comma or "en", not preceded by a
 * street word and not followed by a street number). Deterministic.
 */
export function municipalityFromText(text: string, coveredCity = "Sevilla"): string | undefined {
  const t = ` ${normalizeText(text)} `;
  const covered = normalizeText(coveredCity);
  let best: { name: string; len: number } | undefined;
  for (const name of SEVILLA_PROVINCE_MUNICIPALITIES) {
    const n = normalizeText(name);
    if (n === covered) continue;
    const re = new RegExp(`(^|[\\s,(])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[\\s,).]|$)`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const start = m.index + (m[1] ?? "").length;
      const before = t.slice(0, start);
      const after = t.slice(start + n.length);
      if (STREET_WORDS.test(before.trimEnd() + " ")) continue;
      if (AMBIGUOUS.has(n)) {
        const locality = /(,|\ben)\s*$/.test(before) && !/^\s*,?\s*(n[ºo°.]?\s*)?\d/.test(after);
        if (!locality) continue;
      }
      if (!best || n.length > best.len) best = { name, len: n.length };
    }
  }
  return best?.name;
}

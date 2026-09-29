import type { IntakeRequest } from "@/modules/property/intake";
import { municipalityFromText } from "./province";
import { cityByName, defaultCity } from "./registry";
import type { CityProfile } from "./types";

/**
 * City an intake belongs to: the municipality named in the address when it
 * is covered; the default city otherwise (the intake agent refuses a named
 * municipality that is not covered, so nothing is ever analysed with another
 * city's data).
 */
export function cityForIntake(intake: IntakeRequest): CityProfile {
  const text = [intake.property?.address, intake.rawText].filter(Boolean).join(" ");
  const municipality = intake.property?.municipality ?? municipalityFromText(text, "");
  return cityByName(municipality) ?? defaultCity();
}

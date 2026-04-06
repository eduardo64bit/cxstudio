import { ELEMENT_ID_MAX } from "../constants/fieldLimits";

/** Normaliza texto digitado para ID (trim, espaços → hífen, limite de tamanho). */
export function sanitizeFlowElementId(raw: string): string {
  return raw.trim().replace(/\s+/g, "-").slice(0, ELEMENT_ID_MAX);
}

export interface LaneColorSet {
  light: string;
  medium: string;
  strong: string;
}

/**
 * Paleta por **famílias nomeáveis** (azul, verde, verde-água, vermelho…), com poucos tons por família.
 *
 * **Ordem no array (lógica de intercalação):** em vez de listar todos os azuis seguidos, fazemos **rodadas**
 * fixas — azul → verde → verde-água → vermelho → laranja → amarelo → rosa → cinza — e repetimos a
 * rodada com o 2º tom de cada família, depois o 3º onde existir. Assim **nunca duas raias consecutivas**
 * (índice 0 e 1, 1 e 2…) caem na mesma família: evita “tom sobre tom” e dá ritmo visual confortável,
 * ainda sem parecer uma fórmula abstrata — é só “uma de cada tipo” antes de voltar num tom parecido.
 */
export const LANE_COLOR_PALETTE: LaneColorSet[] = [
  // Rodada 1 — um de cada família
  { light: "#EEF4FC", medium: "#C5D9F5", strong: "#2F6FAD" }, // azul 1
  { light: "#EEF7F0", medium: "#B8DFC4", strong: "#2F6B45" }, // verde 1
  { light: "#E8F7F6", medium: "#A8E5E0", strong: "#2A7A74" }, // verde-água 1
  { light: "#FCEEED", medium: "#F0B8B4", strong: "#A83C38" }, // vermelho 1
  { light: "#FDF3E8", medium: "#F5D4B0", strong: "#B56E28" }, // laranja 1
  { light: "#FDF8E8", medium: "#F5E5A8", strong: "#8F7320" }, // amarelo 1
  { light: "#FCEEF5", medium: "#F0B8D4", strong: "#A84878" }, // rosa 1
  { light: "#F1F3F5", medium: "#D1D8E0", strong: "#5A6570" }, // cinza 1

  // Rodada 2
  { light: "#E8F2FA", medium: "#A8C8E8", strong: "#1E5A8C" }, // azul 2
  { light: "#EDF8F2", medium: "#A8E3C8", strong: "#2D7A55" }, // verde 2
  { light: "#E6F5F5", medium: "#9DD9D9", strong: "#256F6F" }, // verde-água 2
  { light: "#F5EAEC", medium: "#D9A8B0", strong: "#8F3D4D" }, // vermelho 2
  { light: "#FFF2E6", medium: "#FFD4A8", strong: "#A65F20" }, // laranja 2
  { light: "#FCF6E3", medium: "#F0DCA0", strong: "#7A6218" }, // amarelo 2
  { light: "#F5ECF7", medium: "#DEB8E8", strong: "#8B4899" }, // rosa 2
  { light: "#EEF0F3", medium: "#C8CED6", strong: "#4A5562" }, // cinza 2

  // Rodada 3 — famílias com 3º tom (as de 2 tons já esgotaram na rodada 2)
  { light: "#ECF7FC", medium: "#B8E0F0", strong: "#2A7A9A" }, // azul 3
  { light: "#F4F6ED", medium: "#D0D9B8", strong: "#5C6B3A" }, // verde 3
  { light: "#FCEFEC", medium: "#F0C4B8", strong: "#B55A42" }, // vermelho 3
  { light: "#F5F3F0", medium: "#E0DAD4", strong: "#6B625C" }, // cinza 3
];

export const MAX_LANE_COLORS = 20;
export const DEFAULT_LANE_STRONG_COLORS = LANE_COLOR_PALETTE.slice(0, MAX_LANE_COLORS).map((c) => c.strong);

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function parseHexColor(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${clampByte(r).toString(16).padStart(2, "0")}${clampByte(g).toString(16).padStart(2, "0")}${clampByte(b).toString(16).padStart(2, "0")}`.toUpperCase();
}

function mixWithWhite(hex: string, whiteRatio: number): string {
  const rgb = parseHexColor(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  const w = Math.max(0, Math.min(1, whiteRatio));
  return toHex([
    r * (1 - w) + 255 * w,
    g * (1 - w) + 255 * w,
    b * (1 - w) + 255 * w,
  ] as [number, number, number]);
}

export function normalizeHexColor(value: string, fallback: string): string {
  const rgb = parseHexColor(value);
  if (!rgb) return fallback;
  return toHex(rgb);
}

export function buildLaneColorSetFromStrong(strong: string): LaneColorSet {
  const normalizedStrong = normalizeHexColor(strong, "#64748B");
  return {
    strong: normalizedStrong,
    medium: mixWithWhite(normalizedStrong, 0.72),
    light: mixWithWhite(normalizedStrong, 0.9),
  };
}

export function getLaneColorSet(laneIndex: number, laneStrongColors?: string[]): LaneColorSet {
  if (laneStrongColors && laneStrongColors.length > 0) {
    const idx = laneIndex % laneStrongColors.length;
    const strong = normalizeHexColor(laneStrongColors[idx] ?? DEFAULT_LANE_STRONG_COLORS[0], DEFAULT_LANE_STRONG_COLORS[0]);
    const defaultSet = LANE_COLOR_PALETTE[laneIndex % LANE_COLOR_PALETTE.length];
    if (defaultSet && strong === defaultSet.strong.toUpperCase()) {
      // Mantém exatamente a paleta original quando a cor padrão não foi alterada.
      return defaultSet;
    }
    return buildLaneColorSetFromStrong(strong);
  }
  return LANE_COLOR_PALETTE[laneIndex % LANE_COLOR_PALETTE.length];
}

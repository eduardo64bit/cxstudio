/** Formas disponíveis para o ponto de rota (sem círculo / quadrado / losango). */
export const ANCHOR_SHAPE_VALUES = [
  "single-center",
  "cross",
  "elbow-tl",
  "elbow-tr",
  "elbow-bl",
  "elbow-br",
  "elbow-left-double",
  "elbow-right-double",
  "elbow-top-double",
  "elbow-bottom-double",
  "elbow-top-left-bottom-right",
  "elbow-top-right-bottom-left",
  "line-h",
  "line-v",
] as const;

export type AnchorShape = (typeof ANCHOR_SHAPE_VALUES)[number];
export type AnchorSide = "top" | "right" | "bottom" | "left";

export const DEFAULT_ANCHOR_SHAPE: AnchorShape = "single-center";
/** Mesmo raio dos conectores ortogonais, limitado pelo glifo 32×32. */
const ORTHO_CORNER_RADIUS = 12;
export const ANCHOR_ELBOW_CORNER_RADIUS = Math.min(ORTHO_CORNER_RADIUS, 8);

export const ANCHOR_SHAPE_LABELS: Record<AnchorShape, string> = {
  "single-center": "Ponto único (centro)",
  cross: "Cruz",
  "elbow-tl": "Cotovelo ↖",
  "elbow-tr": "Cotovelo ↗",
  "elbow-bl": "Cotovelo ↙",
  "elbow-br": "Cotovelo ↘",
  "elbow-left-double": "Duplo cotovelo à esquerda",
  "elbow-right-double": "Duplo cotovelo à direita",
  "elbow-top-double": "Duplo cotovelo acima",
  "elbow-bottom-double": "Duplo cotovelo abaixo",
  "elbow-top-left-bottom-right": "Intercalado sup-esq / inf-dir",
  "elbow-top-right-bottom-left": "Intercalado sup-dir / inf-esq",
  "line-h": "Linha horizontal",
  "line-v": "Linha vertical",
};

/**
 * Grade 2×5 no editor para seguir o arranjo visual pedido.
 * `null` = célula vazia.
 */
export const ANCHOR_SHAPE_MATRIX: readonly (readonly (AnchorShape | null)[])[] = [
  ["single-center", "elbow-br", "elbow-bottom-double", "elbow-bl"],
  ["line-h", "elbow-right-double", "cross", "elbow-left-double"],
  ["line-v", "elbow-tr", "elbow-top-double", "elbow-tl"],
  ["elbow-top-right-bottom-left", "elbow-top-left-bottom-right", null, null],
] as const;

const LEGACY_ANCHOR_SHAPES_REMOVED = new Set(["circle", "diamond", "square"]);

export function normalizeAnchorShape(value: unknown): AnchorShape {
  if (typeof value === "string") {
    if (LEGACY_ANCHOR_SHAPES_REMOVED.has(value)) return DEFAULT_ANCHOR_SHAPE;
    if ((ANCHOR_SHAPE_VALUES as readonly string[]).includes(value)) {
      return value as AnchorShape;
    }
  }
  return DEFAULT_ANCHOR_SHAPE;
}

export function anchorShapePathDs(shape: AnchorShape): readonly string[] {
  const r = ANCHOR_ELBOW_CORNER_RADIUS;
  const innerMin = 16 - r;
  const innerMax = 16 + r;
  switch (shape) {
    case "elbow-tl":
      return [`M 4 16 L ${innerMin} 16 a ${r} ${r} 0 0 0 ${r} ${-r} L 16 4`];
    case "elbow-tr":
      return [`M 28 16 L ${innerMax} 16 a ${r} ${r} 0 0 1 ${-r} ${-r} L 16 4`];
    case "elbow-bl":
      return [`M 4 16 L ${innerMin} 16 a ${r} ${r} 0 0 1 ${r} ${r} L 16 28`];
    case "elbow-br":
      return [`M 28 16 L ${innerMax} 16 a ${r} ${r} 0 0 0 ${-r} ${r} L 16 28`];
    case "elbow-left-double":
      return [
        `M 16 4 L 16 ${innerMin} a ${r} ${r} 0 0 1 ${-r} ${r} L 4 16`,
        `M 16 28 L 16 ${innerMax} a ${r} ${r} 0 0 0 ${-r} ${-r} L 4 16`,
      ];
    case "elbow-right-double":
      return [
        `M 16 4 L 16 ${innerMin} a ${r} ${r} 0 0 0 ${r} ${r} L 28 16`,
        `M 16 28 L 16 ${innerMax} a ${r} ${r} 0 0 1 ${r} ${-r} L 28 16`,
      ];
    case "elbow-top-double":
      return [
        `M 4 16 L ${innerMin} 16 a ${r} ${r} 0 0 0 ${r} ${-r} L 16 4`,
        `M 28 16 L ${innerMax} 16 a ${r} ${r} 0 0 1 ${-r} ${-r} L 16 4`,
      ];
    case "elbow-bottom-double":
      return [
        `M 4 16 L ${innerMin} 16 a ${r} ${r} 0 0 1 ${r} ${r} L 16 28`,
        `M 28 16 L ${innerMax} 16 a ${r} ${r} 0 0 0 ${-r} ${r} L 16 28`,
      ];
    case "elbow-top-left-bottom-right":
      return [
        `M 4 16 L ${innerMin} 16 a ${r} ${r} 0 0 0 ${r} ${-r} L 16 4`,
        `M 28 16 L ${innerMax} 16 a ${r} ${r} 0 0 0 ${-r} ${r} L 16 28`,
      ];
    case "elbow-top-right-bottom-left":
      return [
        `M 28 16 L ${innerMax} 16 a ${r} ${r} 0 0 1 ${-r} ${-r} L 16 4`,
        `M 4 16 L ${innerMin} 16 a ${r} ${r} 0 0 1 ${r} ${r} L 16 28`,
      ];
    case "single-center":
    default:
      return [];
  }
}

export function anchorConnectedSides(shape: AnchorShape): Readonly<Record<AnchorSide, boolean>> {
  switch (shape) {
    case "cross":
      return { top: true, right: true, bottom: true, left: true };
    case "single-center":
      return { top: false, right: false, bottom: false, left: false };
    case "line-h":
      return { top: false, right: true, bottom: false, left: true };
    case "line-v":
      return { top: true, right: false, bottom: true, left: false };
    case "elbow-tl":
      return { top: true, right: false, bottom: false, left: true };
    case "elbow-tr":
      return { top: true, right: true, bottom: false, left: false };
    case "elbow-bl":
      return { top: false, right: false, bottom: true, left: true };
    case "elbow-br":
      return { top: false, right: true, bottom: true, left: false };
    case "elbow-left-double":
      return { top: true, right: false, bottom: true, left: true };
    case "elbow-right-double":
      return { top: true, right: true, bottom: true, left: false };
    case "elbow-top-double":
      return { top: true, right: true, bottom: false, left: true };
    case "elbow-bottom-double":
      return { top: false, right: true, bottom: true, left: true };
    case "elbow-top-left-bottom-right":
    case "elbow-top-right-bottom-left":
      return { top: true, right: true, bottom: true, left: true };
  }
}

/** Fragmento SVG em coordenadas 0–32 (para exportação, dentro de `<g transform="…">`). */
export function anchorSvgInnerXml(shape: AnchorShape, strokeEscaped: string): string {
  const s = normalizeAnchorShape(shape);
  const sw = "2";
  const bridgeR = Math.max(3, ANCHOR_ELBOW_CORNER_RADIUS - 3);
  const bridgeStartX = 16 - bridgeR;
  const bridgeEndX = 16 + bridgeR;
  switch (s) {
    case "single-center":
      return `<circle cx="16" cy="16" r="3.25" fill="#ffffff" stroke="${strokeEscaped}" stroke-width="2"/>`;
    case "cross":
      return `<line x1="16" y1="4" x2="16" y2="28" stroke="${strokeEscaped}" stroke-width="${sw}" stroke-linecap="round"/><line x1="4" y1="16" x2="${bridgeStartX}" y2="16" stroke="${strokeEscaped}" stroke-width="${sw}" stroke-linecap="round"/><path d="M ${bridgeStartX} 16 a ${bridgeR} ${bridgeR} 0 0 1 ${bridgeR * 2} 0" fill="none" stroke="${strokeEscaped}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/><line x1="${bridgeEndX}" y1="16" x2="28" y2="16" stroke="${strokeEscaped}" stroke-width="${sw}" stroke-linecap="round"/>`;
    case "elbow-tl":
    case "elbow-tr":
    case "elbow-bl":
    case "elbow-br":
    case "elbow-left-double":
    case "elbow-right-double":
    case "elbow-top-double":
    case "elbow-bottom-double":
    case "elbow-top-left-bottom-right":
    case "elbow-top-right-bottom-left":
      return anchorShapePathDs(s)
        .map(
          (d) =>
            `<path d="${d}" fill="none" stroke="${strokeEscaped}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`,
        )
        .join("");
    case "line-h":
      return `<line x1="4" y1="16" x2="28" y2="16" stroke="${strokeEscaped}" stroke-width="${sw}" stroke-linecap="round"/>`;
    case "line-v":
      return `<line x1="16" y1="4" x2="16" y2="28" stroke="${strokeEscaped}" stroke-width="${sw}" stroke-linecap="round"/>`;
  }
}

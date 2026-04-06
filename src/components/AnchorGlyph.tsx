import type { AnchorShape } from "../constants/anchorShapes";
import {
  ANCHOR_ELBOW_CORNER_RADIUS,
  anchorConnectedSides,
  anchorShapePathDs,
  normalizeAnchorShape,
} from "../constants/anchorShapes";

interface AnchorGlyphProps {
  shape: AnchorShape | undefined;
  className?: string;
  /** Tamanho em px (viewBox continua 32×32). */
  size?: number;
}

/**
 * Desenho do ponto de rota (32×32). Mesma geometria usada na exportação SVG.
 */
export default function AnchorGlyph({ shape, className, size = 32 }: AnchorGlyphProps) {
  const s = normalizeAnchorShape(shape);
  const shapePaths = anchorShapePathDs(s);
  const connected = anchorConnectedSides(s);
  const bridgeR = Math.max(3, ANCHOR_ELBOW_CORNER_RADIUS - 3);
  const bridgeStartX = 16 - bridgeR;
  const bridgeEndX = 16 + bridgeR;

  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden
    >
      {s === "cross" ? (
        <>
          <line className="flow-node__anchor-glyph-stroke flow-node__anchor-glyph-stroke--under" x1="16" y1="4" x2="16" y2="28" />
          <line className="flow-node__anchor-glyph-stroke" x1="4" y1="16" x2={bridgeStartX} y2="16" />
          <path
            className="flow-node__anchor-glyph-stroke"
            d={`M ${bridgeStartX} 16 a ${bridgeR} ${bridgeR} 0 0 1 ${bridgeR * 2} 0`}
            fill="none"
          />
          <line className="flow-node__anchor-glyph-stroke" x1={bridgeEndX} y1="16" x2="28" y2="16" />
        </>
      ) : null}
      {/* Cotovelos: arco relativo `a` para o fillet ficar para dentro do L (centro do raio no quadrante interno). */}
      {shapePaths.map((d, idx) => (
        <path key={`anchor-seg-${idx}`} className="flow-node__anchor-glyph-stroke" d={d} fill="none" />
      ))}
      <circle
        className={`flow-node__anchor-glyph-point${connected.top ? "" : " flow-node__anchor-glyph-point--inactive"}${s === "cross" ? " flow-node__anchor-glyph-point--under" : ""}`}
        cx="16"
        cy="4"
        r="3"
      />
      <circle
        className={`flow-node__anchor-glyph-point${connected.right ? "" : " flow-node__anchor-glyph-point--inactive"}`}
        cx="28"
        cy="16"
        r="3"
      />
      <circle
        className={`flow-node__anchor-glyph-point${connected.bottom ? "" : " flow-node__anchor-glyph-point--inactive"}${s === "cross" ? " flow-node__anchor-glyph-point--under" : ""}`}
        cx="16"
        cy="28"
        r="3"
      />
      <circle
        className={`flow-node__anchor-glyph-point${connected.left ? "" : " flow-node__anchor-glyph-point--inactive"}`}
        cx="4"
        cy="16"
        r="3"
      />
      {s === "line-h" ? (
        <line className="flow-node__anchor-glyph-stroke" x1="4" y1="16" x2="28" y2="16" />
      ) : null}
      {s === "line-v" ? (
        <line className="flow-node__anchor-glyph-stroke" x1="16" y1="4" x2="16" y2="28" />
      ) : null}
      {s === "single-center" ? <circle className="flow-node__anchor-glyph-point-center" cx="16" cy="16" r="4" /> : null}
    </svg>
  );
}

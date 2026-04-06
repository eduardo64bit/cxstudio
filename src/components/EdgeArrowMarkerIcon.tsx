import { ArrowLeft, ArrowRight, Minus } from "lucide-react";

export type EdgeArrowMarkerOption = "none" | "arrow";

export const EDGE_ARROW_MARKER_OPTIONS: EdgeArrowMarkerOption[] = ["none", "arrow"];

export const EDGE_ARROW_MARKER_LABELS: Record<EdgeArrowMarkerOption, string> = {
  none: "Sem seta",
  arrow: "Com seta",
};

/** Ícones para pontas: sem seta (tracinho, como conector reto), ou seta em contorno (fluxo usa ponta preenchida). */
export function EdgeArrowMarkerIcon({
  option,
  size = 18,
  /** Destino: seta para a direita; origem: para a esquerda (padrão). */
  arrowPointsRight = false,
}: {
  option: EdgeArrowMarkerOption;
  size?: number;
  arrowPointsRight?: boolean;
}) {
  const common = { size, strokeWidth: 2 as const, "aria-hidden": true as const };
  switch (option) {
    case "none":
      return <Minus {...common} />;
    case "arrow":
      return arrowPointsRight ? <ArrowRight {...common} /> : <ArrowLeft {...common} />;
  }
}

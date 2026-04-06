export const FLOW_EDGE_LINE_STYLES = ["solid", "dashed", "dotted"] as const;
export type FlowEdgeLineStyle = (typeof FLOW_EDGE_LINE_STYLES)[number];

export const EDGE_LINE_STYLE_LABELS: Record<FlowEdgeLineStyle, string> = {
  solid: "Linha padrão",
  dashed: "Linha tracejada",
  dotted: "Linha pontilhada",
};

export function isFlowEdgeLineStyle(value: string | undefined): value is FlowEdgeLineStyle {
  return value === "solid" || value === "dashed" || value === "dotted";
}

export function normalizeEdgeLineStyle(value: unknown): FlowEdgeLineStyle {
  if (typeof value === "string" && isFlowEdgeLineStyle(value)) return value;
  return "solid";
}

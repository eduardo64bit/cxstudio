import { ConnectionLineType } from "@xyflow/react";

/** Tipos nativos do @xyflow para arestas (ver `builtinEdgeTypes`). */
export const FLOW_EDGE_PATH_TYPES = ["smoothstep", "default", "straight"] as const;
export type FlowEdgePathType = (typeof FLOW_EDGE_PATH_TYPES)[number];

/** Padrão do app: ortogonal com cantos arredondados (`smoothstep`). */
export const DEFAULT_FLOW_EDGE_PATH_TYPE: FlowEdgePathType = "smoothstep";

export const EDGE_PATH_LABELS: Record<FlowEdgePathType, string> = {
  default: "Curva",
  straight: "Linha",
  smoothstep: "Ortogonal (90°)",
};

export function isFlowEdgePathType(value: string | undefined): value is FlowEdgePathType {
  return value !== undefined && (FLOW_EDGE_PATH_TYPES as readonly string[]).includes(value);
}

export function normalizeEdgePathType(value: string | undefined): FlowEdgePathType {
  if (value === "step") return "smoothstep";
  if (isFlowEdgePathType(value)) return value;
  return DEFAULT_FLOW_EDGE_PATH_TYPE;
}

export function connectionLineTypeFromEdgePath(t: string | undefined): ConnectionLineType {
  switch (t) {
    case "straight":
      return ConnectionLineType.Straight;
    case "smoothstep":
      return ConnectionLineType.SmoothStep;
    case "step":
      return ConnectionLineType.Step;
    default:
      return ConnectionLineType.Bezier;
  }
}

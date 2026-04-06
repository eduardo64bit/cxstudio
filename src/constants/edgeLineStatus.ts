import type { FlowEdgeLineStatus } from "../types/flow";

/** Ordem no painel: verde → âmbar → vermelho (semáforo “bom → atenção → parar”). */
export const FLOW_EDGE_LINE_STATUSES = ["green", "amber", "red"] as const satisfies readonly FlowEdgeLineStatus[];

/** Cores do traço e das setas (fora do tema cinza padrão). */
export const FLOW_EDGE_STATUS_HEX: Record<FlowEdgeLineStatus, string> = {
  red: "#dc2626",
  amber: "#d97706",
  green: "#15803d",
};

export const FLOW_EDGE_STATUS_LABELS: Record<FlowEdgeLineStatus, string> = {
  red: "Vermelho",
  amber: "Âmbar",
  green: "Verde",
};

export function normalizeFlowEdgeLineStatus(data: Record<string, unknown> | undefined): FlowEdgeLineStatus | undefined {
  if (!data) return undefined;
  const s = data.lineStatus;
  if (s === "red" || s === "amber" || s === "green") return s;
  if (data.lineAlert === true) return "red";
  return undefined;
}

import { normalizeEdgeLineStyle } from "../constants/edgeLineAppearance";
import { FLOW_EDGE_STATUS_HEX, normalizeFlowEdgeLineStatus } from "../constants/edgeLineStatus";
import type { FlowEdge, FlowEdgeLineStatus } from "../types/flow";

/** Mantém `className` da aresta e cor dos marcadores alinhados a `data.lineStatus` (e legado `lineAlert`) / `data.lineStyle`. */
export function applyEdgeLineAppearance(edge: FlowEdge): FlowEdge {
  const rawData = edge.data as Record<string, unknown> | undefined;
  const status: FlowEdgeLineStatus | undefined = normalizeFlowEdgeLineStatus(rawData);
  const ls = normalizeEdgeLineStyle(edge.data?.lineStyle);
  const dashed = ls === "dashed";
  const dotted = ls === "dotted";
  const color = status ? FLOW_EDGE_STATUS_HEX[status] : null;

  let markerStart = edge.markerStart;
  let markerEnd = edge.markerEnd;

  if (markerStart && typeof markerStart === "object" && markerStart !== null && !Array.isArray(markerStart)) {
    markerStart = { ...markerStart, color };
  }
  if (markerEnd && typeof markerEnd === "object" && markerEnd !== null && !Array.isArray(markerEnd)) {
    markerEnd = { ...markerEnd, color };
  }

  const statusClass = status ? `flow-edge-line-status--${status}` : "";
  const className =
    [statusClass, dashed && "flow-edge-line-dashed", dotted && "flow-edge-line-dotted"].filter(Boolean).join(" ") ||
    undefined;

  return { ...edge, markerStart, markerEnd, className };
}

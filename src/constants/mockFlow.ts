import type { FlowEdge, FlowJson } from "../types/flow";
import { buildInitialMockFlow } from "./nodeTemplates";

const defaultEdges: FlowEdge[] = [
  { id: "e1", source: "node-start", target: "node-step-1", label: "início" },
  { id: "e2", source: "node-step-1", target: "node-decision", label: "avaliar" },
  { id: "e3", source: "node-decision", target: "node-end", label: "sim" },
  { id: "e4", source: "node-decision", target: "node-note", label: "não" },
];

export const initialMockFlow: FlowJson = {
  nodes: buildInitialMockFlow().nodes,
  edges: defaultEdges,
};

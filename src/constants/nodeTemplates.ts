import type { XYPosition } from "@xyflow/react";
import type { FlowNode, FlowNodeType } from "../types/flow";
import { DEFAULT_ANCHOR_SHAPE } from "./anchorShapes";

export const NODE_TYPE_LABELS: Record<FlowNodeType, string> = {
  action: "Ação",
  comment: "Comentário",
  anchor: "Ponto de rota",
};

export const NODE_TYPE_COLORS: Record<FlowNodeType, string> = {
  action: "#64748b",
  comment: "#94a3b8",
  anchor: "#868e96",
};

export function createFlowNode(nodeType: FlowNodeType, id: string, position: XYPosition): FlowNode {
  const isAnchor = nodeType === "anchor";
  const isComment = nodeType === "comment";
  const connectorsPerSide = isComment
    ? { top: 0, bottom: 0, left: 0, right: 0 }
    : { top: 1, bottom: 1, left: 1, right: 1 };
  return {
    id,
    type: "flowNode",
    position,
    data: {
      id,
      type: nodeType,
      channel: "none",
      channels: [],
      connectorsPerSide,
      title: isAnchor ? "" : "Título",
      description: isAnchor ? "" : "Descritivo",
      metadata: {},
      ...(isAnchor ? { anchorShape: DEFAULT_ANCHOR_SHAPE } : {}),
    },
  };
}

export function buildInitialMockFlow(): { nodes: FlowNode[] } {
  const nodes: FlowNode[] = [
    createFlowNode("action", "node-start", { x: 40, y: 140 }),
    createFlowNode("action", "node-step-1", { x: 320, y: 140 }),
    createFlowNode("action", "node-decision", { x: 600, y: 140 }),
    createFlowNode("comment", "node-note", { x: 600, y: 340 }),
    createFlowNode("action", "node-end", { x: 880, y: 140 }),
  ];

  nodes[0].data.title = "Iniciar";
  nodes[0].data.description = "Ponto de entrada do fluxo";

  nodes[1].data.title = "Validar entrada";
  nodes[1].data.description = "Executa validações básicas";
  nodes[1].data.metadata = { owner: "backend", retries: 2 };

  nodes[2].data.title = "Dados válidos?";
  nodes[2].data.description = "Se válido segue, senão documenta erro";

  nodes[3].data.title = "Observação";
  nodes[3].data.description = "Registrar motivo da rejeição";
  nodes[3].data.metadata = { severity: "warning" };
  /* Fluxo demo liga uma aresta a este comentário; conectores padrão de comentário são 0. */
  nodes[3].data.connectorsPerSide = { top: 1, bottom: 0, left: 0, right: 0 };

  nodes[4].data.title = "Concluir";
  nodes[4].data.description = "Encerrar processamento";

  return { nodes };
}

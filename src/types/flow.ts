import type { Edge, Node } from "@xyflow/react";
import type { AnchorShape } from "../constants/anchorShapes";

export type { AnchorShape } from "../constants/anchorShapes";

export type FlowNodeType = "action" | "comment" | "anchor";
export type FlowChannel =
  | "none"
  | "web"
  | "app"
  | "sms"
  | "social"
  | "whatsapp"
  | "telegram"
  | "email"
  | "voice";

export interface FlowNodeConnectorsPerSide {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FlowNodeData extends Record<string, unknown> {
  id: string;
  type: FlowNodeType;
  laneId?: string;
  columnIndex?: number;
  laneColorStrong?: string;
  channel: FlowChannel;
  channels: FlowChannel[];
  connectorsPerSide: FlowNodeConnectorsPerSide;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  /** Só para `type === "anchor"`: forma visual do ponto de rota. */
  anchorShape?: AnchorShape;
  /** Só para `type === "anchor"`: fixa posição relativa ao nó alvo. */
  anchorToNodeId?: string;
  /** Offset relativo ao centro do nó alvo. */
  anchorOffsetX?: number;
  /** Offset relativo ao centro do nó alvo. */
  anchorOffsetY?: number;
  /** Quando true, não segue referência automática aos conectores nem reposiciona com o layout. */
  anchorFollowReferenceDisabled?: boolean;
}

export type FlowNode = Node<FlowNodeData, "flowNode">;

/** Cor de destaque do conector (sem valor = cinza padrão do tema). */
export type FlowEdgeLineStatus = "red" | "amber" | "green";

export interface FlowEdgeData extends Record<string, unknown> {
  /** 0 = início do path, 1 = fim — rótulo desliza ao longo do conector. */
  labelPathT?: number;
  /** Legado: offset livre; ainda usado para exibir fluxos antigos até o próximo arraste. */
  labelOffsetX?: number;
  labelOffsetY?: number;
  /**
   * 0–100: posição do segmento médio em traçado ortogonal reto (H→V→H ou V→H→V). 50 = meio entre as âncoras.
   */
  bendOffsetPercent?: number;
  /**
   * Pixels: afasta o segmento paralelo ao alinhar nós (bottom+bottom / top+top na mesma linha, ou left+left / right+right na mesma coluna).
   */
  alignedPerpendicularPx?: number;
  /** Contínua (padrão), tracejada ou pontilhada. */
  lineStyle?: "solid" | "dashed" | "dotted";
  /** Legado: migrado para `lineStatus: "red"` ao normalizar o fluxo. */
  lineAlert?: boolean;
  /** Cor de destaque R/A/G; omitido = cinza padrão (`--flow-edge`). */
  lineStatus?: FlowEdgeLineStatus;
  /** Endpoint origem deve renderizar no centro de uma âncora single-center. */
  sourceAnchorSingleCenter?: boolean;
  /** Endpoint destino deve renderizar no centro de uma âncora single-center. */
  targetAnchorSingleCenter?: boolean;
}

export type FlowEdge = Edge<FlowEdgeData>;

export interface Lane {
  id: string;
  title: string;
  order: number;
  columnCount: number;
}

export interface LaneColumn {
  id: string;
  title: string;
}

export interface LaneSystem {
  lanes: Lane[];
  columns: LaneColumn[];
  columnWidth: number;
  rowMinHeight: number;
  cellPadding: number;
  verticalSpacing: number;
  horizontalGap: number;
  verticalGap: number;
}

export interface FlowJson {
  nodes: FlowNode[];
  edges: FlowEdge[];
  laneSystem?: LaneSystem;
  theme?: {
    artboardBackground?: string;
    laneStrongColors?: string[];
  };
}

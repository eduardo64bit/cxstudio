import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Controls,
  MiniMap,
  ReactFlow,
  ConnectionMode,
  PanOnScrollMode,
  SelectionMode,
  type Viewport,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeMouseHandler,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import LoginModal from "./components/LoginModal";
import ColectOpsApp from "./components/ColectOpsApp";
import DesignSystemPage from "./components/DesignSystemPage";
import ServiceHub from "./components/ServiceHub";
import Toolbar from "./components/Toolbar";
import LaneGridOverlay from "./components/LaneGridOverlay";
import AiEditorPanel from "./components/AiEditorPanel";
import NodeEditorPanel from "./components/NodeEditorPanel";
import FlowNode from "./components/FlowNode";
import FlowLabeledEdge from "./components/FlowLabeledEdge";
import { createFlowNode } from "./constants/nodeTemplates";
import {
  connectionLineTypeFromEdgePath,
  DEFAULT_FLOW_EDGE_PATH_TYPE,
  normalizeEdgePathType,
  type FlowEdgePathType,
} from "./constants/edgePath";
import { initialMockFlow } from "./constants/mockFlow";
import type {
  AnchorShape,
  FlowChannel,
  FlowEdge,
  FlowJson,
  FlowNode as FlowNodeType,
  FlowNodeConnectorsPerSide,
  FlowNodeType as FlowNodeKind,
  Lane,
  LaneSystem,
} from "./types/flow";
import { FlowCanvasProvider } from "./context/FlowCanvasContext";
import {
  DEFAULT_LANE_STRONG_COLORS,
  MAX_LANE_COLORS,
  getLaneColorSet,
  normalizeHexColor,
} from "./constants/laneColors";
import { loadFlowFromStorage, saveFlowToStorage } from "./utils/storage";
import { buildFlowSvgFromDom, downloadSvgFile } from "./utils/exportFlowToSvg";
import { applyEdgeLineAppearance } from "./utils/edgeLineAppearance";
import { normalizeFlowEdgeLineStatus } from "./constants/edgeLineStatus";
import { normalizeAnchorShape } from "./constants/anchorShapes";
import { sanitizeFlowElementId } from "./utils/flowElementId";
import { nextDuplicateNodeId, nextSequentialEdgeId, nextSequentialNodeId } from "./utils/nodeNaming";

const nodeTypes: NodeTypes = {
  flowNode: FlowNode,
};

const edgeTypes: EdgeTypes = {
  default: FlowLabeledEdge,
  straight: FlowLabeledEdge,
  smoothstep: FlowLabeledEdge,
};
const defaultEdgeStyle = {
  strokeWidth: 2,
  stroke: "var(--flow-edge)",
} as const;

interface ClipboardSelection {
  nodes: FlowNodeType[];
  edges: FlowEdge[];
}

type LayerAction = "forward" | "backward" | "front" | "back";

const HISTORY_LIMIT = 80;
const GRID_HEADER_HEIGHT = 44;
const GRID_LANE_TITLE_WIDTH = 180;
const DEFAULT_LANE_SYSTEM: LaneSystem = {
  lanes: [{ id: "lane-1", order: 0, columnCount: 1, title: "Raia 1" }],
  columns: [{ id: "col-1", title: "Coluna 1" }],
  columnWidth: 320,
  rowMinHeight: 200,
  cellPadding: 32,
  verticalSpacing: 32,
  horizontalGap: 32,
  verticalGap: 24,
};

function cloneFlowSnapshot(snapshot: FlowJson): FlowJson {
  return JSON.parse(JSON.stringify(snapshot)) as FlowJson;
}

/** Conteúdo do fluxo sem flags de seleção — para ignorar mudanças só de seleção no histórico e no persist. */
function flowContentFingerprint(nodes: FlowNodeType[], edges: FlowEdge[], laneSystem: LaneSystem): string {
  const nodesStripped = nodes.map(({ selected: _sel, ...n }) => n);
  const edgesStripped = edges.map(({ selected: _sel, ...e }) => e);
  return JSON.stringify({ nodes: nodesStripped, edges: edgesStripped, laneSystem });
}

const DEFAULT_FLOW_CARD_WIDTH = 220;
const DEFAULT_FLOW_CARD_HEIGHT_FALLBACK = 100;
const ANCHOR_NODE_SIZE = 32;
const OUTSIDE_LANE_SNAP_THRESHOLD = 8;

/** Largura/altura para alinhamento pelo centro (React Flow usa canto superior esquerdo em `position`). */
function getNodeLayoutSize(node: FlowNodeType): { w: number; h: number } {
  const isAnchor = node.data.type === "anchor";
  const wRaw = node.measured?.width ?? node.width;
  const hRaw = node.measured?.height ?? node.height;
  const w =
    typeof wRaw === "number" && wRaw > 0
      ? wRaw
      : isAnchor
        ? ANCHOR_NODE_SIZE
        : DEFAULT_FLOW_CARD_WIDTH;
  const h =
    typeof hRaw === "number" && hRaw > 0
      ? hRaw
      : isAnchor
        ? ANCHOR_NODE_SIZE
        : DEFAULT_FLOW_CARD_HEIGHT_FALLBACK;
  return { w, h };
}

/** Nó posicionado fora das células da tabela (ou âncora) — alinhamento da toolbar só afeta estes. */
function isNodeOutsideLaneGrid(node: FlowNodeType): boolean {
  if (node.data.type === "anchor") return true;
  return !node.data.laneId || typeof node.data.columnIndex !== "number";
}

function isSelectOnlyNodeChanges(changes: NodeChange<FlowNodeType>[]): boolean {
  return changes.length > 0 && changes.every((c) => c.type === "select");
}

function isPositionOnlyNodeChanges(changes: NodeChange<FlowNodeType>[]): boolean {
  return changes.length > 0 && changes.every((c) => c.type === "position");
}

function hasDimensionsNodeChanges(changes: NodeChange<FlowNodeType>[]): boolean {
  return changes.some((c) => c.type === "dimensions");
}

function hasRemoveNodeChanges(changes: NodeChange<FlowNodeType>[]): boolean {
  return changes.some((c) => c.type === "remove");
}

function isSelectOnlyEdgeChanges(changes: EdgeChange<FlowEdge>[]): boolean {
  return changes.length > 0 && changes.every((c) => c.type === "select");
}

function normalizeChannel(value: unknown): FlowChannel {
  const validChannels: FlowChannel[] = ["none", "web", "app", "sms", "social", "whatsapp", "telegram", "email", "voice"];
  return validChannels.includes(value as FlowChannel) ? (value as FlowChannel) : "none";
}

function normalizeChannels(value: unknown): FlowChannel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeChannel(item))
    .filter((item) => item !== "none")
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 5);
}

function normalizeConnectorCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(5, Math.round(value)));
}

function normalizeConnectorsPerSide(nodeData: unknown, nodeType: FlowNodeKind): FlowNodeConnectorsPerSide {
  if (nodeType === "anchor") {
    return { top: 1, bottom: 1, left: 1, right: 1 };
  }
  const defaultPerSide = nodeType === "comment" ? 0 : 1;
  const data = (nodeData ?? {}) as {
    connectorsPerSide?: Partial<Record<"top" | "bottom" | "left" | "right", unknown>>;
    connectorCountPerSide?: unknown;
  };
  const hasLegacyGlobal = data.connectorCountPerSide !== undefined && data.connectorCountPerSide !== null;
  const legacyValue = hasLegacyGlobal ? normalizeConnectorCount(data.connectorCountPerSide) : defaultPerSide;
  const source = data.connectorsPerSide ?? {};
  return {
    top: normalizeConnectorCount(source.top ?? legacyValue),
    bottom: normalizeConnectorCount(source.bottom ?? legacyValue),
    left: normalizeConnectorCount(source.left ?? legacyValue),
    right: normalizeConnectorCount(source.right ?? legacyValue),
  };
}

function getValidHandleIds(connectors: FlowNodeConnectorsPerSide, allowCenterHandle = false): Set<string> {
  const ids = new Set<string>();
  const prefixBySide = { top: "T", bottom: "B", left: "L", right: "R" } as const;
  (["top", "bottom", "left", "right"] as const).forEach((side) => {
    const count = normalizeConnectorCount(connectors[side]);
    for (let i = 1; i <= count; i += 1) {
      ids.add(`${prefixBySide[side]}${i}`);
    }
  });
  if (allowCenterHandle) ids.add("C1");
  return ids;
}

function inferHandleByRelativePosition(
  selfCenter: { x: number; y: number },
  otherCenter: { x: number; y: number } | null,
): "T1" | "R1" | "B1" | "L1" {
  if (!otherCenter) return "T1";
  const dx = otherCenter.x - selfCenter.x;
  const dy = otherCenter.y - selfCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "R1" : "L1";
  return dy >= 0 ? "B1" : "T1";
}

function remapCenterHandlesToSides(
  edges: FlowEdge[],
  nodes: FlowNodeType[],
  targetNodeIds: Set<string>,
): FlowEdge[] {
  if (targetNodeIds.size === 0) return edges;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  let changed = false;
  const next = edges.map((edge) => {
    let sourceHandle = edge.sourceHandle;
    let targetHandle = edge.targetHandle;

    if (targetNodeIds.has(edge.source) && edge.sourceHandle === "C1") {
      const self = nodeById.get(edge.source);
      const other = nodeById.get(edge.target);
      if (self) {
        const { w, h } = getNodeLayoutSize(self);
        const selfCenter = { x: self.position.x + w / 2, y: self.position.y + h / 2 };
        const otherCenter = other
          ? (() => {
              const { w: ow, h: oh } = getNodeLayoutSize(other);
              return { x: other.position.x + ow / 2, y: other.position.y + oh / 2 };
            })()
          : null;
        sourceHandle = inferHandleByRelativePosition(selfCenter, otherCenter);
        changed = true;
      }
    }

    if (targetNodeIds.has(edge.target) && edge.targetHandle === "C1") {
      const self = nodeById.get(edge.target);
      const other = nodeById.get(edge.source);
      if (self) {
        const { w, h } = getNodeLayoutSize(self);
        const selfCenter = { x: self.position.x + w / 2, y: self.position.y + h / 2 };
        const otherCenter = other
          ? (() => {
              const { w: ow, h: oh } = getNodeLayoutSize(other);
              return { x: other.position.x + ow / 2, y: other.position.y + oh / 2 };
            })()
          : null;
        targetHandle = inferHandleByRelativePosition(selfCenter, otherCenter);
        changed = true;
      }
    }

    if (sourceHandle !== edge.sourceHandle || targetHandle !== edge.targetHandle) {
      return { ...edge, sourceHandle, targetHandle };
    }
    return edge;
  });
  return changed ? next : edges;
}

function stampAnchorEndpointMode(
  edges: FlowEdge[],
  nodes: FlowNodeType[],
  targetNodeIds?: Set<string>,
): FlowEdge[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  let changed = false;
  const next = edges.map((edge) => {
    if (
      targetNodeIds &&
      !targetNodeIds.has(edge.source) &&
      !targetNodeIds.has(edge.target)
    ) {
      return edge;
    }
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const sourceSingleCenter =
      sourceNode?.data.type === "anchor" && normalizeAnchorShape(sourceNode.data.anchorShape) === "single-center";
    const targetSingleCenter =
      targetNode?.data.type === "anchor" && normalizeAnchorShape(targetNode.data.anchorShape) === "single-center";
    const prevSource = edge.data?.sourceAnchorSingleCenter === true;
    const prevTarget = edge.data?.targetAnchorSingleCenter === true;
    if (prevSource === sourceSingleCenter && prevTarget === targetSingleCenter) return edge;
    changed = true;
    return {
      ...edge,
      data: {
        ...edge.data,
        sourceAnchorSingleCenter: sourceSingleCenter,
        targetAnchorSingleCenter: targetSingleCenter,
      },
    };
  });
  return changed ? next : edges;
}

function edgeUsesRemovedHandle(edge: FlowEdge, nodeId: string, validHandleIds: Set<string>): boolean {
  if (edge.source === nodeId && typeof edge.sourceHandle === "string" && !validHandleIds.has(edge.sourceHandle)) return true;
  if (edge.target === nodeId && typeof edge.targetHandle === "string" && !validHandleIds.has(edge.targetHandle)) return true;
  return false;
}

function normalizeHandleId(handleId: unknown): string | null | undefined {
  if (handleId === null || handleId === undefined) return handleId as null | undefined;
  if (typeof handleId !== "string") return undefined;

  const canonical = handleId.toUpperCase();
  if (canonical === "C1") return canonical;
  if (/^[RLTB][1-5]$/.test(canonical)) return canonical;

  // Old ids from overlapped source/target handles.
  const legacyExact: Record<string, string> = {
    left: "L1",
    "left-source": "L1",
    "left-target": "L1",
    top: "T1",
    "top-target": "T1",
    "top-source": "T1",
    bottom: "B1",
    "bottom-target": "B1",
    "bottom-source": "B1",
    right: "R1",
    "right-target": "R1",
    "right-source": "R1",
  };
  if (legacyExact[handleId]) return legacyExact[handleId];

  // Old indexed ids: left-target-2 / right-source-3 etc.
  const legacyIndexed = handleId.match(/^(left|right|top|bottom)-(?:source|target)-([2-5])$/);
  if (legacyIndexed) {
    const side = legacyIndexed[1];
    const index = legacyIndexed[2];
    const prefix = side === "left" ? "L" : side === "right" ? "R" : side === "top" ? "T" : "B";
    return `${prefix}${index}`;
  }

  // Older indexed ids: left-2 / right-3 etc.
  const olderIndexed = handleId.match(/^(left|right|top|bottom)-([2-5])$/);
  if (olderIndexed) {
    const side = olderIndexed[1];
    const index = olderIndexed[2];
    const prefix = side === "left" ? "L" : side === "right" ? "R" : side === "top" ? "T" : "B";
    return `${prefix}${index}`;
  }

  return undefined;
}

function normalizeNodeType(value: unknown): FlowNodeKind {
  if (value === "anchor") return "anchor";
  if (value === "comment" || value === "note") return "comment";
  if (value === "action" || value === "start" || value === "step" || value === "decision" || value === "end") return "action";
  return "action";
}

function normalizeLaneSystem(value: unknown): LaneSystem {
  const source = (value ?? {}) as Partial<LaneSystem>;
  const lanesInput = Array.isArray(source.lanes) ? source.lanes : [];
  const lanes: Lane[] =
    lanesInput.length > 0
      ? lanesInput.map((lane, index) => ({
          id: typeof lane.id === "string" && lane.id ? lane.id : `lane-${index + 1}`,
          title: typeof lane.title === "string" ? lane.title : `Raia ${index + 1}`,
          order: typeof lane.order === "number" ? lane.order : index,
          columnCount:
            typeof lane.columnCount === "number" && Number.isFinite(lane.columnCount)
              ? Math.max(1, Math.round(lane.columnCount))
              : 1,
        }))
      : DEFAULT_LANE_SYSTEM.lanes;
  const legacyMaxColumns = lanes.reduce((max, lane) => Math.max(max, lane.columnCount), 1);
  const columnsInput = Array.isArray(source.columns) ? source.columns : [];
  const columns =
    columnsInput.length > 0
      ? columnsInput.map((column, index) => ({
          id: typeof column.id === "string" && column.id ? column.id : `col-${index + 1}`,
          title: typeof column.title === "string" ? column.title : `Coluna ${index + 1}`,
        }))
      : Array.from({ length: legacyMaxColumns }, (_, index) => ({
          id: `col-${index + 1}`,
          title: `Coluna ${index + 1}`,
        }));
  const normalizedColumnCount = Math.max(1, columns.length);

  return {
    lanes: lanes
      .sort((a, b) => a.order - b.order)
      .map((lane) => ({ ...lane, columnCount: normalizedColumnCount })),
    columns,
    columnWidth:
      typeof source.columnWidth === "number" && source.columnWidth > 0
        ? source.columnWidth
        : DEFAULT_LANE_SYSTEM.columnWidth,
    rowMinHeight:
      typeof source.rowMinHeight === "number" && source.rowMinHeight > 0
        ? source.rowMinHeight
        : DEFAULT_LANE_SYSTEM.rowMinHeight,
    cellPadding:
      typeof source.cellPadding === "number" && source.cellPadding >= 0
        ? source.cellPadding
        : DEFAULT_LANE_SYSTEM.cellPadding,
    verticalSpacing:
      typeof source.verticalSpacing === "number" && source.verticalSpacing >= 0
        ? Math.max(0, source.verticalSpacing)
        : DEFAULT_LANE_SYSTEM.verticalSpacing,
    horizontalGap:
      typeof source.horizontalGap === "number" && source.horizontalGap >= 0
        ? Math.max(32, source.horizontalGap)
        : DEFAULT_LANE_SYSTEM.horizontalGap,
    verticalGap:
      typeof source.verticalGap === "number" && source.verticalGap >= 0
        ? Math.max(20, source.verticalGap)
        : DEFAULT_LANE_SYSTEM.verticalGap,
  };
}

function normalizeTheme(value: unknown): { artboardBackground: string; laneStrongColors: string[] } {
  const source = (value ?? {}) as { artboardBackground?: unknown; laneStrongColors?: unknown };
  const artboardBackground = normalizeHexColor(
    typeof source.artboardBackground === "string" ? source.artboardBackground : "#FFFFFF",
    "#FFFFFF",
  );
  const rawColors = Array.isArray(source.laneStrongColors) ? source.laneStrongColors : [];
  const laneStrongColors = Array.from({ length: MAX_LANE_COLORS }, (_, i) =>
    normalizeHexColor(
      typeof rawColors[i] === "string" ? rawColors[i] : DEFAULT_LANE_STRONG_COLORS[i % DEFAULT_LANE_STRONG_COLORS.length],
      DEFAULT_LANE_STRONG_COLORS[i % DEFAULT_LANE_STRONG_COLORS.length],
    ),
  );
  return { artboardBackground, laneStrongColors };
}

function computeLaneLayoutMetrics(nodes: FlowNodeType[], laneSystem: LaneSystem): {
  laneTopById: Map<string, number>;
  rowHeightByLaneId: Map<string, number>;
} {
  const laneOrder = laneSystem.lanes.map((lane) => lane.id);
  const laneIndexById = new Map(laneOrder.map((laneId, index) => [laneId, index]));
  const defaultLaneId = laneOrder[0];
  const maxColumns = Math.max(1, laneSystem.columns.length);
  const columnsByLane = new Map(laneSystem.lanes.map((lane) => [lane.id, Math.max(1, Math.min(lane.columnCount, maxColumns))]));
  const grouped = new Map<string, FlowNodeType[]>();
  const rowHeightByLaneId = new Map<string, number>(laneSystem.lanes.map((lane) => [lane.id, laneSystem.rowMinHeight]));

  nodes.forEach((node, index) => {
    if (node.data.type === "anchor") return;
    // Mesmo critério de `layoutNodesByLaneSystem`: nós livres não entram nas células nem na altura das raias.
    if (!node.data.laneId || typeof node.data.columnIndex !== "number") return;
    const laneId = node.data.laneId && laneIndexById.has(node.data.laneId) ? node.data.laneId : defaultLaneId;
    const maxColumns = columnsByLane.get(laneId) ?? 1;
    const columnIndex = Math.max(0, Math.min(maxColumns - 1, Number(node.data.columnIndex ?? 0)));
    const key = `${laneId}::${columnIndex}`;
    const arr = grouped.get(key) ?? [];
    arr.push({ ...node, zIndex: index });
    grouped.set(key, arr);
  });

  grouped.forEach((cellNodes, key) => {
    const [laneId] = key.split("::");
    const ordered = [...cellNodes].sort((a, b) => {
      const dy = a.position.y - b.position.y;
      if (Math.abs(dy) > 0.5) return dy;
      return (a.zIndex ?? 0) - (b.zIndex ?? 0);
    });
    const stackHeight = ordered.reduce((sum, node, index) => {
      const { h } = getNodeLayoutSize(node);
      return sum + h + (index < ordered.length - 1 ? laneSystem.verticalSpacing : 0);
    }, 0);
    const cellHeight = laneSystem.cellPadding * 2 + stackHeight;
    rowHeightByLaneId.set(laneId, Math.max(rowHeightByLaneId.get(laneId) ?? laneSystem.rowMinHeight, cellHeight));
  });

  const laneTopById = new Map<string, number>();
  let y = 0;
  laneSystem.lanes.forEach((lane) => {
    laneTopById.set(lane.id, y);
    y += (rowHeightByLaneId.get(lane.id) ?? laneSystem.rowMinHeight) + laneSystem.verticalGap;
  });

  return { laneTopById, rowHeightByLaneId };
}

function layoutNodesByLaneSystem(
  nodes: FlowNodeType[],
  laneSystem: LaneSystem,
  laneStrongColors?: string[],
): FlowNodeType[] {
  const laneOrder = laneSystem.lanes.map((lane) => lane.id);
  const laneIndexById = new Map(laneOrder.map((laneId, index) => [laneId, index]));
  const defaultLaneId = laneOrder[0];
  const maxColumns = Math.max(1, laneSystem.columns.length);
  const columnsByLane = new Map(laneSystem.lanes.map((lane) => [lane.id, Math.max(1, Math.min(lane.columnCount, maxColumns))]));
  const grouped = new Map<string, FlowNodeType[]>();
  const { laneTopById } = computeLaneLayoutMetrics(nodes, laneSystem);

  const prepared = nodes.map((node, index) => {
    if (node.data.type === "anchor") return node;
    if (!node.data.laneId || typeof node.data.columnIndex !== "number") {
      // Nó livre (fora das células): mantém posição manual.
      return node;
    }
    const laneId = node.data.laneId && laneIndexById.has(node.data.laneId) ? node.data.laneId : defaultLaneId;
    const maxColumns = columnsByLane.get(laneId) ?? 1;
    const columnIndex = Math.max(0, Math.min(maxColumns - 1, Number(node.data.columnIndex ?? 0)));
    const key = `${laneId}::${columnIndex}`;
    const laneIndex = laneSystem.lanes.findIndex((lane) => lane.id === laneId);
    const laneColors = getLaneColorSet(Math.max(0, laneIndex), laneStrongColors);
    const nextNode: FlowNodeType = {
      ...node,
      data: { ...node.data, laneId, columnIndex, laneColorStrong: laneColors.strong },
    };
    const arr = grouped.get(key) ?? [];
    arr.push({ ...nextNode, zIndex: index });
    grouped.set(key, arr);
    return nextNode;
  });

  const positionById = new Map<string, { x: number; y: number }>();
  grouped.forEach((cellNodes, key) => {
    const [laneId, columnRaw] = key.split("::");
    const columnIndex = Number(columnRaw);
    const laneTop = laneTopById.get(laneId) ?? 0;
    const cellLeft =
      GRID_LANE_TITLE_WIDTH + laneSystem.horizontalGap + columnIndex * (laneSystem.columnWidth + laneSystem.horizontalGap);

    const ordered = [...cellNodes].sort((a, b) => {
      const dy = a.position.y - b.position.y;
      if (Math.abs(dy) > 0.5) return dy;
      return (a.zIndex ?? 0) - (b.zIndex ?? 0);
    });
    let y = GRID_HEADER_HEIGHT + laneSystem.verticalGap + laneTop + laneSystem.cellPadding;
    ordered.forEach((node, index) => {
      const { h, w } = getNodeLayoutSize(node);
      const x = cellLeft + (laneSystem.columnWidth - w) / 2;
      positionById.set(node.id, { x, y });
      y += h + (index < ordered.length - 1 ? laneSystem.verticalSpacing : 0);
    });
  });

  const layouted = prepared.map((node) => ({
    ...node,
    position: positionById.get(node.id) ?? node.position,
  }));

  const byId = new Map(layouted.map((n) => [n.id, n]));
  const targetCandidates = layouted.filter((n) => n.data.type !== "anchor");
  return layouted.map((node) => {
    if (node.data.type !== "anchor" || node.data.anchorFollowReferenceDisabled === true) return node;
    if (!node.data.anchorToNodeId) return node;
    let target = byId.get(node.data.anchorToNodeId);
    if (!target || target.id === node.id || target.data.type === "anchor") {
      if (targetCandidates.length === 0) {
        return {
          ...node,
          data: { ...node.data, anchorToNodeId: undefined, anchorOffsetX: undefined, anchorOffsetY: undefined },
        };
      }
      const { w: aw, h: ah } = getNodeLayoutSize(node);
      const anchorCenterX = node.position.x + aw / 2;
      const anchorCenterY = node.position.y + ah / 2;
      let nearest = targetCandidates[0]!;
      let nearestDist = Number.POSITIVE_INFINITY;
      targetCandidates.forEach((candidate) => {
        const { w, h } = getNodeLayoutSize(candidate);
        const cx = candidate.position.x + w / 2;
        const cy = candidate.position.y + h / 2;
        const d = Math.hypot(cx - anchorCenterX, cy - anchorCenterY);
        if (d < nearestDist) {
          nearest = candidate;
          nearestDist = d;
        }
      });
      const { w: nw, h: nh } = getNodeLayoutSize(nearest);
      const nearestCenterX = nearest.position.x + nw / 2;
      const nearestCenterY = nearest.position.y + nh / 2;
      const offsetX = anchorCenterX - nearestCenterX;
      const offsetY = anchorCenterY - nearestCenterY;
      return {
        ...node,
        data: { ...node.data, anchorToNodeId: nearest.id, anchorOffsetX: offsetX, anchorOffsetY: offsetY },
        position: {
          x: nearestCenterX + offsetX - ANCHOR_NODE_SIZE / 2,
          y: nearestCenterY + offsetY - ANCHOR_NODE_SIZE / 2,
        },
      };
    }
    const { w, h } = getNodeLayoutSize(target);
    const targetCenterX = target.position.x + w / 2;
    const targetCenterY = target.position.y + h / 2;
    const offsetX = typeof node.data.anchorOffsetX === "number" && Number.isFinite(node.data.anchorOffsetX) ? node.data.anchorOffsetX : 0;
    const offsetY = typeof node.data.anchorOffsetY === "number" && Number.isFinite(node.data.anchorOffsetY) ? node.data.anchorOffsetY : 0;
    return { ...node, position: { x: targetCenterX + offsetX - ANCHOR_NODE_SIZE / 2, y: targetCenterY + offsetY - ANCHOR_NODE_SIZE / 2 } };
  });
}

function reconcileAnchorFixationByEdges(
  nodes: FlowNodeType[],
  edges: FlowEdge[],
): { nodes: FlowNodeType[]; changed: boolean } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const nonAnchors = nodes.filter((n) => n.data.type !== "anchor");
  const edgeNeighbors = new Map<string, string[]>();
  edges.forEach((edge) => {
    const src = edgeNeighbors.get(edge.source) ?? [];
    src.push(edge.target);
    edgeNeighbors.set(edge.source, src);
    const tgt = edgeNeighbors.get(edge.target) ?? [];
    tgt.push(edge.source);
    edgeNeighbors.set(edge.target, tgt);
  });

  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.data.type !== "anchor") return node;
    const neighbors = edgeNeighbors.get(node.id) ?? [];
    const isConnected = neighbors.length > 0;
    const currentTargetId = typeof node.data.anchorToNodeId === "string" ? node.data.anchorToNodeId : undefined;
    const currentTarget = currentTargetId ? byId.get(currentTargetId) : undefined;

    if (!isConnected) {
      if (!currentTargetId && node.data.anchorOffsetX === undefined && node.data.anchorOffsetY === undefined) return node;
      changed = true;
      return {
        ...node,
        data: { ...node.data, anchorToNodeId: undefined, anchorOffsetX: undefined, anchorOffsetY: undefined },
      };
    }

    const currentIsValid = Boolean(currentTarget && currentTarget.data.type !== "anchor" && currentTarget.id !== node.id);
    if (currentIsValid) return node;

    const preferredNeighborId = neighbors.find((id) => {
      const candidate = byId.get(id);
      return candidate && candidate.data.type !== "anchor" && candidate.id !== node.id;
    });
    const target =
      (preferredNeighborId ? byId.get(preferredNeighborId) : undefined) ??
      (() => {
        if (nonAnchors.length === 0) return undefined;
        const { w: aw, h: ah } = getNodeLayoutSize(node);
        const anchorCenterX = node.position.x + aw / 2;
        const anchorCenterY = node.position.y + ah / 2;
        let nearest = nonAnchors[0]!;
        let nearestDist = Number.POSITIVE_INFINITY;
        nonAnchors.forEach((candidate) => {
          const { w, h } = getNodeLayoutSize(candidate);
          const cx = candidate.position.x + w / 2;
          const cy = candidate.position.y + h / 2;
          const d = Math.hypot(cx - anchorCenterX, cy - anchorCenterY);
          if (d < nearestDist) {
            nearest = candidate;
            nearestDist = d;
          }
        });
        return nearest;
      })();
    if (!target) return node;

    const { w: aw, h: ah } = getNodeLayoutSize(node);
    const { w: tw, h: th } = getNodeLayoutSize(target);
    const anchorCenterX = node.position.x + aw / 2;
    const anchorCenterY = node.position.y + ah / 2;
    const targetCenterX = target.position.x + tw / 2;
    const targetCenterY = target.position.y + th / 2;
    changed = true;
    return {
      ...node,
      data: {
        ...node.data,
        anchorToNodeId: target.id,
        anchorOffsetX: anchorCenterX - targetCenterX,
        anchorOffsetY: anchorCenterY - targetCenterY,
      },
    };
  });

  return { nodes: changed ? nextNodes : nodes, changed };
}

function normalizeFlow(data: FlowJson): FlowJson {
  const laneSystem = normalizeLaneSystem((data as FlowJson).laneSystem);
  const theme = normalizeTheme((data as FlowJson).theme);
  return {
    laneSystem,
    theme,
    nodes: data.nodes.map((node) => {
      const nodeType = normalizeNodeType((node.data as { type?: unknown }).type);
      return {
        ...node,
        parentId: undefined,
        extent: undefined,
        data: {
          ...node.data,
          type: nodeType,
          channel: normalizeChannel((node.data as { channel?: unknown }).channel),
          channels: normalizeChannels((node.data as { channels?: unknown }).channels),
          connectorsPerSide: normalizeConnectorsPerSide(node.data, nodeType),
          laneId:
            nodeType === "anchor"
              ? undefined
              : typeof (node.data as { laneId?: unknown }).laneId === "string"
                ? ((node.data as { laneId?: string }).laneId ?? laneSystem.lanes[0]?.id)
                : laneSystem.lanes[0]?.id,
          columnIndex:
            nodeType === "anchor"
              ? undefined
              : Math.max(0, Math.round(Number((node.data as { columnIndex?: unknown }).columnIndex ?? 0))),
          ...(nodeType === "anchor"
            ? {
                anchorShape: normalizeAnchorShape((node.data as { anchorShape?: unknown }).anchorShape),
                anchorToNodeId:
                  typeof (node.data as { anchorToNodeId?: unknown }).anchorToNodeId === "string" &&
                  (node.data as { anchorToNodeId?: string }).anchorToNodeId
                    ? (node.data as { anchorToNodeId?: string }).anchorToNodeId
                    : undefined,
                anchorOffsetX:
                  typeof (node.data as { anchorOffsetX?: unknown }).anchorOffsetX === "number" &&
                  Number.isFinite((node.data as { anchorOffsetX?: number }).anchorOffsetX)
                    ? (node.data as { anchorOffsetX?: number }).anchorOffsetX
                    : undefined,
                anchorOffsetY:
                  typeof (node.data as { anchorOffsetY?: unknown }).anchorOffsetY === "number" &&
                  Number.isFinite((node.data as { anchorOffsetY?: number }).anchorOffsetY)
                    ? (node.data as { anchorOffsetY?: number }).anchorOffsetY
                    : undefined,
                anchorFollowReferenceDisabled:
                  (node.data as { anchorFollowReferenceDisabled?: unknown }).anchorFollowReferenceDisabled === true,
              }
            : {}),
        },
      };
    }),
    edges: data.edges.map((edge) => {
      const baseData =
        edge.data !== undefined && edge.data !== null && typeof edge.data === "object" && !Array.isArray(edge.data)
          ? { ...edge.data }
          : {};
      delete (baseData as Record<string, unknown>).orthogonalOffset;
      const status = normalizeFlowEdgeLineStatus(baseData as Record<string, unknown>);
      delete (baseData as Record<string, unknown>).lineAlert;
      if (status) (baseData as Record<string, unknown>).lineStatus = status;
      else delete (baseData as Record<string, unknown>).lineStatus;
      return applyEdgeLineAppearance({
        ...edge,
        type: normalizeEdgePathType(edge.type),
        sourceHandle: normalizeHandleId(edge.sourceHandle),
        targetHandle: normalizeHandleId(edge.targetHandle),
        data: baseData,
      });
    }),
  };
}

const AUTH_SESSION_KEY = "cxstudio-auth";
const AI2FLOW_PATH = "/ai2flow";
const COLECTOPS_PATH = "/colectops";
const DESIGN_SYSTEM_PATH = "/design-system";

export default function App() {
  const pathname =
    typeof window !== "undefined"
      ? window.location.pathname.replace(/\/+$/, "") || "/"
      : "/";
  const shouldRenderAi2Flow = pathname === AI2FLOW_PATH;
  const shouldRenderColectOps = pathname === COLECTOPS_PATH;
  const shouldRenderDesignSystem = pathname === DESIGN_SYSTEM_PATH;
  const shouldRenderServiceHub = !shouldRenderAi2Flow && !shouldRenderColectOps && !shouldRenderDesignSystem;

  if (shouldRenderServiceHub) {
    return <ServiceHub />;
  }

  if (shouldRenderColectOps) {
    return <ColectOpsApp />;
  }

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });

  const handleLoginSuccess = useCallback(() => {
    try {
      sessionStorage.setItem(AUTH_SESSION_KEY, "1");
    } catch {
      /* storage indisponível */
    }
    setIsAuthenticated(true);
  }, []);

  if (shouldRenderDesignSystem) {
    if (!isAuthenticated) {
      return <LoginModal onSuccess={handleLoginSuccess} />;
    }
    return <DesignSystemPage />;
  }

  const persisted = loadFlowFromStorage();
  const initialFlow = normalizeFlow(persisted ?? initialMockFlow);
  const [theme, setTheme] = useState(() => normalizeTheme(initialFlow.theme));
  const [laneSystem, setLaneSystem] = useState<LaneSystem>(initialFlow.laneSystem ?? DEFAULT_LANE_SYSTEM);
  const [nodes, setNodes] = useState<FlowNodeType[]>(() =>
    layoutNodesByLaneSystem(
      initialFlow.nodes,
      initialFlow.laneSystem ?? DEFAULT_LANE_SYSTEM,
      initialFlow.theme?.laneStrongColors,
    ),
  );
  const [edges, setEdges] = useState<FlowEdge[]>(initialFlow.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(nodes[0]?.id ?? null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedLaneTitleId, setSelectedLaneTitleId] = useState<string | null>(null);
  const [selectedColumnTitleId, setSelectedColumnTitleId] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ laneId: string; columnIndex: number } | null>(null);
  const [dragSnapGuide, setDragSnapGuide] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  /** Com Space ativo, o pan do artboard deve ganhar prioridade sobre arrastar nós. */
  const [spacePressed, setSpacePressed] = useState(false);
  const [middlePanActive, setMiddlePanActive] = useState(false);
  const [defaultEdgePathType, setDefaultEdgePathType] = useState<FlowEdgePathType>(DEFAULT_FLOW_EDGE_PATH_TYPE);
  const [aiMode, setAiMode] = useState(false);
  const [editorPanelOpen, setEditorPanelOpen] = useState(true);
  const copiedSelectionRef = useRef<ClipboardSelection | null>(null);
  const pasteCountRef = useRef(0);
  const historyPastRef = useRef<FlowJson[]>([]);
  const historyFutureRef = useRef<FlowJson[]>([]);
  const prevSnapshotRef = useRef<FlowJson | null>(null);
  const prevContentFingerprintRef = useRef<string>("");
  const suppressNextHistoryRef = useRef(false);
  const isDraggingRef = useRef(false);
  const latestNodesRef = useRef<FlowNodeType[]>(nodes);
  const latestEdgesRef = useRef<FlowEdge[]>(edges);
  /** Option/Alt + arrastar: RF ainda reporta o id do nó original; redirecionamos posição para o clone. */
  const altDragDupIdMapRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") setSpacePressed(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") setSpacePressed(false);
    };
    const onBlur = () => setSpacePressed(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId && node.selected) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(() => edges.find((edge) => edge.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);
  const allNodeIds = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const allEdgeIds = useMemo(() => edges.map((e) => e.id), [edges]);
  const selectedNodes = useMemo(() => nodes.filter((node) => node.selected), [nodes]);
  const canAlignSelection = useMemo(
    () => selectedNodes.length > 0 && selectedNodes.every((node) => isNodeOutsideLaneGrid(node)),
    [selectedNodes],
  );
  const laneLayoutMetrics = useMemo(() => computeLaneLayoutMetrics(nodes, laneSystem), [nodes, laneSystem]);
  const selectGridHeaderFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = document.querySelector(".canvas-area");
      if (!canvas) return false;
      const rect = canvas.getBoundingClientRect();
      const flowX = (clientX - rect.left - viewport.x) / viewport.zoom;
      const flowY = (clientY - rect.top - viewport.y) / viewport.zoom;

      const columnsStartX = GRID_LANE_TITLE_WIDTH + laneSystem.horizontalGap;
      const columnsSpan = laneSystem.columnWidth + laneSystem.horizontalGap;
      if (flowY >= 0 && flowY <= GRID_HEADER_HEIGHT && flowX >= columnsStartX) {
        const idx = Math.floor((flowX - columnsStartX) / columnsSpan);
        const col = laneSystem.columns[idx];
        if (col) {
          setSelectedColumnTitleId(col.id);
          setSelectedLaneTitleId(null);
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
          return true;
        }
      }

      if (flowX >= 0 && flowX <= GRID_LANE_TITLE_WIDTH && flowY >= GRID_HEADER_HEIGHT + laneSystem.verticalGap) {
        const yInRows = flowY - GRID_HEADER_HEIGHT - laneSystem.verticalGap;
        for (const lane of laneSystem.lanes) {
          const top = laneLayoutMetrics.laneTopById.get(lane.id) ?? 0;
          const h = laneLayoutMetrics.rowHeightByLaneId.get(lane.id) ?? laneSystem.rowMinHeight;
          if (yInRows >= top && yInRows <= top + h) {
            setSelectedLaneTitleId(lane.id);
            setSelectedColumnTitleId(null);
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
            return true;
          }
        }
      }
      return false;
    },
    [laneLayoutMetrics, laneSystem, viewport],
  );
  /** Ponto em coordenadas do fluxo (ex.: centro do nó), não o canto do card. */
  const getClosestCell = useCallback(
    (x: number, y: number): { laneId: string; columnIndex: number } | null => {
      const maxColumns = Math.max(1, laneSystem.columns.length);
      const gridWidth =
        GRID_LANE_TITLE_WIDTH +
        laneSystem.horizontalGap +
        maxColumns * laneSystem.columnWidth +
        (maxColumns - 1) * laneSystem.horizontalGap;
      const lastLaneId = laneSystem.lanes[laneSystem.lanes.length - 1]?.id ?? "";
      const gridHeight =
        GRID_HEADER_HEIGHT +
        laneSystem.verticalGap +
        (laneLayoutMetrics.laneTopById.get(lastLaneId) ?? 0) +
        (laneLayoutMetrics.rowHeightByLaneId.get(lastLaneId) ?? laneSystem.rowMinHeight);
      if (x < 0 || y < 0 || x > gridWidth || y > gridHeight) return null;
      if (x < GRID_LANE_TITLE_WIDTH + laneSystem.horizontalGap || y < GRID_HEADER_HEIGHT + laneSystem.verticalGap) return null;

      let laneId = laneSystem.lanes[0]?.id ?? "";
      for (const lane of laneSystem.lanes) {
        const top = GRID_HEADER_HEIGHT + laneSystem.verticalGap + (laneLayoutMetrics.laneTopById.get(lane.id) ?? 0);
        const h = laneLayoutMetrics.rowHeightByLaneId.get(lane.id) ?? laneSystem.rowMinHeight;
        if (y >= top && y <= top + h) {
          laneId = lane.id;
          break;
        }
        if (y > top) laneId = lane.id;
      }
      const lane = laneSystem.lanes.find((l) => l.id === laneId) ?? laneSystem.lanes[0];
      const colSpan = laneSystem.columnWidth + laneSystem.horizontalGap;
      const localX = x - GRID_LANE_TITLE_WIDTH - laneSystem.horizontalGap;
      const columnIndex = Math.max(0, Math.min((lane?.columnCount ?? 1) - 1, Math.round(localX / colSpan)));
      return { laneId, columnIndex };
    },
    [laneSystem, laneLayoutMetrics],
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      type: defaultEdgePathType,
      style: { ...defaultEdgeStyle },
    }),
    [defaultEdgePathType],
  );

  const persistFlow = useCallback(
    (
      nextNodes: FlowNodeType[],
      nextEdges: FlowEdge[],
      nextLaneSystem: LaneSystem = laneSystem,
      nextTheme: { artboardBackground: string; laneStrongColors: string[] } = theme,
    ) => {
      saveFlowToStorage({ nodes: nextNodes, edges: nextEdges, laneSystem: nextLaneSystem, theme: nextTheme });
    },
    [laneSystem, theme],
  );

  useEffect(() => {
    if (laneSystem.verticalSpacing >= 0) return;
    const nextLaneSystem = { ...laneSystem, verticalSpacing: 0 };
    setLaneSystem(nextLaneSystem);
    const layouted = layoutNodesByLaneSystem(nodes, nextLaneSystem, theme.laneStrongColors);
    setNodes(layouted);
    persistFlow(layouted, edges, nextLaneSystem);
  }, [laneSystem, nodes, edges, persistFlow]);

  useEffect(() => {
    if (laneSystem.horizontalGap >= 32 && laneSystem.verticalGap >= 20) return;
    const nextLaneSystem = {
      ...laneSystem,
      horizontalGap: Math.max(32, laneSystem.horizontalGap),
      verticalGap: Math.max(20, laneSystem.verticalGap),
    };
    setLaneSystem(nextLaneSystem);
    const layouted = layoutNodesByLaneSystem(nodes, nextLaneSystem, theme.laneStrongColors);
    setNodes(layouted);
    persistFlow(layouted, edges, nextLaneSystem);
  }, [laneSystem, nodes, edges, persistFlow]);

  useEffect(() => {
    const endMiddlePan = (e: PointerEvent) => {
      if (e.button === 1) setMiddlePanActive(false);
    };
    const blur = () => setMiddlePanActive(false);
    window.addEventListener("pointerup", endMiddlePan);
    window.addEventListener("pointercancel", endMiddlePan);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerup", endMiddlePan);
      window.removeEventListener("pointercancel", endMiddlePan);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const commitSnapshotToHistory = useCallback((current: FlowJson) => {
    if (!prevSnapshotRef.current) {
      prevSnapshotRef.current = current;
      return;
    }
    const prev = prevSnapshotRef.current;
    const prevSerialized = JSON.stringify(prev);
    const currentSerialized = JSON.stringify(current);
    if (prevSerialized !== currentSerialized) {
      historyPastRef.current.push(cloneFlowSnapshot(prev));
      if (historyPastRef.current.length > HISTORY_LIMIT) {
        historyPastRef.current = historyPastRef.current.slice(-HISTORY_LIMIT);
      }
      historyFutureRef.current = [];
      prevSnapshotRef.current = current;
    }
  }, []);

  const flowCanvasApi = useMemo(
    () => ({
      notifyInteractionStart: () => {
        isDraggingRef.current = true;
      },
      notifyInteractionEnd: () => {
        isDraggingRef.current = false;
        requestAnimationFrame(() => {
          commitSnapshotToHistory(
            cloneFlowSnapshot({
              nodes: latestNodesRef.current,
              edges: latestEdgesRef.current,
              laneSystem,
            }),
          );
        });
      },
    }),
    [commitSnapshotToHistory, laneSystem],
  );

  useEffect(() => {
    latestNodesRef.current = nodes;
    latestEdgesRef.current = edges;

    if (!prevSnapshotRef.current) {
      const initial = cloneFlowSnapshot({ nodes, edges, laneSystem });
      prevSnapshotRef.current = initial;
      prevContentFingerprintRef.current = flowContentFingerprint(nodes, edges, laneSystem);
      return;
    }

    if (suppressNextHistoryRef.current) {
      suppressNextHistoryRef.current = false;
      prevSnapshotRef.current = cloneFlowSnapshot({ nodes, edges, laneSystem });
      prevContentFingerprintRef.current = flowContentFingerprint(nodes, edges, laneSystem);
      return;
    }

    if (isDraggingRef.current) return;

    const fp = flowContentFingerprint(nodes, edges, laneSystem);
    if (fp === prevContentFingerprintRef.current) {
      prevSnapshotRef.current = { nodes, edges, laneSystem };
      return;
    }

    const current = cloneFlowSnapshot({ nodes, edges, laneSystem });
    commitSnapshotToHistory(current);
    prevContentFingerprintRef.current = fp;
  }, [nodes, edges, laneSystem, commitSnapshotToHistory]);

  useEffect(() => {
    if (selectedLaneTitleId && !laneSystem.lanes.some((lane) => lane.id === selectedLaneTitleId)) {
      setSelectedLaneTitleId(null);
    }
    if (selectedColumnTitleId && !laneSystem.columns.some((column) => column.id === selectedColumnTitleId)) {
      setSelectedColumnTitleId(null);
    }
  }, [laneSystem, selectedLaneTitleId, selectedColumnTitleId]);

  const handleUndo = useCallback(() => {
    const previous = historyPastRef.current.pop();
    if (!previous) return;

    const current = cloneFlowSnapshot({ nodes, edges, laneSystem });
    historyFutureRef.current.push(current);
    suppressNextHistoryRef.current = true;
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setLaneSystem(previous.laneSystem ?? DEFAULT_LANE_SYSTEM);
    persistFlow(previous.nodes, previous.edges, previous.laneSystem ?? DEFAULT_LANE_SYSTEM);
  }, [nodes, edges, persistFlow, laneSystem]);

  const handleRedo = useCallback(() => {
    const next = historyFutureRef.current.pop();
    if (!next) return;

    const current = cloneFlowSnapshot({ nodes, edges, laneSystem });
    historyPastRef.current.push(current);
    suppressNextHistoryRef.current = true;
    setNodes(next.nodes);
    setEdges(next.edges);
    setLaneSystem(next.laneSystem ?? DEFAULT_LANE_SYSTEM);
    persistFlow(next.nodes, next.edges, next.laneSystem ?? DEFAULT_LANE_SYSTEM);
  }, [nodes, edges, persistFlow, laneSystem]);

  const onSelectionChange: OnSelectionChangeFunc<FlowNodeType, FlowEdge> = useCallback(({ nodes: selNodes, edges: selEdges }) => {
    if (selNodes.length > 0) {
      setSelectedEdgeId(null);
      setSelectedLaneTitleId(null);
      setSelectedColumnTitleId(null);
      setSelectedNodeId((prev) => {
        if (prev && selNodes.some((n) => n.id === prev)) return prev;
        return selNodes[0]?.id ?? null;
      });
      setEdges((current) => (current.some((e) => e.selected) ? current.map((e) => ({ ...e, selected: false })) : current));
      return;
    }
    setSelectedNodeId(null);
    if (selEdges.length > 0) {
      setSelectedEdgeId(selEdges[0]?.id ?? null);
    } else {
      setSelectedEdgeId(null);
    }
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNodeType>[]) => {
      const dupMap = altDragDupIdMapRef.current;
      const effectiveChanges =
        dupMap && dupMap.size > 0
          ? changes.map((ch) => {
              if (
                (ch.type === "position" || ch.type === "dimensions") &&
                "id" in ch &&
                dupMap.has(ch.id)
              ) {
                return { ...ch, id: dupMap.get(ch.id)! } as NodeChange<FlowNodeType>;
              }
              return ch;
            })
          : changes;

      setNodes((current) => {
        const next = applyNodeChanges(effectiveChanges, current) as FlowNodeType[];
        if (hasDimensionsNodeChanges(effectiveChanges) || hasRemoveNodeChanges(effectiveChanges)) {
          const needsLaneRelayout = next.some(
            (node) => node.data.type !== "anchor" && node.data.laneId && typeof node.data.columnIndex === "number",
          );
          if (needsLaneRelayout) {
            const layouted = layoutNodesByLaneSystem(next, laneSystem, theme.laneStrongColors);
            persistFlow(layouted, edges, laneSystem);
            return layouted;
          }
        }
        if (!isSelectOnlyNodeChanges(effectiveChanges) && !isPositionOnlyNodeChanges(effectiveChanges)) {
          persistFlow(next, edges, laneSystem);
        }
        return next;
      });
    },
    [edges, laneSystem, persistFlow],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      setEdges((current) => {
        const patched = applyEdgeChanges(changes, current) as FlowEdge[];
        const next = patched.map(applyEdgeLineAppearance);
        if (!isSelectOnlyEdgeChanges(changes)) {
          setNodes((currentNodes) => {
            const reconciled = reconcileAnchorFixationByEdges(currentNodes, next).nodes;
            const layouted = layoutNodesByLaneSystem(reconciled, laneSystem, theme.laneStrongColors);
            persistFlow(layouted, next);
            return layouted;
          });
        }
        return next;
      });
    },
    [laneSystem, persistFlow, theme.laneStrongColors],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const currentEdges = latestEdgesRef.current;
      const currentNodes = latestNodesRef.current;
      const edgeId = nextSequentialEdgeId(currentEdges.map((e) => e.id));
      const clearedEdges = currentEdges.map((edge) => ({ ...edge, selected: false }));
      const withNew = addEdge(
        { ...connection, id: edgeId, label: "", type: defaultEdgePathType, data: {} },
        clearedEdges,
      );
      const nextEdges = withNew.map((e) => applyEdgeLineAppearance({ ...e, selected: e.id === edgeId }));

      const unselectedNodes = currentNodes.some((n) => n.selected)
        ? currentNodes.map((n) => ({ ...n, selected: false }))
        : currentNodes;
      const reconciled = reconcileAnchorFixationByEdges(unselectedNodes, nextEdges).nodes;
      const layouted = layoutNodesByLaneSystem(reconciled, laneSystem, theme.laneStrongColors);

      // Atualização síncrona: se os nós continuarem selecionados, `onSelectionChange` zera `selectedEdgeId`.
      flushSync(() => {
        setEdges(nextEdges);
        setNodes(layouted);
        setSelectedEdgeId(edgeId);
        setSelectedNodeId(null);
        setSelectedLaneTitleId(null);
        setSelectedColumnTitleId(null);
      });
      persistFlow(layouted, nextEdges);
    },
    [defaultEdgePathType, laneSystem, persistFlow, theme.laneStrongColors],
  );

  const onEdgeClick: EdgeMouseHandler<Edge> = useCallback((_, edge) => {
    setSelectedLaneTitleId(null);
    setSelectedColumnTitleId(null);
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    setNodes((current) => current.map((n) => ({ ...n, selected: false })));
    setEdges((current) => current.map((e) => ({ ...e, selected: e.id === edge.id })));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedLaneTitleId(null);
    setSelectedColumnTitleId(null);
    setSelectedEdgeId(null);
    setEdges((current) => {
      if (!current.some((e) => e.selected)) return current;
      const next = current.map((e) => ({ ...e, selected: false }));
      persistFlow(latestNodesRef.current, next);
      return next;
    });
  }, [persistFlow]);

  const onNodeDragStart: OnNodeDrag<FlowNodeType> = useCallback((event, _node, dragNodes) => {
    isDraggingRef.current = true;

    if (!event.altKey || event.metaKey || event.ctrlKey) return;

    const sourceNodes = dragNodes;
    if (sourceNodes.length === 0) return;

    const idsToDup = new Set(sourceNodes.map((n) => n.id));
    const idMap = new Map<string, string>();
    const currentNodes = latestNodesRef.current;
    const toClone = sourceNodes.map((d) => currentNodes.find((c) => c.id === d.id) ?? d);
    const sourceNodeIdSet = new Set(toClone.map((n) => n.id));
    const snapshotEdges = latestEdgesRef.current;
    const internalEdges = snapshotEdges.filter(
      (edge) => sourceNodeIdSet.has(edge.source) && sourceNodeIdSet.has(edge.target),
    );

    const usedIds = new Set<string>();
    currentNodes.forEach((n) => usedIds.add(n.id));
    snapshotEdges.forEach((e) => usedIds.add(e.id));

    toClone.forEach((n) => {
      const newId = nextDuplicateNodeId(n.id, usedIds);
      usedIds.add(newId);
      idMap.set(n.id, newId);
    });

    const dupNodes: FlowNodeType[] = toClone.map((n) => {
      const newId = idMap.get(n.id)!;
      const currentAnchorTo = typeof n.data.anchorToNodeId === "string" ? n.data.anchorToNodeId : undefined;
      const remappedAnchorTo = currentAnchorTo ? (idMap.get(currentAnchorTo) ?? currentAnchorTo) : undefined;
      return {
        ...n,
        id: newId,
        selected: true,
        position: { ...n.position },
        data: { ...n.data, id: newId, anchorToNodeId: remappedAnchorTo },
      };
    });

    const dupEdges: FlowEdge[] = internalEdges.map((edge) => {
      const newEdgeId = nextSequentialEdgeId(usedIds);
      usedIds.add(newEdgeId);
      return applyEdgeLineAppearance({
        ...edge,
        id: newEdgeId,
        source: idMap.get(edge.source) ?? edge.source,
        target: idMap.get(edge.target) ?? edge.target,
        selected: false,
      });
    });

    altDragDupIdMapRef.current = idMap;

    flushSync(() => {
      setNodes((current) => {
        const next = current.map((n) => (idsToDup.has(n.id) ? { ...n, selected: false } : n));
        return [...next, ...dupNodes];
      });
      setEdges((current) => [...current, ...dupEdges]);
    });
  }, []);
  const onNodeDrag: OnNodeDrag<FlowNodeType> = useCallback(
    (_, node, dragNodes) => {
      const cloneId = altDragDupIdMapRef.current?.get(node.id);
      const live = latestNodesRef.current;
      const n = cloneId ? (live.find((x) => x.id === cloneId) ?? node) : node;
      const dragTargetId = cloneId ?? node.id;
      const draggingIds = new Set((dragNodes ?? [node]).map((d) => altDragDupIdMapRef.current?.get(d.id) ?? d.id));

      if (isNodeOutsideLaneGrid(n)) {
        const isRoutePoint = n.data.type === "anchor";
        const { w, h } = getNodeLayoutSize(n);
        const cx = n.position.x + w / 2;
        const cy = n.position.y + h / 2;
        let snapX: number | null = null;
        let snapY: number | null = null;
        let bestDx = Number.POSITIVE_INFINITY;
        let bestDy = Number.POSITIVE_INFINITY;

        live.forEach((candidate) => {
          if (draggingIds.has(candidate.id)) return;
          if (!isRoutePoint && !isNodeOutsideLaneGrid(candidate)) return;
          const { w: cw, h: ch } = getNodeLayoutSize(candidate);
          const ccx = candidate.position.x + cw / 2;
          const ccy = candidate.position.y + ch / 2;
          const dx = Math.abs(ccx - cx);
          const dy = Math.abs(ccy - cy);
          if (dx <= OUTSIDE_LANE_SNAP_THRESHOLD && dx < bestDx) {
            snapX = ccx;
            bestDx = dx;
          }
          if (dy <= OUTSIDE_LANE_SNAP_THRESHOLD && dy < bestDy) {
            snapY = ccy;
            bestDy = dy;
          }
        });
        setDragSnapGuide((prev) => (prev.x === snapX && prev.y === snapY ? prev : { x: snapX, y: snapY }));

        if (snapX !== null || snapY !== null) {
          setNodes((current) =>
            current.map((item) => {
              if (item.id !== dragTargetId) return item;
              const size = getNodeLayoutSize(item);
              const nextX = snapX !== null ? snapX - size.w / 2 : item.position.x;
              const nextY = snapY !== null ? snapY - size.h / 2 : item.position.y;
              if (nextX === item.position.x && nextY === item.position.y) return item;
              return { ...item, position: { x: nextX, y: nextY } };
            }),
          );
        }
      } else {
        setDragSnapGuide((prev) => (prev.x === null && prev.y === null ? prev : { x: null, y: null }));
      }

      if (n.data.type === "anchor") return;
      const { w, h } = getNodeLayoutSize(n);
      setHoveredCell(getClosestCell(n.position.x + w / 2, n.position.y + h / 2));
    },
    [getClosestCell],
  );

  const onNodeDragStop: OnNodeDrag<FlowNodeType> = useCallback(
    (_, draggedNode) => {
      isDraggingRef.current = false;
      setHoveredCell(null);
      const snapGuideSnapshot = dragSnapGuide;
      const dupMapSnapshot = altDragDupIdMapRef.current;
      setDragSnapGuide({ x: null, y: null });

      if (draggedNode.data.type === "anchor") {
        altDragDupIdMapRef.current = null;
        const dragFinalId = dupMapSnapshot?.get(draggedNode.id) ?? draggedNode.id;
        setNodes((current) => {
          let next = current;
          if (snapGuideSnapshot.x !== null || snapGuideSnapshot.y !== null) {
            next = current.map((node) => {
              if (node.id !== dragFinalId) return node;
              if (!isNodeOutsideLaneGrid(node)) return node;
              const { w, h } = getNodeLayoutSize(node);
              const nextX = snapGuideSnapshot.x !== null ? snapGuideSnapshot.x - w / 2 : node.position.x;
              const nextY = snapGuideSnapshot.y !== null ? snapGuideSnapshot.y - h / 2 : node.position.y;
              if (nextX === node.position.x && nextY === node.position.y) return node;
              return { ...node, position: { x: nextX, y: nextY } };
            });
          }
          const movedAnchor = next.find((n) => n.id === dragFinalId && n.data.type === "anchor");
          if (movedAnchor?.data.anchorToNodeId && movedAnchor.data.anchorFollowReferenceDisabled !== true) {
            const target = next.find((n) => n.id === movedAnchor.data.anchorToNodeId);
            if (target && target.id !== movedAnchor.id) {
              const { w: aw, h: ah } = getNodeLayoutSize(movedAnchor);
              const { w: tw, h: th } = getNodeLayoutSize(target);
              const anchorCenterX = movedAnchor.position.x + aw / 2;
              const anchorCenterY = movedAnchor.position.y + ah / 2;
              const targetCenterX = target.position.x + tw / 2;
              const targetCenterY = target.position.y + th / 2;
              next = next.map((n) =>
                n.id !== movedAnchor.id
                  ? n
                  : {
                      ...n,
                      data: {
                        ...n.data,
                        anchorOffsetX: anchorCenterX - targetCenterX,
                        anchorOffsetY: anchorCenterY - targetCenterY,
                      },
                    },
              );
            }
          }
          persistFlow(next, latestEdgesRef.current, laneSystem);
          return next;
        });
        return;
      }

      requestAnimationFrame(() => {
        setNodes((current) => {
          const dragFinalId = dupMapSnapshot?.get(draggedNode.id) ?? draggedNode.id;
          const snappedCurrent =
            snapGuideSnapshot.x !== null || snapGuideSnapshot.y !== null
              ? current.map((node) => {
                  if (node.id !== dragFinalId) return node;
                  if (!isNodeOutsideLaneGrid(node)) return node;
                  const { w, h } = getNodeLayoutSize(node);
                  const nextX = snapGuideSnapshot.x !== null ? snapGuideSnapshot.x - w / 2 : node.position.x;
                  const nextY = snapGuideSnapshot.y !== null ? snapGuideSnapshot.y - h / 2 : node.position.y;
                  if (nextX === node.position.x && nextY === node.position.y) return node;
                  return { ...node, position: { x: nextX, y: nextY } };
                })
              : current;

          const selectedIds = new Set(snappedCurrent.filter((n) => n.selected).map((n) => n.id));
          const altDupDrag = dupMapSnapshot && dupMapSnapshot.size > 0 && dupMapSnapshot.has(draggedNode.id);
          const idsToMove = altDupDrag
            ? new Set(
                [...selectedIds].filter((id) => snappedCurrent.find((n) => n.id === id)?.data.type !== "anchor"),
              )
            : selectedIds.size > 1 && selectedIds.has(draggedNode.id)
              ? new Set([...selectedIds].filter((id) => snappedCurrent.find((n) => n.id === id)?.data.type !== "anchor"))
              : new Set([draggedNode.id]);

          const moved = snappedCurrent.map((node) => {
            if (!idsToMove.has(node.id)) return node;
            const { w, h } = getNodeLayoutSize(node);
            const cx = node.position.x + w / 2;
            const cy = node.position.y + h / 2;
            const nextCell = getClosestCell(cx, cy);
            return nextCell
              ? { ...node, data: { ...node.data, laneId: nextCell.laneId, columnIndex: nextCell.columnIndex } }
              : { ...node, data: { ...node.data, laneId: undefined, columnIndex: undefined } };
          });

          const layouted = layoutNodesByLaneSystem(moved, laneSystem, theme.laneStrongColors);
          persistFlow(layouted, latestEdgesRef.current, laneSystem);
          requestAnimationFrame(() => {
            commitSnapshotToHistory(
              cloneFlowSnapshot({
                nodes: layouted,
                edges: latestEdgesRef.current,
                laneSystem,
              }),
            );
          });
          return layouted;
        });
        altDragDupIdMapRef.current = null;
      });
    },
    [commitSnapshotToHistory, dragSnapGuide, laneSystem, persistFlow, getClosestCell],
  );

  const handleAddNode = useCallback(
    (nodeType: FlowNodeType["data"]["type"]) => {
      const canvas = document.querySelector(".canvas-area");
      const rect = canvas?.getBoundingClientRect();
      const isAnchor = nodeType === "anchor";
      const w = isAnchor ? ANCHOR_NODE_SIZE : DEFAULT_FLOW_CARD_WIDTH;
      const h = isAnchor ? ANCHOR_NODE_SIZE : DEFAULT_FLOW_CARD_HEIGHT_FALLBACK;
      let centerFlowX = 400;
      let centerFlowY = 300;
      if (rect && rect.width > 0 && rect.height > 0) {
        centerFlowX = (rect.width / 2 - viewport.x) / viewport.zoom;
        centerFlowY = (rect.height / 2 - viewport.y) / viewport.zoom;
      }
      const position = {
        x: centerFlowX - w / 2,
        y: centerFlowY - h / 2,
      };

      setNodes((current) => {
        const newNodeId = nextSequentialNodeId(current.map((n) => n.id));
        const newNode = { ...createFlowNode(nodeType, newNodeId, position), selected: true };
        const next = layoutNodesByLaneSystem(
          [...current.map((node) => ({ ...node, selected: false })), newNode],
          laneSystem,
          theme.laneStrongColors,
        );
        setSelectedNodeId(newNode.id);
        setSelectedEdgeId(null);
        setSelectedLaneTitleId(null);
        setSelectedColumnTitleId(null);
        setEdges((allEdges) => (allEdges.some((e) => e.selected) ? allEdges.map((e) => ({ ...e, selected: false })) : allEdges));
        persistFlow(next, edges);
        return next;
      });
    },
    [edges, persistFlow, laneSystem, viewport],
  );

  const handleAddLaneRow = useCallback(() => {
    const maxColumns = Math.max(1, laneSystem.columns.length);
    const nextLaneSystem: LaneSystem = {
      ...laneSystem,
      lanes: [
        ...laneSystem.lanes,
        {
          id: `lane-${Date.now()}`,
          title: `Raia ${laneSystem.lanes.length + 1}`,
          order: laneSystem.lanes.length,
          columnCount: maxColumns,
        },
      ],
    };
    setLaneSystem(nextLaneSystem);
    const layouted = layoutNodesByLaneSystem(nodes, nextLaneSystem, theme.laneStrongColors);
    setNodes(layouted);
    persistFlow(layouted, edges, nextLaneSystem);
  }, [laneSystem, nodes, edges, persistFlow]);

  const handleAddLaneColumn = useCallback(() => {
    const nextLaneSystem: LaneSystem = {
      ...laneSystem,
      columns: [
        ...laneSystem.columns,
        { id: `col-${Date.now()}`, title: `Coluna ${laneSystem.columns.length + 1}` },
      ],
      lanes: laneSystem.lanes.map((lane) => ({ ...lane, columnCount: lane.columnCount + 1 })),
    };
    setLaneSystem(nextLaneSystem);
    const layouted = layoutNodesByLaneSystem(nodes, nextLaneSystem, theme.laneStrongColors);
    setNodes(layouted);
    persistFlow(layouted, edges, nextLaneSystem);
  }, [laneSystem, nodes, edges, persistFlow]);

  const handleRemoveLaneRow = useCallback(
    (laneId: string) => {
      if (laneSystem.lanes.length <= 1) {
        window.alert("É necessário manter pelo menos uma raia.");
        return;
      }
      const hasNodes = nodes.some((node) => node.data.type !== "anchor" && node.data.laneId === laneId);
      if (hasNodes) {
        window.alert("Não é possível excluir a raia: existem nós dentro dela.");
        return;
      }
      const nextLanes = laneSystem.lanes
        .filter((lane) => lane.id !== laneId)
        .map((lane, index) => ({ ...lane, order: index }));
      const nextLaneSystem: LaneSystem = { ...laneSystem, lanes: nextLanes };
      setLaneSystem(nextLaneSystem);
      const layouted = layoutNodesByLaneSystem(nodes, nextLaneSystem, theme.laneStrongColors);
      setNodes(layouted);
      persistFlow(layouted, edges, nextLaneSystem);
    },
    [laneSystem, nodes, edges, persistFlow],
  );

  const handleRemoveLaneColumn = useCallback(() => {
    const minColumns = laneSystem.columns.length;
    if (!Number.isFinite(minColumns) || minColumns <= 1) {
      window.alert("É necessário manter pelo menos uma coluna.");
      return;
    }
    const targetColumn = minColumns - 1;
    const hasNodes = nodes.some(
      (node) => node.data.type !== "anchor" && Number(node.data.columnIndex ?? 0) === targetColumn,
    );
    if (hasNodes) {
      window.alert("Não é possível excluir a última coluna: existem nós dentro dela.");
      return;
    }
    const nextLaneSystem: LaneSystem = {
      ...laneSystem,
      columns: laneSystem.columns.slice(0, -1),
      lanes: laneSystem.lanes.map((lane) => ({ ...lane, columnCount: lane.columnCount - 1 })),
    };
    setLaneSystem(nextLaneSystem);
    const layouted = layoutNodesByLaneSystem(nodes, nextLaneSystem, theme.laneStrongColors);
    setNodes(layouted);
    persistFlow(layouted, edges, nextLaneSystem);
  }, [laneSystem, nodes, edges, persistFlow]);

  const handleUpdateLaneTitle = useCallback(
    (laneId: string, title: string) => {
      const nextLaneSystem: LaneSystem = {
        ...laneSystem,
        lanes: laneSystem.lanes.map((lane) => (lane.id === laneId ? { ...lane, title: title || lane.title } : lane)),
      };
      setLaneSystem(nextLaneSystem);
      persistFlow(nodes, edges, nextLaneSystem);
    },
    [laneSystem, nodes, edges, persistFlow],
  );

  const handleUpdateColumnTitle = useCallback(
    (columnId: string, title: string) => {
      const nextLaneSystem: LaneSystem = {
        ...laneSystem,
        columns: laneSystem.columns.map((column) =>
          column.id === columnId ? { ...column, title: title || column.title } : column,
        ),
      };
      setLaneSystem(nextLaneSystem);
      persistFlow(nodes, edges, nextLaneSystem);
    },
    [laneSystem, nodes, edges, persistFlow],
  );

  const handleSelectLaneTitle = useCallback((laneId: string) => {
    setSelectedLaneTitleId(laneId);
    setSelectedColumnTitleId(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const handleSelectColumnHeader = useCallback((columnId: string) => {
    setSelectedColumnTitleId(columnId);
    setSelectedLaneTitleId(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const handleUpdateArtboardBackground = useCallback(
    (value: string) => {
      const next = normalizeHexColor(value, theme.artboardBackground);
      const nextTheme = { ...theme, artboardBackground: next };
      setTheme(nextTheme);
      persistFlow(nodes, edges, laneSystem, nextTheme);
    },
    [theme, nodes, edges, laneSystem, persistFlow],
  );

  const handleUpdateLaneStrongColor = useCallback(
    (index: number, value: string) => {
      if (index < 0 || index >= theme.laneStrongColors.length) return;
      const nextColor = normalizeHexColor(value, theme.laneStrongColors[index]);
      const nextColors = [...theme.laneStrongColors];
      nextColors[index] = nextColor;
      const nextTheme = { ...theme, laneStrongColors: nextColors };
      setTheme(nextTheme);

      const laneIndexById = new Map(laneSystem.lanes.map((lane, i) => [lane.id, i]));
      const nextNodes = nodes.map((node) => {
        if (node.data.type === "anchor" || !node.data.laneId || typeof node.data.columnIndex !== "number") return node;
        const laneIndex = laneIndexById.get(node.data.laneId);
        if (laneIndex === undefined) return node;
        const colorForLane = nextColors[laneIndex % nextColors.length];
        if (node.data.laneColorStrong === colorForLane) return node;
        return { ...node, data: { ...node.data, laneColorStrong: colorForLane } };
      });
      setNodes(nextNodes);
      persistFlow(nextNodes, edges, laneSystem, nextTheme);
    },
    [theme, laneSystem, nodes, edges, persistFlow],
  );

  const handleUpdateNode = useCallback(
    (nodeId: string, patch: Partial<FlowNodeType["data"]>) => {
      setNodes((current) => {
        const next = current.map((node) => {
          if (node.id !== nodeId) return node;
          return {
            ...node,
            data: {
              ...node.data,
              ...patch,
            },
          };
        });
        const updatedNode = next.find((node) => node.id === nodeId);
        let nextEdges = remapCenterHandlesToSides(edges, next, new Set([nodeId]));
        const anchorShapeChanged = patch.anchorShape !== undefined;
        const shouldRefreshConnectedEdges =
          anchorShapeChanged && updatedNode?.data.type === "anchor";

        if (updatedNode && patch.connectorsPerSide) {
          const allowCenterHandle =
            updatedNode.data.type === "anchor" && normalizeAnchorShape(updatedNode.data.anchorShape) === "single-center";
          const validHandleIds = getValidHandleIds(updatedNode.data.connectorsPerSide, allowCenterHandle);
          nextEdges = nextEdges.filter((edge) => !edgeUsesRemovedHandle(edge, nodeId, validHandleIds));
          if (nextEdges !== edges) {
            setEdges(nextEdges);
            if (selectedEdgeId && !nextEdges.some((edge) => edge.id === selectedEdgeId)) {
              setSelectedEdgeId(null);
            }
          }
        }

        if (shouldRefreshConnectedEdges) {
          const refreshed = nextEdges.map((edge) =>
            edge.source === nodeId || edge.target === nodeId ? { ...edge } : edge,
          );
          if (refreshed.some((edge, index) => edge !== nextEdges[index])) {
            nextEdges = refreshed;
            setEdges(nextEdges);
          }
        }

        nextEdges = stampAnchorEndpointMode(nextEdges, next, new Set([nodeId]));
        if (nextEdges !== edges) setEdges(nextEdges);

        persistFlow(next, nextEdges);
        return next;
      });
    },
    [edges, persistFlow, selectedEdgeId],
  );

  const handleUpdateEdge = useCallback(
    (edgeId: string, patch: Partial<FlowEdge>) => {
      setEdges((current) => {
        const next = current.map((edge) => {
          if (edge.id !== edgeId) return edge;
          const merged =
            patch.data !== undefined
              ? (() => {
                  const patchD = patch.data as Record<string, unknown>;
                  const nextD = { ...(edge.data as Record<string, unknown>), ...patchD };
                  for (const k of Object.keys(patchD)) {
                    if (patchD[k] === undefined) delete nextD[k];
                  }
                  return { ...edge, ...patch, data: nextD as FlowEdge["data"] };
                })()
              : { ...edge, ...patch };
          return applyEdgeLineAppearance(merged);
        });
        persistFlow(nodes, next);
        return next;
      });
    },
    [nodes, persistFlow],
  );

  const handleRenameNodeId = useCallback((oldId: string, rawNext: string) => {
    const newId = sanitizeFlowElementId(rawNext);
    if (!newId) return false;
    if (newId === oldId) return true;
    const current = latestNodesRef.current;
    if (current.some((n) => n.id === newId)) return false;
    const nextNodes = current.map((node) =>
      node.id === oldId ? { ...node, id: newId, data: { ...node.data, id: newId } } : node,
    );
    const nextEdges = latestEdgesRef.current.map((edge) => ({
      ...edge,
      source: edge.source === oldId ? newId : edge.source,
      target: edge.target === oldId ? newId : edge.target,
    }));
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNodeId((prev) => (prev === oldId ? newId : prev));
    persistFlow(nextNodes, nextEdges);
    return true;
  }, [persistFlow]);

  const handleRenameEdgeId = useCallback(
    (oldId: string, rawNext: string) => {
      const newId = sanitizeFlowElementId(rawNext);
      if (!newId) return false;
      if (newId === oldId) return true;
      const current = latestEdgesRef.current;
      if (current.some((e) => e.id === newId)) return false;
      const next = current.map((edge) =>
        edge.id === oldId ? applyEdgeLineAppearance({ ...edge, id: newId }) : edge,
      );
      setEdges(next);
      setSelectedEdgeId((prev) => (prev === oldId ? newId : prev));
      persistFlow(latestNodesRef.current, next);
      return true;
    },
    [persistFlow],
  );

  const handleUpdateNodeChannels = useCallback(
    (nodeId: string, channels: FlowChannel[]) => {
      setNodes((current) => {
        const next = current.map((node) => {
          if (node.id !== nodeId) return node;
          const normalized = channels
            .filter((channel) => channel !== "none")
            .filter((channel, index, arr) => arr.indexOf(channel) === index)
            .slice(0, 5);
          const nextPrimary = normalized[0] ?? "none";
          return {
            ...node,
            data: {
              ...node.data,
              channels: normalized,
              channel: nextPrimary,
            },
          };
        });
        persistFlow(next, edges);
        return next;
      });
    },
    [edges, persistFlow],
  );

  const handleToggleAnchorFollowReference = useCallback(
    (anchorNodeId: string) => {
      setNodes((current) => {
        const anchor = current.find((n) => n.id === anchorNodeId && n.data.type === "anchor");
        if (!anchor) return current;
        const isCurrentlyDisabled = anchor.data.anchorFollowReferenceDisabled === true;
        const nextDisabled = !isCurrentlyDisabled;
        const patched = current.map((n) => {
          if (n.id !== anchorNodeId || n.data.type !== "anchor") return n;
          if (nextDisabled) {
            return {
              ...n,
              data: {
                ...n.data,
                anchorFollowReferenceDisabled: true,
                anchorToNodeId: undefined,
                anchorOffsetX: undefined,
                anchorOffsetY: undefined,
              },
            };
          }
          return { ...n, data: { ...n.data, anchorFollowReferenceDisabled: false } };
        });
        const reconciled = reconcileAnchorFixationByEdges(patched, edges).nodes;
        const layouted = layoutNodesByLaneSystem(reconciled, laneSystem, theme.laneStrongColors);
        persistFlow(layouted, edges);
        return layouted;
      });
    },
    [edges, laneSystem, persistFlow, theme.laneStrongColors],
  );

  const handleUpdateSelectedNodesConnectorCount = useCallback(
    (side: keyof FlowNodeConnectorsPerSide, value: number) => {
      const nextValue = Math.max(0, Math.min(5, Math.round(value)));
      setNodes((current) => {
        const next = current.map((node) => {
          if (!node.selected || node.data.type === "anchor") return node;
          return {
            ...node,
            data: {
              ...node.data,
              connectorsPerSide: {
                ...node.data.connectorsPerSide,
                [side]: nextValue,
              },
            },
          };
        });
        persistFlow(next, edges);
        return next;
      });
    },
    [edges, persistFlow],
  );

  const handleUpdateSelectedNodesAnchorShape = useCallback(
    (shape: AnchorShape) => {
      setNodes((current) => {
        let changed = false;
        const selectedAnchorIds = new Set<string>();
        const next = current.map((node) => {
          if (!node.selected || node.data.type !== "anchor") return node;
          selectedAnchorIds.add(node.id);
          const currentShape = normalizeAnchorShape(node.data.anchorShape);
          if (currentShape === shape) return node;
          changed = true;
          return {
            ...node,
            data: {
              ...node.data,
              anchorShape: shape,
            },
          };
        });
        if (!changed) return current;
        let nextEdges = remapCenterHandlesToSides(edges, next, selectedAnchorIds);
        nextEdges = stampAnchorEndpointMode(nextEdges, next, selectedAnchorIds);
        const refreshed = nextEdges.map((edge) =>
          selectedAnchorIds.has(edge.source) || selectedAnchorIds.has(edge.target) ? { ...edge } : edge,
        );
        if (refreshed.some((edge, index) => edge !== nextEdges[index])) {
          nextEdges = refreshed;
        }
        if (nextEdges !== edges) setEdges(nextEdges);
        persistFlow(next, nextEdges);
        return next;
      });
    },
    [edges, persistFlow],
  );

  const handleImportJson = useCallback(
    (raw: string) => {
      try {
        const parsed = JSON.parse(raw) as FlowJson;
        if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
          throw new Error("JSON inválido");
        }
        const normalized = normalizeFlow(parsed);
        setLaneSystem(normalized.laneSystem ?? DEFAULT_LANE_SYSTEM);
        setTheme(normalizeTheme(normalized.theme));
        const layouted = layoutNodesByLaneSystem(
          normalized.nodes,
          normalized.laneSystem ?? DEFAULT_LANE_SYSTEM,
          normalized.theme?.laneStrongColors,
        );
        setNodes(layouted);
        setEdges(normalized.edges);
        setSelectedNodeId(layouted[0]?.id ?? null);
        setSelectedEdgeId(null);
        persistFlow(
          layouted,
          normalized.edges,
          normalized.laneSystem ?? DEFAULT_LANE_SYSTEM,
          normalizeTheme(normalized.theme),
        );
      } catch {
        window.alert("Não foi possível carregar o JSON. Verifique o formato.");
      }
    },
    [persistFlow],
  );

  const handleLoadProjectFlow = useCallback(async () => {
    try {
      const response = await fetch("/flows/flow.json", { cache: "no-store" });
      if (!response.ok) throw new Error("arquivo não encontrado");
      const parsed = (await response.json()) as FlowJson;
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        throw new Error("json inválido");
      }
      const normalized = normalizeFlow(parsed);
      setLaneSystem(normalized.laneSystem ?? DEFAULT_LANE_SYSTEM);
      setTheme(normalizeTheme(normalized.theme));
      const layouted = layoutNodesByLaneSystem(
        normalized.nodes,
        normalized.laneSystem ?? DEFAULT_LANE_SYSTEM,
        normalized.theme?.laneStrongColors,
      );
      setNodes(layouted);
      setEdges(normalized.edges);
      setSelectedNodeId(layouted[0]?.id ?? null);
      setSelectedEdgeId(null);
      persistFlow(
        layouted,
        normalized.edges,
        normalized.laneSystem ?? DEFAULT_LANE_SYSTEM,
        normalizeTheme(normalized.theme),
      );
      window.alert("Fluxo carregado de /flows/flow.json.");
    } catch {
      window.alert("Não foi possível carregar /flows/flow.json.");
    }
  }, [persistFlow]);

  useEffect(() => {
    if (persisted) return;
    void handleLoadProjectFlow();
  }, [persisted, handleLoadProjectFlow]);

  const postFlowToProjectFile = useCallback(async (payload: FlowJson, opts?: { silent?: boolean }) => {
    try {
      const response = await fetch("/api/save-flow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("falha ao salvar");
      if (!opts?.silent) window.alert("Salvo em /public/flows/flow.json.");
    } catch {
      if (!opts?.silent) {
        window.alert("Não foi possível salvar no arquivo do projeto.");
      } else {
        console.warn(
          "ai2flow: salvamento automático em flow.json falhou (em dev, use `npm run dev`; em build estático não há /api/save-flow).",
        );
      }
    }
  }, []);

  const handleSaveProjectFlow = useCallback(() => {
    void postFlowToProjectFile({ nodes, edges, laneSystem, theme }, { silent: false });
  }, [nodes, edges, laneSystem, theme, postFlowToProjectFile]);

  const latestFlowPayloadRef = useRef({ nodes, edges, laneSystem, theme });
  latestFlowPayloadRef.current = { nodes, edges, laneSystem, theme };
  const prevFingerprintForAutosaveRef = useRef<string | null>(null);

  useEffect(() => {
    const fp = `${flowContentFingerprint(nodes, edges, laneSystem)}|${JSON.stringify(theme)}`;
    if (prevFingerprintForAutosaveRef.current === null) {
      prevFingerprintForAutosaveRef.current = fp;
      return;
    }
    if (fp === prevFingerprintForAutosaveRef.current) return;
    prevFingerprintForAutosaveRef.current = fp;
    const timer = window.setTimeout(() => {
      void postFlowToProjectFile(latestFlowPayloadRef.current, { silent: true });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [nodes, edges, laneSystem, theme, postFlowToProjectFile]);

  const handleExportFlowSvg = useCallback(() => {
    const root = document.querySelector<HTMLElement>(".canvas-area .react-flow");
    if (!root) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const svg = buildFlowSvgFromDom(root, nodes);
        if (svg) {
          const stamp = new Date().toISOString().slice(0, 10);
          downloadSvgFile(`fluxo-ai2flow-${stamp}.svg`, svg);
        }
      });
    });
  }, [nodes]);

  const handleSaveAs = useCallback(() => {
    const payload: FlowJson = { nodes, edges, laneSystem, theme };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "flow.json";
    link.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, laneSystem, theme]);

  const handleOpenFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        handleImportJson(text);
      } catch {
        window.alert("Não foi possível ler o arquivo selecionado.");
      }
    },
    [handleImportJson],
  );

  const applyAlignment = useCallback(
    (
      action:
        | "left"
        | "right"
        | "top"
        | "bottom"
        | "center-horizontal"
        | "center-vertical"
        | "distribute-horizontal"
        | "distribute-vertical",
    ) => {
      setNodes((current) => {
        const freeSelected = current.filter((n) => n.selected && isNodeOutsideLaneGrid(n));
        if (freeSelected.length === 0) return current;

        const boxes = freeSelected.map((n) => {
          const { w, h } = getNodeLayoutSize(n);
          const x = n.position.x;
          const y = n.position.y;
          return {
            id: n.id,
            w,
            h,
            x,
            y,
            right: x + w,
            bottom: y + h,
            cx: x + w / 2,
            cy: y + h / 2,
          };
        });

        const posById = new Map<string, { x: number; y: number }>();
        if (action === "left") {
          const target = Math.min(...boxes.map((b) => b.x));
          for (const b of boxes) {
            posById.set(b.id, { x: target, y: b.y });
          }
        } else if (action === "right") {
          const target = Math.max(...boxes.map((b) => b.right));
          for (const b of boxes) {
            posById.set(b.id, { x: target - b.w, y: b.y });
          }
        } else if (action === "top") {
          const target = Math.min(...boxes.map((b) => b.y));
          for (const b of boxes) {
            posById.set(b.id, { x: b.x, y: target });
          }
        } else if (action === "bottom") {
          const target = Math.max(...boxes.map((b) => b.bottom));
          for (const b of boxes) {
            posById.set(b.id, { x: b.x, y: target - b.h });
          }
        } else if (action === "center-horizontal") {
          const target = boxes.reduce((s, b) => s + b.cx, 0) / boxes.length;
          for (const b of boxes) {
            posById.set(b.id, { x: target - b.w / 2, y: b.y });
          }
        } else if (action === "center-vertical") {
          const target = boxes.reduce((s, b) => s + b.cy, 0) / boxes.length;
          for (const b of boxes) {
            posById.set(b.id, { x: b.x, y: target - b.h / 2 });
          }
        } else if (action === "distribute-horizontal") {
          if (boxes.length < 3) return current;
          const ordered = [...boxes].sort((a, b) => a.x - b.x);
          const minLeft = ordered[0]?.x ?? 0;
          const maxRight = ordered[ordered.length - 1]?.right ?? 0;
          const totalWidth = ordered.reduce((sum, b) => sum + b.w, 0);
          const gap = (maxRight - minLeft - totalWidth) / (ordered.length - 1);
          let cursorX = minLeft;
          ordered.forEach((b) => {
            posById.set(b.id, { x: cursorX, y: b.y });
            cursorX += b.w + gap;
          });
        } else {
          if (boxes.length < 3) return current;
          const ordered = [...boxes].sort((a, b) => a.y - b.y);
          const minTop = ordered[0]?.y ?? 0;
          const maxBottom = ordered[ordered.length - 1]?.bottom ?? 0;
          const totalHeight = ordered.reduce((sum, b) => sum + b.h, 0);
          const gap = (maxBottom - minTop - totalHeight) / (ordered.length - 1);
          let cursorY = minTop;
          ordered.forEach((b) => {
            posById.set(b.id, { x: b.x, y: cursorY });
            cursorY += b.h + gap;
          });
        }

        let changed = false;
        const next = current.map((node) => {
          const p = posById.get(node.id);
          if (!p) return node;
          if (Math.abs(node.position.x - p.x) > 0.01 || Math.abs(node.position.y - p.y) > 0.01) {
            changed = true;
            return { ...node, position: p };
          }
          return node;
        });
        if (!changed) return current;
        persistFlow(next, latestEdgesRef.current);
        return next;
      });
    },
    [persistFlow],
  );

  const applyLayerAction = useCallback(
    (action: LayerAction) => {
      setNodes((current) => {
        const freeIndices: number[] = [];
        for (let i = 0; i < current.length; i += 1) {
          if (isNodeOutsideLaneGrid(current[i])) freeIndices.push(i);
        }
        if (freeIndices.length < 2) return current;

        const freeNodes = freeIndices.map((i) => current[i]);
        const selectedMask = freeNodes.map((n) => n.selected);
        if (!selectedMask.some(Boolean)) return current;

        if (action === "forward") {
          for (let i = freeNodes.length - 2; i >= 0; i -= 1) {
            if (!selectedMask[i] || selectedMask[i + 1]) continue;
            [freeNodes[i], freeNodes[i + 1]] = [freeNodes[i + 1], freeNodes[i]];
            [selectedMask[i], selectedMask[i + 1]] = [selectedMask[i + 1], selectedMask[i]];
          }
        } else if (action === "backward") {
          for (let i = 1; i < freeNodes.length; i += 1) {
            if (!selectedMask[i] || selectedMask[i - 1]) continue;
            [freeNodes[i], freeNodes[i - 1]] = [freeNodes[i - 1], freeNodes[i]];
            [selectedMask[i], selectedMask[i - 1]] = [selectedMask[i - 1], selectedMask[i]];
          }
        } else if (action === "front") {
          const picked = freeNodes.filter((n) => n.selected);
          const rest = freeNodes.filter((n) => !n.selected);
          freeNodes.splice(0, freeNodes.length, ...rest, ...picked);
        } else {
          const picked = freeNodes.filter((n) => n.selected);
          const rest = freeNodes.filter((n) => !n.selected);
          freeNodes.splice(0, freeNodes.length, ...picked, ...rest);
        }

        const next = [...current];
        freeIndices.forEach((idx, i) => {
          next[idx] = freeNodes[i];
        });
        persistFlow(next, latestEdgesRef.current);
        return next;
      });
    },
    [persistFlow],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isEditable) return;

      const key = event.key.toLowerCase();

      // Option/Alt + tecla física — alinhamento (macOS: Option muda `key` p/ å etc.; usar `code`)
      if (event.altKey && !event.metaKey && !event.ctrlKey) {
        const alignByCode: Record<string, Parameters<typeof applyAlignment>[0]> = {
          KeyA: "left",
          KeyD: "right",
          KeyW: "top",
          KeyS: "bottom",
          KeyH: "center-horizontal",
          KeyV: "center-vertical",
        };
        const action = alignByCode[event.code];
        if (action) {
          event.preventDefault();
          event.stopPropagation();
          applyAlignment(action);
          return;
        }
      }

      const commandPressed = event.metaKey || event.ctrlKey;
      if (!commandPressed) return;

      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (key === "z") {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (key === "]") {
        event.preventDefault();
        applyLayerAction(event.shiftKey ? "front" : "forward");
        return;
      }
      if (key === "[") {
        event.preventDefault();
        applyLayerAction(event.shiftKey ? "back" : "backward");
        return;
      }

      if (key === "c") {
        const selectedNodes = nodes.filter((node) => node.selected);
        if (selectedNodes.length === 0) return;

        const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
        const selectedEdges = edges.filter((edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target));
        copiedSelectionRef.current = { nodes: selectedNodes, edges: selectedEdges };
        pasteCountRef.current = 0;
        return;
      }

      if (key === "v") {
        const copied = copiedSelectionRef.current;
        if (!copied || copied.nodes.length === 0) return;
        event.preventDefault();

        pasteCountRef.current += 1;
        const offset = 40 * pasteCountRef.current;
        const idMap = new Map<string, string>();
        const usedIds = new Set<string>();
        nodes.forEach((n) => usedIds.add(n.id));
        edges.forEach((e) => usedIds.add(e.id));
        copied.nodes.forEach((node) => {
          const newId = nextDuplicateNodeId(node.id, usedIds);
          usedIds.add(newId);
          idMap.set(node.id, newId);
        });

        const pastedNodes: FlowNodeType[] = copied.nodes.map((node) => {
          const newId = idMap.get(node.id)!;
          const currentAnchorTo = typeof node.data.anchorToNodeId === "string" ? node.data.anchorToNodeId : undefined;
          const remappedAnchorTo = currentAnchorTo ? (idMap.get(currentAnchorTo) ?? currentAnchorTo) : undefined;
          return {
            ...node,
            id: newId,
            selected: true,
            position: {
              x: node.position.x + offset,
              y: node.position.y + offset,
            },
            data: {
              ...node.data,
              id: newId,
              anchorToNodeId: remappedAnchorTo,
            },
          };
        });

        const pastedEdges: FlowEdge[] = copied.edges.map((edge) => {
          const newEdgeId = nextSequentialEdgeId(usedIds);
          usedIds.add(newEdgeId);
          return applyEdgeLineAppearance({
            ...edge,
            id: newEdgeId,
            source: idMap.get(edge.source) ?? edge.source,
            target: idMap.get(edge.target) ?? edge.target,
            selected: false,
          });
        });

        const sourceIds = new Set(copied.nodes.map((node) => node.id));
        const nextNodes = nodes.map((node) =>
          sourceIds.has(node.id) ? { ...node, selected: false } : node,
        );
        const allNodes = layoutNodesByLaneSystem([...nextNodes, ...pastedNodes], laneSystem, theme.laneStrongColors);
        const allEdges = [...edges, ...pastedEdges];

        setNodes(allNodes);
        setEdges(allEdges);
        setSelectedEdgeId(null);
        setSelectedNodeId(pastedNodes[0]?.id ?? null);
        persistFlow(allNodes, allEdges);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [nodes, edges, persistFlow, handleUndo, handleRedo, laneSystem, applyAlignment, applyLayerAction]);

  if (!isAuthenticated) {
    return <LoginModal onSuccess={handleLoginSuccess} />;
  }

  return (
    <div className={`app-layout${aiMode ? " app-layout--ai" : ""}${editorPanelOpen ? "" : " app-layout--panel-hidden"}`}>
      {aiMode ? <AiEditorPanel /> : null}
      <div
        className={`canvas-area${middlePanActive ? " canvas-area--middle-pan" : ""}`}
        style={{ background: theme.artboardBackground }}
        onPointerDownCapture={(e) => {
          if (e.button === 1 && (e.target as HTMLElement).closest(".react-flow")) {
            setMiddlePanActive(true);
          }
        }}
        onMouseDown={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onClickCapture={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest(".lane-add-button")) return;
          if (target.closest(".react-flow__node")) return;
          if (target.closest(".react-flow__edge")) return;
          selectGridHeaderFromPointer(e.clientX, e.clientY);
        }}
      >
        <Toolbar
          aiMode={aiMode}
          onAiModeToggle={() => setAiMode((v) => !v)}
          editorPanelOpen={editorPanelOpen}
          onEditorPanelToggle={() => setEditorPanelOpen((v) => !v)}
          onAddNode={handleAddNode}
          onSave={handleSaveProjectFlow}
          onSaveAs={handleSaveAs}
          onExportSvg={handleExportFlowSvg}
          onOpen={handleOpenFile}
          onReloadProjectFlow={handleLoadProjectFlow}
          defaultEdgePathType={defaultEdgePathType}
          onDefaultEdgePathTypeChange={setDefaultEdgePathType}
        />
        <LaneGridOverlay
          laneSystem={laneSystem}
          laneTopById={laneLayoutMetrics.laneTopById}
          rowHeightByLaneId={laneLayoutMetrics.rowHeightByLaneId}
          viewport={viewport}
          hoveredCell={hoveredCell}
          onAddColumn={handleAddLaneColumn}
          onAddLane={handleAddLaneRow}
          onRemoveColumn={handleRemoveLaneColumn}
          onRemoveLane={handleRemoveLaneRow}
          onUpdateLaneTitle={handleUpdateLaneTitle}
          onUpdateColumnTitle={handleUpdateColumnTitle}
          onSelectLaneTitle={handleSelectLaneTitle}
          onSelectColumnHeader={handleSelectColumnHeader}
          selectedLaneId={selectedLaneTitleId}
          selectedColumnId={selectedColumnTitleId}
          laneStrongColors={theme.laneStrongColors}
        />
        <FlowCanvasProvider value={flowCanvasApi}>
        <ReactFlow<FlowNodeType, FlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionLineType={connectionLineTypeFromEdgePath(defaultEdgePathType)}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={28}
          nodesDraggable={!spacePressed}
          panOnDrag={[1]}
          /* Trackpad (Mac): dois dedos = eventos de roda → pano no quadro. Cmd + rolagem = zoom (padrão no macOS). */
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          panOnScrollSpeed={0.85}
          minZoom={0.15}
          maxZoom={2}
          panActivationKeyCode="Space"
          selectionOnDrag
          selectionKeyCode={null}
          selectionMode={SelectionMode.Full}
          onMove={(_, vp) => setViewport(vp)}
          onSelectionChange={onSelectionChange}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDrag={onNodeDrag}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          fitView
        >
          <MiniMap ariaLabel="Visão geral do fluxo" />
          <Controls aria-label="Controles do fluxo" position="top-right" />
        </ReactFlow>
        {dragSnapGuide.x !== null ? (
          <div
            className="canvas-align-guide canvas-align-guide--vertical"
            style={{ left: dragSnapGuide.x * viewport.zoom + viewport.x }}
            aria-hidden
          />
        ) : null}
        {dragSnapGuide.y !== null ? (
          <div
            className="canvas-align-guide canvas-align-guide--horizontal"
            style={{ top: dragSnapGuide.y * viewport.zoom + viewport.y }}
            aria-hidden
          />
        ) : null}
        </FlowCanvasProvider>
      </div>
      {editorPanelOpen ? (
        <NodeEditorPanel
          node={selectedNode}
          edge={selectedEdge}
          laneSystem={laneSystem}
          selectedLaneId={selectedLaneTitleId}
          selectedColumnId={selectedColumnTitleId}
          selectedNodesCount={selectedNodes.length}
          selectedNodes={selectedNodes}
          artboardBackground={theme.artboardBackground}
          laneStrongColors={theme.laneStrongColors}
          canAlignSelection={canAlignSelection}
          onAlignSelected={applyAlignment}
          onUpdateArtboardBackground={handleUpdateArtboardBackground}
          onUpdateLaneStrongColor={handleUpdateLaneStrongColor}
          onUpdateSelectedNodesConnectorCount={handleUpdateSelectedNodesConnectorCount}
          onUpdateSelectedNodesAnchorShape={handleUpdateSelectedNodesAnchorShape}
          onUpdateNode={handleUpdateNode}
          onToggleAnchorFollowReference={handleToggleAnchorFollowReference}
          onUpdateNodeChannels={handleUpdateNodeChannels}
          onUpdateEdge={handleUpdateEdge}
          onRenameNodeId={handleRenameNodeId}
          onRenameEdgeId={handleRenameEdgeId}
          allNodeIds={allNodeIds}
          allEdgeIds={allEdgeIds}
          onUpdateLaneTitle={handleUpdateLaneTitle}
          onUpdateColumnTitle={handleUpdateColumnTitle}
        />
      ) : null}
    </div>
  );
}

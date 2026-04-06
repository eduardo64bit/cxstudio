import { Position, type InternalNode } from "@xyflow/react";
import type { FlowEdge } from "../types/flow";

const EPS = 0.5;

function isHorizontalHandle(p: Position): boolean {
  return p === Position.Left || p === Position.Right;
}

function isVerticalHandle(p: Position): boolean {
  return p === Position.Top || p === Position.Bottom;
}

function mergeHandleBounds(n: InternalNode) {
  const s = n.internals.handleBounds?.source ?? [];
  const t = n.internals.handleBounds?.target ?? [];
  return [...s, ...t];
}

function findHandle(n: InternalNode, handleId: string | null | undefined) {
  const list = mergeHandleBounds(n);
  if (!list.length) return null;
  if (handleId == null || handleId === "") return list[0];
  return list.find((h) => h.id === handleId) ?? null;
}

/** Centro absoluto do handle e `Position` (igual ao usado no traçado da aresta). */
export function getEdgeHandleWorldXY(
  node: InternalNode,
  handleId: string | null | undefined,
): { x: number; y: number; position: Position } | null {
  const h = findHandle(node, handleId);
  if (!h) return null;
  const x = node.internals.positionAbsolute.x + h.x + h.width / 2;
  const y = node.internals.positionAbsolute.y + h.y + h.height / 2;
  return { x, y, position: h.position };
}

export type EdgeHandleGeometry = {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePosition: Position;
  targetPosition: Position;
};

export function buildEdgeHandleGeometry(
  sourceNode: InternalNode,
  targetNode: InternalNode,
  edge: FlowEdge,
): EdgeHandleGeometry | null {
  const sh = getEdgeHandleWorldXY(sourceNode, edge.sourceHandle ?? null);
  const th = getEdgeHandleWorldXY(targetNode, edge.targetHandle ?? null);
  if (!sh || !th) return null;
  return {
    sx: sh.x,
    sy: sh.y,
    tx: th.x,
    ty: th.y,
    sourcePosition: sh.position,
    targetPosition: th.position,
  };
}

/**
 * Espelha `buildHVHPath` / `buildVHVPath` em FlowLabeledEdge: indica quando cada slider altera o traçado.
 */
export function computeOrthogonalSliderApplicability(
  pathType: string,
  geom: EdgeHandleGeometry | null,
): { bendApplicable: boolean; alignedApplicable: boolean } {
  if (pathType !== "smoothstep") {
    return { bendApplicable: false, alignedApplicable: false };
  }
  if (!geom) {
    return { bendApplicable: true, alignedApplicable: true };
  }

  const { sx, sy, tx, ty, sourcePosition, targetPosition } = geom;

  if (isHorizontalHandle(sourcePosition) && isHorizontalHandle(targetPosition)) {
    if (Math.abs(sy - ty) < EPS) {
      return { bendApplicable: false, alignedApplicable: false };
    }
    if (Math.abs(sx - tx) < EPS) {
      const aligned =
        (sourcePosition === Position.Left && targetPosition === Position.Left) ||
        (sourcePosition === Position.Right && targetPosition === Position.Right);
      return aligned
        ? { bendApplicable: false, alignedApplicable: true }
        : { bendApplicable: false, alignedApplicable: false };
    }
    if (sourcePosition === Position.Left && targetPosition === Position.Left) {
      return { bendApplicable: false, alignedApplicable: true };
    }
    if (sourcePosition === Position.Right && targetPosition === Position.Right) {
      return { bendApplicable: false, alignedApplicable: true };
    }
    return { bendApplicable: true, alignedApplicable: false };
  }

  if (isVerticalHandle(sourcePosition) && isVerticalHandle(targetPosition)) {
    if (Math.abs(sx - tx) < EPS) {
      return { bendApplicable: false, alignedApplicable: false };
    }
    if (Math.abs(sy - ty) < EPS) {
      const aligned =
        (sourcePosition === Position.Bottom && targetPosition === Position.Bottom) ||
        (sourcePosition === Position.Top && targetPosition === Position.Top);
      return aligned
        ? { bendApplicable: false, alignedApplicable: true }
        : { bendApplicable: false, alignedApplicable: false };
    }
    if (sourcePosition === Position.Bottom && targetPosition === Position.Bottom) {
      return { bendApplicable: false, alignedApplicable: true };
    }
    if (sourcePosition === Position.Top && targetPosition === Position.Top) {
      return { bendApplicable: false, alignedApplicable: true };
    }
    return { bendApplicable: true, alignedApplicable: false };
  }

  return { bendApplicable: false, alignedApplicable: false };
}

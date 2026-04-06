import { type InternalNode, Position } from "@xyflow/react";

const EPS = 0.5;
const NODE_CLAMP_PAD = 2;
export const ORTHO_CORNER_RADIUS = 12;

export const ALIGNED_PERPENDICULAR_MIN = 8;
export const ALIGNED_PERPENDICULAR_MAX = 160;
export const ALIGNED_PERPENDICULAR_DEFAULT = 48;

export function clampAlignedPerpendicularPx(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return ALIGNED_PERPENDICULAR_DEFAULT;
  return Math.max(ALIGNED_PERPENDICULAR_MIN, Math.min(ALIGNED_PERPENDICULAR_MAX, Math.round(v)));
}

function nodeRect(n: InternalNode): { x: number; y: number; w: number; h: number } | null {
  const x = n.internals.positionAbsolute.x;
  const y = n.internals.positionAbsolute.y;
  const w = n.measured?.width ?? n.width ?? 0;
  const h = n.measured?.height ?? n.height ?? 0;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/**
 * If the vertical segment x = mx between yMin and yMax lies inside a node's interior (x range),
 * nudge mx to the nearer horizontal boundary (+pad) so the segment runs along the border.
 */
export function clampVerticalSegmentMx(
  mx: number,
  yMin: number,
  yMax: number,
  sourceId: string,
  targetId: string,
  getInternalNode: (id: string) => InternalNode | undefined,
): number {
  let m = mx;
  const y0 = Math.min(yMin, yMax);
  const y1 = Math.max(yMin, yMax);

  for (const id of [sourceId, targetId]) {
    const n = getInternalNode(id);
    if (!n) continue;
    const r = nodeRect(n);
    if (!r) continue;
    const overlapY = y1 > r.y && y0 < r.y + r.h;
    if (!overlapY) continue;
    const left = r.x - NODE_CLAMP_PAD;
    const right = r.x + r.w + NODE_CLAMP_PAD;
    if (m > r.x && m < r.x + r.w) {
      const toLeft = m - left;
      const toRight = right - m;
      m = toLeft <= toRight ? left : right;
    }
  }
  return m;
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

function roundedOrthoPath(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
): string {
  const len01 = distance(p0.x, p0.y, p1.x, p1.y);
  const len12 = distance(p1.x, p1.y, p2.x, p2.y);
  const len23 = distance(p2.x, p2.y, p3.x, p3.y);
  if (len01 < EPS || len12 < EPS || len23 < EPS) {
    return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y}`;
  }

  const d01x = (p1.x - p0.x) / len01;
  const d01y = (p1.y - p0.y) / len01;
  const d12x = (p2.x - p1.x) / len12;
  const d12y = (p2.y - p1.y) / len12;
  const d23x = (p3.x - p2.x) / len23;
  const d23y = (p3.y - p2.y) / len23;

  let r1 = Math.min(ORTHO_CORNER_RADIUS, len01 / 2, len12 / 2);
  let r2 = Math.min(ORTHO_CORNER_RADIUS, len12 / 2, len23 / 2);
  const combined = r1 + r2;
  if (combined > len12 - 0.1) {
    const k = (len12 - 0.1) / combined;
    r1 *= Math.max(0, k);
    r2 *= Math.max(0, k);
  }

  const c1Start = { x: p1.x - d01x * r1, y: p1.y - d01y * r1 };
  const c1End = { x: p1.x + d12x * r1, y: p1.y + d12y * r1 };
  const c2Start = { x: p2.x - d12x * r2, y: p2.y - d12y * r2 };
  const c2End = { x: p2.x + d23x * r2, y: p2.y + d23y * r2 };

  return [
    `M ${p0.x} ${p0.y}`,
    `L ${c1Start.x} ${c1Start.y}`,
    `Q ${p1.x} ${p1.y} ${c1End.x} ${c1End.y}`,
    `L ${c2Start.x} ${c2Start.y}`,
    `Q ${p2.x} ${p2.y} ${c2End.x} ${c2End.y}`,
    `L ${p3.x} ${p3.y}`,
  ].join(" ");
}

/**
 * Horizontal → vertical → horizontal, 90° only. `percent` 0 = mx at sourceX, 100 = at targetX.
 */
export function buildHVHPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  percent: number,
  getInternalNode: (id: string) => InternalNode | undefined,
  sourceId: string,
  targetId: string,
  sourcePosition: Position,
  targetPosition: Position,
  perpendicularPx: number,
): [path: string, labelX: number, labelY: number] {
  if (Math.abs(sy - ty) < EPS) {
    const path = `M ${sx} ${sy} L ${tx} ${ty}`;
    return [path, (sx + tx) / 2, sy];
  }
  if (Math.abs(sx - tx) < EPS) {
    if (sourcePosition === Position.Left && targetPosition === Position.Left) {
      const mx = sx - perpendicularPx;
      const path = roundedOrthoPath({ x: sx, y: sy }, { x: mx, y: sy }, { x: mx, y: ty }, { x: tx, y: ty });
      return [path, mx, (sy + ty) / 2];
    }
    if (sourcePosition === Position.Right && targetPosition === Position.Right) {
      const mx = sx + perpendicularPx;
      const path = roundedOrthoPath({ x: sx, y: sy }, { x: mx, y: sy }, { x: mx, y: ty }, { x: tx, y: ty });
      return [path, mx, (sy + ty) / 2];
    }
    const path = `M ${sx} ${sy} L ${tx} ${ty}`;
    return [path, sx, (sy + ty) / 2];
  }

  /**
   * Esquerda↔esquerda (ou direita↔direita) com âncoras desalinhadas: o segmento vertical entre sx e tx
   * pode cair dentro do nó e o clamp empurra para a borda errada. Contorna sempre pela esquerda ou direita.
   */
  if (sourcePosition === Position.Left && targetPosition === Position.Left) {
    const mx = Math.min(sx, tx) - perpendicularPx;
    const path = roundedOrthoPath({ x: sx, y: sy }, { x: mx, y: sy }, { x: mx, y: ty }, { x: tx, y: ty });
    return [path, mx, (sy + ty) / 2];
  }
  if (sourcePosition === Position.Right && targetPosition === Position.Right) {
    const mx = Math.max(sx, tx) + perpendicularPx;
    const path = roundedOrthoPath({ x: sx, y: sy }, { x: mx, y: sy }, { x: mx, y: ty }, { x: tx, y: ty });
    return [path, mx, (sy + ty) / 2];
  }

  const p = Math.max(0, Math.min(100, percent)) / 100;
  let mx = sx + (tx - sx) * p;
  const lo = Math.min(sx, tx);
  const hi = Math.max(sx, tx);
  mx = Math.max(lo, Math.min(hi, mx));

  mx = clampVerticalSegmentMx(mx, sy, ty, sourceId, targetId, getInternalNode);

  const path = roundedOrthoPath({ x: sx, y: sy }, { x: mx, y: sy }, { x: mx, y: ty }, { x: tx, y: ty });
  const labelX = mx;
  const labelY = (sy + ty) / 2;
  return [path, labelX, labelY];
}

/**
 * Vertical → horizontal → vertical. `percent` 0 = my at sourceY, 100 = at targetY.
 */
export function buildVHVPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  percent: number,
  getInternalNode: (id: string) => InternalNode | undefined,
  sourceId: string,
  targetId: string,
  sourcePosition: Position,
  targetPosition: Position,
  perpendicularPx: number,
): [path: string, labelX: number, labelY: number] {
  if (Math.abs(sx - tx) < EPS) {
    const path = `M ${sx} ${sy} L ${tx} ${ty}`;
    return [path, sx, (sy + ty) / 2];
  }
  if (Math.abs(sy - ty) < EPS) {
    if (sourcePosition === Position.Bottom && targetPosition === Position.Bottom) {
      const my = sy + perpendicularPx;
      const path = roundedOrthoPath({ x: sx, y: sy }, { x: sx, y: my }, { x: tx, y: my }, { x: tx, y: ty });
      return [path, (sx + tx) / 2, my];
    }
    if (sourcePosition === Position.Top && targetPosition === Position.Top) {
      const my = sy - perpendicularPx;
      const path = roundedOrthoPath({ x: sx, y: sy }, { x: sx, y: my }, { x: tx, y: my }, { x: tx, y: ty });
      return [path, (sx + tx) / 2, my];
    }
    const path = `M ${sx} ${sy} L ${tx} ${ty}`;
    return [path, (sx + tx) / 2, sy];
  }

  /**
   * Base↔base com alturas diferentes: o segmento horizontal não pode ficar entre sy e ty (cai dentro do nó
   * de baixo e o clamp empurrava para o topo). Desvia tudo por baixo, em U.
   */
  if (sourcePosition === Position.Bottom && targetPosition === Position.Bottom) {
    const my = Math.max(sy, ty) + perpendicularPx;
    const path = roundedOrthoPath({ x: sx, y: sy }, { x: sx, y: my }, { x: tx, y: my }, { x: tx, y: ty });
    return [path, (sx + tx) / 2, my];
  }
  if (sourcePosition === Position.Top && targetPosition === Position.Top) {
    const my = Math.min(sy, ty) - perpendicularPx;
    const path = roundedOrthoPath({ x: sx, y: sy }, { x: sx, y: my }, { x: tx, y: my }, { x: tx, y: ty });
    return [path, (sx + tx) / 2, my];
  }

  const p = Math.max(0, Math.min(100, percent)) / 100;
  let my = sy + (ty - sy) * p;
  const lo = Math.min(sy, ty);
  const hi = Math.max(sy, ty);
  my = Math.max(lo, Math.min(hi, my));

  my = clampHorizontalSegmentMy(my, sx, tx, sourceId, targetId, getInternalNode);

  const path = roundedOrthoPath({ x: sx, y: sy }, { x: sx, y: my }, { x: tx, y: my }, { x: tx, y: ty });
  const labelX = (sx + tx) / 2;
  const labelY = my;
  return [path, labelX, labelY];
}

function clampHorizontalSegmentMy(
  my: number,
  xMin: number,
  xMax: number,
  sourceId: string,
  targetId: string,
  getInternalNode: (id: string) => InternalNode | undefined,
): number {
  let m = my;
  const x0 = Math.min(xMin, xMax);
  const x1 = Math.max(xMin, xMax);

  for (const id of [sourceId, targetId]) {
    const n = getInternalNode(id);
    if (!n) continue;
    const r = nodeRect(n);
    if (!r) continue;
    const overlapX = x1 > r.x && x0 < r.x + r.w;
    if (!overlapX) continue;
    const top = r.y - NODE_CLAMP_PAD;
    const bottom = r.y + r.h + NODE_CLAMP_PAD;
    if (m > r.y && m < r.y + r.h) {
      const toTop = m - top;
      const toBottom = bottom - m;
      m = toTop <= toBottom ? top : bottom;
    }
  }
  return m;
}

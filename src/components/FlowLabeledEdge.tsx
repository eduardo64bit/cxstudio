import { memo, useCallback, useMemo, useRef } from "react";
import type { CSSProperties, PointerEvent } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position,
  useReactFlow,
  useStore,
  type EdgeProps,
} from "@xyflow/react";
import { normalizeEdgePathType } from "../constants/edgePath";
import { normalizeAnchorShape } from "../constants/anchorShapes";
import { useFlowCanvas } from "../context/FlowCanvasContext";
import type { FlowEdge, FlowEdgeData } from "../types/flow";
import { nearestTOnPath, pointAtPathT } from "../utils/edgePathRail";
import {
  buildHVHPath,
  buildVHVPath,
  clampAlignedPerpendicularPx,
  ORTHO_CORNER_RADIUS,
} from "../utils/orthogonalStraightSegments";

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function isHorizontalHandle(p: Position): boolean {
  return p === Position.Left || p === Position.Right;
}

function isVerticalHandle(p: Position): boolean {
  return p === Position.Top || p === Position.Bottom;
}

function inferFacingPosition(selfX: number, selfY: number, otherX: number, otherY: number): Position {
  const dx = otherX - selfX;
  const dy = otherY - selfY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? Position.Right : Position.Left;
  }
  return dy >= 0 ? Position.Bottom : Position.Top;
}

function getNodeCenter(getInternalNode: (id: string) => any, nodeId: string): { x: number; y: number } | null {
  const n = getInternalNode(nodeId);
  if (!n) return null;
  const w = n.measured?.width ?? n.width ?? 0;
  const h = n.measured?.height ?? n.height ?? 0;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return {
    x: n.internals.positionAbsolute.x + w / 2,
    y: n.internals.positionAbsolute.y + h / 2,
  };
}

function isOuterAnchorHandle(handle: string | null): boolean {
  if (!handle) return false;
  const h = handle.toUpperCase();
  return /^(T|R|B|L)[1-5]$/.test(h);
}

function FlowLabeledEdgeComponent(props: EdgeProps<FlowEdge>) {
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerStart,
    markerEnd,
    style,
    interactionWidth,
    label,
    labelStyle,
    type,
    pathOptions,
    selected,
    data,
  } = props;

  const { updateEdgeData, screenToFlowPosition, getInternalNode, getEdges } = useReactFlow();
  const flowCanvas = useFlowCanvas();
  const dragActiveRef = useRef(false);
  const edgePathRef = useRef("");

  const currentEdge = getEdges().find((e) => e.id === id) as FlowEdge | undefined;
  const sourceHandle = currentEdge?.sourceHandle ?? null;
  const targetHandle = currentEdge?.targetHandle ?? null;
  const anchorMode = useStore(
    (state) => {
      const sourceNode = (state.nodes as Array<{ id: string; data?: unknown }>).find((n) => n.id === source);
      const targetNode = (state.nodes as Array<{ id: string; data?: unknown }>).find((n) => n.id === target);
      const sourceNodeData = sourceNode?.data as
        | { type?: unknown; anchorShape?: unknown }
        | undefined;
      const targetNodeData = targetNode?.data as
        | { type?: unknown; anchorShape?: unknown }
        | undefined;
      return {
        sourceKnown: Boolean(sourceNode),
        targetKnown: Boolean(targetNode),
        sourceSingleCenter:
          sourceNodeData?.type === "anchor" && normalizeAnchorShape(sourceNodeData.anchorShape) === "single-center",
        targetSingleCenter:
          targetNodeData?.type === "anchor" && normalizeAnchorShape(targetNodeData.anchorShape) === "single-center",
      };
    },
    (a, b) =>
      a.sourceKnown === b.sourceKnown &&
      a.targetKnown === b.targetKnown &&
      a.sourceSingleCenter === b.sourceSingleCenter &&
      a.targetSingleCenter === b.targetSingleCenter,
  );
  const sourceAnchorsToCenter = anchorMode.sourceKnown
    ? anchorMode.sourceSingleCenter
    : data?.sourceAnchorSingleCenter === true;
  const targetAnchorsToCenter = anchorMode.targetKnown
    ? anchorMode.targetSingleCenter
    : data?.targetAnchorSingleCenter === true;

  const pathType = normalizeEdgePathType(type);
  const effectiveSourcePosition = useMemo(
    () =>
      sourceHandle === "C1"
        ? inferFacingPosition(sourceX, sourceY, targetX, targetY)
        : sourcePosition,
    [sourceHandle, sourcePosition, sourceX, sourceY, targetX, targetY],
  );
  const effectiveTargetPosition = useMemo(
    () =>
      targetHandle === "C1"
        ? inferFacingPosition(targetX, targetY, sourceX, sourceY)
        : targetPosition,
    [sourceX, sourceY, targetHandle, targetPosition, targetX, targetY],
  );
  const sourcePoint = useMemo(
    () =>
      sourceHandle === "C1" || (sourceAnchorsToCenter && isOuterAnchorHandle(sourceHandle))
        ? (() => {
            const c = getNodeCenter(getInternalNode, source);
            if (!c) return { x: sourceX, y: sourceY };
            return { x: c.x, y: c.y };
          })()
        : { x: sourceX, y: sourceY },
    [effectiveSourcePosition, getInternalNode, source, sourceAnchorsToCenter, sourceHandle, sourceX, sourceY],
  );
  const targetPoint = useMemo(
    () =>
      targetHandle === "C1" || (targetAnchorsToCenter && isOuterAnchorHandle(targetHandle))
        ? (() => {
            const c = getNodeCenter(getInternalNode, target);
            if (!c) return { x: targetX, y: targetY };
            return { x: c.x, y: c.y };
          })()
        : { x: targetX, y: targetY },
    [effectiveTargetPosition, getInternalNode, target, targetAnchorsToCenter, targetHandle, targetX, targetY],
  );

  const bendPercent = useMemo(() => {
    const v = data?.bendOffsetPercent;
    if (typeof v === "number" && Number.isFinite(v)) {
      return Math.max(0, Math.min(100, v));
    }
    return 50;
  }, [data?.bendOffsetPercent]);

  const alignedPerpendicularPx = useMemo(
    () => clampAlignedPerpendicularPx(data?.alignedPerpendicularPx),
    [data?.alignedPerpendicularPx],
  );

  const [edgePath, labelX, labelY] = useMemo(() => {
    const common = {
      sourceX: sourcePoint.x,
      sourceY: sourcePoint.y,
      targetX: targetPoint.x,
      targetY: targetPoint.y,
      sourcePosition: effectiveSourcePosition,
      targetPosition: effectiveTargetPosition,
    };
    if (pathType === "straight") {
      return getStraightPath(common);
    }
    if (pathType === "smoothstep") {
      if (isHorizontalHandle(effectiveSourcePosition) && isHorizontalHandle(effectiveTargetPosition)) {
        return buildHVHPath(
          sourcePoint.x,
          sourcePoint.y,
          targetPoint.x,
          targetPoint.y,
          bendPercent,
          getInternalNode,
          source,
          target,
          effectiveSourcePosition,
          effectiveTargetPosition,
          alignedPerpendicularPx,
        );
      }
      if (isVerticalHandle(effectiveSourcePosition) && isVerticalHandle(effectiveTargetPosition)) {
        return buildVHVPath(
          sourcePoint.x,
          sourcePoint.y,
          targetPoint.x,
          targetPoint.y,
          bendPercent,
          getInternalNode,
          source,
          target,
          effectiveSourcePosition,
          effectiveTargetPosition,
          alignedPerpendicularPx,
        );
      }
      const opts =
        pathOptions && typeof pathOptions === "object" && !Array.isArray(pathOptions)
          ? (pathOptions as Record<string, unknown>)
          : {};
      return getSmoothStepPath({
        ...common,
        borderRadius: typeof opts.borderRadius === "number" ? opts.borderRadius : ORTHO_CORNER_RADIUS,
        offset: typeof opts.offset === "number" ? opts.offset : undefined,
        stepPosition: typeof opts.stepPosition === "number" ? opts.stepPosition : undefined,
      });
    }
    return getBezierPath(common);
  }, [
    alignedPerpendicularPx,
    bendPercent,
    getInternalNode,
    pathOptions,
    pathType,
    source,
    effectiveSourcePosition,
    sourcePoint.x,
    sourcePoint.y,
    target,
    effectiveTargetPosition,
    targetPoint.x,
    targetPoint.y,
  ]);

  edgePathRef.current = edgePath;

  const labelT = useMemo(() => {
    const stored = data?.labelPathT;
    if (typeof stored === "number" && Number.isFinite(stored)) {
      return clamp01(stored);
    }
    const ox = typeof data?.labelOffsetX === "number" && Number.isFinite(data.labelOffsetX) ? data.labelOffsetX : 0;
    const oy = typeof data?.labelOffsetY === "number" && Number.isFinite(data.labelOffsetY) ? data.labelOffsetY : 0;
    if (ox !== 0 || oy !== 0) {
      return nearestTOnPath(edgePath, labelX + ox, labelY + oy);
    }
    /* Evita centenas de getPointAtLength por aresta a cada render; t=0.5 coincide com o meio do path na maioria dos conectores. */
    return 0.5;
  }, [data?.labelOffsetX, data?.labelOffsetY, data?.labelPathT, edgePath, labelX, labelY]);

  const { x: lx, y: ly } = useMemo(() => pointAtPathT(edgePath, labelT), [edgePath, labelT]);

  const labelText = label != null && label !== false ? String(label).trim() : "";
  const showLabelUi = labelText.length > 0 || selected;

  const onLabelPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      flowCanvas?.notifyInteractionStart();
      dragActiveRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [flowCanvas],
  );

  const onLabelPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!dragActiveRef.current) return;
      const pathD = edgePathRef.current;
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const t = nearestTOnPath(pathD, p.x, p.y);
      updateEdgeData(id, (prev) => {
        const next: FlowEdgeData = { ...prev, labelPathT: t };
        delete next.labelOffsetX;
        delete next.labelOffsetY;
        return next;
      });
    },
    [id, screenToFlowPosition, updateEdgeData],
  );

  const endLabelDrag = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const wasActive = dragActiveRef.current;
      if (wasActive) {
        dragActiveRef.current = false;
        flowCanvas?.notifyInteractionEnd();
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    },
    [flowCanvas],
  );

  const displayText = labelText.length > 0 ? String(label) : selected ? "·" : "";

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={interactionWidth}
      />
      {showLabelUi ? (
        <EdgeLabelRenderer>
          <div
            className={`flow-edge-label-hit nodrag nopan${selected ? " flow-edge-label-hit--selected" : ""}`}
            title="Arraste ao longo da conexão para posicionar o rótulo"
            style={{
              transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`,
              pointerEvents: "all",
            }}
            onPointerDown={onLabelPointerDown}
            onPointerMove={onLabelPointerMove}
            onPointerUp={endLabelDrag}
            onPointerCancel={endLabelDrag}
          >
            <span className="flow-edge-label-hit__text" style={labelStyle as CSSProperties | undefined}>
              {displayText}
            </span>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export default memo(FlowLabeledEdgeComponent);

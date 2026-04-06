import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Anchor,
  Check,
  CircleCheck,
  RotateCcw,
  SquarePen,
  XCircle,
} from "lucide-react";
import { MarkerType, useStore, type InternalNode } from "@xyflow/react";
import type {
  FlowChannel,
  FlowEdge,
  FlowEdgeLineStatus,
  FlowNode,
  FlowNodeConnectorsPerSide,
  LaneSystem,
} from "../types/flow";
import { CHANNEL_LABELS } from "../constants/channels";
import {
  EDGE_LABEL_MAX,
  ELEMENT_ID_MAX,
  NODE_DESCRIPTION_MAX,
  NODE_METADATA_JSON_MAX,
  NODE_TITLE_MAX,
} from "../constants/fieldLimits";
import { EDGE_PATH_LABELS, FLOW_EDGE_PATH_TYPES, normalizeEdgePathType } from "../constants/edgePath";
import {
  EDGE_LINE_STYLE_LABELS,
  FLOW_EDGE_LINE_STYLES,
  normalizeEdgeLineStyle,
  type FlowEdgeLineStyle,
} from "../constants/edgeLineAppearance";
import { FLOW_EDGE_LINE_STATUSES, FLOW_EDGE_STATUS_LABELS } from "../constants/edgeLineStatus";
import { EdgeArrowMarkerIcon, type EdgeArrowMarkerOption } from "./EdgeArrowMarkerIcon";
import { EdgePathTypeIcon } from "./EdgePathTypeIcon";
import { EdgeLineDashedIcon, EdgeLineDottedIcon, EdgeLineSolidIcon } from "./EdgeLineAppearanceIcons";
import {
  ALIGNED_PERPENDICULAR_MAX,
  ALIGNED_PERPENDICULAR_MIN,
  clampAlignedPerpendicularPx,
} from "../utils/orthogonalStraightSegments";
import { DEFAULT_LANE_STRONG_COLORS } from "../constants/laneColors";
import {
  buildEdgeHandleGeometry,
  computeOrthogonalSliderApplicability,
} from "../utils/orthogonalSliderApplicability";
import {
  ANCHOR_SHAPE_LABELS,
  ANCHOR_SHAPE_MATRIX,
  type AnchorShape,
  normalizeAnchorShape,
} from "../constants/anchorShapes";
import { sanitizeFlowElementId } from "../utils/flowElementId";
import AnchorGlyph from "./AnchorGlyph";

const DEFAULT_ARTBOARD_BACKGROUND = "#FFFFFF";

/** Lucide não tem ícone de semáforo; verde = ok, âmbar = atenção, vermelho = X no círculo (`currentColor`). */
const EDGE_STATUS_ICON = {
  green: CircleCheck,
  amber: AlertTriangle,
  red: XCircle,
} as const satisfies Record<FlowEdgeLineStatus, typeof CircleCheck>;

function DistributeHorizontalSpacingIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden>
      <path d="M2 2v12M14 2v12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="4.2" y="6.1" width="2.2" height="3.8" rx="0.7" fill="currentColor" />
      <rect x="9.6" y="6.1" width="2.2" height="3.8" rx="0.7" fill="currentColor" />
      <path d="M6.9 8h2.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function DistributeVerticalSpacingIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden>
      <path d="M2 2h12M2 14h12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="6.1" y="4.2" width="3.8" height="2.2" rx="0.7" fill="currentColor" />
      <rect x="6.1" y="9.6" width="3.8" height="2.2" rx="0.7" fill="currentColor" />
      <path d="M8 6.9v2.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function markerToOption(marker: FlowEdge["markerStart"]): EdgeArrowMarkerOption {
  if (!marker) return "none";
  if (typeof marker === "string") {
    if (marker === "arrow" || marker === "arrowclosed") return "arrow";
    return "none";
  }
  if (marker.type === MarkerType.Arrow || marker.type === MarkerType.ArrowClosed) return "arrow";
  return "none";
}

function optionToMarker(option: EdgeArrowMarkerOption): FlowEdge["markerStart"] {
  if (option === "none") return undefined;
  return { type: MarkerType.ArrowClosed };
}

function clampBendOffsetPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

interface NodeEditorPanelProps {
  node: FlowNode | null;
  edge: FlowEdge | null;
  laneSystem: LaneSystem;
  selectedLaneId: string | null;
  selectedColumnId: string | null;
  selectedNodesCount: number;
  selectedNodes: FlowNode[];
  artboardBackground: string;
  laneStrongColors: string[];
  canAlignSelection: boolean;
  onAlignSelected: (
    action:
      | "left"
      | "right"
      | "top"
      | "bottom"
      | "center-horizontal"
      | "center-vertical"
      | "distribute-horizontal"
      | "distribute-vertical",
  ) => void;
  onUpdateArtboardBackground: (value: string) => void;
  onUpdateLaneStrongColor: (index: number, value: string) => void;
  onUpdateSelectedNodesConnectorCount: (side: keyof FlowNodeConnectorsPerSide, value: number) => void;
  onUpdateSelectedNodesAnchorShape: (shape: AnchorShape) => void;
  onUpdateNode: (nodeId: string, patch: Partial<FlowNode["data"]>) => void;
  onToggleAnchorFollowReference: (anchorNodeId: string) => void;
  onUpdateNodeChannels: (nodeId: string, channels: FlowChannel[]) => void;
  onUpdateEdge: (edgeId: string, patch: Partial<FlowEdge>) => void;
  onRenameNodeId: (currentId: string, nextIdRaw: string) => boolean;
  onRenameEdgeId: (currentId: string, nextIdRaw: string) => boolean;
  /** IDs atuais no fluxo (validação em tempo real de duplicados). */
  allNodeIds: string[];
  allEdgeIds: string[];
  onUpdateLaneTitle: (laneId: string, title: string) => void;
  onUpdateColumnTitle: (columnId: string, title: string) => void;
}

export default function NodeEditorPanel({
  node,
  edge,
  laneSystem,
  selectedLaneId,
  selectedColumnId,
  selectedNodesCount,
  selectedNodes,
  artboardBackground,
  laneStrongColors,
  canAlignSelection,
  onAlignSelected,
  onUpdateArtboardBackground,
  onUpdateLaneStrongColor,
  onUpdateSelectedNodesConnectorCount,
  onUpdateSelectedNodesAnchorShape,
  onUpdateNode,
  onToggleAnchorFollowReference,
  onUpdateNodeChannels,
  onUpdateEdge,
  onRenameNodeId,
  onRenameEdgeId,
  allNodeIds,
  allEdgeIds,
  onUpdateLaneTitle,
  onUpdateColumnTitle,
}: NodeEditorPanelProps) {
  const [nodeIdDraft, setNodeIdDraft] = useState("");
  const [edgeIdDraft, setEdgeIdDraft] = useState("");
  const [showAllLaneColors, setShowAllLaneColors] = useState(false);

  useEffect(() => {
    if (node) setNodeIdDraft(node.id);
  }, [node, node?.id]);

  useEffect(() => {
    if (edge) setEdgeIdDraft(edge.id);
  }, [edge, edge?.id]);

  const edgeIdValidation = useMemo(() => {
    if (!edge) {
      return { conflict: false, canApply: false };
    }
    const sanitized = sanitizeFlowElementId(edgeIdDraft);
    const empty = !sanitized;
    const unchanged = sanitized === edge.id;
    const conflict = !empty && !unchanged && allEdgeIds.includes(sanitized);
    const canApply = !empty && !unchanged && !conflict;
    return { conflict, canApply, sanitized, empty, unchanged };
  }, [edge, edge?.id, edgeIdDraft, allEdgeIds]);

  const nodeIdValidation = useMemo(() => {
    if (!node) {
      return { conflict: false, canApply: false };
    }
    const sanitized = sanitizeFlowElementId(nodeIdDraft);
    const empty = !sanitized;
    const unchanged = sanitized === node.id;
    const conflict = !empty && !unchanged && allNodeIds.includes(sanitized);
    const canApply = !empty && !unchanged && !conflict;
    return { conflict, canApply, sanitized, empty, unchanged };
  }, [node, node?.id, nodeIdDraft, allNodeIds]);

  const selectedLane = selectedLaneId ? laneSystem.lanes.find((lane) => lane.id === selectedLaneId) ?? null : null;
  const selectedColumn = selectedColumnId ? laneSystem.columns.find((column) => column.id === selectedColumnId) ?? null : null;
  const bulkConnectorValues = useMemo(() => {
    const editable = selectedNodes.filter((sn) => sn.data.type !== "anchor");
    if (editable.length === 0) return null;
    const sides: (keyof FlowNodeConnectorsPerSide)[] = ["top", "right", "bottom", "left"];
    const result = {} as Record<keyof FlowNodeConnectorsPerSide, number | null>;
    sides.forEach((side) => {
      const values = editable.map((sn) => Number(sn.data.connectorsPerSide?.[side] ?? 0));
      result[side] = values.every((v) => v === values[0]) ? values[0] : null;
    });
    return result;
  }, [selectedNodes]);
  const selectedAnchorNodes = useMemo(
    () => selectedNodes.filter((sn) => sn.data.type === "anchor"),
    [selectedNodes],
  );
  const bulkAnchorShapeValue = useMemo(() => {
    if (selectedAnchorNodes.length === 0) return null;
    const first = normalizeAnchorShape(selectedAnchorNodes[0]?.data.anchorShape);
    return selectedAnchorNodes.every((n) => normalizeAnchorShape(n.data.anchorShape) === first) ? first : null;
  }, [selectedAnchorNodes]);

  /** Só faz sentido alternar referência ao layout quando existe linha ligada ao ponto de rota. */
  const anchorHasConnectedEdges = useStore(
    (state) => {
      if (!node || node.data.type !== "anchor") return false;
      return state.edges.some((e) => e.source === node.id || e.target === node.id);
    },
    (a, b) => a === b,
  );

  const edgePathTypeNormalized = edge ? normalizeEdgePathType(edge.type) : "";

  const edgeHandleGeometry = useStore(
    (state) => {
      if (!edge) return null;
      const sn = state.nodeLookup.get(edge.source);
      const tn = state.nodeLookup.get(edge.target);
      if (!sn || !tn) return null;
      return buildEdgeHandleGeometry(sn as InternalNode, tn as InternalNode, edge);
    },
    (a, b) => {
      if (a === b) return true;
      if (!a && !b) return true;
      if (!a || !b) return false;
      return (
        a.sx === b.sx &&
        a.sy === b.sy &&
        a.tx === b.tx &&
        a.ty === b.ty &&
        a.sourcePosition === b.sourcePosition &&
        a.targetPosition === b.targetPosition
      );
    },
  );

  const { bendApplicable, alignedApplicable } = useMemo(
    () => computeOrthogonalSliderApplicability(edgePathTypeNormalized, edgeHandleGeometry),
    [edgePathTypeNormalized, edgeHandleGeometry],
  );

  if (selectedLane || selectedColumn) {
    return (
      <aside className="node-panel">
        <h2>Editor de grid</h2>
        {selectedColumn ? (
          <label>
            Título da coluna
            <input
              autoFocus
              value={selectedColumn.title}
              maxLength={NODE_TITLE_MAX}
              onChange={(e) => onUpdateColumnTitle(selectedColumn.id, e.target.value.slice(0, NODE_TITLE_MAX))}
            />
            <small className="field-counter">
              {selectedColumn.title.length}/{NODE_TITLE_MAX}
            </small>
          </label>
        ) : null}
        {selectedLane ? (
          <label>
            Título da raia
            <input
              autoFocus
              value={selectedLane.title}
              maxLength={NODE_TITLE_MAX}
              onChange={(e) => onUpdateLaneTitle(selectedLane.id, e.target.value.slice(0, NODE_TITLE_MAX))}
            />
            <small className="field-counter">
              {selectedLane.title.length}/{NODE_TITLE_MAX}
            </small>
          </label>
        ) : null}
      </aside>
    );
  }

  if (edge) {
    const edgeLabel = String(edge.label ?? "");
    const edgePathType = normalizeEdgePathType(edge.type);
    const startArrow = markerToOption(edge.markerStart);
    const endArrow = markerToOption(edge.markerEnd);
    const bendOffsetPercent = clampBendOffsetPercent(edge.data?.bendOffsetPercent);
    const alignedPerpendicularPx = clampAlignedPerpendicularPx(edge.data?.alignedPerpendicularPx);
    const edgeLineStyle = normalizeEdgeLineStyle(edge.data?.lineStyle);
    const rawStatus = edge.data?.lineStatus;
    const lineStatus: FlowEdgeLineStatus | undefined =
      rawStatus === "red" || rawStatus === "amber" || rawStatus === "green"
        ? rawStatus
        : edge.data?.lineAlert === true
          ? "red"
          : undefined;
    const patchEdgeLineStatus = (next: FlowEdgeLineStatus | undefined) => {
      onUpdateEdge(edge.id, {
        data: { ...edge.data, lineStatus: next, lineAlert: undefined } as FlowEdge["data"],
      });
    };
    return (
      <aside className="node-panel">
        <h2>Editor de conexão</h2>

        <label>
          Rótulo
          <input
            value={edgeLabel}
            maxLength={EDGE_LABEL_MAX}
            onChange={(e) => onUpdateEdge(edge.id, { label: e.target.value.slice(0, EDGE_LABEL_MAX) })}
          />
          <small className="field-counter">
            {edgeLabel.length}/{EDGE_LABEL_MAX}
          </small>
        </label>

        <div className="node-panel__edge-path-field">
          <span className="node-panel__field-label">Tipo</span>
          <div className="node-panel__edge-toolbar" role="group" aria-label="Tipo de traçado">
            <div className="node-panel__edge-path-group" role="radiogroup" aria-label="Tipo de traçado">
              {FLOW_EDGE_PATH_TYPES.map((value) => {
                const selected = edgePathType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`secondary icon-only-button${selected ? " toolbar-icon-toggle--selected" : ""}`}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onUpdateEdge(edge.id, { type: value })}
                    title={EDGE_PATH_LABELS[value]}
                    aria-label={EDGE_PATH_LABELS[value]}
                  >
                    <EdgePathTypeIcon pathType={value} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="node-panel__edge-path-field">
          <span className="node-panel__field-label">Composição</span>
          <div className="node-panel__edge-toolbar" role="group" aria-label="Estilo da linha e pontas">
            <div className="node-panel__edge-path-group" role="radiogroup" aria-label="Estilo da linha">
              {FLOW_EDGE_LINE_STYLES.map((value: FlowEdgeLineStyle) => {
                const selected = edgeLineStyle === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`secondary icon-only-button${selected ? " toolbar-icon-toggle--selected" : ""}`}
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      onUpdateEdge(edge.id, {
                        data: { ...edge.data, lineStyle: value },
                      })
                    }
                    title={EDGE_LINE_STYLE_LABELS[value]}
                    aria-label={EDGE_LINE_STYLE_LABELS[value]}
                  >
                    {value === "solid" ? (
                      <EdgeLineSolidIcon size={18} />
                    ) : value === "dashed" ? (
                      <EdgeLineDashedIcon size={18} />
                    ) : (
                      <EdgeLineDottedIcon size={18} />
                    )}
                  </button>
                );
              })}
            </div>
            <span className="node-panel__edge-toolbar-divider" aria-hidden />
            <div className="node-panel__edge-path-group" role="group" aria-label="Setas na origem e no destino">
              <button
                type="button"
                className={`secondary icon-only-button${startArrow === "arrow" ? " toolbar-icon-toggle--selected" : ""}`}
                role="switch"
                aria-checked={startArrow === "arrow"}
                onClick={() =>
                  onUpdateEdge(edge.id, {
                    markerStart: startArrow === "arrow" ? undefined : optionToMarker("arrow"),
                  })
                }
                title={startArrow === "arrow" ? "Remover seta na origem" : "Adicionar seta na origem"}
                aria-label="Alternar seta na origem"
              >
                <EdgeArrowMarkerIcon option="arrow" size={18} />
              </button>
              <button
                type="button"
                className={`secondary icon-only-button${endArrow === "arrow" ? " toolbar-icon-toggle--selected" : ""}`}
                role="switch"
                aria-checked={endArrow === "arrow"}
                onClick={() =>
                  onUpdateEdge(edge.id, {
                    markerEnd: endArrow === "arrow" ? undefined : optionToMarker("arrow"),
                  })
                }
                title={endArrow === "arrow" ? "Remover seta no destino" : "Adicionar seta no destino"}
                aria-label="Alternar seta no destino"
              >
                <EdgeArrowMarkerIcon option="arrow" size={18} arrowPointsRight />
              </button>
            </div>
          </div>
          <div
            className="node-panel__edge-toolbar node-panel__edge-toolbar--rag-below-composition"
            role="group"
            aria-label="Sinalização do conector (verde, âmbar, vermelho ou padrão)"
          >
            <div className="node-panel__edge-path-group" role="radiogroup" aria-label="Cor do conector">
              {FLOW_EDGE_LINE_STATUSES.map((st) => {
                const selected = lineStatus === st;
                const StatusIcon = EDGE_STATUS_ICON[st];
                return (
                  <button
                    key={st}
                    type="button"
                    className={`secondary icon-only-button${selected ? " toolbar-icon-toggle--selected" : ""}`}
                    role="radio"
                    aria-checked={selected}
                    title={`${FLOW_EDGE_STATUS_LABELS[st]}${selected ? " — clique para voltar ao cinza padrão" : ""}`}
                    aria-label={`${FLOW_EDGE_STATUS_LABELS[st]}${selected ? "; clique para remover cor" : ""}`}
                    onClick={() => patchEdgeLineStatus(selected ? undefined : st)}
                  >
                    <StatusIcon size={18} strokeWidth={2} aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {edgePathType === "smoothstep" ? (
          <div className="node-panel__orthogonal">
            <div className="node-panel__orthogonal-row-two">
              <label
                className={!bendApplicable ? "node-panel__orthogonal-field--disabled" : undefined}
                title={
                  !bendApplicable
                    ? "Só se aplica quando o traçado usa o segmento médio (H→V→H ou V→H→V sem alinhamento especial)."
                    : undefined
                }
              >
                Posição
                <span className="node-panel__orthogonal-input-unit">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={10}
                    className="node-panel__orthogonal-number"
                    disabled={!bendApplicable}
                    value={bendOffsetPercent}
                    onChange={(e) => {
                      const v = clampBendOffsetPercent(e.target.value);
                      onUpdateEdge(edge.id, { data: { ...edge.data, bendOffsetPercent: v } });
                    }}
                  />
                  <span className="node-panel__orthogonal-unit">%</span>
                </span>
              </label>
              <label
                className={!alignedApplicable ? "node-panel__orthogonal-field--disabled" : undefined}
                title={
                  !alignedApplicable
                    ? "Só se aplica com bases ou topos na mesma linha, ou lados iguais na mesma coluna."
                    : undefined
                }
              >
                Distância
                <span className="node-panel__orthogonal-input-unit">
                  <input
                    type="number"
                    min={ALIGNED_PERPENDICULAR_MIN}
                    max={ALIGNED_PERPENDICULAR_MAX}
                    step={8}
                    className="node-panel__orthogonal-number"
                    disabled={!alignedApplicable}
                    value={alignedPerpendicularPx}
                    onChange={(e) => {
                      const v = clampAlignedPerpendicularPx(Number(e.target.value));
                      onUpdateEdge(edge.id, { data: { ...edge.data, alignedPerpendicularPx: v } });
                    }}
                  />
                  <span className="node-panel__orthogonal-unit">px</span>
                </span>
              </label>
            </div>
          </div>
        ) : null}

        <label>
          ID
          <div className="node-panel__id-row">
            <input
              className={`node-panel__id-input${edgeIdValidation.conflict ? " node-panel__id-input--invalid" : ""}`}
              value={edgeIdDraft}
              maxLength={ELEMENT_ID_MAX}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={edgeIdValidation.conflict}
              onChange={(e) => setEdgeIdDraft(e.target.value.slice(0, ELEMENT_ID_MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && edgeIdValidation.canApply) {
                  e.preventDefault();
                  onRenameEdgeId(edge.id, edgeIdDraft);
                }
              }}
            />
            <button
              type="button"
              className="secondary icon-only-button node-panel__id-commit"
              disabled={!edgeIdValidation.canApply}
              title={
                edgeIdValidation.conflict
                  ? "Este ID já está em uso"
                  : edgeIdValidation.unchanged || edgeIdValidation.empty
                    ? "Altere o ID para aplicar"
                    : "Aplicar ID"
              }
              aria-label={
                edgeIdValidation.conflict
                  ? "Não é possível aplicar: ID já em uso"
                  : "Aplicar ID da conexão"
              }
              onClick={() => {
                if (edgeIdValidation.canApply) onRenameEdgeId(edge.id, edgeIdDraft);
              }}
            >
              <Check size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
          <small className="field-counter">
            {edgeIdDraft.length}/{ELEMENT_ID_MAX}
          </small>
          {edgeIdValidation.conflict ? (
            <p className="node-panel__id-hint node-panel__id-hint--error" role="status">
              Este ID já está em uso por outra conexão.
            </p>
          ) : null}
        </label>

        <label>
          Origem
          <input value={edge.source} disabled />
        </label>

        <label>
          Destino
          <input value={edge.target} disabled />
        </label>
      </aside>
    );
  }

  if (!node) {
    return (
      <aside className="node-panel">
        <h2>Tema do quadro</h2>
        <label>
          Fundo do artboard
          <div className="node-panel__lane-theme-row">
            <div
              className="node-panel__lane-theme-preview"
              style={{ backgroundColor: artboardBackground }}
              aria-label="Amostra da cor de fundo do artboard"
            />
            <input
              value={artboardBackground}
              onChange={(e) => onUpdateArtboardBackground(e.target.value)}
              aria-label="HEX da cor de fundo do artboard"
            />
            <label className="secondary node-panel__lane-theme-edit">
              <input
                type="color"
                value={artboardBackground}
                onChange={(e) => onUpdateArtboardBackground(e.target.value)}
                aria-label="Editar cor de fundo do artboard"
              />
              <SquarePen size={14} aria-hidden />
            </label>
            <button
              type="button"
              className="node-panel__lane-theme-reset"
              onClick={() => onUpdateArtboardBackground(DEFAULT_ARTBOARD_BACKGROUND)}
              title="Restaurar cor padrão do artboard"
              aria-label="Restaurar cor padrão do artboard"
            >
              <RotateCcw size={14} aria-hidden />
            </button>
          </div>
        </label>
        <div className="node-panel__accent-field">
          <div className="node-panel__id-row">
            <span className="node-panel__field-label">Cores da raias</span>
          </div>
          <div className="node-panel__lane-theme-list" aria-label="Lista de cores das raias">
            {(showAllLaneColors ? laneStrongColors : laneStrongColors.slice(0, 6)).map((color, index) => (
              <div key={`lane-theme-color-${index}`}>
                <div className="node-panel__lane-theme-row">
                  <div
                    className="node-panel__lane-theme-preview"
                    style={{ backgroundColor: color }}
                    aria-label={`Amostra da cor ${index + 1}`}
                  />
                  <input
                    value={color}
                    onChange={(e) => onUpdateLaneStrongColor(index, e.target.value)}
                    aria-label={`HEX da cor ${index + 1}`}
                  />
                  <label className="secondary node-panel__lane-theme-edit" title={`Editar cor ${index + 1}`}>
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => onUpdateLaneStrongColor(index, e.target.value)}
                      aria-label={`Editar cor ${index + 1}`}
                    />
                    <SquarePen size={14} aria-hidden />
                  </label>
                  <button
                    type="button"
                    className="node-panel__lane-theme-reset"
                    onClick={() =>
                      onUpdateLaneStrongColor(
                        index,
                        DEFAULT_LANE_STRONG_COLORS[index % DEFAULT_LANE_STRONG_COLORS.length],
                      )
                    }
                    title={`Restaurar cor ${index + 1}`}
                    aria-label={`Restaurar cor ${index + 1}`}
                  >
                    <RotateCcw size={14} aria-hidden />
                  </button>
                </div>
              </div>
            ))}
            {laneStrongColors.length > 6 ? (
              <div className="node-panel__id-row">
                <button type="button" className="secondary" onClick={() => setShowAllLaneColors((v) => !v)}>
                  {showAllLaneColors ? "Exibir menos" : "Exibir mais"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    );
  }

  const n = node;

  const safeNodeData = {
    ...n.data,
    id: n.data.id || n.id,
    title: n.data.title || "",
    description: n.data.description || "",
    metadata: n.data.metadata && typeof n.data.metadata === "object" ? n.data.metadata : {},
    connectorsPerSide:
      n.data.connectorsPerSide ??
      (n.data.type === "comment"
        ? { top: 0, bottom: 0, left: 0, right: 0 }
        : { top: 1, bottom: 1, left: 1, right: 1 }),
  };
  const metadataText = JSON.stringify(safeNodeData.metadata, null, 2) ?? "{}";
  const isBulkEditing = selectedNodesCount > 1;
  const selectedChannels = (safeNodeData.channels ?? []).slice(0, 5);

  if (isBulkEditing) {
    return (
      <aside className="node-panel">
        <h2>Editor de nós</h2>
        <div className="node-panel__edge-path-field">
          <span className="node-panel__field-label">Alinhamento ({selectedNodesCount} nós selecionados)</span>
          <div className="node-panel__edge-toolbar node-panel__alignment-group" role="group" aria-label="Alinhamento horizontal">
            <span className="node-panel__field-label">Horizontal</span>
            <div className="node-panel__edge-path-group" role="group" aria-label="Alinhamento horizontal">
              <button type="button" className="node-panel__icon-toggle" disabled={!canAlignSelection} onClick={() => onAlignSelected("left")} title="Alinhar à esquerda" aria-label="Alinhar à esquerda">
                <AlignStartVertical size={16} />
              </button>
              <button type="button" className="node-panel__icon-toggle" disabled={!canAlignSelection} onClick={() => onAlignSelected("center-horizontal")} title="Centralizar na horizontal (⌥H)" aria-label="Centralizar na horizontal">
                <AlignCenterVertical size={16} />
              </button>
              <button type="button" className="node-panel__icon-toggle" disabled={!canAlignSelection} onClick={() => onAlignSelected("right")} title="Alinhar à direita" aria-label="Alinhar à direita">
                <AlignEndVertical size={16} />
              </button>
              <span className="node-panel__edge-toolbar-divider" aria-hidden />
              <button type="button" className="node-panel__icon-toggle" disabled={!canAlignSelection} onClick={() => onAlignSelected("distribute-horizontal")} title="Distribuir na horizontal" aria-label="Distribuir na horizontal">
                <DistributeHorizontalSpacingIcon size={16} />
              </button>
            </div>
          </div>
          <div className="node-panel__edge-toolbar node-panel__alignment-group" role="group" aria-label="Alinhamento vertical">
            <span className="node-panel__field-label">Vertical</span>
            <div className="node-panel__edge-path-group" role="group" aria-label="Alinhamento vertical">
              <button type="button" className="node-panel__icon-toggle" disabled={!canAlignSelection} onClick={() => onAlignSelected("top")} title="Alinhar ao topo" aria-label="Alinhar ao topo">
                <AlignStartHorizontal size={16} />
              </button>
              <button type="button" className="node-panel__icon-toggle" disabled={!canAlignSelection} onClick={() => onAlignSelected("center-vertical")} title="Centralizar na vertical (⌥V)" aria-label="Centralizar na vertical">
                <AlignCenterHorizontal size={16} />
              </button>
              <button type="button" className="node-panel__icon-toggle" disabled={!canAlignSelection} onClick={() => onAlignSelected("bottom")} title="Alinhar à base" aria-label="Alinhar à base">
                <AlignEndHorizontal size={16} />
              </button>
              <span className="node-panel__edge-toolbar-divider" aria-hidden />
              <button type="button" className="node-panel__icon-toggle" disabled={!canAlignSelection} onClick={() => onAlignSelected("distribute-vertical")} title="Distribuir na vertical" aria-label="Distribuir na vertical">
                <DistributeVerticalSpacingIcon size={16} />
              </button>
            </div>
          </div>
          {!canAlignSelection ? (
            <p className="node-panel__accent-hint">Alinhamento disponível apenas para nós fora das raias.</p>
          ) : null}
        </div>
        {bulkConnectorValues ? (
          <>
            <p className="node-panel__accent-hint">Pontos de conexão (lote): sobrescreve os nós selecionados.</p>
            <div className="node-panel__row">
              <label>
                Superior
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={1}
                  inputMode="numeric"
                  placeholder="-"
                  value={bulkConnectorValues.top === null ? "" : bulkConnectorValues.top}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === "") return;
                    const n = Number(raw);
                    if (!Number.isInteger(n) || n < 0 || n > 5) return;
                    onUpdateSelectedNodesConnectorCount("top", n);
                  }}
                />
              </label>
              <label>
                Direita
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={1}
                  inputMode="numeric"
                  placeholder="-"
                  value={bulkConnectorValues.right === null ? "" : bulkConnectorValues.right}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === "") return;
                    const n = Number(raw);
                    if (!Number.isInteger(n) || n < 0 || n > 5) return;
                    onUpdateSelectedNodesConnectorCount("right", n);
                  }}
                />
              </label>
            </div>
            <div className="node-panel__row">
              <label>
                Esquerda
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={1}
                  inputMode="numeric"
                  placeholder="-"
                  value={bulkConnectorValues.left === null ? "" : bulkConnectorValues.left}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === "") return;
                    const n = Number(raw);
                    if (!Number.isInteger(n) || n < 0 || n > 5) return;
                    onUpdateSelectedNodesConnectorCount("left", n);
                  }}
                />
              </label>
              <label>
                Inferior
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={1}
                  inputMode="numeric"
                  placeholder="-"
                  value={bulkConnectorValues.bottom === null ? "" : bulkConnectorValues.bottom}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === "") return;
                    const n = Number(raw);
                    if (!Number.isInteger(n) || n < 0 || n > 5) return;
                    onUpdateSelectedNodesConnectorCount("bottom", n);
                  }}
                />
              </label>
            </div>
          </>
        ) : (
          <p className="node-panel__accent-hint">Lote de conectores indisponível para seleção apenas com âncoras.</p>
        )}
        {selectedAnchorNodes.length > 0 ? (
          <>
            <p className="node-panel__accent-hint">Forma do ponto de rota (lote): aplica nas âncoras selecionadas.</p>
            <div className="node-panel__anchor-shapes-wrap">
              <div className="node-panel__anchor-shapes-grid" role="group" aria-label="Forma do ponto de rota (lote)">
                {ANCHOR_SHAPE_MATRIX.flatMap((row, ri) =>
                  row.map((val, ci) => {
                    if (val === null) {
                      return (
                        <div
                          key={`anchor-bulk-cell-${ri}-${ci}`}
                          className="node-panel__anchor-shape-cell node-panel__anchor-shape-cell--empty"
                          aria-hidden
                        />
                      );
                    }
                    const selected = bulkAnchorShapeValue === val;
                    return (
                      <button
                        key={`anchor-bulk-cell-${ri}-${ci}-${val}`}
                        type="button"
                        className={`secondary node-panel__anchor-shape-btn${selected ? " toolbar-icon-toggle--selected" : ""}`}
                        title={ANCHOR_SHAPE_LABELS[val]}
                        aria-label={ANCHOR_SHAPE_LABELS[val]}
                        aria-pressed={selected}
                        onClick={() => onUpdateSelectedNodesAnchorShape(val)}
                      >
                        <AnchorGlyph shape={val} size={18} className="node-panel__anchor-shape-preview" />
                      </button>
                    );
                  }),
                )}
              </div>
            </div>
          </>
        ) : null}
      </aside>
    );
  }

  function handleTextChange(field: "title" | "description") {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const max = field === "title" ? NODE_TITLE_MAX : NODE_DESCRIPTION_MAX;
      onUpdateNode(n.id, { [field]: e.target.value.slice(0, max) });
    };
  }

  function handleMetadataChange(e: ChangeEvent<HTMLTextAreaElement>): void {
    const value = e.target.value.slice(0, NODE_METADATA_JSON_MAX);
    try {
      const parsed = value.trim() ? (JSON.parse(value) as Record<string, unknown>) : {};
      onUpdateNode(n.id, { metadata: parsed });
    } catch {
      // Ignore parse errors while typing to keep the UI responsive.
    }
  }

  const isAnchorSingle = !isBulkEditing && n.data.type === "anchor";
  const isCommentSingle = !isBulkEditing && n.data.type === "comment";
  const isNodeInLane = Boolean(n.data.laneId && typeof n.data.columnIndex === "number");

  const connectorSideFields = (
    <>
      <div className="node-panel__row">
        <label>
          Superior
          <input
            type="number"
            min={0}
            max={5}
            step={1}
            value={safeNodeData.connectorsPerSide.top}
            onChange={(e) =>
              onUpdateNode(n.id, {
                connectorsPerSide: {
                  ...safeNodeData.connectorsPerSide,
                  top: Math.max(0, Math.min(5, Number(e.target.value))),
                },
              })
            }
          />
        </label>
        <label>
          Direita
          <input
            type="number"
            min={0}
            max={5}
            step={1}
            value={safeNodeData.connectorsPerSide.right}
            onChange={(e) =>
              onUpdateNode(n.id, {
                connectorsPerSide: {
                  ...safeNodeData.connectorsPerSide,
                  right: Math.max(0, Math.min(5, Number(e.target.value))),
                },
              })
            }
          />
        </label>
      </div>
      <div className="node-panel__row">
        <label>
          Esquerda
          <input
            type="number"
            min={0}
            max={5}
            step={1}
            value={safeNodeData.connectorsPerSide.left}
            onChange={(e) =>
              onUpdateNode(n.id, {
                connectorsPerSide: {
                  ...safeNodeData.connectorsPerSide,
                  left: Math.max(0, Math.min(5, Number(e.target.value))),
                },
              })
            }
          />
        </label>
        <label>
          Inferior
          <input
            type="number"
            min={0}
            max={5}
            step={1}
            value={safeNodeData.connectorsPerSide.bottom}
            onChange={(e) =>
              onUpdateNode(n.id, {
                connectorsPerSide: {
                  ...safeNodeData.connectorsPerSide,
                  bottom: Math.max(0, Math.min(5, Number(e.target.value))),
                },
              })
            }
          />
        </label>
      </div>
    </>
  );

  return (
    <aside className="node-panel">
      <h2>Editor de nó</h2>

      {isAnchorSingle ? (
        <div className="node-panel__anchor-shapes-wrap node-panel__anchor-shapes-wrap--first">
          <span className="node-panel__field-label">Forma</span>
          <div className="node-panel__anchor-shapes-grid" role="group" aria-label="Forma do ponto de rota">
            {ANCHOR_SHAPE_MATRIX.flatMap((row, ri) =>
              row.map((val, ci) => {
                if (val === null) {
                  return (
                    <div
                      key={`anchor-cell-${ri}-${ci}`}
                      className="node-panel__anchor-shape-cell node-panel__anchor-shape-cell--empty"
                      aria-hidden
                    />
                  );
                }
                const current = normalizeAnchorShape(n.data.anchorShape);
                return (
                  <button
                    key={`anchor-cell-${ri}-${ci}-${val}`}
                    type="button"
                    className={`secondary node-panel__anchor-shape-btn${current === val ? " toolbar-icon-toggle--selected" : ""}`}
                    title={ANCHOR_SHAPE_LABELS[val]}
                    aria-label={ANCHOR_SHAPE_LABELS[val]}
                    aria-pressed={current === val}
                    onClick={() => onUpdateNode(n.id, { anchorShape: val })}
                  >
                    <AnchorGlyph shape={val} size={18} className="node-panel__anchor-shape-preview" />
                  </button>
                );
              }),
            )}
          </div>
        </div>
      ) : null}

      {!isAnchorSingle && !isCommentSingle ? (
        <>
          <label>
            Título
            <input value={safeNodeData.title} maxLength={NODE_TITLE_MAX} onChange={handleTextChange("title")} />
            <small className="field-counter">
              {safeNodeData.title.length}/{NODE_TITLE_MAX}
            </small>
          </label>

          <label>
            Descrição
            <textarea
              rows={4}
              value={safeNodeData.description}
              maxLength={NODE_DESCRIPTION_MAX}
              onChange={handleTextChange("description")}
            />
            <small className="field-counter">
              {safeNodeData.description.length}/{NODE_DESCRIPTION_MAX}
            </small>
          </label>

          {!isBulkEditing && n.data.type === "action" ? (
            <div className="node-panel__accent-field">
              <span className="node-panel__field-label">Cor</span>
              {isNodeInLane ? (
                <p className="node-panel__accent-hint">Definida automaticamente pela raia.</p>
              ) : (
                <div className="node-panel__lane-palette" role="radiogroup" aria-label="Cor do nó">
                  {laneStrongColors.map((strongColor, index) => {
                    const current = safeNodeData.laneColorStrong?.toLowerCase();
                    const selected = current !== undefined && current === strongColor.toLowerCase();
                    return (
                      <button
                        key={`${strongColor}-${index}`}
                        type="button"
                        className={`node-panel__lane-swatch${selected ? " node-panel__lane-swatch--selected" : ""}`}
                        style={{ backgroundColor: strongColor }}
                        role="radio"
                        aria-checked={selected}
                        title={`Cor ${index + 1}`}
                        aria-label={`Cor ${index + 1}`}
                        onClick={() => onUpdateNode(n.id, { laneColorStrong: strongColor })}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          <details>
            <summary>Canal</summary>
            <div className="channel-checklist">
              {Object.entries(CHANNEL_LABELS)
                .filter(([value]) => value !== "none")
                .map(([value, label]) => {
                  const channel = value as FlowChannel;
                  const checked = selectedChannels.includes(channel);
                  return (
                    <label key={channel} className="channel-checklist__item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const nextChannels = e.target.checked
                            ? [...selectedChannels, channel]
                            : selectedChannels.filter((current) => current !== channel);
                          onUpdateNodeChannels(n.id, nextChannels.slice(0, 5));
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
            </div>
          </details>

          {connectorSideFields}
        </>
      ) : null}

      {isCommentSingle ? (
        <>
          <label>
            Título
            <input value={safeNodeData.title} maxLength={NODE_TITLE_MAX} onChange={handleTextChange("title")} />
            <small className="field-counter">
              {safeNodeData.title.length}/{NODE_TITLE_MAX}
            </small>
          </label>
          <label>
            Comentário
            <textarea
              rows={6}
              value={safeNodeData.description}
              maxLength={NODE_DESCRIPTION_MAX}
              onChange={handleTextChange("description")}
            />
            <small className="field-counter">
              {safeNodeData.description.length}/{NODE_DESCRIPTION_MAX}
            </small>
          </label>

          {connectorSideFields}
        </>
      ) : null}

      {!isBulkEditing ? (
        <label>
          ID
          <div className="node-panel__id-row">
            <input
              className={`node-panel__id-input${nodeIdValidation.conflict ? " node-panel__id-input--invalid" : ""}`}
              value={nodeIdDraft}
              maxLength={ELEMENT_ID_MAX}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={nodeIdValidation.conflict}
              onChange={(e) => setNodeIdDraft(e.target.value.slice(0, ELEMENT_ID_MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nodeIdValidation.canApply) {
                  e.preventDefault();
                  onRenameNodeId(n.id, nodeIdDraft);
                }
              }}
            />
            <button
              type="button"
              className="secondary icon-only-button node-panel__id-commit"
              disabled={!nodeIdValidation.canApply}
              title={
                nodeIdValidation.conflict
                  ? "Este ID já está em uso"
                  : nodeIdValidation.unchanged || nodeIdValidation.empty
                    ? "Altere o ID para aplicar"
                    : "Aplicar ID"
              }
              aria-label={
                nodeIdValidation.conflict
                  ? "Não é possível aplicar: ID já em uso"
                  : "Aplicar ID do nó"
              }
              onClick={() => {
                if (nodeIdValidation.canApply) onRenameNodeId(n.id, nodeIdDraft);
              }}
            >
              <Check size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
          <small className="field-counter">
            {nodeIdDraft.length}/{ELEMENT_ID_MAX}
          </small>
          {nodeIdValidation.conflict ? (
            <p className="node-panel__id-hint node-panel__id-hint--error" role="status">
              Este ID já está em uso por outro nó.
            </p>
          ) : null}
        </label>
      ) : null}

      {isAnchorSingle ? (
        <div className="node-panel__anchor-follow-stack">
          <p className="node-panel__accent-hint node-panel__anchor-follow-hint">
            Aviso: os pontos de rota podem ficar referenciados ao nó ligado pelas linhas, para acompanhar mudanças no
            layout. O botão só fica ativo quando existe linha ligada ao ponto; clique para desativar ou ativar o vínculo.
          </p>
          <button
            type="button"
            className={`secondary icon-only-button${
              anchorHasConnectedEdges && n.data.anchorFollowReferenceDisabled !== true
                ? " toolbar-icon-toggle--selected"
                : ""
            }`}
            disabled={!anchorHasConnectedEdges}
            title={
              !anchorHasConnectedEdges
                ? "Conecte uma linha ao ponto de rota para ativar ou desativar a referência ao layout."
                : n.data.anchorFollowReferenceDisabled === true
                  ? "Ativar referência ao nó conectado"
                  : "Desativar referência ao nó (layout livre)"
            }
            aria-label={
              !anchorHasConnectedEdges
                ? "Referência ao layout: conecte uma linha ao ponto primeiro"
                : n.data.anchorFollowReferenceDisabled === true
                  ? "Ativar referência ao nó conectado"
                  : "Desativar referência ao nó (layout livre)"
            }
            aria-pressed={anchorHasConnectedEdges ? n.data.anchorFollowReferenceDisabled !== true : false}
            onClick={() => onToggleAnchorFollowReference(n.id)}
          >
            <Anchor size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : null}

      {!isAnchorSingle && !isCommentSingle ? (
        <label>
          Metadados (JSON)
          <textarea
            rows={8}
            defaultValue={metadataText}
            maxLength={NODE_METADATA_JSON_MAX}
            onChange={handleMetadataChange}
            key={n.id + metadataText}
          />
          <small className="field-counter">
            {metadataText.length}/{NODE_METADATA_JSON_MAX}
          </small>
        </label>
      ) : null}
    </aside>
  );
}

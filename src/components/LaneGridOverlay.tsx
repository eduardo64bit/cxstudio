import type { Viewport } from "@xyflow/react";
import { useEffect, useState } from "react";
import type { WheelEvent as ReactWheelEvent } from "react";
import type { LaneSystem } from "../types/flow";
import { getLaneColorSet } from "../constants/laneColors";

const GRID_HEADER_HEIGHT = 44;
const GRID_LANE_TITLE_WIDTH = 180;

interface LaneGridOverlayProps {
  laneSystem: LaneSystem;
  laneTopById: Map<string, number>;
  rowHeightByLaneId: Map<string, number>;
  viewport: Viewport;
  hoveredCell: { laneId: string; columnIndex: number } | null;
  onAddColumn: () => void;
  onAddLane: () => void;
  onRemoveColumn: () => void;
  onRemoveLane: (laneId: string) => void;
  onUpdateLaneTitle: (laneId: string, title: string) => void;
  onUpdateColumnTitle: (columnId: string, title: string) => void;
  onSelectLaneTitle: (laneId: string) => void;
  onSelectColumnHeader: (columnId: string) => void;
  selectedLaneId: string | null;
  selectedColumnId: string | null;
  laneStrongColors: string[];
}

export default function LaneGridOverlay({
  laneSystem,
  laneTopById,
  rowHeightByLaneId,
  viewport,
  hoveredCell,
  onAddColumn,
  onAddLane,
  onRemoveColumn,
  onRemoveLane,
  onUpdateLaneTitle,
  onUpdateColumnTitle,
  onSelectLaneTitle,
  onSelectColumnHeader,
  selectedLaneId,
  selectedColumnId,
  laneStrongColors,
}: LaneGridOverlayProps) {
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingLaneId, setEditingLaneId] = useState<string | null>(null);
  const [panThroughControls, setPanThroughControls] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const maxColumns = Math.max(1, laneSystem.columns.length);
  const totalWidth = maxColumns * laneSystem.columnWidth + (maxColumns - 1) * laneSystem.horizontalGap;
  const lastLaneId = laneSystem.lanes[laneSystem.lanes.length - 1]?.id ?? "";
  const rowButtonsTop =
    GRID_HEADER_HEIGHT +
    laneSystem.verticalGap +
    (laneTopById.get(lastLaneId) ?? 0) +
    (rowHeightByLaneId.get(lastLaneId) ?? laneSystem.rowMinHeight) +
    laneSystem.verticalGap / 2;

  const forwardWheelToCanvas = (e: ReactWheelEvent) => {
    const flow = document.querySelector(".canvas-area .react-flow");
    if (!flow) return;
    const ev = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaZ: e.deltaZ,
      deltaMode: e.deltaMode,
      clientX: e.clientX,
      clientY: e.clientY,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    });
    flow.dispatchEvent(ev);
    e.preventDefault();
  };

  useEffect(() => {
    if (!panThroughControls) return;
    const release = () => setPanThroughControls(false);
    window.addEventListener("mouseup", release);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("mouseup", release);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [panThroughControls]);

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

  return (
    <>
      <div className="lane-system-overlay lane-system-overlay--cells" aria-hidden>
        <div
          className="lane-system-overlay__viewport"
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
        >
          {laneSystem.lanes.map((lane, laneIndex) => (
            <div
              key={lane.id}
              className="lane-row"
              style={{
                  top:
                    GRID_HEADER_HEIGHT +
                    laneSystem.verticalGap +
                    (laneTopById.get(lane.id) ?? laneIndex * (laneSystem.rowMinHeight + laneSystem.verticalGap)),
                height: rowHeightByLaneId.get(lane.id) ?? laneSystem.rowMinHeight,
                  width: totalWidth,
              }}
            >
              {/** Cor por lane: título mais intenso e células mais claras da mesma família. */}
              {(() => {
                const laneColors = getLaneColorSet(laneIndex, laneStrongColors);
                return Array.from({ length: lane.columnCount }).map((_, columnIndex) => (
                  <div
                    key={`${lane.id}-${columnIndex}`}
                    className={`lane-cell${
                      hoveredCell?.laneId === lane.id && hoveredCell.columnIndex === columnIndex ? " lane-cell--hovered" : ""
                    }`}
                    style={{
                      left: GRID_LANE_TITLE_WIDTH + laneSystem.horizontalGap + columnIndex * (laneSystem.columnWidth + laneSystem.horizontalGap),
                      width: laneSystem.columnWidth,
                      background: laneColors.light,
                      borderColor: laneColors.strong,
                    }}
                  />
                ));
              })()}
            </div>
          ))}
        </div>
      </div>
      <div className="lane-system-overlay lane-system-overlay--controls" aria-hidden>
        <div
          className={`lane-system-overlay__viewport${
            panThroughControls || spacePressed ? " lane-system-overlay__viewport--passthrough" : ""
          }`}
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
          onMouseDownCapture={(e) => {
            if (e.button === 1 || (e.button === 0 && spacePressed)) setPanThroughControls(true);
          }}
        >
          <div
            className="lane-header-row"
            style={{
              top: 0,
              height: GRID_HEADER_HEIGHT,
              width: GRID_LANE_TITLE_WIDTH + laneSystem.horizontalGap + totalWidth,
            }}
          >
            <div className="lane-corner-cell" style={{ width: GRID_LANE_TITLE_WIDTH }} />
            {laneSystem.columns.map((column, columnIndex) => (
              <div
                key={column.id}
                className={`lane-header-cell${selectedColumnId === column.id ? " lane-header-cell--selected" : ""}`}
                style={{
                  left:
                    GRID_LANE_TITLE_WIDTH +
                    laneSystem.horizontalGap +
                    columnIndex * (laneSystem.columnWidth + laneSystem.horizontalGap),
                  width: laneSystem.columnWidth,
                  background: columnIndex % 2 === 0 ? "#2B2B2B" : "#3A3A3A",
                }}
              >
                {editingColumnId === column.id ? (
                  <input
                    autoFocus
                    defaultValue={column.title}
                    className="lane-header-input"
                    onWheelCapture={forwardWheelToCanvas}
                    onBlur={(e) => {
                      onUpdateColumnTitle(column.id, e.currentTarget.value);
                      setEditingColumnId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onUpdateColumnTitle(column.id, (e.target as HTMLInputElement).value);
                        setEditingColumnId(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="lane-header-hit"
                    onDoubleClick={() => setEditingColumnId(column.id)}
                    onClick={() => onSelectColumnHeader(column.id)}
                    onWheelCapture={forwardWheelToCanvas}
                  >
                    <span className="lane-header-text">{column.title}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
          {laneSystem.lanes.map((lane, laneIndex) => (
            <div
              key={`title-${lane.id}`}
              className="lane-title-cell-wrapper"
              style={{
                top:
                  GRID_HEADER_HEIGHT +
                  laneSystem.verticalGap +
                  (laneTopById.get(lane.id) ?? laneIndex * (laneSystem.rowMinHeight + laneSystem.verticalGap)),
                height: rowHeightByLaneId.get(lane.id) ?? laneSystem.rowMinHeight,
              }}
            >
              {(() => {
                const laneColors = getLaneColorSet(laneIndex, laneStrongColors);
                return (
              <div
                className={`lane-title-cell${selectedLaneId === lane.id ? " lane-title-cell--selected" : ""}`}
                style={{ width: GRID_LANE_TITLE_WIDTH, background: laneColors.medium, borderColor: laneColors.strong }}
              >
                {editingLaneId === lane.id ? (
                  <input
                    autoFocus
                    defaultValue={lane.title}
                    className="lane-title-input"
                    onWheelCapture={forwardWheelToCanvas}
                    onBlur={(e) => {
                      onUpdateLaneTitle(lane.id, e.currentTarget.value);
                      setEditingLaneId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onUpdateLaneTitle(lane.id, (e.target as HTMLInputElement).value);
                        setEditingLaneId(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="lane-title-hit"
                    onDoubleClick={() => setEditingLaneId(lane.id)}
                    onClick={() => onSelectLaneTitle(lane.id)}
                    onWheelCapture={forwardWheelToCanvas}
                  >
                    <span className="lane-title-text">{lane.title}</span>
                  </button>
                )}
              </div>
                );
              })()}
            </div>
          ))}
          <button
            className="lane-add-button lane-add-button--column"
            style={{
              left: GRID_LANE_TITLE_WIDTH + laneSystem.columns.length * (laneSystem.columnWidth + laneSystem.horizontalGap) - laneSystem.horizontalGap / 2,
              top: GRID_HEADER_HEIGHT / 2,
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddColumn();
            }}
            title="Adicionar coluna"
            aria-label="Adicionar coluna"
            type="button"
          >
            +
          </button>
          <button
            className="lane-add-button lane-add-button--column lane-add-button--danger"
            style={{
              left:
                GRID_LANE_TITLE_WIDTH + laneSystem.columns.length * (laneSystem.columnWidth + laneSystem.horizontalGap) -
                laneSystem.horizontalGap / 2 +
                28,
              top: GRID_HEADER_HEIGHT / 2,
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemoveColumn();
            }}
            title="Excluir última coluna"
            aria-label="Excluir última coluna"
            type="button"
          >
            -
          </button>
          <button
            className="lane-add-button lane-add-button--row lane-add-button--row-first-column"
            style={{ top: rowButtonsTop }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddLane();
            }}
            title="Adicionar nova linha"
            aria-label="Adicionar nova linha"
            type="button"
          >
            +
          </button>
          <button
            className="lane-add-button lane-add-button--row lane-add-button--row-first-column lane-add-button--danger"
            style={{ top: rowButtonsTop + 28 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const lastLaneId = laneSystem.lanes[laneSystem.lanes.length - 1]?.id;
              if (lastLaneId) onRemoveLane(lastLaneId);
            }}
            title="Excluir última linha (se vazia)"
            aria-label="Excluir última linha (se vazia)"
            type="button"
          >
            -
          </button>
        </div>
      </div>
    </>
  );
}

import { useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import type { CSSProperties } from "react";
import {
  Globe,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Send,
  Share2,
  Smartphone,
} from "lucide-react";
import AnchorGlyph from "./AnchorGlyph";
import { NODE_TYPE_COLORS } from "../constants/nodeTemplates";
import { anchorConnectedSides, normalizeAnchorShape } from "../constants/anchorShapes";
import type { FlowNodeData } from "../types/flow";
import { CHANNEL_LABELS } from "../constants/channels";

const CHANNEL_ICONS = {
  none: Globe,
  web: Globe,
  app: Smartphone,
  sms: MessageSquare,
  social: Share2,
  whatsapp: MessageCircle,
  telegram: Send,
  email: Mail,
  voice: Phone,
} as const;

export default function FlowNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as FlowNodeData;
  const updateNodeInternals = useUpdateNodeInternals();
  const isAnchor = nodeData.type === "anchor";
  const isComment = nodeData.type === "comment";
  const connectorsPerSide = isAnchor
    ? { top: 1, bottom: 1, left: 1, right: 1 }
    : isComment
      ? {
          top: Math.max(0, Math.min(5, Math.round(nodeData.connectorsPerSide?.top ?? 0))),
          bottom: Math.max(0, Math.min(5, Math.round(nodeData.connectorsPerSide?.bottom ?? 0))),
          left: Math.max(0, Math.min(5, Math.round(nodeData.connectorsPerSide?.left ?? 0))),
          right: Math.max(0, Math.min(5, Math.round(nodeData.connectorsPerSide?.right ?? 0))),
        }
      : {
          top: Math.max(0, Math.min(5, Math.round(nodeData.connectorsPerSide?.top ?? 1))),
          bottom: Math.max(0, Math.min(5, Math.round(nodeData.connectorsPerSide?.bottom ?? 1))),
          left: Math.max(0, Math.min(5, Math.round(nodeData.connectorsPerSide?.left ?? 1))),
          right: Math.max(0, Math.min(5, Math.round(nodeData.connectorsPerSide?.right ?? 1))),
        };

  useEffect(() => {
    updateNodeInternals(id);
  }, [
    id,
    nodeData.anchorShape,
    connectorsPerSide.top,
    connectorsPerSide.bottom,
    connectorsPerSide.left,
    connectorsPerSide.right,
    updateNodeInternals,
  ]);

  function getPositionPercentForSide(side: "left" | "top" | "bottom" | "right", index: number): number {
    const count = connectorsPerSide[side];
    return Math.round(((index + 1) / (count + 1)) * 100);
  }

  function getHandleId(side: "left" | "top" | "bottom" | "right", index: number): string {
    const prefixBySide: Record<typeof side, "L" | "T" | "B" | "R"> = {
      left: "L",
      top: "T",
      bottom: "B",
      right: "R",
    };
    return `${prefixBySide[side]}${index + 1}`;
  }

  function getHandleStyle(side: "left" | "top" | "bottom" | "right", index: number) {
    const percent = `${getPositionPercentForSide(side, index)}%`;
    if (side === "left" || side === "right") return { top: percent };
    return { left: percent };
  }

  if (isAnchor) {
    const anchorShape = normalizeAnchorShape(nodeData.anchorShape);
    const connectedSides = anchorConnectedSides(anchorShape);
    const isSingleCenter = anchorShape === "single-center";
    return (
      <div
        className={`flow-node flow-node--anchor${isSingleCenter ? " flow-node--anchor-single-center" : ""} ${selected ? "selected" : ""}`}
        title="Ponto de rota — conecte as linhas para flexibilizar o caminho"
      >
        <AnchorGlyph className="flow-node__anchor-glyph" shape={anchorShape} />
        {Array.from({ length: connectorsPerSide.left }).map((_, index) => (
          <Handle
            key={`left-handle-${index}`}
            type="source"
            position={Position.Left}
            id={getHandleId("left", index)}
            className={`flow-node__handle flow-node__handle--edge flow-node__handle--anchor${connectedSides.left ? "" : " flow-node__handle--inactive"}`}
            isConnectableStart
            isConnectableEnd
          />
        ))}
        {Array.from({ length: connectorsPerSide.top }).map((_, index) => (
          <Handle
            key={`top-handle-${index}`}
            type="source"
            position={Position.Top}
            id={getHandleId("top", index)}
            className={`flow-node__handle flow-node__handle--edge flow-node__handle--anchor${connectedSides.top ? "" : " flow-node__handle--inactive"}`}
            isConnectableStart
            isConnectableEnd
          />
        ))}
        {Array.from({ length: connectorsPerSide.bottom }).map((_, index) => (
          <Handle
            key={`bottom-handle-${index}`}
            type="source"
            position={Position.Bottom}
            id={getHandleId("bottom", index)}
            className={`flow-node__handle flow-node__handle--edge flow-node__handle--anchor${connectedSides.bottom ? "" : " flow-node__handle--inactive"}`}
            isConnectableStart
            isConnectableEnd
          />
        ))}
        {Array.from({ length: connectorsPerSide.right }).map((_, index) => (
          <Handle
            key={`right-handle-${index}`}
            type="source"
            position={Position.Right}
            id={getHandleId("right", index)}
            className={`flow-node__handle flow-node__handle--edge flow-node__handle--anchor${connectedSides.right ? "" : " flow-node__handle--inactive"}`}
            isConnectableStart
            isConnectableEnd
          />
        ))}
      </div>
    );
  }

  const color = nodeData.laneColorStrong ?? NODE_TYPE_COLORS[nodeData.type];
  if (isComment) {
    const title = nodeData.title?.trim() ? nodeData.title : "";
    const description = nodeData.description?.trim() ? nodeData.description : "";
    return (
      <div className={`flow-node ${selected ? "selected" : ""}`}>
        <div className="flow-node__comment-shell">
          <div className="flow-node__comment-surface">
            {title ? <div className="flow-node__comment-title">{title}</div> : null}
            {description ? <div className="flow-node__comment-description">{description}</div> : null}
            {!title && !description ? <div className="flow-node__comment-description">Comentário</div> : null}
          </div>
          {Array.from({ length: connectorsPerSide.left }).map((_, index) => (
            <Handle
              key={`left-handle-${index}`}
              type="source"
              position={Position.Left}
              id={getHandleId("left", index)}
              className="flow-node__handle flow-node__handle--edge flow-node__handle--comment"
              style={getHandleStyle("left", index)}
              isConnectableStart
              isConnectableEnd
            />
          ))}
          {Array.from({ length: connectorsPerSide.top }).map((_, index) => (
            <Handle
              key={`top-handle-${index}`}
              type="source"
              position={Position.Top}
              id={getHandleId("top", index)}
              className="flow-node__handle flow-node__handle--edge flow-node__handle--comment"
              style={getHandleStyle("top", index)}
              isConnectableStart
              isConnectableEnd
            />
          ))}
          {Array.from({ length: connectorsPerSide.bottom }).map((_, index) => (
            <Handle
              key={`bottom-handle-${index}`}
              type="source"
              position={Position.Bottom}
              id={getHandleId("bottom", index)}
              className="flow-node__handle flow-node__handle--edge flow-node__handle--comment"
              style={getHandleStyle("bottom", index)}
              isConnectableStart
              isConnectableEnd
            />
          ))}
          {Array.from({ length: connectorsPerSide.right }).map((_, index) => (
            <Handle
              key={`right-handle-${index}`}
              type="source"
              position={Position.Right}
              id={getHandleId("right", index)}
              className="flow-node__handle flow-node__handle--edge flow-node__handle--comment"
              style={getHandleStyle("right", index)}
              isConnectableStart
              isConnectableEnd
            />
          ))}
        </div>
      </div>
    );
  }

  const uniqueChannels = Array.from(
    new Set([...(nodeData.channel !== "none" ? [nodeData.channel] : []), ...(nodeData.channels ?? [])]),
  ).slice(0, 5);

  return (
    <div className={`flow-node ${selected ? "selected" : ""}`}>
      <div
        className="flow-node__surface"
        style={{ borderColor: color, color } as CSSProperties}
      >
        {Array.from({ length: connectorsPerSide.left }).map((_, index) => (
          <Handle
            key={`left-handle-${index}`}
            type="source"
            position={Position.Left}
            id={getHandleId("left", index)}
            className="flow-node__handle flow-node__handle--edge"
            style={getHandleStyle("left", index)}
            isConnectableStart
            isConnectableEnd
          />
        ))}
        {Array.from({ length: connectorsPerSide.top }).map((_, index) => (
          <Handle
            key={`top-handle-${index}`}
            type="source"
            position={Position.Top}
            id={getHandleId("top", index)}
            className="flow-node__handle flow-node__handle--edge"
            style={getHandleStyle("top", index)}
            isConnectableStart
            isConnectableEnd
          />
        ))}
        <div className="flow-node__title">{nodeData.title || "Sem título"}</div>
        {nodeData.description && <div className="flow-node__description">{nodeData.description}</div>}
        {uniqueChannels.length > 0 && (
          <div className="flow-node__channels" aria-label="Canais">
            {uniqueChannels.map((channel) => {
              const ChannelIcon = CHANNEL_ICONS[channel];
              return (
                <div key={channel} className="flow-node__channel-badge" title={`Canal: ${CHANNEL_LABELS[channel]}`}>
                  <ChannelIcon size={14} />
                </div>
              );
            })}
          </div>
        )}
        {Array.from({ length: connectorsPerSide.bottom }).map((_, index) => (
          <Handle
            key={`bottom-handle-${index}`}
            type="source"
            position={Position.Bottom}
            id={getHandleId("bottom", index)}
            className="flow-node__handle flow-node__handle--edge"
            style={getHandleStyle("bottom", index)}
            isConnectableStart
            isConnectableEnd
          />
        ))}
        {Array.from({ length: connectorsPerSide.right }).map((_, index) => (
          <Handle
            key={`right-handle-${index}`}
            type="source"
            position={Position.Right}
            id={getHandleId("right", index)}
            className="flow-node__handle flow-node__handle--edge"
            style={getHandleStyle("right", index)}
            isConnectableStart
            isConnectableEnd
          />
        ))}
      </div>
    </div>
  );
}

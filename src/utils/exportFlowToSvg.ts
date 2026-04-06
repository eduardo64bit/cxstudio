import { anchorSvgInnerXml, normalizeAnchorShape } from "../constants/anchorShapes";
import { NODE_TYPE_COLORS } from "../constants/nodeTemplates";
import type { FlowNode } from "../types/flow";

const DEFAULT_FLOW_CARD_WIDTH = 220;
const DEFAULT_FLOW_CARD_HEIGHT_FALLBACK = 100;
const ANCHOR_NODE_SIZE = 32;
const VIEW_PADDING = 48;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nodeLayoutSize(node: FlowNode): { w: number; h: number } {
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

function expandBounds(
  box: { minX: number; minY: number; maxX: number; maxY: number },
  x: number,
  y: number,
  w: number,
  h: number,
) {
  box.minX = Math.min(box.minX, x);
  box.minY = Math.min(box.minY, y);
  box.maxX = Math.max(box.maxX, x + w);
  box.maxY = Math.max(box.maxY, y + h);
}

/**
 * Monta um SVG do fluxo visível no React Flow (coordenadas de fluxo), para importar no Figma.
 * Conexões vêm dos paths renderizados; cartões vêm dos dados dos nós (vetor simples).
 */
export function buildFlowSvgFromDom(reactFlowRoot: HTMLElement, nodes: FlowNode[]): string | null {
  const viewport = reactFlowRoot.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) return null;

  const edgePaths = viewport.querySelectorAll<SVGPathElement>("path.react-flow__edge-path");
  const markerSvg = reactFlowRoot.querySelector<SVGElement>("svg.react-flow__marker");
  const defsEl = markerSvg?.querySelector("defs");
  const defsXml = defsEl ? new XMLSerializer().serializeToString(defsEl) : "<defs></defs>";

  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  for (const node of nodes) {
    const { w, h } = nodeLayoutSize(node);
    expandBounds(box, node.position.x, node.position.y, w, h);
  }

  edgePaths.forEach((path) => {
    try {
      const bb = path.getBBox();
      expandBounds(box, bb.x, bb.y, bb.width, bb.height);
    } catch {
      /* path sem geometria */
    }
  });

  if (!Number.isFinite(box.minX)) {
    box.minX = 0;
    box.minY = 0;
    box.maxX = 400;
    box.maxY = 300;
  }

  const vbX = box.minX - VIEW_PADDING;
  const vbY = box.minY - VIEW_PADDING;
  const vbW = box.maxX - box.minX + VIEW_PADDING * 2;
  const vbH = box.maxY - box.minY + VIEW_PADDING * 2;

  const pathsXml: string[] = [];
  edgePaths.forEach((path) => {
    const d = path.getAttribute("d");
    if (!d) return;
    const cs = window.getComputedStyle(path);
    const stroke = cs.stroke && cs.stroke !== "none" ? cs.stroke : "#94a3b8";
    const sw = cs.strokeWidth || "2";
    const dash = cs.strokeDasharray;
    const dashAttr =
      dash && dash !== "none" && dash !== "0" ? ` stroke-dasharray="${escapeXml(dash)}"` : "";
    const ms = path.getAttribute("marker-start");
    const me = path.getAttribute("marker-end");
    const msA = ms ? ` marker-start="${escapeXml(ms)}"` : "";
    const meA = me ? ` marker-end="${escapeXml(me)}"` : "";
    pathsXml.push(
      `<path fill="none" d="${escapeXml(d)}" stroke="${escapeXml(stroke)}" stroke-width="${escapeXml(sw)}"${dashAttr}${msA}${meA}/>`,
    );
  });

  let nodesXml = "";
  for (const node of nodes) {
    const { w, h } = nodeLayoutSize(node);
    const { x, y } = node.position;
    const t = node.data.type;
    const strokeColor = node.data.laneColorStrong ?? NODE_TYPE_COLORS[t];
    const title = (node.data.title ?? "").trim();

    if (t === "anchor") {
      const shape = normalizeAnchorShape(node.data.anchorShape);
      const strokeEsc = escapeXml(strokeColor);
      const inner = anchorSvgInnerXml(shape, strokeEsc);
      const sx = w / 32;
      const sy = h / 32;
      nodesXml += `<g transform="translate(${x},${y}) scale(${sx},${sy})">${inner}</g>`;
    } else {
      const ry = t === "comment" ? 12 : 8;
      nodesXml += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${ry}" ry="${ry}" fill="#ffffff" stroke="${escapeXml(strokeColor)}" stroke-width="2"/>`;
      if (title) {
        nodesXml += `<text x="${x + 12}" y="${y + 26}" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="600" fill="#1f2937">${escapeXml(title)}</text>`;
      }
      const desc = (node.data.description ?? "").trim();
      if (desc) {
        const clipped = desc.length > 140 ? `${desc.slice(0, 137)}…` : desc;
        nodesXml += `<text x="${x + 12}" y="${y + 46}" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="12" fill="#64748b">${escapeXml(clipped)}</text>`;
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${Math.round(vbW)}" height="${Math.round(vbH)}">
${defsXml}
<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#f1f5f9"/>
<g id="edges">${pathsXml.join("")}</g>
<g id="nodes">${nodesXml}</g>
</svg>`;
}

export function downloadSvgFile(filename: string, svgContent: string) {
  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

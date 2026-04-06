/**
 * Posição ao longo do `d` da aresta (coordenadas do fluxo), usando a API SVG do browser.
 */

let measurePath: SVGPathElement | null = null;

function ensureMeasurePath(): SVGPathElement | null {
  if (typeof document === "undefined") return null;
  if (!measurePath) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    measurePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.appendChild(measurePath);
    svg.setAttribute("style", "position:absolute;width:0;height:0;visibility:hidden;pointer-events:none");
    document.body.appendChild(svg);
  }
  return measurePath;
}

function setMeasurePathD(el: SVGPathElement, pathD: string): void {
  if (el.getAttribute("d") !== pathD) {
    el.setAttribute("d", pathD);
  }
}

/** Ponto em t ∈ [0,1] ao longo do comprimento do path. */
export function pointAtPathT(pathD: string, t: number): { x: number; y: number } {
  const el = ensureMeasurePath();
  if (!el) return { x: 0, y: 0 };
  setMeasurePathD(el, pathD);
  const len = el.getTotalLength();
  if (!len || !Number.isFinite(len)) return { x: 0, y: 0 };
  const u = Math.max(0, Math.min(1, t));
  return el.getPointAtLength(u * len);
}

/** t ∈ [0,1] do ponto do path mais próximo de (x,y), por amostragem + refinamento local. */
export function nearestTOnPath(pathD: string, x: number, y: number): number {
  const el = ensureMeasurePath();
  if (!el) return 0.5;
  setMeasurePathD(el, pathD);
  const len = el.getTotalLength();
  if (!len || !Number.isFinite(len)) return 0.5;

  const steps = Math.min(200, Math.max(24, Math.ceil(len / 6)));
  let bestT = 0.5;
  let bestDist = Infinity;

  const distAt = (t: number) => {
    const p = el.getPointAtLength(Math.max(0, Math.min(1, t)) * len);
    const dx = p.x - x;
    const dy = p.y - y;
    return dx * dx + dy * dy;
  };

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const d2 = distAt(t);
    if (d2 < bestDist) {
      bestDist = d2;
      bestT = t;
    }
  }

  const dt = 1 / steps;
  const lo = Math.max(0, bestT - dt);
  const hi = Math.min(1, bestT + dt);
  const refineSteps = 28;
  for (let i = 0; i <= refineSteps; i += 1) {
    const t = lo + (i / refineSteps) * (hi - lo);
    const d2 = distAt(t);
    if (d2 < bestDist) {
      bestDist = d2;
      bestT = t;
    }
  }

  return Math.max(0, Math.min(1, bestT));
}

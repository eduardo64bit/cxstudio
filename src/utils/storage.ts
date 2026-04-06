import type { FlowJson } from "../types/flow";

const STORAGE_KEY = "ai2flow:flow";
const LEGACY_STORAGE_KEY = "ia2flow:flow";

export function saveFlowToStorage(data: FlowJson): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function loadFlowFromStorage(): FlowJson | null {
  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as FlowJson;
    if (!parsed.nodes || !parsed.edges) return null;
    return parsed;
  } catch {
    return null;
  }
}

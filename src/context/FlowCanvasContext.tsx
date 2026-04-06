import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type FlowCanvasApi = {
  /** While true, node/edge commits from the main sync effect are skipped (like node drag). */
  notifyInteractionStart: () => void;
  /** Call when a gesture ends; records history if the snapshot changed. */
  notifyInteractionEnd: () => void;
};

const FlowCanvasContext = createContext<FlowCanvasApi | null>(null);

export function FlowCanvasProvider({
  value,
  children,
}: {
  value: FlowCanvasApi;
  children: ReactNode;
}) {
  return <FlowCanvasContext.Provider value={value}>{children}</FlowCanvasContext.Provider>;
}

export function useFlowCanvas(): FlowCanvasApi | null {
  return useContext(FlowCanvasContext);
}

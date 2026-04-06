import { CornerDownRight, Minus, Spline } from "lucide-react";
import type { FlowEdgePathType } from "../constants/edgePath";

export function EdgePathTypeIcon({
  pathType,
  size = 18,
}: {
  pathType: FlowEdgePathType;
  size?: number;
}) {
  const common = { size, strokeWidth: 2 as const, "aria-hidden": true as const };
  switch (pathType) {
    case "default":
      return <Spline {...common} />;
    case "straight":
      return <Minus {...common} />;
    case "smoothstep":
      return <CornerDownRight {...common} />;
  }
}

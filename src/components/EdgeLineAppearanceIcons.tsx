import { AlertTriangle } from "lucide-react";

export function EdgeLineSolidIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function EdgeLineDashedIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2.5" strokeDasharray="5 4" strokeLinecap="round" />
    </svg>
  );
}

export function EdgeLineDottedIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2.5" strokeDasharray="0.1 5" strokeLinecap="round" />
    </svg>
  );
}

export function EdgeLineAlertIcon({ size = 18 }: { size?: number }) {
  const common = { size, strokeWidth: 2 as const, "aria-hidden": true as const };
  return <AlertTriangle {...common} />;
}

import type { ReactNode } from "react";
export { scoutHubDesignTokens } from "./tokens";
export type { ScoutHubDesignTokens } from "./tokens";

export function AppShell({ children }: { readonly children: ReactNode }) {
  return <div className="shell">{children}</div>;
}

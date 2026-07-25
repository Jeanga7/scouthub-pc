import type { ReactNode } from "react";

export function AppShell({ children }: { readonly children: ReactNode }) {
  return <div className="shell">{children}</div>;
}

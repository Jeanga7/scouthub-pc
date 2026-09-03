import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import "./styles.css";
import { isLocalIdentityMode } from "@/identity/local-mode";

export const metadata: Metadata = {
  title: "ScoutHub-PC",
  description: "Plateforme numerique regionale du scoutisme"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  if (isLocalIdentityMode(process.env)) {
    return <html lang="fr"><body>{children}</body></html>;
  }
  return (
    <ClerkProvider>
      <html lang="fr">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}

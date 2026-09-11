import type { ReactNode } from "react";
import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { LOCAL_PERSONA_COOKIE } from "@scouthub/infrastructure";
import { isLocalIdentityMode } from "@/identity/local-mode";
import { PublicAuthCta } from "./public-auth-cta";

export default async function PublicLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const local = isLocalIdentityMode(process.env);
  const cookieStore = await cookies();
  const localAuthenticated =
    cookieStore.get(LOCAL_PERSONA_COOKIE) !== undefined;

  return (
    <div className="public-shell">
      <header className="public-nav">
        <Link
          className="public-brand"
          href="/"
          aria-label="ScoutHub-PC, accueil"
        >
          <span className="brand-mark">S</span>
          <span>
            <strong>ScoutHub-PC</strong>
            <small>Région Petite Côte</small>
          </span>
        </Link>
        <nav className="public-links" aria-label="Navigation publique">
          <a href="#actions">Nos actions</a>
          <a href="#mission">Notre mission</a>
        </nav>
        <PublicAuthCta local={local} localAuthenticated={localAuthenticated} />
      </header>
      {children}
      <footer className="public-footer">
        <div>
          <Link className="public-brand" href="/">
            <span className="brand-mark">S</span>
            <strong>ScoutHub-PC</strong>
          </Link>
          <p>Une région qui agit, une mémoire qui se transmet.</p>
        </div>
        <div className="public-footer-meta">
          <span>Région Petite Côte</span>
          <span>Plateforme institutionnelle</span>
        </div>
      </footer>
    </div>
  );
}

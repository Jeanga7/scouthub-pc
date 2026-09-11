import Link from "next/link";
import React from "react";
import { ClerkAuthCta } from "./clerk-auth-cta";

type PublicAuthDestination =
  "/app" | "/local-demo" | "/sign-in?redirect_url=%2Fapp";

type PublicAuthCtaValue = {
  readonly href: PublicAuthDestination;
  readonly label: "Se connecter" | "Ouvrir ScoutHub";
};

export function publicAuthCta(input: {
  readonly local: boolean;
  readonly localAuthenticated: boolean;
  readonly signedIn: boolean;
}): PublicAuthCtaValue {
  if (input.local) {
    return input.localAuthenticated
      ? { href: "/app", label: "Ouvrir ScoutHub" }
      : { href: "/local-demo", label: "Se connecter" };
  }
  return input.signedIn
    ? { href: "/app", label: "Ouvrir ScoutHub" }
    : { href: "/sign-in?redirect_url=%2Fapp", label: "Se connecter" };
}

export function PublicAuthCta({
  local,
  localAuthenticated,
}: {
  readonly local: boolean;
  readonly localAuthenticated: boolean;
}) {
  if (local) {
    const href = localAuthenticated ? "/app" : "/local-demo";
    const label = localAuthenticated ? "Ouvrir ScoutHub" : "Se connecter";
    return (
      <Link className="public-auth-cta" href={href}>
        {label}
      </Link>
    );
  }
  return <ClerkAuthCta />;
}

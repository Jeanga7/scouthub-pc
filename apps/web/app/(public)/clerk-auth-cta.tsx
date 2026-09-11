"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

export function ClerkAuthCta() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return (
      <span className="public-auth-cta" aria-live="polite" aria-busy="true">
        Chargement...
      </span>
    );
  }
  const label = isSignedIn === true ? "Ouvrir ScoutHub" : "Se connecter";

  return (
    <Link
      className="public-auth-cta"
      href={
        isSignedIn === true
          ? "/app"
          : { pathname: "/sign-in", query: { redirect_url: "/app" } }
      }
    >
      {label}
    </Link>
  );
}

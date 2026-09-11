import { describe, expect, it } from "vitest";
import { publicAuthCta } from "../../app/(public)/public-auth-cta";

describe("public and app boundary", () => {
  it("sends anonymous visitors to sign-in and signed-in visitors to the app", () => {
    expect(
      publicAuthCta({
        local: false,
        localAuthenticated: false,
        signedIn: false,
      }),
    ).toEqual({ href: "/sign-in?redirect_url=%2Fapp", label: "Se connecter" });
    expect(
      publicAuthCta({
        local: false,
        localAuthenticated: false,
        signedIn: true,
      }),
    ).toEqual({ href: "/app", label: "Ouvrir ScoutHub" });
  });

  it("keeps local identity inside the local demo flow", () => {
    expect(
      publicAuthCta({
        local: true,
        localAuthenticated: false,
        signedIn: false,
      }),
    ).toEqual({ href: "/local-demo", label: "Se connecter" });
    expect(
      publicAuthCta({ local: true, localAuthenticated: true, signedIn: false }),
    ).toEqual({ href: "/app", label: "Ouvrir ScoutHub" });
  });
});

import { describe, expect, it } from "vitest";
import { authorizedPartiesFromEnv } from "./clerk-middleware-config";

describe("Clerk middleware configuration", () => {
  it("uses explicit authorized parties when configured", () => {
    expect(
      authorizedPartiesFromEnv({
        APP_ORIGIN: "https://primary.example.test",
        CLERK_AUTHORIZED_PARTIES:
          "https://preview.example.test, https://scouthub-pc.example.test"
      })
    ).toEqual([
      "https://preview.example.test",
      "https://scouthub-pc.example.test"
    ]);
  });

  it("falls back to APP_ORIGIN and never inspects request Host", () => {
    expect(
      authorizedPartiesFromEnv({
        APP_ORIGIN: "http://localhost:3000",
        HOST: "attacker.example.test"
      })
    ).toEqual(["http://localhost:3000"]);
  });

  it("falls back to APP_ORIGIN when CLERK_AUTHORIZED_PARTIES is empty", () => {
    expect(
      authorizedPartiesFromEnv({
        APP_ORIGIN: "https://scouthub-pc.example.test",
        CLERK_AUTHORIZED_PARTIES: ""
      })
    ).toEqual(["https://scouthub-pc.example.test"]);
  });

  it("rejects invalid origins", () => {
    expect(() =>
      authorizedPartiesFromEnv({
        CLERK_AUTHORIZED_PARTIES: "not-an-origin"
      })
    ).toThrow("Invalid Clerk authorized party origin");
  });
});

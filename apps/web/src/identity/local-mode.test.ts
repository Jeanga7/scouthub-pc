import { describe, expect, it } from "vitest";
import { isLocalIdentityMode } from "./local-mode";

const local = {
  APP_ENV: "local",
  APP_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgres://scouthub:scouthub@127.0.0.1:5433/scouthub"
};

describe("local identity mode guard", () => {
  it("requires local plus loopback app and database endpoints", () => {
    expect(isLocalIdentityMode(local)).toBe(true);
  });

  it.each(["test", "preview", "staging", "production"])("fails closed in %s", (APP_ENV) => {
    expect(isLocalIdentityMode({ ...local, APP_ENV })).toBe(false);
  });

  it("cannot be enabled against preview or remote database infrastructure", () => {
    expect(isLocalIdentityMode({ ...local, APP_ORIGIN: "https://preview.example.test" })).toBe(false);
    expect(isLocalIdentityMode({ ...local, DATABASE_URL: "postgres://user:pass@example.neon.tech/db" })).toBe(false);
  });
});

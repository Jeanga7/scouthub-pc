import { describe, expect, it } from "vitest";
import { serverEnvSchema } from "@scouthub/config";

describe("serverEnvSchema", () => {
  it("accepts local bootstrap configuration", () => {
    const parsed = serverEnvSchema.parse({
      APP_ENV: "local",
      APP_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgres://scouthub:scouthub@localhost:5433/scouthub",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: "",
      NEXT_PUBLIC_APP_NAME: "ScoutHub-PC"
    });

    expect(parsed.APP_ENV).toBe("local");
    expect(parsed.APP_ORIGIN).toBe("http://localhost:3000");
  });

  it("fails closed when APP_ENV is missing", () => {
    expect(() =>
      serverEnvSchema.parse({
        APP_ORIGIN: "http://localhost:3000",
        DATABASE_URL: "postgres://scouthub:scouthub@localhost:5433/scouthub",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
        CLERK_SECRET_KEY: ""
      })
    ).toThrow();
  });

  it("fails closed when APP_ORIGIN is missing", () => {
    expect(() =>
      serverEnvSchema.parse({
        APP_ENV: "production",
        DATABASE_URL: "postgres://scouthub:scouthub@localhost:5433/scouthub",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_example",
        CLERK_SECRET_KEY: "sk_live_example"
      })
    ).toThrow();
  });

  it("requires Clerk keys outside local and test", () => {
    expect(() =>
      serverEnvSchema.parse({
        APP_ENV: "production",
        APP_ORIGIN: "https://scouthub-pc.example.test",
        DATABASE_URL: "postgres://scouthub:scouthub@localhost:5433/scouthub",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
        CLERK_SECRET_KEY: ""
      })
    ).toThrow();
  });

  it("accepts test configuration without real Clerk secrets", () => {
    const parsed = serverEnvSchema.parse({
      APP_ENV: "test",
      APP_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgres://scouthub:scouthub@localhost:5433/scouthub",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: ""
    });

    expect(parsed.APP_ENV).toBe("test");
  });
});

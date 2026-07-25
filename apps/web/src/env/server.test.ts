import { describe, expect, it } from "vitest";
import { serverEnvSchema } from "@scouthub/config";

describe("serverEnvSchema", () => {
  it("accepts local bootstrap configuration", () => {
    const parsed = serverEnvSchema.parse({
      APP_ENV: "local",
      DATABASE_URL: "postgres://scouthub:scouthub@localhost:5433/scouthub",
      NEXT_PUBLIC_APP_NAME: "ScoutHub Region"
    });

    expect(parsed.APP_ENV).toBe("local");
  });
});

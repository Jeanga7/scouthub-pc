import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetServerEnvForTests } from "@/env/server";
import {
  DELETE,
  GET,
  HEAD,
  PUT
} from "../../app/api/dev/evidence-storage/[...key]/route";

const objectKey = ["tmp", "evidence", "tenant", "asset", "nonce"];
const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

function params(): { params: Promise<{ readonly key: string[] }> } {
  return { params: Promise.resolve({ key: objectKey }) };
}

function putRequest(): Request {
  return new Request("https://app.test/api/dev/evidence-storage/tmp/evidence/tenant/asset/nonce", {
    method: "PUT",
    headers: { "content-type": "image/png" },
    body: bytes
  });
}

function getRequest(): Request {
  return new Request("https://app.test/api/dev/evidence-storage/tmp/evidence/tenant/asset/nonce");
}

const requiredEnv = {
  APP_ORIGIN: "https://app.test",
  DATABASE_URL: "postgres://user:pass@localhost:5433/scouthub",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_key",
  CLERK_SECRET_KEY: "sk_test_key",
  R2_ACCOUNT_ID: "account",
  R2_BUCKET_NAME: "bucket",
  R2_ACCESS_KEY_ID: "access",
  R2_SECRET_ACCESS_KEY: "secret"
} as const;

describe("dev Evidence storage route", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, requiredEnv);
    resetServerEnvForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetServerEnvForTests();
  });

  it("serves the presigned upload target under APP_ENV=local", async () => {
    process.env.APP_ENV = "local";
    resetServerEnvForTests();

    const put = await PUT(putRequest(), params());
    expect(put.status).toBe(200);
    expect(put.headers.get("etag")).not.toBeNull();

    const got = await GET(getRequest(), params());
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes);

    const head = await HEAD(getRequest(), params());
    expect(head.status).toBe(200);

    const deleted = await DELETE(getRequest(), params());
    expect(deleted.status).toBe(204);
    expect((await GET(getRequest(), params())).status).toBe(404);
  });

  it.each(["test", "preview", "staging", "production"])(
    "is unreachable under APP_ENV=%s",
    async (appEnv) => {
      process.env.APP_ENV = appEnv;
      resetServerEnvForTests();

      // Every verb is fail-closed, not only the read paths: a deployed-by-accident
      // route must never accept a write either.
      expect((await PUT(putRequest(), params())).status).toBe(404);
      expect((await GET(getRequest(), params())).status).toBe(404);
      expect((await HEAD(getRequest(), params())).status).toBe(404);
      expect((await DELETE(getRequest(), params())).status).toBe(404);
    }
  );

  it("does not leak objects written in local mode to a non-local environment", async () => {
    process.env.APP_ENV = "local";
    resetServerEnvForTests();
    expect((await PUT(putRequest(), params())).status).toBe(200);

    process.env.APP_ENV = "production";
    resetServerEnvForTests();

    const got = await GET(getRequest(), params());
    expect(got.status).toBe(404);
    expect(got.headers.get("content-type")).not.toBe("image/png");
  });
});

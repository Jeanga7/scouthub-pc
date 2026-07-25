import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

void initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingIncludes: {
    // pg requires this optional Worker socket file when OpenNext bundles with workerd conditions.
    "/*": [
      "../../node_modules/.pnpm/pg-cloudflare@1.4.0/node_modules/pg-cloudflare/dist/index.js"
    ]
  }
};

export default nextConfig;

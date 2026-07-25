import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const forbidden = [
  "@clerk",
  "@neondatabase",
  "cloudflare:",
  "wrangler",
  "R2Bucket"
];

const repositoryForbidden = [
  "ENABLE_DEV_ADMIN",
  "isDevAdminEnabled",
  "assertDevAdmin",
  "organizationMembership",
  "OrganizationList",
  "ClerkOrganizations",
  "publicMetadata: { role",
  "privateMetadata: { role"
];

function collectSourceFiles(directory) {
  const entries = readdirSync(directory);
  const files = [];

  for (const entry of entries) {
    if (
      entry === "node_modules" ||
      entry === ".git" ||
      entry === ".next" ||
      entry === ".open-next" ||
      entry === "dist"
    ) {
      continue;
    }
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(path));
      continue;
    }

    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      files.push(path);
    }
  }

  return files;
}

const files = [
  ...collectSourceFiles("packages/domain/src"),
  ...collectSourceFiles("packages/application/src")
];
const failures = [];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  for (const token of forbidden) {
    if (content.includes(token)) {
      failures.push(`${file}: forbidden provider token "${token}"`);
    }
  }
}

for (const file of collectSourceFiles(".")) {
  if (file.includes("node_modules/") || file.includes(".next/") || file.includes(".open-next/")) {
    continue;
  }
  const content = readFileSync(file, "utf8");
  for (const token of repositoryForbidden) {
    if (content.includes(token)) {
      failures.push(`${file}: forbidden security token "${token}"`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Provider boundary check passed.");

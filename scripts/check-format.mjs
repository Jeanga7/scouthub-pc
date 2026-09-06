import { spawnSync } from "node:child_process";

const supported = /\.(?:[cm]?[jt]sx?|json|css|md|ya?ml)$/;
const commands = [
  ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
  ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "HEAD"],
  ["diff", "--name-only", "--diff-filter=ACMR", "@{upstream}...HEAD"],
];
const files = new Set();
for (const args of commands) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) continue;
  for (const file of result.stdout.split("\n"))
    if (supported.test(file)) files.add(file);
}
if (files.size === 0) process.exit(0);
const result = spawnSync("pnpm", ["exec", "prettier", "--check", ...files], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);

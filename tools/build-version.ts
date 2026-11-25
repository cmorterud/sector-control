// The build's identity for the corner version label: the commit it was built
// from, and the PR number on pull-request previews. CI passes these in;
// local builds fall back to git and say they are local.
import { execFileSync } from "node:child_process";

const git = (...args: string[]) => {
  try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
};

export function buildVersion(env: NodeJS.ProcessEnv = process.env): string {
  const sha = (env.BUILD_SHA || git("rev-parse", "HEAD")).slice(0, 7) || "unknown";
  const pr = Number(env.BUILD_PR);
  if (Number.isInteger(pr) && pr > 0) return `${sha} · PR ${pr}`;
  if (env.CI) return sha;
  return `${sha}${git("status", "--porcelain") ? "+" : ""} · local`;
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export function evaluateFreshness({ head, remote }) {
  const current = `${head || ""}`.trim();
  const upstream = `${remote || ""}`.trim().split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/i.test(current) || !/^[0-9a-f]{40}$/i.test(upstream)) {
    return { fresh: false, reason: "Could not resolve a full upstream main revision." };
  }
  return current.toLowerCase() === upstream.toLowerCase()
    ? { fresh: true, reason: "HEAD matches live origin/main." }
    : { fresh: false, reason: `HEAD ${current.slice(0, 12)} differs from live origin/main ${upstream.slice(0, 12)}.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [{ stdout: head }, { stdout: remote }] = await Promise.all([
    exec("git", ["rev-parse", "HEAD"]),
    exec("git", ["ls-remote", "origin", "refs/heads/main"]),
  ]);
  const result = evaluateFreshness({ head, remote });
  console.log(result.reason);
  if (!result.fresh) process.exitCode = 1;
}

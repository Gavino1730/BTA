import { spawnSync } from "node:child_process";

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error("Usage: node scripts/run-ps.mjs <script-path>");
  process.exit(1);
}

const candidates = process.platform === "win32"
  ? ["powershell", "pwsh"]
  : ["pwsh", "powershell"];

let lastError = null;
for (const command of candidates) {
  const result = spawnSync(command, ["-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    stdio: "inherit"
  });

  if (!result.error) {
    process.exit(result.status ?? 0);
  }

  lastError = result.error;
}

console.error(`Unable to execute ${scriptPath} using ${candidates.join(" or ")}.`);
if (lastError) {
  console.error(lastError.message);
}
process.exit(1);

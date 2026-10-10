// Each suite uses its own in-memory Foundry globals.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
for (const suite of ["crafting.mjs", "audit-transactions.mjs", "audit-meals.mjs"]) {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL(suite, import.meta.url))], {
    encoding: "utf8", stdio: ["ignore", "pipe", "inherit"]
  });
  console.log(output.trim().split("\n").filter(line => line.startsWith("PASS")).join("\n"));
}

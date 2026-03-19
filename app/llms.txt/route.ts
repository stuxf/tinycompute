import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let llmsTxt = "";
try {
  llmsTxt = readFileSync(resolve(process.cwd(), "public", "llms.txt"), "utf-8");
} catch {
  llmsTxt = "# TinyCompute\n";
}

export function GET() {
  return new Response(llmsTxt, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

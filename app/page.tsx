import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export default function Home() {
  // Next.js serves public/ automatically, but we want the HTML as the page content.
  // Read the HTML file and render it directly.
  let html = "<h1>tinycompute</h1>";
  try {
    html = readFileSync(resolve(process.cwd(), "public", "index.html"), "utf-8");
  } catch {
    // fallback
  }

  return (
    <div dangerouslySetInnerHTML={{ __html: html }} suppressHydrationWarning />
  );
}

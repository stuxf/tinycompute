import { Hono } from "hono";
import { handle } from "hono/vercel";

const app = new Hono();
app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));
app.get("/*", (c) => c.json({ status: "minimal test" }));

export const config = {
  runtime: "nodejs",
};

export default handle(app);

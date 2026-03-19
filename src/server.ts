/**
 * MPP-gated compute provisioning API
 * Session-based billing: pay per minute of compute, one-time fees for setup.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { Credential } from "mppx";

const isVercel = !!process.env.VERCEL;

import { FlyClient, FlyApiError } from "./fly/index.js";
import { DOClient, DOApiError } from "./do/index.js";
import { VercelClient, VercelApiError } from "./vercel/index.js";
import { mppx } from "./mpp.js";
import {
  validateCreateMachine,
  validateCreateVolume,
  validateExtendVolume,
  validateWaitState,
  validateExecCommand,
  validateCreateDroplet,
} from "./validation.js";
import type { ValidationError } from "./validation.js";
import {
  setMachineOwner,
  setVolumeOwner,
  setDropletOwner,
  assertOwnership,
  listOwnedMachines,
  listOwnedVolumes,
  listOwnedDroplets,
  removeMachine,
  removeVolume,
  removeDroplet,
} from "./ownership.js";
import {
  startSession,
  stopSession,
  getBillingInfo,
  startBillingEnforcement,
  stopBillingEnforcement,
} from "./billing.js";
import type { Context, Next } from "hono";

// --- Config ---
const FLY_TOKEN = process.env.FLY_API_TOKEN;
const FLY_APP = process.env.FLY_APP_NAME;
const DO_TOKEN = process.env.DO_API_TOKEN;
const DO_PROJECT_ID = process.env.DO_PROJECT_ID ?? "6952f275-0062-4c92-a8a7-dc2ca86cf195";
const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
const PORT = Number(process.env.PORT ?? 3000);

if (!FLY_TOKEN || !FLY_APP) {
  if (!isVercel) {
    console.error("Missing FLY_API_TOKEN or FLY_APP_NAME env vars");
    process.exit(1);
  }
}

if (!DO_TOKEN) {
  if (!isVercel) {
    console.error("Missing DO_API_TOKEN env var");
    process.exit(1);
  }
}

if (!VERCEL_API_TOKEN) {
  console.warn("VERCEL_API_TOKEN not set — Vercel provider endpoints will not work");
}

const fly = new FlyClient({ token: FLY_TOKEN!, appName: FLY_APP! });
const doClient = new DOClient({ token: DO_TOKEN!, projectId: DO_PROJECT_ID });
const vercelClient = new VercelClient({ token: VERCEL_API_TOKEN ?? "" });

// --- Standardized error responses ---

function errorResponse(
  c: Context,
  status: number,
  error: string,
  code: string,
  details?: unknown,
): Response {
  const body: { error: string; code: string; details?: unknown } = {
    error,
    code,
  };
  if (details !== undefined) body.details = details;
  return c.json(body, status as any);
}

function validationErrorResponse(
  c: Context,
  validationErrors: ValidationError[],
): Response {
  return errorResponse(c, 400, "Validation failed", "VALIDATION_ERROR", validationErrors);
}

// --- Pricing constants (amounts in human-readable USDC — mppx applies decimals) ---
const PRICES = {
  MACHINE_SETUP: "0.1",       // $0.10
  VOLUME_SETUP: "0.05",       // $0.05
  VOLUME_EXTEND: "0.05",      // $0.05
  EXEC_COMMAND: "0.01",       // $0.01
  ALLOCATE_IP: "0.01",        // $0.01
  SESSION_PER_MIN: "0.005",   // $0.005/min
  SESSION_DEPOSIT: "0.30",    // $0.30 suggested (1 hour)
  VERCEL_PROJECT: "0.1",      // $0.10
  DOMAIN_CHECK: "0.001",      // $0.001
  AUTH: "0.001",              // $0.001 — tiny charge for wallet auth on read endpoints
} as const;

// --- Helpers ---

/** Extract a required route param, asserting it exists */
function param(c: Context, name: string): string {
  const v = c.req.param(name);
  if (!v) throw new Error(`Missing route parameter: ${name}`);
  return v;
}

/** Extract payer wallet address from MPP credential in Authorization header */
function getPayerWallet(c: Context): string | null {
  if (!c.req.header("authorization")) return null;
  try {
    const credential = Credential.fromRequest(c.req.raw);
    if (credential.source) {
      const parts = credential.source.split(":");
      return parts[parts.length - 1].toLowerCase();
    }
  } catch {
    // No valid credential
  }
  return null;
}

/** Require wallet auth — returns wallet string or throws */
function requireWallet(c: Context): string {
  const wallet = getPayerWallet(c);
  if (!wallet) throw new FlyApiError(401, "Authorization required");
  return wallet;
}

/** Require wallet auth + resource ownership — returns { wallet, resourceId } or throws */
async function requireOwnership(
  c: Context,
  paramName: string,
  type: "machine" | "volume" | "droplet",
): Promise<{ wallet: string; resourceId: string }> {
  const wallet = requireWallet(c);
  const resourceId = param(c, paramName);
  await assertOwnership(resourceId, wallet, type);
  return { wallet, resourceId };
}

/** Register a billing session from MPP session headers */
function registerBillingSession(c: Context, machineId: string, wallet: string): void {
  const sessionId = c.req.header("x-mpp-session-id") ?? `session-${Date.now()}`;
  const deposit = Number(c.req.header("x-mpp-deposit") || PRICES.SESSION_DEPOSIT);
  startSession(machineId, wallet, sessionId, deposit);
}

/** Validation middleware factory — validates body before MPP charges */
function validate(fn: (body: unknown) => { ok: boolean; errors?: ValidationError[] }) {
  return async (c: Context, next: Next) => {
    const body = await c.req.json();
    const v = fn(body);
    if (!v.ok) return validationErrorResponse(c, v.errors as ValidationError[]);
    c.set("validatedBody", body);
    await next();
  };
}

/** Wrap handler with error handling */
function withErrorHandling(
  handler: (c: Context) => Promise<Response>,
): (c: Context) => Promise<Response> {
  return async (c: Context) => {
    try {
      return await handler(c);
    } catch (err) {
      if (err instanceof FlyApiError) {
        const code = err.statusCode === 401 ? "AUTH_REQUIRED"
          : err.statusCode === 403 ? "FORBIDDEN"
          : "FLY_API_ERROR";
        return errorResponse(c, err.statusCode, err.message, code);
      }
      if (err instanceof DOApiError) {
        const code = err.statusCode === 401 ? "AUTH_REQUIRED"
          : err.statusCode === 403 ? "FORBIDDEN"
          : "DO_API_ERROR";
        return errorResponse(c, err.statusCode, err.message, code);
      }
      if (err instanceof VercelApiError) {
        const code = err.statusCode === 401 ? "AUTH_REQUIRED"
          : err.statusCode === 403 ? "FORBIDDEN"
          : "VERCEL_API_ERROR";
        return errorResponse(c, err.statusCode, err.message, code);
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("Not authorized") || message.includes("not own")) {
        return errorResponse(c, 403, message, "FORBIDDEN");
      }
      if (message.includes("not found in registry")) {
        return errorResponse(c, 404, message, "NOT_FOUND");
      }
      return errorResponse(c, 500, message, "INTERNAL_ERROR");
    }
  };
}

const app = new Hono();

// --- Static assets ---
const __dirname = dirname(fileURLToPath(import.meta.url));
// On Vercel, includeFiles copies public/** relative to the function entry (api/index.ts).
// The bundled output runs from a flat directory, so public/ is a sibling of the bundle.
// Locally (dist/), public/ is one level up from __dirname.
const publicDir = isVercel
  ? resolve(process.cwd(), "public")
  : resolve(__dirname, "..", "public");

let landingHtml = "";
let llmsTxt = "";
try {
  landingHtml = readFileSync(resolve(publicDir, "index.html"), "utf-8");
  llmsTxt = readFileSync(resolve(publicDir, "llms.txt"), "utf-8");
} catch {
  console.warn("Could not load static assets from", publicDir);
}

app.get("/", (c: Context) => c.html(landingHtml || "<h1>tinycompute</h1>"));
app.get("/llms.txt", (c: Context) => c.text(llmsTxt));

// --- Health (free) ---
app.get("/health", (c: Context) => c.json({ ok: true }));

// --- Machines: List ($0.001) ---
app.get("/api/machines",
  mppx.charge({ amount: PRICES.AUTH, description: "List machines" }),
  withErrorHandling(async (c: Context) => {
  const wallet = requireWallet(c);
  const ownedIds = await listOwnedMachines(wallet);
  if (ownedIds.length === 0) return c.json([]);
  const allMachines = await fly.machines.list();
  return c.json(allMachines.filter((m) => ownedIds.includes(m.id)));
}));

// --- Machines: Get ($0.001) ---
app.get("/api/machines/:id",
  mppx.charge({ amount: PRICES.AUTH, description: "Get machine" }),
  withErrorHandling(async (c: Context) => {
  const { resourceId } = await requireOwnership(c, "id", "machine");
  return c.json(await fly.machines.get(resourceId));
}));

// --- Machines: Create (charge) ---
app.post("/api/machines",
  validate(validateCreateMachine),
  mppx.charge({ amount: PRICES.MACHINE_SETUP, description: "Machine setup fee" }),
  withErrorHandling(async (c: Context) => {
    const machine = await fly.machines.create(c.get("validatedBody"));
    const wallet = getPayerWallet(c);
    if (wallet) await setMachineOwner(machine.id, wallet);
    return c.json(machine, 201);
  }),
);

// --- Machines: Start (session) ---
app.post("/api/machines/:id/start",
  mppx.session({ amount: PRICES.SESSION_PER_MIN, unitType: "minute", suggestedDeposit: PRICES.SESSION_DEPOSIT }),
  withErrorHandling(async (c: Context) => {
    const { wallet, resourceId } = await requireOwnership(c, "id", "machine");
    await fly.machines.start(resourceId);
    registerBillingSession(c, resourceId, wallet);
    return c.json({ ok: true, billing: "session", rate: "$0.005/min" });
  }),
);

// --- Machines: Stop ($0.001) ---
app.post("/api/machines/:id/stop",
  mppx.charge({ amount: PRICES.AUTH, description: "Stop machine" }),
  withErrorHandling(async (c: Context) => {
  const { resourceId } = await requireOwnership(c, "id", "machine");
  await fly.machines.stop(resourceId);
  stopSession(resourceId);
  return c.json({ ok: true });
}));

// --- Machines: Restart (session) ---
app.post("/api/machines/:id/restart",
  mppx.session({ amount: PRICES.SESSION_PER_MIN, unitType: "minute", suggestedDeposit: PRICES.SESSION_DEPOSIT }),
  withErrorHandling(async (c: Context) => {
    const { wallet, resourceId } = await requireOwnership(c, "id", "machine");
    await fly.machines.restart(resourceId);
    stopSession(resourceId);
    registerBillingSession(c, resourceId, wallet);
    return c.json({ ok: true, billing: "session", rate: "$0.005/min" });
  }),
);

// --- Machines: Destroy ($0.001) ---
app.delete("/api/machines/:id",
  mppx.charge({ amount: PRICES.AUTH, description: "Destroy machine" }),
  withErrorHandling(async (c: Context) => {
  const { resourceId } = await requireOwnership(c, "id", "machine");
  const force = c.req.query("force") === "true";
  await fly.machines.destroy(resourceId, force);
  stopSession(resourceId);
  await removeMachine(resourceId);
  return c.json({ ok: true });
}));

// --- Machines: Billing info ($0.001) ---
app.get("/api/machines/:id/billing",
  mppx.charge({ amount: PRICES.AUTH, description: "Billing info" }),
  withErrorHandling(async (c: Context) => {
  const { resourceId } = await requireOwnership(c, "id", "machine");
  const info = getBillingInfo(resourceId);
  if (!info) return errorResponse(c, 404, "No active billing session", "NOT_FOUND");
  return c.json(info);
}));

// --- Machines: Wait for state ($0.001) ---
app.post("/api/machines/:id/wait",
  mppx.charge({ amount: PRICES.AUTH, description: "Wait for state" }),
  withErrorHandling(async (c: Context) => {
  const { resourceId } = await requireOwnership(c, "id", "machine");
  const state = c.req.query("state") ?? "started";
  const sv = validateWaitState(state);
  if (!sv.ok) return validationErrorResponse(c, sv.errors);
  const timeout = Number(c.req.query("timeout") ?? 60);
  return c.json(await fly.machines.waitForState(resourceId, state, timeout));
}));

// --- Machines: Events ($0.001) ---
app.get("/api/machines/:id/events",
  mppx.charge({ amount: PRICES.AUTH, description: "Machine events" }),
  withErrorHandling(async (c: Context) => {
  const { resourceId } = await requireOwnership(c, "id", "machine");
  return c.json(await fly.machines.events(resourceId));
}));

// --- Machines: Exec (charge) ---
app.post("/api/machines/:id/exec",
  async (c: Context, next: Next) => {
    const body = await c.req.json();
    const v = validateExecCommand(body);
    if (!v.ok) return validationErrorResponse(c, v.errors);
    c.set("validatedBody", { command: v.command, timeout: v.timeout });
    await next();
  },
  mppx.charge({ amount: PRICES.EXEC_COMMAND, description: "Execute command in machine" }),
  withErrorHandling(async (c: Context) => {
    const { resourceId } = await requireOwnership(c, "id", "machine");
    const { command, timeout } = c.get("validatedBody");
    return c.json(await fly.machines.exec(resourceId, command, timeout));
  }),
);

// --- Machines: Suspend ($0.001) ---
app.post("/api/machines/:id/suspend",
  mppx.charge({ amount: PRICES.AUTH, description: "Suspend machine" }),
  withErrorHandling(async (c: Context) => {
  const { resourceId } = await requireOwnership(c, "id", "machine");
  await fly.machines.suspend(resourceId);
  return c.json({ ok: true });
}));

// --- Machines: Processes ($0.001) ---
app.get("/api/machines/:id/ps",
  mppx.charge({ amount: PRICES.AUTH, description: "List processes" }),
  withErrorHandling(async (c: Context) => {
  const { resourceId } = await requireOwnership(c, "id", "machine");
  return c.json(await fly.machines.ps(resourceId));
}));

// --- Volumes: Create (charge) ---
app.post("/api/volumes",
  validate(validateCreateVolume),
  mppx.charge({ amount: PRICES.VOLUME_SETUP, description: "Volume setup fee" }),
  withErrorHandling(async (c: Context) => {
    const volume = await fly.volumes.create(c.get("validatedBody"));
    const wallet = getPayerWallet(c);
    if (wallet) await setVolumeOwner(volume.id, wallet);
    return c.json(volume, 201);
  }),
);

// --- Volumes: List ($0.001) ---
app.get("/api/volumes",
  mppx.charge({ amount: PRICES.AUTH, description: "List volumes" }),
  withErrorHandling(async (c: Context) => {
  const wallet = requireWallet(c);
  const ownedIds = await listOwnedVolumes(wallet);
  if (ownedIds.length === 0) return c.json([]);
  const allVolumes = await fly.volumes.list();
  return c.json(allVolumes.filter((v) => ownedIds.includes(v.id)));
}));

// --- Volumes: Get ($0.001) ---
app.get("/api/volumes/:id",
  mppx.charge({ amount: PRICES.AUTH, description: "Get volume" }),
  withErrorHandling(async (c: Context) => {
  const { resourceId } = await requireOwnership(c, "id", "volume");
  return c.json(await fly.volumes.get(resourceId));
}));

// --- Volumes: Delete ($0.001) ---
app.delete("/api/volumes/:id",
  mppx.charge({ amount: PRICES.AUTH, description: "Delete volume" }),
  withErrorHandling(async (c: Context) => {
  const { resourceId } = await requireOwnership(c, "id", "volume");
  await fly.volumes.delete(resourceId);
  await removeVolume(resourceId);
  return c.json({ ok: true });
}));

// --- Volumes: Extend (charge) ---
app.put("/api/volumes/:id/extend",
  async (c: Context, next: Next) => {
    const body = await c.req.json();
    const v = validateExtendVolume(body);
    if (!v.ok) return validationErrorResponse(c, v.errors);
    c.set("validatedBody", { size_gb: v.size_gb });
    await next();
  },
  mppx.charge({ amount: PRICES.VOLUME_EXTEND, description: "Extend storage volume" }),
  withErrorHandling(async (c: Context) => {
    const { resourceId } = await requireOwnership(c, "id", "volume");
    const { size_gb } = c.get("validatedBody");
    return c.json(await fly.volumes.extend(resourceId, size_gb));
  }),
);

// --- Apps: Create ($0.001) ---
app.post("/api/apps",
  mppx.charge({ amount: PRICES.AUTH, description: "Create app" }),
  withErrorHandling(async (c: Context) => {
  requireWallet(c);
  return c.json(await fly.apps.create(await c.req.json()), 201);
}));

// --- Apps: Delete ($0.001) ---
app.delete("/api/apps/:name",
  mppx.charge({ amount: PRICES.AUTH, description: "Delete app" }),
  withErrorHandling(async (c: Context) => {
  requireWallet(c);
  const force = c.req.query("force") === "true";
  await fly.apps.delete(param(c, "name"), force);
  return c.json({ ok: true });
}));

// --- Apps: List IPs (free, no auth) ---
app.get("/api/apps/:name/ips", withErrorHandling(async (c: Context) => {
  return c.json(await fly.apps.listIps(param(c, "name")));
}));

// --- Apps: Allocate IP (charge) ---
app.post("/api/apps/:name/ips",
  mppx.charge({ amount: PRICES.ALLOCATE_IP, description: "Allocate IP address" }),
  withErrorHandling(async (c: Context) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(await fly.apps.allocateIp(param(c, "name"), body.type ?? "shared_v4", body.region), 201);
  }),
);

// =====================
// DigitalOcean Droplets
// =====================

// --- Droplets: Create (charge) ---
app.post("/api/do/droplets",
  validate(validateCreateDroplet),
  mppx.charge({ amount: PRICES.MACHINE_SETUP, description: "Droplet setup fee" }),
  withErrorHandling(async (c: Context) => {
    const body = c.get("validatedBody");
    const droplet = await doClient.droplets.create(body);
    const wallet = getPayerWallet(c);
    if (wallet) await setDropletOwner(String(droplet.id), wallet);
    return c.json(droplet, 201);
  }),
);

// --- Droplets: List ($0.001) ---
app.get("/api/do/droplets",
  mppx.charge({ amount: PRICES.AUTH, description: "List droplets" }),
  withErrorHandling(async (c: Context) => {
  const wallet = requireWallet(c);
  const ownedIds = await listOwnedDroplets(wallet);
  if (ownedIds.length === 0) return c.json([]);
  const { droplets } = await doClient.droplets.list();
  return c.json(droplets.filter((d) => ownedIds.includes(String(d.id))));
}));

// --- Droplets: Get ($0.001) ---
app.get("/api/do/droplets/:id",
  mppx.charge({ amount: PRICES.AUTH, description: "Get droplet" }),
  withErrorHandling(async (c: Context) => {
  const { resourceId } = await requireOwnership(c, "id", "droplet");
  return c.json(await doClient.droplets.get(Number(resourceId)));
}));

// --- Droplets: Start / Power On (session) ---
app.post("/api/do/droplets/:id/start",
  mppx.session({ amount: PRICES.SESSION_PER_MIN, unitType: "minute", suggestedDeposit: PRICES.SESSION_DEPOSIT }),
  withErrorHandling(async (c: Context) => {
    const { wallet, resourceId } = await requireOwnership(c, "id", "droplet");
    await doClient.droplets.powerOn(Number(resourceId));
    registerBillingSession(c, resourceId, wallet);
    return c.json({ ok: true, billing: "session", rate: "$0.005/min" });
  }),
);

// --- Droplets: Stop ($0.001) ---
app.post("/api/do/droplets/:id/stop",
  mppx.charge({ amount: PRICES.AUTH, description: "Stop droplet" }),
  withErrorHandling(async (c: Context) => {
  const { resourceId } = await requireOwnership(c, "id", "droplet");
  await doClient.droplets.powerOff(Number(resourceId));
  stopSession(resourceId);
  return c.json({ ok: true });
}));

// --- Droplets: Destroy ($0.001) ---
app.delete("/api/do/droplets/:id",
  mppx.charge({ amount: PRICES.AUTH, description: "Destroy droplet" }),
  withErrorHandling(async (c: Context) => {
  const { resourceId } = await requireOwnership(c, "id", "droplet");
  await doClient.droplets.delete(Number(resourceId));
  stopSession(resourceId);
  await removeDroplet(resourceId);
  return c.json({ ok: true });
}));

// =============
// Vercel
// =============

// --- Projects: Create (charge) ---
app.post("/api/vercel/projects",
  mppx.charge({ amount: PRICES.VERCEL_PROJECT, description: "Vercel project setup fee" }),
  withErrorHandling(async (c: Context) => {
    requireWallet(c);
    const body = await c.req.json();
    const project = await vercelClient.projects.create(body);
    return c.json(project, 201);
  }),
);

// --- Projects: List ($0.001) ---
app.get("/api/vercel/projects",
  mppx.charge({ amount: PRICES.AUTH, description: "List Vercel projects" }),
  withErrorHandling(async (c: Context) => {
  requireWallet(c);
  const res = await vercelClient.projects.list();
  return c.json(res.projects);
}));

// --- Domains: Check availability (charge) ---
app.post("/api/vercel/domains/check",
  mppx.charge({ amount: PRICES.DOMAIN_CHECK, description: "Domain availability check" }),
  withErrorHandling(async (c: Context) => {
    requireWallet(c);
    const body = await c.req.json();
    const result = await vercelClient.domains.checkAvailability(body.name);
    return c.json(result);
  }),
);

// --- Domains: Buy (dynamic charge) ---
app.post("/api/vercel/domains/buy",
  async (c: Context, next: Next) => {
    const body = await c.req.json();
    if (!body.name || typeof body.name !== "string") {
      return validationErrorResponse(c, [{ field: "name", message: "Domain name is required" }]);
    }
    // Look up the price before charging
    const availability = await vercelClient.domains.checkAvailability(body.name);
    if (!availability.available) {
      return errorResponse(c, 400, `Domain ${body.name} is not available`, "DOMAIN_UNAVAILABLE");
    }
    const price = availability.price ?? 0;
    // Convert dollar price to USDC base units (1 unit = $0.000001)
    const amount = String(Math.ceil(price * 1_000_000));
    c.set("validatedBody", body);
    c.set("domainPrice", amount);
    await next();
  },
  async (c: Context, next: Next) => {
    const amount = c.get("domainPrice") as string;
    const charge = mppx.charge({ amount, description: "Domain purchase" });
    return charge(c, next);
  },
  withErrorHandling(async (c: Context) => {
    const body = c.get("validatedBody");
    const domain = await vercelClient.domains.buy(body);
    return c.json(domain, 201);
  }),
);

// --- Export for Vercel ---
export default app;

// --- Lifecycle (skip in serverless) ---
if (!isVercel) {
  const { serve } = await import("@hono/node-server");
  startBillingEnforcement(fly.machines);
  process.on("SIGTERM", () => { stopBillingEnforcement(); process.exit(0); });
  process.on("SIGINT", () => { stopBillingEnforcement(); process.exit(0); });

  serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
    console.log(`Server running on http://0.0.0.0:${info.port}`);
  });
}

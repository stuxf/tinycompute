/**
 * Shared server utilities for Next.js route handlers.
 * Mirrors the helpers from src/server.ts but adapted for Next.js Request/Response.
 */

import { Credential, Store } from "mppx";
import { Mppx, tempo } from "mppx/nextjs";
import { Redis } from "@upstash/redis";
import { FlyClient, FlyApiError } from "./fly/index";
import { DOClient, DOApiError } from "./do/index";
import { VercelClient, VercelApiError } from "./vercel/index";
import { UpstashClient, UpstashApiError } from "./upstash/index";
import {
  assertOwnership,
} from "./ownership";
import {
  startSession,
  startBillingEnforcement,
  stopBillingEnforcement,
} from "./billing";
import type { ValidationError } from "./validation";

// --- Config ---
const FLY_TOKEN = process.env.FLY_API_TOKEN;
const FLY_APP = process.env.FLY_APP_NAME;
const DO_TOKEN = process.env.DO_API_TOKEN;
const DO_PROJECT_ID = process.env.DO_PROJECT_ID ?? "6952f275-0062-4c92-a8a7-dc2ca86cf195";
const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
const UPSTASH_EMAIL = process.env.UPSTASH_EMAIL;
const UPSTASH_API_KEY = process.env.UPSTASH_API_KEY;

const isVercel = !!process.env.VERCEL;

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

if (!UPSTASH_EMAIL || !UPSTASH_API_KEY) {
  console.warn("UPSTASH_EMAIL or UPSTASH_API_KEY not set — Upstash KV endpoints will not work");
}

// --- MPP setup ---
const USDC = "0x20c000000000000000000000b9537d11c60e8b50" as const;
const RECIPIENT = process.env.MPP_RECIPIENT;
if (!RECIPIENT) {
  if (!isVercel) {
    console.error("Missing MPP_RECIPIENT env var (your Tempo wallet address)");
    process.exit(1);
  }
  console.warn("MPP_RECIPIENT not set — MPP middleware will not function");
}

// --- Session store (Upstash Redis for persistent channel state across serverless invocations) ---
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let sessionStore: Store.Store | undefined;
if (UPSTASH_URL && UPSTASH_TOKEN) {
  const storeRedis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
  sessionStore = Store.upstash({
    get: (key: string) => storeRedis.get(key),
    set: (key: string, value: unknown) => storeRedis.set(key, value),
    del: (key: string) => storeRedis.del(key),
  });
}

// @ts-ignore - mppx has complex internal types
export const mppx = Mppx.create({
  methods: [
    tempo({
      currency: USDC,
      recipient: RECIPIENT as `0x${string}`,
      ...(sessionStore ? { store: sessionStore } : {}),
    }),
  ],
});

// --- Clients ---
export const fly = new FlyClient({ token: FLY_TOKEN!, appName: FLY_APP! });
export const doClient = new DOClient({ token: DO_TOKEN!, projectId: DO_PROJECT_ID });
export const vercelClient = new VercelClient({ token: VERCEL_API_TOKEN ?? "" });
export const upstashClient = new UpstashClient({ email: UPSTASH_EMAIL ?? "", apiKey: UPSTASH_API_KEY ?? "" });

// --- Pricing constants ---
export const PRICES = {
  MACHINE_SETUP: "0.1",       // base setup fee — compute pricing added dynamically
  VOLUME_SETUP: "0.05",
  VOLUME_EXTEND: "0.05",
  EXEC_COMMAND: "0.01",
  ALLOCATE_IP: "0.01",
  SESSION_PER_MIN: "0.005",   // base rate — actual rate scales with machine size
  SESSION_DEPOSIT: "0.30",
  VERCEL_PROJECT: "0.1",
  DOMAIN_CHECK: "0.001",
  AUTH: "0.001",
  KV_DATABASE_CREATE: "0.05",
  KV_OP: "0.001",
} as const;

/**
 * Calculate per-minute rate based on machine config.
 * Base: $0.005/min for shared-1x/256MB
 * +$0.003/min per additional CPU
 * +$0.001/min per additional 256MB RAM
 * Performance CPUs: 2x the CPU rate
 */
export function computeRate(config?: { guest?: { cpu_kind?: string; cpus?: number; memory_mb?: number } }): {
  ratePerMin: string;
  suggestedDeposit: string;
  ratePretty: string;
} {
  const guest = config?.guest;
  const cpus = guest?.cpus ?? 1;
  const memMb = guest?.memory_mb ?? 256;
  const isPerf = guest?.cpu_kind === "performance";

  const cpuRate = isPerf ? 0.006 : 0.003; // per CPU per minute
  const memRate = 0.001; // per 256MB per minute

  const rate = (cpus * cpuRate) + (Math.ceil(memMb / 256) * memRate);
  const rateRounded = Math.round(rate * 10000) / 10000; // 4 decimal places

  return {
    ratePerMin: String(rateRounded),
    suggestedDeposit: String(Math.round(rateRounded * 60 * 100) / 100), // 1 hour
    ratePretty: `$${rateRounded}/min (~$${(rateRounded * 60).toFixed(2)}/hr)`,
  };
}

/**
 * Calculate setup fee based on machine size.
 * Base: $0.10 for shared-1x/256MB
 * Scales with size: $0.10 + $0.02 per extra CPU + $0.01 per extra 256MB
 */
export function computeSetupFee(config?: { guest?: { cpus?: number; memory_mb?: number } }): string {
  const cpus = config?.guest?.cpus ?? 1;
  const memMb = config?.guest?.memory_mb ?? 256;

  const fee = 0.10 + ((cpus - 1) * 0.02) + ((Math.ceil(memMb / 256) - 1) * 0.01);
  return String(Math.round(fee * 100) / 100);
}

/**
 * Calculate DO droplet pricing based on size slug.
 */
export function computeDropletRate(size?: string): {
  ratePerMin: string;
  suggestedDeposit: string;
  ratePretty: string;
  setupFee: string;
} {
  // Map DO sizes to approximate costs
  const sizeRates: Record<string, number> = {
    "s-1vcpu-512mb-10gb": 0.005,
    "s-1vcpu-1gb": 0.006,
    "s-1vcpu-2gb": 0.008,
    "s-2vcpu-2gb": 0.010,
    "s-2vcpu-4gb": 0.014,
    "s-4vcpu-8gb": 0.024,
  };
  const rate = sizeRates[size ?? ""] ?? 0.005;
  return {
    ratePerMin: String(rate),
    suggestedDeposit: String(Math.round(rate * 60 * 100) / 100),
    ratePretty: `$${rate}/min (~$${(rate * 60).toFixed(2)}/hr)`,
    setupFee: String(Math.round((0.10 + rate * 10) * 100) / 100), // setup scales too
  };
}

// --- Response helpers ---

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function errorResponse(
  status: number,
  error: string,
  code: string,
  details?: unknown,
): Response {
  const body: { error: string; code: string; details?: unknown } = { error, code };
  if (details !== undefined) body.details = details;
  return Response.json(body, { status });
}

export function validationErrorResponse(validationErrors: ValidationError[]): Response {
  return errorResponse(400, "Validation failed", "VALIDATION_ERROR", validationErrors);
}

// --- Wallet helpers ---

export function getPayerWallet(req: Request): string | null {
  if (!req.headers.get("authorization")) return null;
  try {
    const credential = Credential.fromRequest(req);
    if (credential.source) {
      const parts = credential.source.split(":");
      return parts[parts.length - 1].toLowerCase();
    }
  } catch {
    // No valid credential
  }
  return null;
}

export function requireWallet(req: Request): string {
  const wallet = getPayerWallet(req);
  if (!wallet) throw new FlyApiError(401, "Authorization required");
  return wallet;
}

export async function requireOwnership(
  req: Request,
  resourceId: string,
  type: "machine" | "volume" | "droplet",
): Promise<{ wallet: string; resourceId: string }> {
  const wallet = requireWallet(req);
  await assertOwnership(resourceId, wallet, type);
  return { wallet, resourceId };
}

// --- Billing session helper ---

export async function registerBillingSession(req: Request, machineId: string, wallet: string): Promise<void> {
  const sessionId = req.headers.get("x-mpp-session-id") ?? `session-${Date.now()}`;
  const deposit = Number(req.headers.get("x-mpp-deposit") || PRICES.SESSION_DEPOSIT);
  await startSession(machineId, wallet, sessionId, deposit);
}

// --- URL param extraction ---

/**
 * Extract a path segment by name from the URL.
 * E.g., for "/api/machines/abc123/start", extractParam(req, "machines") returns "abc123"
 * (the segment after "machines").
 */
export function extractParam(req: Request, segmentBefore: string): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf(segmentBefore);
  if (idx === -1 || idx + 1 >= parts.length) {
    throw new Error(`Missing route parameter after "${segmentBefore}"`);
  }
  return decodeURIComponent(parts[idx + 1]);
}

// --- Error handling wrapper ---

export function withErrorHandling(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof FlyApiError) {
        const code = err.statusCode === 401 ? "AUTH_REQUIRED"
          : err.statusCode === 403 ? "FORBIDDEN"
          : "FLY_API_ERROR";
        return errorResponse(err.statusCode, err.message, code);
      }
      if (err instanceof DOApiError) {
        const code = err.statusCode === 401 ? "AUTH_REQUIRED"
          : err.statusCode === 403 ? "FORBIDDEN"
          : "DO_API_ERROR";
        return errorResponse(err.statusCode, err.message, code);
      }
      if (err instanceof VercelApiError) {
        const code = err.statusCode === 401 ? "AUTH_REQUIRED"
          : err.statusCode === 403 ? "FORBIDDEN"
          : "VERCEL_API_ERROR";
        return errorResponse(err.statusCode, err.message, code);
      }
      if (err instanceof UpstashApiError) {
        const code = err.statusCode === 401 ? "AUTH_REQUIRED"
          : err.statusCode === 403 ? "FORBIDDEN"
          : "UPSTASH_API_ERROR";
        return errorResponse(err.statusCode, err.message, code);
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("Not authorized") || message.includes("not own")) {
        return errorResponse(403, message, "FORBIDDEN");
      }
      if (message.includes("not found in registry")) {
        return errorResponse(404, message, "NOT_FOUND");
      }
      return errorResponse(500, message, "INTERNAL_ERROR");
    }
  };
}

// --- Billing enforcement (only on non-Vercel, i.e. Fly.io) ---
if (!isVercel) {
  startBillingEnforcement(fly.machines);
  process.on("SIGTERM", () => { stopBillingEnforcement(); process.exit(0); });
  process.on("SIGINT", () => { stopBillingEnforcement(); process.exit(0); });
}

// Re-export billing functions
export { getBillingInfo } from "./billing";

// KV helper — reuse cached database lookup
export async function getKVClient(dbId: string) {
  const { UpstashKVClient } = await import("./upstash/kv");
  const db = await upstashClient.databases.get(dbId);
  return new UpstashKVClient({ url: `https://${db.endpoint}`, token: db.rest_token });
}

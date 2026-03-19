/**
 * Shared server utilities for Next.js route handlers.
 * Mirrors the helpers from src/server.ts but adapted for Next.js Request/Response.
 */

import { Credential } from "mppx";
import { Mppx, tempo } from "mppx/nextjs";
import { FlyClient, FlyApiError } from "./fly/index";
import { DOClient, DOApiError } from "./do/index";
import { VercelClient, VercelApiError } from "./vercel/index";
import { UpstashClient, UpstashApiError } from "./upstash/index";
import {
  assertOwnership,
} from "./ownership";
import {
  startSession,
  stopSession,
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

// @ts-ignore - mppx has complex internal types
export const mppx = Mppx.create({
  methods: [
    tempo({
      currency: USDC,
      recipient: RECIPIENT as `0x${string}`,
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
  MACHINE_SETUP: "0.1",
  VOLUME_SETUP: "0.05",
  VOLUME_EXTEND: "0.05",
  EXEC_COMMAND: "0.01",
  ALLOCATE_IP: "0.01",
  SESSION_PER_MIN: "0.005",
  SESSION_DEPOSIT: "0.30",
  VERCEL_PROJECT: "0.1",
  DOMAIN_CHECK: "0.001",
  AUTH: "0.001",
  KV_DATABASE_CREATE: "0.05",
  KV_OP: "0.001",
} as const;

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

export function registerBillingSession(req: Request, machineId: string, wallet: string): void {
  const sessionId = req.headers.get("x-mpp-session-id") ?? `session-${Date.now()}`;
  const deposit = Number(req.headers.get("x-mpp-deposit") || PRICES.SESSION_DEPOSIT);
  startSession(machineId, wallet, sessionId, deposit);
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
export { stopSession as stopBillingSession_fn } from "./billing";
export { getBillingInfo } from "./billing";

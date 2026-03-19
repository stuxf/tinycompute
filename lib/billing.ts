/**
 * Billing tracker for session-based machine usage.
 * Sessions are stored in Upstash Redis so they persist across serverless invocations.
 * Billing enforcement runs via Vercel Cron (see app/api/cron/billing/route.ts).
 */

import { Redis } from "@upstash/redis";
import type { FlyMachinesClient } from "./fly/machines";

/** Rate per minute in USDC */
const RATE_PER_MINUTE = 0.005;

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let redis: Redis | undefined;
if (UPSTASH_URL && UPSTASH_TOKEN) {
  redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
}

// Fallback in-memory store for local dev without Redis
const memSessions = new Map<string, BillingSession>();

export interface BillingSession {
  machineId: string;
  wallet: string;
  sessionId: string;
  startTime: number; // Date.now()
  deposit: number;
}

export interface BillingInfo {
  machineId: string;
  sessionId: string;
  wallet: string;
  startTime: string;
  elapsedMinutes: number;
  currentCost: number;
  deposit: number;
  remaining: number;
  ratePerMinute: number;
  ratePretty: string;
}

function sessionKey(machineId: string): string {
  return `billing:session:${machineId}`;
}

const ACTIVE_SESSIONS_SET = "billing:active_sessions";

export async function startSession(
  machineId: string,
  wallet: string,
  sessionId: string,
  deposit: number,
): Promise<void> {
  const session: BillingSession = {
    machineId,
    wallet,
    sessionId,
    startTime: Date.now(),
    deposit,
  };

  if (redis) {
    await redis.set(sessionKey(machineId), JSON.stringify(session));
    await redis.sadd(ACTIVE_SESSIONS_SET, machineId);
  } else {
    memSessions.set(machineId, session);
  }
}

export async function stopSession(machineId: string): Promise<BillingSession | undefined> {
  if (redis) {
    const raw = await redis.get<string>(sessionKey(machineId));
    await redis.del(sessionKey(machineId));
    await redis.srem(ACTIVE_SESSIONS_SET, machineId);
    return raw ? JSON.parse(raw) : undefined;
  } else {
    const session = memSessions.get(machineId);
    memSessions.delete(machineId);
    return session;
  }
}

export async function getSession(machineId: string): Promise<BillingSession | undefined> {
  if (redis) {
    const raw = await redis.get<string>(sessionKey(machineId));
    return raw ? JSON.parse(raw) : undefined;
  }
  return memSessions.get(machineId);
}

function elapsedMinutes(session: BillingSession): number {
  return (Date.now() - session.startTime) / 60_000;
}

function currentCost(session: BillingSession): number {
  return elapsedMinutes(session) * RATE_PER_MINUTE;
}

export async function getBillingInfo(machineId: string): Promise<BillingInfo | null> {
  const session = await getSession(machineId);
  if (!session) return null;

  const elapsed = elapsedMinutes(session);
  const cost = currentCost(session);

  return {
    machineId: session.machineId,
    sessionId: session.sessionId,
    wallet: session.wallet,
    startTime: new Date(session.startTime).toISOString(),
    elapsedMinutes: Math.round(elapsed * 100) / 100,
    currentCost: cost,
    deposit: session.deposit,
    remaining: session.deposit - cost,
    ratePerMinute: RATE_PER_MINUTE,
    ratePretty: `$${RATE_PER_MINUTE}/min`,
  };
}

/**
 * Check all active sessions and auto-stop machines that exceeded their deposit.
 * Called by the Vercel Cron job (app/api/cron/billing/route.ts).
 */
export async function enforceActiveSessions(machines: FlyMachinesClient): Promise<string[]> {
  const stopped: string[] = [];

  if (redis) {
    const activeIds = await redis.smembers(ACTIVE_SESSIONS_SET) as string[];
    for (const machineId of activeIds) {
      const session = await getSession(machineId);
      if (!session) {
        await redis.srem(ACTIVE_SESSIONS_SET, machineId);
        continue;
      }
      const cost = currentCost(session);
      if (cost >= session.deposit) {
        console.log(`[billing] Auto-stopping ${machineId}: cost $${cost.toFixed(4)} >= deposit $${session.deposit}`);
        try {
          await machines.stop(machineId);
          await stopSession(machineId);
          stopped.push(machineId);
        } catch (err) {
          console.error(`[billing] Failed to stop ${machineId}:`, err instanceof Error ? err.message : err);
        }
      }
    }
  } else {
    for (const [machineId, session] of memSessions) {
      const cost = currentCost(session);
      if (cost >= session.deposit) {
        try {
          await machines.stop(machineId);
          memSessions.delete(machineId);
          stopped.push(machineId);
        } catch (err) {
          console.error(`[billing] Failed to stop ${machineId}:`, err instanceof Error ? err.message : err);
        }
      }
    }
  }

  return stopped;
}

// Legacy — no-ops for backward compat with old server.ts
export function startBillingEnforcement(_machines: FlyMachinesClient): void {}
export function stopBillingEnforcement(): void {}

/**
 * Billing tracker for session-based machine usage.
 * Tracks active sessions in-memory and provides auto-stop enforcement
 * when a session's deposit is consumed.
 */

import type { FlyMachinesClient } from "./fly/machines";

/** Rate per minute in USDC */
const RATE_PER_MINUTE = 0.005;

export interface BillingSession {
  machineId: string;
  wallet: string;
  sessionId: string;
  startTime: number; // Date.now()
  deposit: number; // base units deposited
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

// In-memory store: machineId → session
const activeSessions = new Map<string, BillingSession>();

let checkInterval: ReturnType<typeof setInterval> | null = null;

export function startSession(
  machineId: string,
  wallet: string,
  sessionId: string,
  deposit: number,
): void {
  activeSessions.set(machineId, {
    machineId,
    wallet,
    sessionId,
    startTime: Date.now(),
    deposit,
  });
}

export function stopSession(machineId: string): BillingSession | undefined {
  const session = activeSessions.get(machineId);
  activeSessions.delete(machineId);
  return session;
}

export function getSession(machineId: string): BillingSession | undefined {
  return activeSessions.get(machineId);
}

function elapsedMinutes(session: BillingSession): number {
  return (Date.now() - session.startTime) / 60_000;
}

function currentCost(session: BillingSession): number {
  return Math.ceil(elapsedMinutes(session) * RATE_PER_MINUTE);
}

export function getBillingInfo(machineId: string): BillingInfo | null {
  const session = activeSessions.get(machineId);
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
 * Start the background enforcement loop.
 * Checks every 30 seconds for sessions that have exceeded their deposit
 * and auto-stops those machines.
 */
export function startBillingEnforcement(machines: FlyMachinesClient): void {
  if (checkInterval) return; // already running

  checkInterval = setInterval(async () => {
    for (const [machineId, session] of activeSessions) {
      const cost = currentCost(session);
      if (cost >= session.deposit) {
        console.log(
          `[billing] Auto-stopping machine ${machineId}: cost ${cost} >= deposit ${session.deposit}`,
        );
        try {
          await machines.stop(machineId);
          activeSessions.delete(machineId);
        } catch (err) {
          console.error(
            `[billing] Failed to auto-stop machine ${machineId}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
  }, 30_000);
}

/** Stop the enforcement loop (for graceful shutdown). */
export function stopBillingEnforcement(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

import { fly } from "@/lib/server-utils";
import { enforceActiveSessions } from "@/lib/billing";

export const dynamic = "force-dynamic";

/**
 * Billing enforcement + TTL expiry check.
 * Vercel Cron runs daily; can also be called manually.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.CRON_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const stopped = await enforceActiveSessions(fly.machines);

  // Also check for TTL-expired machines
  const ttlStopped: string[] = [];
  try {
    const machines = await fly.machines.list();
    const now = Date.now();
    for (const m of machines) {
      const expiresAt = m.config?.metadata?.ttl_expires_at;
      if (expiresAt && m.state === "started") {
        if (now > Number(expiresAt)) {
          console.log(`[ttl] Stopping expired machine ${m.id} (expired ${new Date(Number(expiresAt)).toISOString()})`);
          try {
            await fly.machines.stop(m.id);
            ttlStopped.push(m.id);
          } catch (err) {
            console.error(`[ttl] Failed to stop ${m.id}:`, err instanceof Error ? err.message : err);
          }
        }
      }
    }
  } catch (err) {
    console.error("[ttl] Failed to check machines:", err instanceof Error ? err.message : err);
  }

  return Response.json({
    ok: true,
    checked: new Date().toISOString(),
    billingEnforcement: { stopped },
    ttlEnforcement: { stopped: ttlStopped },
  });
}

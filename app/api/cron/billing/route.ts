import { fly } from "@/lib/server-utils";
import { enforceActiveSessions } from "@/lib/billing";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron job — runs every minute to check billing sessions
 * and auto-stop machines that have exceeded their deposit.
 *
 * Configured in vercel.json: { "crons": [{ "path": "/api/cron/billing", "schedule": "* * * * *" }] }
 */
export async function GET(req: Request) {
  // Verify this is a cron request (Vercel sets this header)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow if no CRON_SECRET is set (dev mode) or if it matches
    if (process.env.CRON_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const stopped = await enforceActiveSessions(fly.machines);
  return Response.json({
    ok: true,
    checked: new Date().toISOString(),
    stopped,
  });
}

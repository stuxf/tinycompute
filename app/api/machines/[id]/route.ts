import {
  mppx, fly, PRICES,
  requireOwnership, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { stopSession } from "@/lib/billing";
import { removeMachine } from "@/lib/ownership";

export const dynamic = "force-dynamic";

// --- Get machine ($0.001) ---
export const GET = mppx.charge({ amount: PRICES.AUTH, description: "Get machine" })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "machines");
    const { resourceId } = await requireOwnership(req, id, "machine");
    return jsonResponse(await fly.machines.get(resourceId));
  }),
);

// --- Destroy machine ($0.001) ---
export const DELETE = mppx.charge({ amount: PRICES.AUTH, description: "Destroy machine" })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "machines");
    const { resourceId } = await requireOwnership(req, id, "machine");
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";
    await fly.machines.destroy(resourceId, force);
    stopSession(resourceId);
    await removeMachine(resourceId);
    return jsonResponse({ ok: true });
  }),
);

import {
  mppx, fly, PRICES,
  requireOwnership, registerBillingSession, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { stopSession } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const POST = mppx.session({ amount: PRICES.SESSION_PER_MIN, unitType: "minute", suggestedDeposit: PRICES.SESSION_DEPOSIT })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "machines");
    const { wallet, resourceId } = await requireOwnership(req, id, "machine");
    await fly.machines.restart(resourceId);
    stopSession(resourceId);
    registerBillingSession(req, resourceId, wallet);
    return jsonResponse({ ok: true, billing: "session", rate: "$0.005/min" });
  }),
);

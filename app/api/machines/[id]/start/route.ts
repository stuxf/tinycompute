import {
  mppx, fly, PRICES,
  requireOwnership, registerBillingSession, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

export const POST = mppx.session({ amount: PRICES.SESSION_PER_MIN, unitType: "minute", suggestedDeposit: PRICES.SESSION_DEPOSIT })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "machines");
    const { wallet, resourceId } = await requireOwnership(req, id, "machine");
    await fly.machines.start(resourceId);
    await registerBillingSession(req, resourceId, wallet);
    return jsonResponse({ ok: true, billing: "session", rate: "$0.005/min" });
  }),
);

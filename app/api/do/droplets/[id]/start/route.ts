import {
  mppx, doClient, PRICES,
  requireOwnership, registerBillingSession, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

export const POST = mppx.session({ amount: PRICES.SESSION_PER_MIN, unitType: "minute", suggestedDeposit: PRICES.SESSION_DEPOSIT })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "droplets");
    const { wallet, resourceId } = await requireOwnership(req, id, "droplet");
    await doClient.droplets.powerOn(Number(resourceId));
    registerBillingSession(req, resourceId, wallet);
    return jsonResponse({ ok: true, billing: "session", rate: "$0.005/min" });
  }),
);

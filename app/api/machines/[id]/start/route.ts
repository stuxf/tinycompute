import {
  mppx, fly, PRICES,
  requireOwnership, extractParam, computeRate,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { startSession } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req) => {
  const id = extractParam(req, "machines");
  const { wallet, resourceId } = await requireOwnership(req, id, "machine");

  // Get the machine config to compute the rate
  const machine = await fly.machines.get(resourceId);
  const rate = computeRate(machine.config);

  // Charge via session with dynamic rate
  const handler = mppx.session({
    amount: rate.ratePerMin,
    unitType: "minute",
    suggestedDeposit: rate.suggestedDeposit,
  })(
    withErrorHandling(async () => {
      await fly.machines.start(resourceId);
      const sessionId = req.headers.get("x-mpp-session-id") ?? `session-${Date.now()}`;
      const deposit = Number(req.headers.get("x-mpp-deposit") || rate.suggestedDeposit);
      await startSession(resourceId, wallet, sessionId, deposit);
      return jsonResponse({ ok: true, billing: "session", rate: rate.ratePretty });
    }),
  );

  return handler(req);
});

import {
  mppx, doClient,
  requireOwnership, extractParam, computeDropletRate,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { startSession } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req) => {
  const id = extractParam(req, "droplets");
  const { wallet, resourceId } = await requireOwnership(req, id, "droplet");

  // Get the droplet to find its size for dynamic pricing
  const droplet = await doClient.droplets.get(Number(resourceId));
  const rate = computeDropletRate(droplet.size?.slug);

  const handler = mppx.session({
    amount: rate.ratePerMin,
    unitType: "minute",
    suggestedDeposit: rate.suggestedDeposit,
  })(
    withErrorHandling(async () => {
      await doClient.droplets.powerOn(Number(resourceId));
      const sessionId = req.headers.get("x-mpp-session-id") ?? `session-${Date.now()}`;
      const deposit = Number(req.headers.get("x-mpp-deposit") || rate.suggestedDeposit);
      await startSession(resourceId, wallet, sessionId, deposit);
      return jsonResponse({ ok: true, billing: "session", rate: rate.ratePretty });
    }),
  );

  return handler(req);
});

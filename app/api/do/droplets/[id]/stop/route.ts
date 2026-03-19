import {
  mppx, doClient, PRICES,
  requireOwnership, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { stopSession } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const POST = mppx.charge({ amount: PRICES.AUTH, description: "Stop droplet" })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "droplets");
    const { resourceId } = await requireOwnership(req, id, "droplet");
    await doClient.droplets.powerOff(Number(resourceId));
    stopSession(resourceId);
    return jsonResponse({ ok: true });
  }),
);

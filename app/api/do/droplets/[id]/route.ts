import {
  mppx, doClient, PRICES,
  requireOwnership, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { stopSession } from "@/lib/billing";
import { removeDroplet } from "@/lib/ownership";

export const dynamic = "force-dynamic";

export const GET = mppx.charge({ amount: PRICES.AUTH, description: "Get droplet" })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "droplets");
    const { resourceId } = await requireOwnership(req, id, "droplet");
    return jsonResponse(await doClient.droplets.get(Number(resourceId)));
  }),
);

export const DELETE = mppx.charge({ amount: PRICES.AUTH, description: "Destroy droplet" })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "droplets");
    const { resourceId } = await requireOwnership(req, id, "droplet");
    await doClient.droplets.delete(Number(resourceId));
    stopSession(resourceId);
    await removeDroplet(resourceId);
    return jsonResponse({ ok: true });
  }),
);

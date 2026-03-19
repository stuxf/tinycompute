import {
  mppx, fly, PRICES,
  requireOwnership, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { removeVolume } from "@/lib/ownership";

export const dynamic = "force-dynamic";

export const GET = mppx.charge({ amount: PRICES.AUTH, description: "Get volume" })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "volumes");
    const { resourceId } = await requireOwnership(req, id, "volume");
    return jsonResponse(await fly.volumes.get(resourceId));
  }),
);

export const DELETE = mppx.charge({ amount: PRICES.AUTH, description: "Delete volume" })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "volumes");
    const { resourceId } = await requireOwnership(req, id, "volume");
    await fly.volumes.delete(resourceId);
    await removeVolume(resourceId);
    return jsonResponse({ ok: true });
  }),
);

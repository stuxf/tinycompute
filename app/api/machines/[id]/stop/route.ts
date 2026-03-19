import {
  mppx, fly, PRICES,
  requireOwnership, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { stopSession } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const POST = mppx.charge({ amount: PRICES.AUTH, description: "Stop machine" })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "machines");
    const { resourceId } = await requireOwnership(req, id, "machine");
    await fly.machines.stop(resourceId);
    await stopSession(resourceId);
    return jsonResponse({ ok: true });
  }),
);

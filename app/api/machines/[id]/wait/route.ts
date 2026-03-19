import {
  mppx, fly, PRICES,
  requireOwnership, extractParam,
  withErrorHandling, validationErrorResponse, jsonResponse,
} from "@/lib/server-utils";
import { validateWaitState } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = mppx.charge({ amount: PRICES.AUTH, description: "Wait for state" })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "machines");
    const { resourceId } = await requireOwnership(req, id, "machine");
    const url = new URL(req.url);
    const state = url.searchParams.get("state") ?? "started";
    const sv = validateWaitState(state);
    if (!sv.ok) return validationErrorResponse(sv.errors);
    const timeout = Number(url.searchParams.get("timeout") ?? 60);
    return jsonResponse(await fly.machines.waitForState(resourceId, state, timeout));
  }),
);

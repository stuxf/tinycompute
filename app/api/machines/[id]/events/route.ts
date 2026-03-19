import {
  mppx, fly, PRICES,
  requireOwnership, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

export const GET = mppx.charge({ amount: PRICES.AUTH, description: "Machine events" })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "machines");
    const { resourceId } = await requireOwnership(req, id, "machine");
    return jsonResponse(await fly.machines.events(resourceId));
  }),
);

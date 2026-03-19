import {
  mppx, PRICES,
  requireOwnership, extractParam,
  withErrorHandling, errorResponse, jsonResponse,
  getBillingInfo,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

export const GET = mppx.charge({ amount: PRICES.AUTH, description: "Billing info" })(
  withErrorHandling(async (req) => {
    const id = extractParam(req, "machines");
    const { resourceId } = await requireOwnership(req, id, "machine");
    const info = getBillingInfo(resourceId);
    if (!info) return errorResponse(404, "No active billing session", "NOT_FOUND");
    return jsonResponse(info);
  }),
);

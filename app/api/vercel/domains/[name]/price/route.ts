import {
  mppx, vercelClient, PRICES,
  requireWallet, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- Get domain price ($0.001) ---
export const GET = mppx.charge({ amount: PRICES.AUTH, description: "Get domain price" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const name = extractParam(req, "domains");
    const price = await vercelClient.domains.getPrice(name);
    return jsonResponse(price);
  }),
);

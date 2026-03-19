import {
  mppx, vercelClient, PRICES,
  requireWallet,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- Check domain availability (charge) ---
export const POST = mppx.charge({ amount: PRICES.DOMAIN_CHECK, description: "Domain availability check" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const body = await req.json();
    const result = await vercelClient.domains.checkAvailability(body.name);
    return jsonResponse(result);
  }),
);

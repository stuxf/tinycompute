import {
  mppx, vercelClient, PRICES,
  requireWallet,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- List domains ($0.001) ---
export const GET = mppx.charge({ amount: PRICES.AUTH, description: "List Vercel domains" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const res = await vercelClient.domains.list();
    return jsonResponse(res.domains);
  }),
);

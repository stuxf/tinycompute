import {
  mppx, fly, PRICES,
  requireWallet,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- Create app ($0.001) ---
export const POST = mppx.charge({ amount: PRICES.AUTH, description: "Create app" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    return jsonResponse(await fly.apps.create(await req.json()), 201);
  }),
);

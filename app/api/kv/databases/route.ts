import {
  mppx, upstashClient, PRICES,
  requireWallet,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- List databases ($0.001) ---
export const GET = mppx.charge({ amount: PRICES.KV_OP, description: "List KV databases" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const databases = await upstashClient.databases.list();
    return jsonResponse(databases);
  }),
);

// --- Create database ($0.05) ---
export const POST = mppx.charge({ amount: PRICES.KV_DATABASE_CREATE, description: "Create KV database" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const body = await req.json();
    const database = await upstashClient.databases.create({
      name: body.name,
      region: body.region,
      primary_region: body.primary_region,
      read_regions: body.read_regions,
      tls: body.tls,
    });
    return jsonResponse(database, 201);
  }),
);

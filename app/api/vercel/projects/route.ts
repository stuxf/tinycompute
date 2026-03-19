import {
  mppx, vercelClient, PRICES,
  requireWallet,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- List projects ($0.001) ---
export const GET = mppx.charge({ amount: PRICES.AUTH, description: "List Vercel projects" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const res = await vercelClient.projects.list();
    return jsonResponse(res.projects);
  }),
);

// --- Create project (charge) ---
export const POST = mppx.charge({ amount: PRICES.VERCEL_PROJECT, description: "Vercel project setup fee" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const body = await req.json();
    const project = await vercelClient.projects.create(body);
    return jsonResponse(project, 201);
  }),
);

import {
  mppx, vercelClient, PRICES,
  requireWallet, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- Get project ($0.001) ---
export const GET = mppx.charge({ amount: PRICES.AUTH, description: "Get Vercel project" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const id = extractParam(req, "projects");
    const project = await vercelClient.projects.getProject(id);
    return jsonResponse(project);
  }),
);

// --- Delete project ($0.001) ---
export const DELETE = mppx.charge({ amount: PRICES.AUTH, description: "Delete Vercel project" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const id = extractParam(req, "projects");
    await vercelClient.projects.deleteProject(id);
    return jsonResponse({ ok: true });
  }),
);

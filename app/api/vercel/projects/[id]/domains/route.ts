import {
  mppx, vercelClient, PRICES,
  requireWallet, extractParam,
  withErrorHandling, validationErrorResponse, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- Add domain to project ($0.01) ---
export const POST = mppx.charge({ amount: PRICES.EXEC_COMMAND, description: "Add domain to Vercel project" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const projectId = extractParam(req, "projects");
    const body = await req.json();
    if (!body.domain || typeof body.domain !== "string") {
      return validationErrorResponse([
        { field: "domain", message: "Domain name is required" },
      ]);
    }
    const result = await vercelClient.projects.addDomain(projectId, body.domain);
    return jsonResponse(result, 201);
  }),
);

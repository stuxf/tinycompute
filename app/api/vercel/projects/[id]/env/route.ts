import {
  mppx, vercelClient, PRICES,
  requireWallet, extractParam,
  withErrorHandling, validationErrorResponse, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- Set env var ($0.01) ---
export const POST = mppx.charge({ amount: PRICES.EXEC_COMMAND, description: "Set Vercel env var" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const projectId = extractParam(req, "projects");
    const body = await req.json();
    if (!body.key || !body.value || !body.target) {
      return validationErrorResponse([
        { field: "key", message: "Env var key is required" },
        { field: "value", message: "Env var value is required" },
        { field: "target", message: "Env var target is required" },
      ]);
    }
    const envVar = await vercelClient.projects.addEnvVar(projectId, body);
    return jsonResponse(envVar, 201);
  }),
);

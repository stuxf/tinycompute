import {
  mppx, vercelClient, PRICES,
  requireWallet,
  withErrorHandling, validationErrorResponse, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- List deployments ($0.001) ---
export const GET = mppx.charge({ amount: PRICES.AUTH, description: "List Vercel deployments" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const url = new URL(req.url);
    const params: Record<string, string | number> = {};
    if (url.searchParams.get("projectId")) params.projectId = url.searchParams.get("projectId")!;
    if (url.searchParams.get("limit")) params.limit = Number(url.searchParams.get("limit"));
    if (url.searchParams.get("state")) params.state = url.searchParams.get("state")!;
    if (url.searchParams.get("target")) params.target = url.searchParams.get("target")!;
    const res = await vercelClient.deployments.listDeployments(params as any);
    return jsonResponse(res.deployments);
  }),
);

// --- Create deployment ($0.10) ---
export const POST = mppx.charge({ amount: PRICES.MACHINE_SETUP, description: "Create Vercel deployment" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const body = await req.json();
    if (!body.name || typeof body.name !== "string") {
      return validationErrorResponse([
        { field: "name", message: "Deployment name is required" },
      ]);
    }
    const deployment = await vercelClient.deployments.createDeployment(body);
    return jsonResponse(deployment, 201);
  }),
);

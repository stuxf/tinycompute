import {
  mppx, fly, PRICES,
  extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- List IPs (free, no auth) ---
export const GET = withErrorHandling(async (req) => {
  const name = extractParam(req, "apps");
  return jsonResponse(await fly.apps.listIps(name));
});

// --- Allocate IP (charge) ---
export const POST = mppx.charge({ amount: PRICES.ALLOCATE_IP, description: "Allocate IP address" })(
  withErrorHandling(async (req) => {
    const name = extractParam(req, "apps");
    const body = await req.json().catch(() => ({}));
    return jsonResponse(
      await fly.apps.allocateIp(name, body.type ?? "shared_v4", body.region),
      201,
    );
  }),
);

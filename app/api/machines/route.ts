import {
  mppx, fly, PRICES,
  requireWallet, getPayerWallet,
  computeSetupFee, computeRate,
  withErrorHandling, validationErrorResponse, jsonResponse,
} from "@/lib/server-utils";
import { validateCreateMachine } from "@/lib/validation";
import { setMachineOwner, listOwnedMachines } from "@/lib/ownership";

export const dynamic = "force-dynamic";

// --- List machines ($0.001) ---
export const GET = mppx.charge({ amount: PRICES.AUTH, description: "List machines" })(
  withErrorHandling(async (req) => {
    const wallet = requireWallet(req);
    const ownedIds = await listOwnedMachines(wallet);
    if (ownedIds.length === 0) return jsonResponse([]);
    const allMachines = await fly.machines.list();
    return jsonResponse(allMachines.filter((m) => ownedIds.includes(m.id)));
  }),
);

// --- Create machine (dynamic charge based on size) ---
export async function POST(req: Request) {
  // Clone request before reading body — mppx needs to read it again
  const cloned = req.clone();
  const body = await cloned.json();
  const v = validateCreateMachine(body);
  if (!v.ok) return Response.json(
    { error: "Validation failed", code: "VALIDATION_ERROR", details: v.errors },
    { status: 400 },
  );

  // Compute dynamic price based on machine config
  const setupFee = computeSetupFee(body.config);
  const rate = computeRate(body.config);

  // Charge the setup fee via mppx
  const handler = mppx.charge({
    amount: setupFee,
    description: `Machine setup (${body.config?.guest?.cpus ?? 1}cpu/${body.config?.guest?.memory_mb ?? 256}mb) — runtime ${rate.ratePretty}`,
  })(
    withErrorHandling(async () => {
      // Apply TTL
      const ttlMinutes = body.ttl_minutes;
      if (ttlMinutes && typeof ttlMinutes === "number" && ttlMinutes > 0) {
        const ttlSeconds = Math.min(ttlMinutes, 1440) * 60;
        const originalCmd = body.config.init?.cmd ?? body.config.init?.exec ?? [];
        body.config.init = {
          ...body.config.init,
          exec: ["timeout", String(ttlSeconds), ...(originalCmd.length > 0 ? originalCmd : ["sleep", "infinity"])],
        };
        body.config.auto_destroy = true;
        body.config.restart = { policy: "no" };
      }

      const machine = await fly.machines.create(body);
      const wallet = getPayerWallet(req);
      if (wallet) await setMachineOwner(machine.id, wallet);

      const ips = await fly.apps.listIps(process.env.FLY_APP_NAME!).catch(() => []);
      const services = body.config?.services ?? [];
      const ports = services.flatMap((s: any) => s.ports?.map((p: any) => p.port) ?? []);

      return jsonResponse({
        ...machine,
        pricing: {
          setupFee: `$${setupFee}`,
          ratePerMin: rate.ratePretty,
        },
        connection: {
          ips: Array.isArray(ips) ? ips : [],
          ports,
          hint: ports.length > 0
            ? `Connect to <ip>:${ports[0]}`
            : "No services/ports configured — use exec to interact",
        },
      }, 201);
    }),
  );

  return handler(req);
}

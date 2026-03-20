import {
  mppx, fly, PRICES,
  requireWallet, getPayerWallet, computeRate,
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

// --- Create machine ($0.10 flat setup + dynamic runtime pricing shown in response) ---
export const POST = mppx.charge({ amount: PRICES.MACHINE_SETUP, description: "Machine setup fee" })(
  withErrorHandling(async (req) => {
    const body = await req.json();
    const v = validateCreateMachine(body);
    if (!v.ok) return validationErrorResponse(v.errors);

    // Apply TTL via machine metadata — billing cron will auto-stop expired machines
    const ttlMinutes = body.ttl_minutes;
    if (ttlMinutes && typeof ttlMinutes === "number" && ttlMinutes > 0) {
      const expiresAt = Date.now() + Math.min(ttlMinutes, 1440) * 60 * 1000;
      body.config.metadata = {
        ...body.config.metadata,
        ttl_expires_at: String(expiresAt),
      };
    }

    const machine = await fly.machines.create(body);
    const wallet = getPayerWallet(req);
    if (wallet) await setMachineOwner(machine.id, wallet);

    // Compute runtime pricing for this machine size
    const rate = computeRate(body.config);
    // Get public IPs for connection info
    let ipList: { ip: string; shared: boolean }[] = [];
    try {
      const rawIps = await fly.apps.listIps(process.env.FLY_APP_NAME!);
      // Handle both array and wrapped object responses from Fly
      ipList = Array.isArray(rawIps) ? rawIps : (rawIps as any)?.ip_assignments ?? [];
    } catch { /* ignore */ }

    const services = body.config?.services ?? [];
    const ports = services.flatMap((s: any) => s.ports?.map((p: any) => p.port) ?? []);
    const dedicatedIp = ipList.find((ip: any) => !ip.shared)?.ip;
    const sharedIp = ipList.find((ip: any) => ip.shared)?.ip;
    const connectIp = dedicatedIp ?? sharedIp;

    return jsonResponse({
      ...machine,
      pricing: {
        setupFee: `$${PRICES.MACHINE_SETUP}`,
        runtimeRate: rate.ratePretty,
      },
      connection: {
        ip: connectIp ?? null,
        allIps: ipList,
        ports,
        address: connectIp && ports.length > 0 ? `${connectIp}:${ports[0]}` : null,
        hint: connectIp && ports.length > 0
          ? `Connect to ${connectIp}:${ports[0]}`
          : connectIp
          ? `IP: ${connectIp} — no ports exposed`
          : "No public IP — use exec to interact",
      },
    }, 201);
  }),
);

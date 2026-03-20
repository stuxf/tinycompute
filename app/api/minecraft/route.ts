import {
  mppx, fly,
  getPayerWallet,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { setMachineOwner } from "@/lib/ownership";
import { startSession } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Session-based: $0.005/min for a 4cpu/4GB machine
// Suggested deposit $0.50 (~100 min / 1.5 hours)
const RATE = "0.005";
const DEPOSIT = "0.50";

/**
 * POST /api/minecraft — One-click Minecraft server
 * Session-based: $0.005/min. Deposit $0.50 (~100 min).
 * Auto-stops when deposit is consumed or TTL expires.
 */
export const POST = mppx.session({
  amount: RATE,
  unitType: "minute",
  suggestedDeposit: DEPOSIT,
})(
  withErrorHandling(async (req) => {
    const body = await req.json().catch(() => ({}));

    const name = body.name ?? `mc-${Date.now().toString(36)}`;
    const region = body.region ?? "sjc";
    const ttlMinutes = Math.min(body.ttl_minutes ?? 60, 1440);
    const serverType = body.type ?? "PAPER";
    const memory = body.memory ?? "3G";
    const maxPlayers = body.max_players ?? 20;
    const motd = body.motd ?? "TinyCompute Minecraft Server";
    const version = body.version ?? "LATEST";

    const machine = await fly.machines.create({
      name,
      region,
      config: {
        image: "itzg/minecraft-server:latest",
        env: {
          EULA: "TRUE",
          TYPE: serverType,
          MEMORY: memory,
          MAX_PLAYERS: String(maxPlayers),
          MOTD: motd,
          VERSION: version,
          ENABLE_COMMAND_BLOCK: "true",
          SPAWN_PROTECTION: "0",
          VIEW_DISTANCE: "6",
          SIMULATION_DISTANCE: "4",
          ONLINE_MODE: "false",
        },
        guest: { cpu_kind: "shared", cpus: 4, memory_mb: 4096 },
        services: [{
          protocol: "tcp",
          internal_port: 25565,
          ports: [{ port: 25565 }],
        }],
        metadata: {
          ttl_expires_at: String(Date.now() + ttlMinutes * 60 * 1000),
          tinycompute_preset: "minecraft",
        },
      },
    });

    // Track ownership + billing session
    const wallet = getPayerWallet(req);
    if (wallet) {
      await setMachineOwner(machine.id, wallet);
      const sessionId = req.headers.get("x-mpp-session-id") ?? `mc-session-${Date.now()}`;
      const deposit = Number(req.headers.get("x-mpp-deposit") || DEPOSIT);
      await startSession(machine.id, wallet, sessionId, deposit);
    }

    // Get connection IP
    let connectIp: string | null = null;
    try {
      const rawIps = await fly.apps.listIps(process.env.FLY_APP_NAME!);
      const ipList = Array.isArray(rawIps) ? rawIps : [];
      const dedicated = ipList.find((ip: any) => !ip.shared && ip.ip);
      const shared = ipList.find((ip: any) => ip.shared && ip.ip);
      connectIp = (dedicated ?? shared)?.ip ?? null;
    } catch { /* ignore */ }

    // Wait for start
    try {
      await fly.machines.waitForState(machine.id, "started", 60);
    } catch { /* continue */ }

    // Poll mc-health
    let ready = false;
    let lastStatus = "starting";
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(r => setTimeout(r, 15000));
      try {
        const result = await fly.machines.exec(machine.id, ["mc-health"], 10);
        if (result.exit_code === 0) {
          ready = true;
          lastStatus = result.stdout.trim();
          break;
        }
        lastStatus = result.stderr.trim() || "starting";
      } catch {
        lastStatus = "waiting for server";
      }
    }

    return jsonResponse({
      id: machine.id,
      name,
      region,
      ready,
      status: lastStatus,
      connection: {
        address: connectIp ? `${connectIp}:25565` : null,
        ip: connectIp,
        port: 25565,
        fallback: "If null: tempo request -t https://tinycompute.dev/api/apps/mpp-compute/ips",
      },
      pricing: {
        type: "session",
        rate: `$${RATE}/min`,
        deposit: `$${DEPOSIT}`,
        billingInfo: `tempo request -t https://tinycompute.dev/api/machines/${machine.id}/billing`,
      },
      server: { type: serverType, version, maxPlayers, motd, memory },
      ttl: { minutes: ttlMinutes, expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString() },
      management: {
        stop: `tempo request -t -X POST https://tinycompute.dev/api/machines/${machine.id}/stop`,
        destroy: `tempo request -t -X DELETE https://tinycompute.dev/api/machines/${machine.id}`,
      },
    }, 201);
  }),
);

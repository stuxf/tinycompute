import {
  mppx, fly,
  getPayerWallet,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { setMachineOwner } from "@/lib/ownership";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Fly cost for 4cpu/4GB shared: ~$0.03/hr = $0.0005/min
// Our rate: $0.005/min (10x markup) + $0.10 setup
const SETUP_FEE = 0.10;
const RATE_PER_MIN = 0.005;

/**
 * POST /api/minecraft — One-click Minecraft server
 * Price = $0.10 setup + $0.005 × ttl_minutes
 */
export async function POST(req: Request) {
  const cloned = req.clone();
  const body = await cloned.json().catch(() => ({}));

  const ttlMinutes = Math.min(body.ttl_minutes ?? 60, 1440);
  const totalPrice = SETUP_FEE + (RATE_PER_MIN * ttlMinutes);
  const amount = String(Math.round(totalPrice * 1000) / 1000);

  const handler = mppx.charge({
    amount,
    description: `Minecraft server (4cpu/4GB, ${ttlMinutes}min) — $${amount}`,
  })(
    withErrorHandling(async () => {
      const name = body.name ?? `mc-${Date.now().toString(36)}`;
      const region = body.region ?? "sjc";
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
          guest: {
            cpu_kind: "shared",
            cpus: 4,
            memory_mb: 4096,
          },
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

      const wallet = getPayerWallet(req);
      if (wallet) await setMachineOwner(machine.id, wallet);

      // Get connection IP
      let connectIp: string | null = null;
      try {
        const rawIps = await fly.apps.listIps(process.env.FLY_APP_NAME!);
        const ipList = Array.isArray(rawIps) ? rawIps : [];
        const dedicated = ipList.find((ip: any) => !ip.shared && ip.ip);
        const shared = ipList.find((ip: any) => ip.shared && ip.ip);
        connectIp = (dedicated ?? shared)?.ip ?? null;
      } catch { /* ignore */ }

      // Wait for machine to start
      try {
        await fly.machines.waitForState(machine.id, "started", 60);
      } catch { /* continue */ }

      // Poll for mc-health
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
        },
        pricing: {
          setup: `$${SETUP_FEE}`,
          runtime: `$${RATE_PER_MIN}/min × ${ttlMinutes}min = $${(RATE_PER_MIN * ttlMinutes).toFixed(2)}`,
          total: `$${amount}`,
        },
        server: { type: serverType, version, maxPlayers, motd, memory },
        ttl: {
          minutes: ttlMinutes,
          expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
        },
        management: {
          stop: `tempo request -t -X POST https://tinycompute.dev/api/machines/${machine.id}/stop`,
          destroy: `tempo request -t -X DELETE https://tinycompute.dev/api/machines/${machine.id}`,
        },
      }, 201);
    }),
  );

  return handler(req);
}

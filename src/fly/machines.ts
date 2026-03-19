/**
 * Fly Machines API client
 * Generic compute provisioning — create, start, stop, destroy machines.
 */

import { flyRequest, assertFlyId, FlyApiError } from "./base.js";

export { FlyApiError };

export interface MachineGuest {
  cpu_kind: "shared" | "performance";
  cpus: number;
  memory_mb: number;
  gpu_kind?: string;
  gpus?: number;
  kernel_args?: string[];
}

export interface MachineService {
  protocol: "tcp" | "udp";
  internal_port: number;
  ports: { port: number; handlers?: string[] }[];
  autostart?: boolean;
  autostop?: "off" | "stop" | "suspend";
}

export interface MachineMount {
  volume: string;
  path: string;
  name?: string;
  size_gb?: number;
  extend_threshold_percent?: number;
  add_size_gb?: number;
}

export interface MachineCheck {
  type: "http" | "tcp";
  port: number;
  path?: string;
  interval?: number;
  timeout?: number;
  method?: string;
  protocol?: string;
}

export interface MachineInit {
  exec?: string[];
  entrypoint?: string[];
  cmd?: string[];
  tty?: boolean;
}

export interface MachineFile {
  guest_path: string;
  raw_value?: string;
  secret_name?: string;
}

export interface MachineMetrics {
  port: number;
  path: string;
}

export interface MachineProcess {
  name: string;
  entrypoint?: string[];
  cmd?: string[];
  env?: Record<string, string>;
  exec?: string[];
}

export interface MachineConfig {
  image: string;
  env?: Record<string, string>;
  guest?: MachineGuest;
  services?: MachineService[];
  mounts?: MachineMount[];
  checks?: Record<string, MachineCheck>;
  auto_destroy?: boolean;
  restart?: { policy: "no" | "on-failure" | "always"; max_retries?: number };
  stop_config?: { signal: string; timeout: number };
  init?: MachineInit;
  processes?: MachineProcess[];
  files?: MachineFile[];
  schedule?: string;
  metrics?: MachineMetrics;
  standbys?: string[];
  metadata?: Record<string, string>;
  dns?: { skip_registration?: boolean };
  statics?: { guest_path: string; url_prefix: string }[];
}

export interface CreateMachineRequest {
  name?: string;
  region?: string;
  config: MachineConfig;
  skip_launch?: boolean;
}

export interface Machine {
  id: string;
  name: string;
  state: string;
  region: string;
  instance_id: string;
  private_ip: string;
  config: MachineConfig;
  created_at: string;
  updated_at: string;
  events: { type: string; status: string; timestamp: number }[];
  image_ref?: { registry: string; repository: string; tag: string; digest: string; labels: Record<string, string> };
  host_status?: string;
  nonce?: string;
  incomplete_config?: MachineConfig;
}

export class FlyMachinesClient {
  private token: string;
  private appName: string;

  constructor(opts: { token: string; appName: string }) {
    this.token = opts.token;
    this.appName = opts.appName;
  }

  private req<T>(method: string, path: string, body?: unknown): Promise<T> {
    return flyRequest<T>(this.token, this.appName, method, path, body);
  }

  async create(req: CreateMachineRequest): Promise<Machine> {
    return this.req<Machine>("POST", "/machines", req);
  }

  async get(machineId: string): Promise<Machine> {
    assertFlyId(machineId, "machine");
    return this.req<Machine>("GET", `/machines/${machineId}`);
  }

  async list(): Promise<Machine[]> {
    return this.req<Machine[]>("GET", "/machines");
  }

  async start(machineId: string): Promise<void> {
    assertFlyId(machineId, "machine");
    await this.req<void>("POST", `/machines/${machineId}/start`);
  }

  async stop(machineId: string, signal?: string): Promise<void> {
    assertFlyId(machineId, "machine");
    await this.req<void>("POST", `/machines/${machineId}/stop`, {
      signal: signal ?? "SIGTERM",
    });
  }

  async restart(machineId: string): Promise<void> {
    assertFlyId(machineId, "machine");
    await this.req<void>("POST", `/machines/${machineId}/restart`);
  }

  async destroy(machineId: string, force?: boolean): Promise<void> {
    assertFlyId(machineId, "machine");
    const query = force ? "?force=true" : "";
    await this.req<void>("DELETE", `/machines/${machineId}${query}`);
  }

  async update(
    machineId: string,
    config: Partial<MachineConfig>,
  ): Promise<Machine> {
    assertFlyId(machineId, "machine");
    return this.req<Machine>("POST", `/machines/${machineId}`, {
      config,
    });
  }

  async waitForState(
    machineId: string,
    state: string,
    timeoutSeconds = 60,
  ): Promise<Machine> {
    assertFlyId(machineId, "machine");
    const safeTimeout =
      Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
        ? Math.min(timeoutSeconds, 300)
        : 60;
    const query = `?state=${state}&timeout=${safeTimeout}`;
    return this.req<Machine>(
      "GET",
      `/machines/${machineId}/wait${query}`,
    );
  }

  async events(machineId: string): Promise<Machine["events"]> {
    assertFlyId(machineId, "machine");
    const machine = await this.get(machineId);
    return machine.events;
  }

  async suspend(machineId: string): Promise<void> {
    assertFlyId(machineId, "machine");
    await this.req<void>("POST", `/machines/${machineId}/suspend`);
  }

  async signal(machineId: string, signal: string): Promise<void> {
    assertFlyId(machineId, "machine");
    await this.req<void>("POST", `/machines/${machineId}/signal`, { signal });
  }

  async exec(
    machineId: string,
    command: string[],
    timeout = 30,
  ): Promise<{ stdout: string; stderr: string; exit_code: number }> {
    assertFlyId(machineId, "machine");
    const safeTimeout = Math.min(Math.max(timeout, 1), 60);
    return this.req("POST", `/machines/${machineId}/exec`, {
      command,
      timeout: safeTimeout,
    });
  }

  async ps(machineId: string): Promise<unknown[]> {
    assertFlyId(machineId, "machine");
    return this.req<unknown[]>("GET", `/machines/${machineId}/ps`);
  }

  async setMetadata(
    machineId: string,
    key: string,
    value: string,
  ): Promise<void> {
    assertFlyId(machineId, "machine");
    await this.req<void>("POST", `/machines/${machineId}/metadata/${key}`, value);
  }

  async getMetadata(machineId: string): Promise<Record<string, string>> {
    assertFlyId(machineId, "machine");
    return this.req<Record<string, string>>(
      "GET",
      `/machines/${machineId}/metadata`,
    );
  }

  async cordon(machineId: string): Promise<void> {
    assertFlyId(machineId, "machine");
    await this.req<void>("POST", `/machines/${machineId}/cordon`);
  }

  async uncordon(machineId: string): Promise<void> {
    assertFlyId(machineId, "machine");
    await this.req<void>("POST", `/machines/${machineId}/uncordon`);
  }
}

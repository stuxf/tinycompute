/**
 * Input validation schemas for the compute API
 */

const MAX_CPUS = 8;
const MAX_MEMORY_MB = 8192;
const MAX_VOLUME_GB = 100;
const MAX_NAME_LENGTH = 64;
const ALLOWED_REGIONS = [
  "ams", "arn", "atl", "bog", "bom", "bos", "cdg", "den", "dfw",
  "ewr", "eze", "fra", "gdl", "gig", "gru", "hkg", "iad", "jnb",
  "lax", "lhr", "mad", "mia", "nrt", "ord", "otp", "phx", "qro",
  "scl", "sea", "sin", "sjc", "syd", "waw", "yul", "yyz",
];

export interface ValidationError {
  field: string;
  message: string;
}

function errors(...errs: ValidationError[]): { ok: false; errors: ValidationError[] } {
  return { ok: false, errors: errs };
}

function err(field: string, message: string): ValidationError {
  return { field, message };
}

export function validateCreateMachine(body: unknown): {
  ok: true;
} | {
  ok: false;
  errors: ValidationError[];
} {
  if (!body || typeof body !== "object") {
    return errors(err("body", "Request body must be an object"));
  }

  const b = body as Record<string, unknown>;
  const errs: ValidationError[] = [];

  // name
  if (b.name !== undefined) {
    if (typeof b.name !== "string" || b.name.length > MAX_NAME_LENGTH) {
      errs.push(err("name", `Must be a string, max ${MAX_NAME_LENGTH} chars`));
    } else if (!/^[a-z0-9-]+$/.test(b.name)) {
      errs.push(err("name", "Must contain only lowercase alphanumeric and hyphens"));
    }
  }

  // region
  if (b.region !== undefined) {
    if (typeof b.region !== "string" || !ALLOWED_REGIONS.includes(b.region)) {
      errs.push(err("region", `Must be one of: ${ALLOWED_REGIONS.join(", ")}`));
    }
  }

  // config
  if (!b.config || typeof b.config !== "object") {
    errs.push(err("config", "config is required and must be an object"));
    return errors(...errs);
  }

  const config = b.config as Record<string, unknown>;

  // config.image
  if (typeof config.image !== "string" || config.image.length === 0) {
    errs.push(err("config.image", "image is required"));
  } else if (config.image.length > 256) {
    errs.push(err("config.image", "image must be <= 256 chars"));
  }

  // config.guest
  if (config.guest !== undefined) {
    const guest = config.guest as Record<string, unknown>;
    if (guest.cpus !== undefined) {
      const cpus = Number(guest.cpus);
      if (!Number.isInteger(cpus) || cpus < 1 || cpus > MAX_CPUS) {
        errs.push(err("config.guest.cpus", `Must be 1-${MAX_CPUS}`));
      }
    }
    if (guest.memory_mb !== undefined) {
      const mem = Number(guest.memory_mb);
      if (!Number.isInteger(mem) || mem < 256 || mem > MAX_MEMORY_MB) {
        errs.push(err("config.guest.memory_mb", `Must be 256-${MAX_MEMORY_MB}`));
      }
    }
    if (guest.cpu_kind !== undefined && !["shared", "performance"].includes(guest.cpu_kind as string)) {
      errs.push(err("config.guest.cpu_kind", "Must be 'shared' or 'performance'"));
    }
  }

  // config.env - limit key/value lengths
  if (config.env !== undefined) {
    if (typeof config.env !== "object" || config.env === null) {
      errs.push(err("config.env", "Must be an object"));
    } else {
      const env = config.env as Record<string, unknown>;
      for (const [k, v] of Object.entries(env)) {
        if (k.length > 128) errs.push(err(`config.env.${k}`, "Key too long (max 128)"));
        if (typeof v !== "string") errs.push(err(`config.env.${k}`, "Value must be a string"));
        else if (v.length > 4096) errs.push(err(`config.env.${k}`, "Value too long (max 4096)"));
      }
    }
  }

  return errs.length > 0 ? errors(...errs) : { ok: true };
}

export function validateCreateVolume(body: unknown): {
  ok: true;
} | {
  ok: false;
  errors: ValidationError[];
} {
  if (!body || typeof body !== "object") {
    return errors(err("body", "Request body must be an object"));
  }

  const b = body as Record<string, unknown>;
  const errs: ValidationError[] = [];

  if (typeof b.name !== "string" || !/^[a-z0-9_]+$/.test(b.name) || b.name.length > MAX_NAME_LENGTH) {
    errs.push(err("name", `Must be lowercase alphanumeric/underscore, max ${MAX_NAME_LENGTH} chars`));
  }

  if (typeof b.region !== "string" || !ALLOWED_REGIONS.includes(b.region)) {
    errs.push(err("region", `Must be one of: ${ALLOWED_REGIONS.join(", ")}`));
  }

  const sizeGb = Number(b.size_gb);
  if (!Number.isInteger(sizeGb) || sizeGb < 1 || sizeGb > MAX_VOLUME_GB) {
    errs.push(err("size_gb", `Must be 1-${MAX_VOLUME_GB}`));
  }

  return errs.length > 0 ? errors(...errs) : { ok: true };
}

export function validateExtendVolume(body: unknown): {
  ok: true;
  size_gb: number;
} | {
  ok: false;
  errors: ValidationError[];
} {
  if (!body || typeof body !== "object") {
    return errors(err("body", "Request body must be an object"));
  }

  const b = body as Record<string, unknown>;
  const sizeGb = Number(b.size_gb);

  if (!Number.isInteger(sizeGb) || sizeGb < 1 || sizeGb > MAX_VOLUME_GB) {
    return errors(err("size_gb", `Must be 1-${MAX_VOLUME_GB}`));
  }

  return { ok: true, size_gb: sizeGb };
}

const VALID_MACHINE_STATES = [
  "created",
  "started",
  "stopped",
  "suspended",
  "destroyed",
] as const;

export function validateWaitState(state: string): {
  ok: true;
} | {
  ok: false;
  errors: ValidationError[];
} {
  if (!VALID_MACHINE_STATES.includes(state as any)) {
    return errors(
      err("state", `Must be one of: ${VALID_MACHINE_STATES.join(", ")}`),
    );
  }
  return { ok: true };
}

export function validateExecCommand(body: unknown): {
  ok: true;
  command: string[];
  timeout?: number;
} | {
  ok: false;
  errors: ValidationError[];
} {
  if (!body || typeof body !== "object") {
    return errors(err("body", "Request body must be an object"));
  }

  const b = body as Record<string, unknown>;
  const errs: ValidationError[] = [];

  if (!Array.isArray(b.command) || b.command.length === 0) {
    errs.push(err("command", "Must be a non-empty array of strings"));
  } else {
    for (let i = 0; i < b.command.length; i++) {
      if (typeof b.command[i] !== "string") {
        errs.push(err(`command[${i}]`, "Each command entry must be a string"));
      }
    }
  }

  if (b.timeout !== undefined) {
    const t = Number(b.timeout);
    if (!Number.isFinite(t) || t < 1 || t > 60) {
      errs.push(err("timeout", "Must be a number between 1 and 60"));
    }
  }

  if (errs.length > 0) return errors(...errs);

  return {
    ok: true,
    command: b.command as string[],
    timeout: b.timeout !== undefined ? Number(b.timeout) : undefined,
  };
}

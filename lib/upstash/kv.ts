/**
 * Upstash Redis per-database KV client
 * Wraps the per-database REST API for key-value operations.
 *
 * Each database has its own REST URL and token (returned on create).
 * Commands are sent as POST with body like ["GET", "mykey"].
 */

export class UpstashKVClient {
  private url: string;
  private token: string;

  constructor(opts: { url: string; token: string }) {
    this.url = opts.url;
    this.token = opts.token;
  }

  private async command<T = unknown>(...args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upstash KV error ${res.status}: ${text}`);
    }

    const data = await res.json() as { result: T };
    return data.result;
  }

  async get(key: string): Promise<string | null> {
    return this.command<string | null>("GET", key);
  }

  async set(key: string, value: string, ex?: number): Promise<string> {
    if (ex !== undefined) {
      return this.command<string>("SET", key, value, "EX", ex);
    }
    return this.command<string>("SET", key, value);
  }

  async del(key: string): Promise<number> {
    return this.command<number>("DEL", key);
  }

  async keys(pattern?: string): Promise<string[]> {
    return this.command<string[]>("KEYS", pattern ?? "*");
  }

  async incr(key: string): Promise<number> {
    return this.command<number>("INCR", key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.command<number>("EXPIRE", key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return this.command<number>("TTL", key);
  }
}

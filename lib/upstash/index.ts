/**
 * Unified Upstash client
 */

export { UpstashApiError, upstashRequest } from "./base";
export { UpstashDatabasesClient } from "./databases";
export type {
  UpstashDatabase,
  CreateDatabaseRequest,
} from "./databases";

export { UpstashKVClient } from "./kv";

import { UpstashDatabasesClient } from "./databases";

export class UpstashClient {
  public databases: UpstashDatabasesClient;

  constructor(opts: { email: string; apiKey: string }) {
    this.databases = new UpstashDatabasesClient(opts);
  }
}

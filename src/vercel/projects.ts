/**
 * Vercel Projects API client
 * Create, list, get, delete projects and manage environment variables.
 */

import { vercelRequest, VercelApiError } from "./base.js";

export { VercelApiError };

export interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  framework: string | null;
  createdAt: number;
  updatedAt: number;
  nodeVersion: string;
  targets?: Record<string, unknown>;
  latestDeployments?: unknown[];
  link?: {
    type: string;
    repo: string;
    repoId: number;
    org: string;
  };
}

export interface CreateProjectRequest {
  name: string;
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  rootDirectory?: string;
  gitRepository?: {
    type: string;
    repo: string;
  };
}

export interface EnvVar {
  key: string;
  value: string;
  target: ("production" | "preview" | "development")[];
  type?: "plain" | "encrypted" | "secret" | "sensitive";
}

export class VercelProjectsClient {
  private token: string;

  constructor(opts: { token: string }) {
    this.token = opts.token;
  }

  private req<T>(method: string, path: string, body?: unknown): Promise<T> {
    return vercelRequest<T>(this.token, method, path, body);
  }

  async create(req: CreateProjectRequest): Promise<VercelProject> {
    return this.req<VercelProject>("POST", "/v10/projects", req);
  }

  async list(limit = 20, from?: number): Promise<{ projects: VercelProject[] }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (from !== undefined) params.set("from", String(from));
    return this.req<{ projects: VercelProject[] }>("GET", `/v10/projects?${params}`);
  }

  async get(idOrName: string): Promise<VercelProject> {
    return this.req<VercelProject>("GET", `/v10/projects/${encodeURIComponent(idOrName)}`);
  }

  async delete(idOrName: string): Promise<void> {
    await this.req<void>("DELETE", `/v10/projects/${encodeURIComponent(idOrName)}`);
  }

  async setEnvVars(projectId: string, envVars: EnvVar[]): Promise<unknown> {
    return this.req<unknown>(
      "POST",
      `/v10/projects/${encodeURIComponent(projectId)}/env`,
      envVars,
    );
  }
}

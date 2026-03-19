/**
 * Vercel Deployments API client
 * List, get, create, and delete deployments.
 */

import { vercelRequest, VercelApiError } from "./base";

export { VercelApiError };

export interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED";
  created: number;
  ready?: number;
  createdAt: number;
  buildingAt?: number;
  creator: { uid: string; username: string };
  meta?: Record<string, string>;
  target?: "production" | "staging" | null;
  inspectorUrl?: string;
}

export interface CreateDeploymentRequest {
  name: string;
  project?: string;
  target?: "production" | "staging";
  gitSource?: {
    type: string;
    ref: string;
    repoId: string | number;
  };
  files?: Array<{
    file: string;
    data: string;
    encoding?: "base64" | "utf-8";
  }>;
  projectSettings?: {
    framework?: string;
    buildCommand?: string;
    outputDirectory?: string;
  };
}

export class VercelDeploymentsClient {
  private token: string;

  constructor(opts: { token: string }) {
    this.token = opts.token;
  }

  private req<T>(method: string, path: string, body?: unknown): Promise<T> {
    return vercelRequest<T>(this.token, method, path, body);
  }

  async list(
    projectId?: string,
    limit = 20,
    from?: number,
  ): Promise<{ deployments: VercelDeployment[] }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (projectId) params.set("projectId", projectId);
    if (from !== undefined) params.set("from", String(from));
    return this.req<{ deployments: VercelDeployment[] }>(
      "GET",
      `/v6/deployments?${params}`,
    );
  }

  async get(deploymentId: string): Promise<VercelDeployment> {
    return this.req<VercelDeployment>(
      "GET",
      `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    );
  }

  async create(req: CreateDeploymentRequest): Promise<VercelDeployment> {
    return this.req<VercelDeployment>("POST", "/v13/deployments", req);
  }

  async delete(deploymentId: string): Promise<void> {
    await this.req<void>(
      "DELETE",
      `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    );
  }
}

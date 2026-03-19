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

export interface DeploymentEvent {
  type: string;
  created: number;
  payload?: Record<string, unknown>;
  text?: string;
}

export interface ListDeploymentsParams {
  projectId?: string;
  limit?: number;
  from?: number;
  state?: VercelDeployment["state"];
  target?: "production" | "staging";
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

  async listDeployments(
    params?: ListDeploymentsParams,
  ): Promise<{ deployments: VercelDeployment[] }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.projectId) qs.set("projectId", params.projectId);
    if (params?.from !== undefined) qs.set("from", String(params.from));
    if (params?.state) qs.set("state", params.state);
    if (params?.target) qs.set("target", params.target);
    const query = qs.toString();
    return this.req<{ deployments: VercelDeployment[] }>(
      "GET",
      `/v6/deployments${query ? `?${query}` : ""}`,
    );
  }

  async getDeployment(deploymentId: string): Promise<VercelDeployment> {
    return this.req<VercelDeployment>(
      "GET",
      `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    );
  }

  async createDeployment(body: CreateDeploymentRequest): Promise<VercelDeployment> {
    return this.req<VercelDeployment>("POST", "/v13/deployments", body);
  }

  async deleteDeployment(deploymentId: string): Promise<void> {
    await this.req<void>(
      "DELETE",
      `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    );
  }

  async cancelDeployment(deploymentId: string): Promise<VercelDeployment> {
    return this.req<VercelDeployment>(
      "PATCH",
      `/v13/deployments/${encodeURIComponent(deploymentId)}/cancel`,
    );
  }

  async getDeploymentEvents(deploymentId: string): Promise<DeploymentEvent[]> {
    return this.req<DeploymentEvent[]>(
      "GET",
      `/v3/deployments/${encodeURIComponent(deploymentId)}/events`,
    );
  }
}

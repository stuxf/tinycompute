/**
 * Vercel Projects API client
 * Create, list, get, delete projects and manage environment variables.
 */

import { vercelRequest, VercelApiError } from "./base";

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
  id?: string;
  key: string;
  value: string;
  target: ("production" | "preview" | "development")[];
  type?: "plain" | "encrypted" | "secret" | "sensitive";
}

export interface UpdateProjectRequest {
  name?: string;
  framework?: string;
  buildCommand?: string | null;
  outputDirectory?: string | null;
  rootDirectory?: string | null;
  nodeVersion?: string;
  serverlessFunctionRegion?: string;
  publicSource?: boolean;
}

export interface ProjectDomain {
  name: string;
  apexName: string;
  projectId: string;
  verified: boolean;
  createdAt: number;
  updatedAt: number;
  redirect?: string | null;
  redirectStatusCode?: number | null;
  gitBranch?: string | null;
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

  async getProject(idOrName: string): Promise<VercelProject> {
    return this.req<VercelProject>(
      "GET",
      `/v9/projects/${encodeURIComponent(idOrName)}`,
    );
  }

  async deleteProject(idOrName: string): Promise<void> {
    await this.req<void>(
      "DELETE",
      `/v9/projects/${encodeURIComponent(idOrName)}`,
    );
  }

  async updateProject(
    idOrName: string,
    body: UpdateProjectRequest,
  ): Promise<VercelProject> {
    return this.req<VercelProject>(
      "PATCH",
      `/v9/projects/${encodeURIComponent(idOrName)}`,
      body,
    );
  }

  async addEnvVar(projectId: string, body: EnvVar): Promise<EnvVar> {
    return this.req<EnvVar>(
      "POST",
      `/v10/projects/${encodeURIComponent(projectId)}/env`,
      body,
    );
  }

  async removeEnvVar(projectId: string, envId: string): Promise<void> {
    await this.req<void>(
      "DELETE",
      `/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(envId)}`,
    );
  }

  async listEnvVars(projectId: string): Promise<{ envs: EnvVar[] }> {
    return this.req<{ envs: EnvVar[] }>(
      "GET",
      `/v9/projects/${encodeURIComponent(projectId)}/env`,
    );
  }

  async addDomain(projectId: string, domain: string): Promise<ProjectDomain> {
    return this.req<ProjectDomain>(
      "POST",
      `/v9/projects/${encodeURIComponent(projectId)}/domains`,
      { name: domain },
    );
  }

  async removeDomain(projectId: string, domain: string): Promise<void> {
    await this.req<void>(
      "DELETE",
      `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}`,
    );
  }

  /** @deprecated Use addEnvVar instead */
  async setEnvVars(projectId: string, envVars: EnvVar[]): Promise<unknown> {
    return this.req<unknown>(
      "POST",
      `/v10/projects/${encodeURIComponent(projectId)}/env`,
      envVars,
    );
  }
}

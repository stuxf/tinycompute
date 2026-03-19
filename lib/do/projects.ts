/**
 * DigitalOcean Projects API client
 * List projects, get default project, assign resources to projects.
 */

import { doRequest } from "./base";

export interface Project {
  id: string;
  owner_id: number;
  owner_uuid: string;
  name: string;
  description: string;
  purpose: string;
  environment: "Development" | "Staging" | "Production";
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectResource {
  urn: string;
  assigned_at: string;
  links: Record<string, unknown>;
  status: string;
}

export class DOProjectsClient {
  private token: string;

  constructor(opts: { token: string }) {
    this.token = opts.token;
  }

  private req<T>(method: string, path: string, body?: unknown): Promise<T> {
    return doRequest<T>(this.token, method, path, body);
  }

  async list(): Promise<Project[]> {
    const res = await this.req<{ projects: Project[] }>("GET", "/projects");
    return res.projects;
  }

  async getDefault(): Promise<Project> {
    const res = await this.req<{ project: Project }>(
      "GET",
      "/projects/default",
    );
    return res.project;
  }

  async get(projectId: string): Promise<Project> {
    const res = await this.req<{ project: Project }>(
      "GET",
      `/projects/${projectId}`,
    );
    return res.project;
  }

  /**
   * Assign resources to a project.
   * URNs look like: do:droplet:12345, do:volume:abc-123, etc.
   */
  async assignResources(
    projectId: string,
    urns: string[],
  ): Promise<ProjectResource[]> {
    const res = await this.req<{ resources: ProjectResource[] }>(
      "POST",
      `/projects/${projectId}/resources`,
      { resources: urns },
    );
    return res.resources;
  }

  /** List resources belonging to a project */
  async listResources(projectId: string): Promise<ProjectResource[]> {
    const res = await this.req<{ resources: ProjectResource[] }>(
      "GET",
      `/projects/${projectId}/resources`,
    );
    return res.resources;
  }
}

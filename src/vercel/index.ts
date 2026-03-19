/**
 * Unified Vercel client
 */

export { VercelApiError, vercelRequest } from "./base.js";
export { VercelProjectsClient } from "./projects.js";
export type {
  VercelProject,
  CreateProjectRequest,
  EnvVar,
} from "./projects.js";

export { VercelDeploymentsClient } from "./deployments.js";
export type {
  VercelDeployment,
  CreateDeploymentRequest,
} from "./deployments.js";

export { VercelDomainsClient } from "./domains.js";
export type {
  DomainAvailability,
  VercelDomain,
  DnsRecord,
  CreateDnsRecordRequest,
  BuyDomainRequest,
} from "./domains.js";

import { VercelProjectsClient } from "./projects.js";
import { VercelDeploymentsClient } from "./deployments.js";
import { VercelDomainsClient } from "./domains.js";

export class VercelClient {
  public projects: VercelProjectsClient;
  public deployments: VercelDeploymentsClient;
  public domains: VercelDomainsClient;

  constructor(opts: { token: string }) {
    this.projects = new VercelProjectsClient(opts);
    this.deployments = new VercelDeploymentsClient(opts);
    this.domains = new VercelDomainsClient(opts);
  }
}

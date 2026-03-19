/**
 * Unified Vercel client
 */

export { VercelApiError, vercelRequest } from "./base";
export { VercelProjectsClient } from "./projects";
export type {
  VercelProject,
  CreateProjectRequest,
  EnvVar,
} from "./projects";

export { VercelDeploymentsClient } from "./deployments";
export type {
  VercelDeployment,
  CreateDeploymentRequest,
} from "./deployments";

export { VercelDomainsClient } from "./domains";
export type {
  DomainAvailability,
  VercelDomain,
  DnsRecord,
  CreateDnsRecordRequest,
  BuyDomainRequest,
} from "./domains";

import { VercelProjectsClient } from "./projects";
import { VercelDeploymentsClient } from "./deployments";
import { VercelDomainsClient } from "./domains";

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

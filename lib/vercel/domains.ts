/**
 * Vercel Domains API client
 * Check availability, buy, list, get DNS records, add DNS records.
 */

import { vercelRequest, VercelApiError } from "./base";

export { VercelApiError };

export interface DomainAvailability {
  available: boolean;
  name: string;
  price?: number;
  period?: number;
}

export interface VercelDomain {
  name: string;
  apexName: string;
  projectId: string | null;
  verified: boolean;
  createdAt: number;
  expiresAt?: number;
  boughtAt?: number;
  transferredAt?: number;
  serviceType: string;
}

export interface DnsRecord {
  id: string;
  slug: string;
  name: string;
  type: string;
  value: string;
  ttl?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateDnsRecordRequest {
  name: string;
  type: "A" | "AAAA" | "ALIAS" | "CAA" | "CNAME" | "MX" | "SRV" | "TXT" | "NS";
  value: string;
  ttl?: number;
  mxPriority?: number;
  srv?: {
    priority: number;
    weight: number;
    port: number;
    target: string;
  };
}

export interface BuyDomainRequest {
  name: string;
  expectedPrice?: number;
}

export class VercelDomainsClient {
  private token: string;

  constructor(opts: { token: string }) {
    this.token = opts.token;
  }

  private req<T>(method: string, path: string, body?: unknown): Promise<T> {
    return vercelRequest<T>(this.token, method, path, body);
  }

  async checkAvailability(name: string): Promise<DomainAvailability> {
    return this.req<DomainAvailability>(
      "GET",
      `/v4/domains/status?name=${encodeURIComponent(name)}`,
    );
  }

  async buy(req: BuyDomainRequest): Promise<VercelDomain> {
    const res = await this.req<{ domain: VercelDomain }>(
      "POST",
      "/v5/domains/buy",
      req,
    );
    return res.domain;
  }

  async list(limit = 20, since?: number): Promise<{ domains: VercelDomain[] }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (since !== undefined) params.set("since", String(since));
    return this.req<{ domains: VercelDomain[] }>(
      "GET",
      `/v5/domains?${params}`,
    );
  }

  async getDnsRecords(
    domain: string,
    limit = 20,
    since?: string,
  ): Promise<{ records: DnsRecord[] }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (since) params.set("since", since);
    return this.req<{ records: DnsRecord[] }>(
      "GET",
      `/v4/domains/${encodeURIComponent(domain)}/records?${params}`,
    );
  }

  async addDnsRecord(domain: string, record: CreateDnsRecordRequest): Promise<DnsRecord> {
    const res = await this.req<{ uid: string }>(
      "POST",
      `/v2/domains/${encodeURIComponent(domain)}/records`,
      record,
    );
    // The API returns the uid; construct a minimal record to return
    return {
      id: res.uid,
      slug: res.uid,
      name: record.name,
      type: record.type,
      value: record.value,
      ttl: record.ttl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
}

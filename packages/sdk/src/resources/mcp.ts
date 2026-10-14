import type { HttpClient } from '../http';

export interface McpAuditEvent {
  id: string;
  toolName: string;
  caller: string;
  status: string;
  createdAt: string;
  [key: string]: unknown;
}

export class McpResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Generates the canonical MCP streamable HTTP endpoint URL
   */
  getEndpointUrl(baseUrl?: string): string {
    const base = baseUrl || this.http.options.baseUrl || '';
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}/api/mcp`;
  }

  /**
   * Fetch MCP audit events
   */
  async listAuditEvents(params?: { limit?: number; offset?: number }): Promise<McpAuditEvent[]> {
    return this.http.get<McpAuditEvent[]>('/api/mcp/audit-events', params);
  }
}

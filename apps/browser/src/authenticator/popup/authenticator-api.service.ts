import { Injectable } from "@angular/core";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";

import {
  AuthenticatorEntryRequest,
  AuthenticatorEntryResponse,
  AuthenticatorListResponse,
} from "../authenticator.models";

export type McpStatus = {
  enabled: boolean;
  configured: boolean;
  revoked: boolean;
  tokenId: string | null;
  label: string | null;
  keySalt: string | null;
  tokenEnc: string | null;
  entryCount: number;
};

export type McpIssuedToken = {
  token: string;
  tokenId: string;
  keySalt: string;
  cleared: Array<{ source: string; sourceId: string; alias: string }>;
};

export type McpEntrySummary = {
  id: string;
  source: string;
  sourceId: string;
  alias: string;
  algorithm: string;
  digits: number;
  period: number;
  steam: boolean;
};

export type McpEntryWrite = {
  alias: string;
  secretCt: string;
  issuerCt?: string;
  accountCt?: string;
  hostCt?: string;
  algorithm: string;
  digits: number;
  period: number;
  steam: boolean;
};

@Injectable({ providedIn: "root" })
export class AuthenticatorApiService {
  constructor(private apiService: ApiService) {}

  async list(): Promise<AuthenticatorEntryResponse[]> {
    const response = await this.apiService.send("GET", "/authenticator", null, true, true);
    return new AuthenticatorListResponse(response).data;
  }

  async get(id: string): Promise<AuthenticatorEntryResponse> {
    const response = await this.apiService.send(
      "GET",
      "/authenticator/" + encodeURIComponent(id),
      null,
      true,
      true,
    );
    return new AuthenticatorEntryResponse(response);
  }

  async create(request: AuthenticatorEntryRequest): Promise<AuthenticatorEntryResponse> {
    const response = await this.apiService.send("POST", "/authenticator", request, true, true);
    return new AuthenticatorEntryResponse(response);
  }

  async update(
    id: string,
    request: AuthenticatorEntryRequest,
  ): Promise<AuthenticatorEntryResponse> {
    const response = await this.apiService.send(
      "PUT",
      "/authenticator/" + encodeURIComponent(id),
      request,
      true,
      true,
    );
    return new AuthenticatorEntryResponse(response);
  }

  delete(id: string): Promise<void> {
    return this.apiService.send(
      "DELETE",
      "/authenticator/" + encodeURIComponent(id),
      null,
      true,
      false,
    );
  }

  mcpStatus(): Promise<McpStatus> {
    return this.apiService.send("GET", "/mcp/status", null, true, true);
  }

  createMcpToken(label: string): Promise<McpIssuedToken> {
    return this.apiService.send("POST", "/mcp/token", { label }, true, true);
  }

  putMcpTokenEnc(tokenEnc: string): Promise<void> {
    return this.apiService.send("PUT", "/mcp/token/enc", { tokenEnc }, true, false);
  }

  rotateMcpToken(): Promise<McpIssuedToken> {
    return this.apiService.send("POST", "/mcp/token/rotate", {}, true, true);
  }

  revokeMcpToken(): Promise<void> {
    return this.apiService.send("DELETE", "/mcp/token", null, true, false);
  }

  async listMcpEntries(): Promise<McpEntrySummary[]> {
    const response = await this.apiService.send("GET", "/mcp/entries", null, true, true);
    return (response?.data ?? []) as McpEntrySummary[];
  }

  putMcpEntry(source: string, sourceId: string, body: McpEntryWrite): Promise<McpEntrySummary> {
    return this.apiService.send(
      "PUT",
      "/mcp/entries/" + encodeURIComponent(source) + "/" + encodeURIComponent(sourceId),
      body,
      true,
      true,
    );
  }

  deleteMcpEntry(source: string, sourceId: string): Promise<void> {
    return this.apiService.send(
      "DELETE",
      "/mcp/entries/" + encodeURIComponent(source) + "/" + encodeURIComponent(sourceId),
      null,
      true,
      false,
    );
  }
}

export function isAuthenticatorUnsupported(error: unknown): boolean {
  return error instanceof ErrorResponse && error.statusCode === 404;
}

export function isMcpUnsupported(error: unknown): boolean {
  return error instanceof ErrorResponse && error.statusCode === 404;
}

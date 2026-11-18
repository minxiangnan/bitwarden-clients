import { Injectable } from "@angular/core";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";

import {
  AuthenticatorEntryRequest,
  AuthenticatorEntryResponse,
  AuthenticatorListResponse,
} from "../authenticator.models";

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
}

export function isAuthenticatorUnsupported(error: unknown): boolean {
  return error instanceof ErrorResponse && error.statusCode === 404;
}

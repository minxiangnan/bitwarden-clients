import { Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { UserId } from "@bitwarden/common/types/guid";
import { KeyService } from "@bitwarden/key-management";
// The MCP token is stored as a user-key EncString so another unlocked device can re-wrap entries.
// The server never receives the user key.
// eslint-disable-next-line no-restricted-imports
import { EncString, EncryptService, SymmetricCryptoKey } from "@bitwarden/legacy-crypto";

import { deriveMcpKey, mcpAad, normalizeAlias, sealField } from "../mcp/mcp-crypto";

import {
  AuthenticatorApiService,
  McpEntrySummary,
  McpStatus,
  isMcpUnsupported,
} from "./authenticator-api.service";

export type McpWrap = {
  sourceId: string;
  alias: string;
  secret: string;
  issuer: string;
  account: string;
  algorithm: string;
  digits: number;
  period: number;
  steam: boolean;
};

@Injectable({ providedIn: "root" })
export class McpAccessService {
  /** Plaintext token for this unlocked session. Not written to disk. */
  private token: string | null = null;
  private keySalt: string | null = null;

  constructor(
    private api: AuthenticatorApiService,
    private accountService: AccountService,
    private keyService: KeyService,
    private encryptService: EncryptService,
  ) {}

  async status(): Promise<McpStatus | "unsupported"> {
    try {
      return await this.api.mcpStatus();
    } catch (error) {
      if (isMcpUnsupported(error)) {
        return "unsupported";
      }
      throw error;
    }
  }

  async hasToken(): Promise<boolean> {
    return (await this.sessionToken()) != null;
  }

  /** Creates a token and returns the plaintext once. The extension keeps only the user-key wrap. */
  async createToken(): Promise<string> {
    const issued = await this.api.createMcpToken("extension");
    await this.remember(issued.token, issued.keySalt);
    return issued.token;
  }

  async rotateToken(): Promise<{ token: string; cleared: McpIssuedCleared[] }> {
    const issued = await this.api.rotateMcpToken();
    await this.remember(issued.token, issued.keySalt);
    return { token: issued.token, cleared: issued.cleared ?? [] };
  }

  async revokeToken(): Promise<void> {
    await this.api.revokeMcpToken();
    this.token = null;
    this.keySalt = null;
  }

  async findAuthenticator(sourceId: string): Promise<McpEntrySummary | null> {
    try {
      const entries = await this.api.listMcpEntries();
      return (
        entries.find((entry) => entry.source === "authenticator" && entry.sourceId === sourceId) ??
        null
      );
    } catch (error) {
      if (isMcpUnsupported(error) || (error instanceof ErrorResponse && error.statusCode === 404)) {
        return null;
      }
      throw error;
    }
  }

  async upsertAuthenticator(wrap: McpWrap): Promise<void> {
    const alias = normalizeAlias(wrap.alias);
    if (alias == null) {
      throw new Error("alias");
    }
    const material = await this.requireMaterial();
    const seal = (field: string, value: string) =>
      sealField(
        material.key,
        mcpAad(material.userId, "authenticator", wrap.sourceId, alias, field),
        value,
      );
    await this.api.putMcpEntry("authenticator", wrap.sourceId, {
      alias,
      secretCt: await seal("secret", wrap.secret),
      issuerCt: wrap.issuer ? await seal("issuer", wrap.issuer) : undefined,
      accountCt: wrap.account ? await seal("account", wrap.account) : undefined,
      algorithm: wrap.algorithm,
      digits: wrap.digits,
      period: wrap.period,
      steam: wrap.steam,
    });
  }

  async disableAuthenticator(sourceId: string): Promise<void> {
    try {
      await this.api.deleteMcpEntry("authenticator", sourceId);
    } catch (error) {
      if (isMcpUnsupported(error) || (error instanceof ErrorResponse && error.statusCode === 404)) {
        return;
      }
      throw error;
    }
  }

  private async remember(token: string, keySalt: string): Promise<void> {
    this.token = token;
    this.keySalt = keySalt;
    try {
      const userId = await this.requireUserId();
      const key = await this.userKey(userId);
      const tokenEnc = (await this.encryptService.encryptString(token, key)).toJSON();
      await this.api.putMcpTokenEnc(tokenEnc);
    } catch {
      // This unlocked session can still wrap entries. Another device needs a new token.
    }
  }

  private async sessionToken(): Promise<{ token: string; keySalt: string } | null> {
    if (this.token && this.keySalt) {
      return { token: this.token, keySalt: this.keySalt };
    }
    const status = await this.status();
    if (status === "unsupported" || !status.configured || !status.keySalt || !status.tokenEnc) {
      return null;
    }
    const userId = await this.requireUserId();
    const key = await this.userKey(userId);
    const token = await this.encryptService.decryptString(new EncString(status.tokenEnc), key);
    if (!token) {
      return null;
    }
    this.token = token;
    this.keySalt = status.keySalt;
    return { token, keySalt: status.keySalt };
  }

  private async requireMaterial(): Promise<{ key: CryptoKey; userId: string }> {
    const session = await this.sessionToken();
    if (session == null) {
      throw new Error("token");
    }
    return {
      userId: await this.requireUserId(),
      key: await deriveMcpKey(session.token, session.keySalt),
    };
  }

  private async requireUserId(): Promise<UserId> {
    const account = await firstValueFrom(this.accountService.activeAccount$);
    if (account?.id == null) {
      throw new Error("No active account.");
    }
    return account.id;
  }

  private async userKey(userId: UserId): Promise<SymmetricCryptoKey> {
    const userKey = await firstValueFrom(this.keyService.userKey$(userId));
    if (userKey == null) {
      throw new Error("User key is not available.");
    }
    return userKey as unknown as SymmetricCryptoKey;
  }
}

type McpIssuedCleared = { source: string; sourceId: string; alias: string };

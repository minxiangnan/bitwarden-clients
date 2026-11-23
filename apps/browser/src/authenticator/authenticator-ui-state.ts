const STORAGE_KEY = "zhAuthenticatorUi";

export type AuthenticatorSort = "manual" | "name" | "issuer";
export type AuthenticatorGroup = "none" | "issuer" | "tag";

export type AuthenticatorUiState = {
  sort: AuthenticatorSort;
  group: AuthenticatorGroup;
  recentIds: string[];
};

const DEFAULT_UI: AuthenticatorUiState = { sort: "manual", group: "none", recentIds: [] };

export function readAuthenticatorUi(storage: Pick<Storage, "getItem"> | null): AuthenticatorUiState {
  if (storage == null) {
    return { ...DEFAULT_UI, recentIds: [] };
  }
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "") as Partial<AuthenticatorUiState>;
    return {
      sort: parsed.sort === "name" || parsed.sort === "issuer" ? parsed.sort : "manual",
      group: parsed.group === "issuer" || parsed.group === "tag" ? parsed.group : "none",
      recentIds: Array.isArray(parsed.recentIds)
        ? parsed.recentIds.filter((id) => typeof id === "string").slice(0, 8)
        : [],
    };
  } catch {
    return { ...DEFAULT_UI, recentIds: [] };
  }
}

export function writeAuthenticatorUi(
  storage: Pick<Storage, "setItem"> | null,
  state: AuthenticatorUiState,
): void {
  storage?.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function rememberRecentId(ids: string[], id: string, limit = 5): string[] {
  return [id, ...ids.filter((item) => item !== id)].slice(0, limit);
}

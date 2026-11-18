import { svg } from "@bitwarden/assets/svg";

export const AuthenticatorInactive = svg`
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm.9 4.1v4.55l2.7 1.62-.72 1.2L11.2 13V7.6h1.7Z" class="tw-fill-fg-body"/>
  </svg>
`;

export const AuthenticatorActive = svg`
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm.9 4.1v4.55l2.7 1.62-.72 1.2L11.2 13V7.6h1.7Z" class="tw-fill-fg-brand"/>
  </svg>
`;

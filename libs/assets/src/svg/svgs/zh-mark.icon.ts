import { svg } from "../svg";

/** Compact mark for the private authenticator build. Not the Bitwarden shield. */
export const ZhMark = svg`
  <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <title>验证器版</title>
    <rect width="32" height="32" rx="8" fill="#C4532A"/>
    <path fill="#FAF9F5" fill-rule="evenodd" d="M11.6 9.4a4.4 4.4 0 1 0 .1 8.8h.2V16.8h7.6v2.6a1.15 1.15 0 0 0 2.3 0V16.8h2.2v1.7a1.05 1.05 0 0 0 2.1 0v-1.7h.2a1.2 1.2 0 0 0 0-2.4h-9.2a4.4 4.4 0 0 0-5.5-3M11.6 11.7a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2"/>
    <path d="M22.4 7.1a5 5 0 0 1 4.2 3" stroke="#F6E7DF" stroke-width="1.6" stroke-linecap="round" fill="none"/>
  </svg>
`;

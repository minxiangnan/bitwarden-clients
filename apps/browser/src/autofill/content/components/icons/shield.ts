import { css } from "@emotion/css";
import { html } from "lit";

import { IconProps } from "../common-types";
import { buildIconColorRule, ruleNames, themes } from "../constants/styles";

export function Shield({ ariaHidden = true, color, theme }: IconProps) {
  const shapeColor = color || themes[theme].brandLogo;

  return html`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 14 16"
      fill="none"
      aria-hidden="${ariaHidden}"
    >
      <rect width="14" height="16" rx="3.5" class=${css(buildIconColorRule(shapeColor, ruleNames.fill))} />
      <path
        fill="#FAF9F5"
        fill-rule="evenodd"
        d="M5.1 4.4a2.2 2.2 0 1 0 .05 4.4H5.3v-.8h3.8v1.3a.55.55 0 0 0 1.1 0V8h1v.8a.5.5 0 0 0 1 0V8h.1a.6.6 0 0 0 0-1.2H7.1A2.2 2.2 0 0 0 5.1 4.4m0 1.15a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1"
      />
      <path d="M10.2 3.2a2.4 2.4 0 0 1 2 1.4" stroke="#F6E7DF" stroke-width=".9" stroke-linecap="round" fill="none" />
    </svg>
  `;
}

import { Theme } from "@bitwarden/common/platform/enums";

import { IconProps } from "../common-types";

const lightTheme = {
  transparent: {
    hover: `rgb(0 0 0 / 0.02)`,
  },
  shadow: `rgba(168 179 200)`,
  primary: {
    100: `rgba(246, 231, 223)`,
    300: `rgba(217, 119, 87)`,
    600: `rgba(196, 83, 42)`,
    700: `rgba(163, 61, 34)`,
  },
  secondary: {
    100: `rgba(232, 230, 220)`,
    300: `rgba(176, 174, 165)`,
    500: `rgba(107, 103, 92)`,
    600: `rgba(92, 88, 78)`,
    700: `rgba(61, 57, 41)`,
  },
  success: {
    100: `rgba(213, 243, 216)`,
    600: `rgba(12, 128, 24)`,
    700: `rgba(8, 81, 15)`,
  },
  danger: {
    100: `rgba(246, 231, 223)`,
    600: `rgba(196, 83, 42)`,
    700: `rgba(163, 61, 34)`,
  },
  warning: {
    100: `rgba(255, 248, 228)`,
    600: `rgba(255, 191, 0)`,
    700: `rgba(172, 88, 0)`,
  },
  info: {
    100: `rgba(246, 231, 223)`,
    600: `rgba(196, 83, 42)`,
    700: `rgba(163, 61, 34)`,
  },
  art: {
    primary: `rgba(61, 57, 41)`,
    accent: `rgba(217, 119, 87)`,
  },
  text: {
    main: `rgba(61, 57, 41)`,
    muted: `rgba(92, 88, 78)`,
    contrast: `rgba(255, 255, 255)`,
    alt2: `rgba(255, 255, 255)`,
    code: `rgba(163, 61, 34)`,
  },
  background: {
    DEFAULT: `rgba(250, 249, 245)`,
    alt: `rgba(240, 238, 230)`,
    alt2: `rgba(196, 83, 42)`,
    alt3: `rgba(163, 61, 34)`,
    alt4: `rgba(92, 36, 20)`,
  },
  brandLogo: `rgba(196, 83, 42)`,
  passwordSpecial: `rgba(124, 47, 26)`,
  passwordNumber: `rgba(196, 83, 42)`,
};

const darkTheme = {
  transparent: {
    hover: `rgb(255 255 255 / 0.02)`,
  },
  shadow: `rgba(0, 0, 0)`,
  primary: {
    100: `rgba(92, 36, 20)`,
    300: `rgba(217, 119, 87)`,
    600: `rgba(217, 119, 87)`,
    700: `rgba(224, 139, 110)`,
  },
  secondary: {
    100: `rgba(61, 57, 41)`,
    300: `rgba(107, 103, 92)`,
    500: `rgba(176, 174, 165)`,
    600: `rgba(196, 193, 184)`,
    700: `rgba(232, 230, 220)`,
  },
  success: {
    100: `rgba(11, 111, 21)`,
    600: `rgba(107, 241, 120)`,
    700: `rgba(191, 236, 195)`,
  },
  danger: {
    100: `rgba(92, 36, 20)`,
    600: `rgba(217, 119, 87)`,
    700: `rgba(246, 231, 223)`,
  },
  warning: {
    100: `rgba(172, 88, 0)`,
    600: `rgba(255, 191, 0)`,
    700: `rgba(255, 248, 228)`,
  },
  info: {
    100: `rgba(92, 36, 20)`,
    600: `rgba(217, 119, 87)`,
    700: `rgba(250, 249, 245)`,
  },
  art: {
    primary: `rgba(250, 249, 245)`,
    accent: `rgba(217, 119, 87)`,
  },
  text: {
    main: `rgba(245, 244, 238)`,
    muted: `rgba(196, 193, 184)`,
    contrast: `rgba(20, 20, 19)`,
    alt2: `rgba(250, 249, 245)`,
    code: `rgba(224, 139, 110)`,
  },
  background: {
    DEFAULT: `rgba(38, 38, 36)`,
    alt: `rgba(48, 48, 46)`,
    alt2: `rgba(61, 57, 41)`,
    alt3: `rgba(92, 88, 78)`,
    alt4: `rgba(20, 20, 19)`,
  },
  brandLogo: `rgba(255, 255, 255)`,
  passwordSpecial: `rgba(227, 168, 142)`,
  passwordNumber: `rgba(217, 119, 87)`,
};

export const themes = {
  light: lightTheme,
  dark: darkTheme,

  // For compatibility
  system: lightTheme,
};

export const spacing = {
  4: `16px`,
  3: `12px`,
  2: `8px`,
  "1.5": `6px`,
  1: `4px`,
};

export const border = {
  radius: {
    large: `12px`,
    full: `9999px`,
  },
};

export const typography = {
  body1: `
    line-height: 24px;
    font-family: Inter, sans-serif;
    font-size: 16px;
  `,
  body2: `
    line-height: 20px;
    font-family: Inter, sans-serif;
    font-size: 14px;
  `,
  helperMedium: `
    line-height: 16px;
    font-family: Inter, sans-serif;
    font-size: 12px;
  `,
};

export const ruleNames = {
  fill: "fill",
  stroke: "stroke",
} as const;

type RuleName = (typeof ruleNames)[keyof typeof ruleNames];

/*
 * `color` is an intentionally generic name here, since either fill or stroke may apply, due to
 * inconsistent SVG construction. This consequently precludes dynamic multi-colored icons here.
 */
export const buildIconColorRule = (color: string, rule: RuleName = ruleNames.fill) => `
  ${rule}: ${color};
`;

export const resolveIconColor = ({ color, disabled, theme }: IconProps) =>
  disabled ? themes[theme].secondary["300"] : color || themes[theme].text.main;

export const animations = {
  spin: `
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(359deg);
    }
  `,
};

export function scrollbarStyles(theme: Theme, color?: { thumb?: string; track?: string }) {
  const thumbColor = color?.thumb || themes[theme].secondary["500"];
  const trackColor = color?.track || themes[theme].background.alt;

  return {
    /* FireFox & Chrome support */
    default: `
      scrollbar-color: ${thumbColor} ${trackColor};
    `,
    /* Safari Support */
    safari: `
      ::-webkit-scrollbar {
        overflow: auto;
      }
      ::-webkit-scrollbar-thumb {
        border-width: 4px;
        border-style: solid;
        border-radius: 0.5rem;
        border-color: transparent;
        background-clip: content-box;
        background-color: ${thumbColor};
      }
      ::-webkit-scrollbar-track {
        ${trackColor};
      }
      ::-webkit-scrollbar-thumb:hover {
        ${themes[theme].secondary["600"]};
      }
    `,
  };
}

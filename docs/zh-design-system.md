# 验证器版设计系统

Popup and the inline autofill menu share these tokens. The Android client should use the same hex values. There is no pure black. The darkest ink is a deep warm brown.

## Palette

| Token             | Hex       | Use                                         |
| ----------------- | --------- | ------------------------------------------- |
| `canvas`          | `#FAF9F5` | Page background                             |
| `surface`         | `#FFFDF8` | Cards, grouped lists, fields, dialogs       |
| `surface-muted`   | `#F0EEE6` | Segmented control track, pressed wells      |
| `primary`         | `#C4532A` | Terracotta. Buttons, active tab, focus      |
| `primary-pressed` | `#A33D22` | Hover and pressed primary                   |
| `primary-soft`    | `#F6E7DF` | Monogram, selected quiet chip               |
| `code`            | `#7C2F1A` | Authenticator digits, terracotta-brown      |
| `urgent`          | `#C2412D` | Countdown ring in the last 5 seconds        |
| `ink`             | `#3D3929` | Body text                                   |
| `ink-deep`        | `#2A261C` | Titles. Darkest color in the system         |
| `muted`           | `#5C584E` | Secondary text                              |
| `faint`           | `#8A8478` | Placeholders, section labels, quiet actions |
| `line`            | `#E8E6DC` | Hairline dividers and borders               |
| `on-primary`      | `#FFFDF8` | Text on terracotta                          |

Dark surfaces, when the theme is dark, stay warm: canvas `#2A261C`, surface `#3D3929`, line `#4A4538`, text `#F5F4EE`. Do not use `#000` or cool gray.

## Type

Inter, then PingFang SC and Noto Sans SC. Sizes: 12, 13, 14, 16, 20. Weights: 500 for row titles and quiet buttons, 600 for page titles and primary buttons. Codes use IBM Plex Mono, 18px, medium, tabular figures, tracking `0.06em`.

| Role          | Size | Weight |
| ------------- | ---- | ------ |
| Page title    | 20   | 600    |
| Section label | 12   | 600    |
| Row title     | 14   | 500    |
| Body          | 14   | 400    |
| Quiet control | 13   | 500    |
| Notes         | 12   | 400    |
| Code          | 18   | 500    |

## Spacing, radius, elevation

Spacing: 4, 8, 12, 16, 24. Row height for authenticator entries is 56. Settings rows are 48.

Radius: 8 for quiet buttons, 12 for fields, buttons, and grouped lists, 16 for the authenticator surface and dialogs. Search is a pill.

Elevation is a warm shadow, never a black one: `0 1px 2px rgb(61 57 41 / 0.05), 0 8px 24px rgb(61 57 41 / 0.06)`. Dragged rows lift with `0 10px 24px rgb(196 83 42 / 0.18)`.

## Icons, motion, states

Icons are the existing outline set (`bwi` / `bit-icon`) at 16px. New controls use `bit-icon`. Stroke weight reads as 1.5px. Do not mix filled and outline icons on one row.

Motion: 180ms, `cubic-bezier(0.2, 0, 0, 1)`. Reorder slides stay 200ms ease. `prefers-reduced-motion` removes lift and slide.

| State    | Treatment                                    |
| -------- | -------------------------------------------- |
| Hover    | Surface `#FBF6F3` or primary `#A33D22`       |
| Pressed  | Scale 0.98 on buttons                        |
| Focus    | 2px terracotta ring, 3px soft halo on fields |
| Disabled | 45% opacity, no shadow                       |

## Lists and empty states

Settings, vault rows, and security pages are one inset group: a single warm-white surface, 12px radius, hairline dividers, no box around each row.

Empty states are one 13px faint line, centered, with 48px of space above. No illustration and no extra border.

Authenticator rows sit in one 16px surface. A 32px monogram circle, 14/12 title and notes (one line, ellipsis), the code, then a 16px countdown ring. The header is the title, a search pill, a `自定义` / `A-Z` segment, and a quiet `排序` text button. Sort mode keeps the drag handle, pin, and 200ms slide.

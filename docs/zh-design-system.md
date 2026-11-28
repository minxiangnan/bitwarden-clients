# 验证器版设计系统

Popup and the inline autofill menu share these tokens. The Android client should use the same hex values. There is no pure black. The darkest ink is a deep warm brown.

## Palette

| Token             | Hex       | Use                                            |
| ----------------- | --------- | ---------------------------------------------- |
| `canvas`          | `#FBF6EF` | Page background                                |
| `surface`         | `#FFFDF9` | Cards, grouped lists, fields, dialogs          |
| `surface-muted`   | `#F3EBE1` | Segmented control track, pressed wells         |
| `primary`         | `#C2552D` | Terracotta fill. Buttons, active tab, focus    |
| `primary-pressed` | `#A44C2B` | Hover and pressed primary. Fill mixed with ink |
| `primary-soft`    | `#F3DFD4` | Selected quiet chip                            |
| `code`            | `#BA4E29` | Primary text, icons, and authenticator digits  |
| `urgent`          | `#C2412D` | Countdown ring in the last 5 seconds           |
| `ink`             | `#3B2A22` | Body text                                      |
| `ink-deep`        | `#2B1E19` | Titles. Darkest color in the system            |
| `muted`           | `#7A675B` | Secondary text                                 |
| `faint`           | `#AC9D91` | Placeholders, section labels, quiet actions    |
| `line`            | `#EADFD3` | Hairline dividers                              |
| `input`           | `#9E8676` | Field and search borders                       |
| `on-primary`      | `#FFFDF9` | Text on terracotta                             |

These light values match the Android client. Pressed is 78% fill mixed with ink. Soft is 86% canvas mixed with fill. Faint is 55% muted mixed with the line.

Dark theme: canvas `#241812`, surface `#32241C`, text `#F6EDE4`, muted `#C4A894`, primary `#E08A6C`. Derived: line `#5B493E`, pressed `#BE765C`, soft `#583A2E`, urgent `#D47D6D`, input `#6E5848`. Do not use `#000` or cool gray.

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

Elevation is a warm shadow, never a black one: `0 1px 2px rgb(59 42 34 / 0.05), 0 8px 24px rgb(59 42 34 / 0.06)`. Dragged rows lift with `0 10px 24px rgb(194 85 45 / 0.18)`.

## Icons, motion, states

Icons are the existing outline set (`bwi` / `bit-icon`) at 16px. New controls use `bit-icon`. Stroke weight reads as 1.5px. Do not mix filled and outline icons on one row.

Motion: 180ms, `cubic-bezier(0.2, 0, 0, 1)`. Reorder slides stay 200ms ease. `prefers-reduced-motion` removes lift and slide.

| State    | Treatment                                    |
| -------- | -------------------------------------------- |
| Hover    | Surface `#F8EEE6` or primary `#A44C2B`       |
| Pressed  | Scale 0.98 on buttons                        |
| Focus    | 2px terracotta ring, 3px soft halo on fields |
| Disabled | 45% opacity, no shadow                       |

## Lists and empty states

Settings, vault rows, and security pages are one inset group: a single warm-white surface, 12px radius, hairline dividers, no box around each row.

Empty states are one 13px faint line, centered, with 48px of space above. No illustration and no extra border.

Authenticator rows sit in one 16px surface. The full name and the full notes wrap; nothing is clipped. The code sits on the right with a 16px countdown ring, then the row menu. There is no favorite star and no favorites filter. The header is the title and a search pill. Order is always the custom `zh.totp.order`. A 400ms press-and-hold starts a drag; other rows slide aside in 200ms. A short click still copies the code and slides a cream pill in from the top (`已复制验证码`). It fades after 1.5s. Reduced motion skips the slide.

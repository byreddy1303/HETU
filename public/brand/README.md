# rebuild

**Every mistake. One step higher.**

The selected identity is the Damaru (hourglass drum), enclosed by a ring and
topped with a flame. The desktop app uses its outlined form beside a lowercase
blue wordmark. The tagline sits below the sidebar brand, on the loading screen,
in Settings, and in the daily brief.

## Editable sources

- `rebuild-mark.svg`: transparent outline; cobalt `#244ED0`, coral `#D9574C`.
  Dark appearance uses pale blue `#A6BFFF` and coral `#F28378` for contrast.
- `rebuild-wordmark.svg`: vector outlines traced from the approved lettering,
  preserving its shapes without depending on a substitute font. The component
  uses it as a CSS mask so the color follows the app's theme.
- `rebuild-icon.svg`: ivory `#FAF6EB` and coral outlines on midnight `#192844`.
  The PNG exports supply desktop, PWA, touch, and notification icons.

The approved card and generated outline reference are retained in
[`docs/brand`](../../docs/brand). The production emblem is a clean SVG redraw.
The outline-generation prompt was:

> Extract only the large emblem from the selected card. Remove all text and
> background; use a truly transparent background. Convert the drum and flame
> to hollow outlines while preserving their silhouettes and arrangement.
> Use navy #192844 for ring, body and cord, and coral #D9574C for rims, flame
> and pellet. Keep uniform stroke weights. Do not redesign the emblem.

Rasterize the icon SVG at 192, 512, and 1024 pixels. Touch icons use an opaque
square background. Maskable icons center the emblem at 70% scale on an opaque
square. The notification badge uses white shapes on transparency at 96 pixels.

## Existing desktop installations

The product and window name are `rebuild`; the application identifier remains
`com.hetu.app`. The local profile and SQLite database remain in
`~/Library/Application Support/hetu/hetu.db`. Existing `HETU_*` environment
settings, API arguments, browser storage keys, and the daily-brief LaunchAgent
identifier remain compatible. This rebrand requires no data migration.

Legacy HETU assets are retained for older/native builds. This change ships the
local desktop identity and does not deploy or access a hosted workspace.

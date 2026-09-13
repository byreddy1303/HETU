# HETU Cobalt & Gold icon

`hetu-cobalt.svg` is the editable web icon source. It preserves the HETU symbol
from Android's `hetu_launcher_foreground.xml` in a cobalt tile (`#244ED0`), with
a white symbol and gold diamond (`#FFD166`).

The PNG exports in `public/` are derived from this SVG:

- `hetu-cobalt-192.png` and `hetu-cobalt-512.png`: original rounded tile.
- `hetu-cobalt-apple-touch-icon.png`: 180 px, square opaque background for iOS masking.
- `hetu-cobalt-maskable-512.png`: square opaque background; symbol transform
  `translate(17.28 17.28) scale(.68)` keeps it inside the maskable safe zone.
- `hetu-notification-badge.png`: 96 px, white symbol on transparency for system tinting.

Rasterize the SVG at each target size with an SVG renderer such as Sharp.
Versioned asset names let browsers fetch the new identity after an app update.
Native Android launcher resources are packaged separately in the APK.

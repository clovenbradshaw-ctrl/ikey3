# ikey3

## Configuring the Viewer URL

`client-qr-creator.html` builds QR codes that point to a viewer page. The base
URL for this viewer is derived from the current location:

```js
const VIEWER_URL = window.IKEY3_VIEWER_URL || new URL('../', window.location.href).href;
```

To target a different viewer in another environment, define a global
`IKEY3_VIEWER_URL` before the page's script runs:

```html
<script>window.IKEY3_VIEWER_URL = 'https://example.com/ikey3/';</script>
```

This overrides the default and ensures generated URLs and on‑page messaging use
the specified base path.


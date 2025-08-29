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

## PIN Encryption

When generating a QR record you must provide a 6-digit PIN. This PIN derives an
AES-GCM key via PBKDF2 and encrypts the private portion of the record. The salt
and ciphertext are stored with the record but the raw PIN or derived key are
never saved. If the PIN is lost the data cannot be recovered.


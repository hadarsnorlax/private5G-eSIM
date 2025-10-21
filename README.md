# Event Private 5G — eSIM Helper

Single-page helper app to guide users through eSIM install + settings.

## How to use
1. Publish a Google Sheet as CSV (headers in `examples/esim-sample.csv`).
2. Set the CSV URL in `assets/js/config.js` (or pass `?csv=<url>`).
3. Deploy with GitHub Pages or Netlify.
4. Share `https://<site>/?id=<participant-code>` or the generic URL (users enter the code).

## Develop
Static site. No build step. Update files and push.

## Deploy (GitHub Pages)
- Settings → Pages → Deploy from `main` → root.

# Static PWWE dosing calculator demo

This is a browser-only static web demo for GitHub Pages or Netlify.

All calculations run in the visitor's browser. The host only serves static files:

- `index.html`
- `style.css`
- `app.js`
- `data/model_config.json`
- `data/deidentified_examples.csv`

No input values are uploaded to a server.

## Local preview

Because the page reads files from `data/`, preview it with a tiny local web server rather than double-clicking `index.html`.

```powershell
cd D:\2-EP\PWWE\dose_adjustment_model_20260606\clinical_dosing_static_demo
python -m http.server 8088
```

Open:

```text
http://127.0.0.1:8088
```

## Deploy with GitHub Pages

1. Create a new public or private GitHub repository, for example `pwwe-tdm-calculator-demo`.
2. Upload the **contents** of this folder to the repository root.
3. In GitHub, go to **Settings > Pages**.
4. Under **Build and deployment**, select:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
5. Wait for GitHub to publish the site. The final URL will look like:

```text
https://YOUR_USERNAME.github.io/pwwe-tdm-calculator-demo/
```

## Deploy with Netlify

Fastest method:

1. Go to Netlify.
2. Choose **Add new site > Deploy manually**.
3. Drag this entire folder into the upload area.
4. Netlify will give you a public URL immediately.

More reproducible method:

1. Push this folder to GitHub.
2. In Netlify, choose **Import from Git**.
3. Select the repository.
4. Build command: leave blank.
5. Publish directory: `/`.

## Recommended conference disclaimer

This web calculator is an exploratory research demonstration based on sparse trough therapeutic drug monitoring, Stan popPK stage priors, and MAP individualization. It is not a standalone prescribing tool. Dose adjustment requires clinical review and TDM confirmation.

## When to prefer this over shinyapps.io

Use this static version if you want the safest and easiest public demo. It has no server-side computation, no login requirement for viewers, and no risk of collecting visitor-entered values. Use Shiny only if you later need server-side plotting, richer interactivity, or user sessions.

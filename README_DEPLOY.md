# Updated PWWE static calculator

This package is a complete browser-only GitHub Pages app. It uses the independent sparse-TDM MAP model and revised no-absolute-ceiling candidate rules. It is a research demonstration, not a standalone prescribing tool.

## Preview

From this directory:

```sh
python -m http.server 8088 --bind 127.0.0.1
```

Open http://127.0.0.1:8088. Use an HTTP server because configuration and examples are loaded with fetch.

## Update GitHub Pages

1. Keep a Git commit or backup of the existing website before replacing its files.
2. Copy this directory's contents into the existing Pages publishing folder. Include the new `engine.js` as well as `index.html`, `app.js`, `style.css` and the complete `data/` directory.
3. Commit/push through the repository's normal review process. Keep its existing Pages deployment settings.
4. After the Pages build completes, reload the site and verify the version `Independent MAP | no absolute ceiling | 2026-09-11`.
5. Verify the synthetic high-risk LTG case: baseline dose150, target10, current dose450, current trough2, stageT2, no earlier measurements. Expected candidate500 mg/day, increase50 mg/day, predicted RTC0.222 (rounded).

Do not upload the parent analysis folder, original clinical workbooks or regression inputs. This package contains only fitted model parameters and synthetic examples. Visitor inputs are processed in-browser, with no analytics or input transmission.

Earlier measurements must be actual earlier observations from the same pregnancy and drug. The current observation is included once. Relative-increase and step parameters apply before rounding; outputs are not subject to fixed2500/300 mg/day ceilings.

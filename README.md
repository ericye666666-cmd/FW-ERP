# FW-ERP Frontend

This project is the FW-ERP / Direct Loop operations frontend.

## Open the clickable preview (non-developer steps)

After this is merged into `main`, you can open a browser preview without running code locally.

1. Open this repository on GitHub.
2. Go to **Settings** → **Pages**.
3. Set **Source** to **GitHub Actions** (one-time setup).
4. Open the **Actions** tab and wait for **Deploy to GitHub Pages** to finish.
5. Open this URL in your browser:
   - `https://<your-github-username-or-org>.github.io/FW-ERP/`

You can now click through the existing FW-ERP pages in the browser preview.


## Project brain (planning source-of-truth)

Before planning or implementation, review the project-brain docs:

- [docs/project-brain/](docs/project-brain/)
- [Project brain overview](docs/project-brain/README.md)

## Local development (optional)

```bash
npm ci
npm run dev
```

## Build check

```bash
npm run build
```

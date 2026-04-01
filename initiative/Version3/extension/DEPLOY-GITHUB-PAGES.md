# Deploy Shadow Study V3 to GitHub Pages (granular steps)

Forma needs an **`https://…github.io/…`** URL, not `https://github.com/...`. This repo includes a workflow that builds the extension and publishes it automatically.

## Pick this in Settings (your “step 2”)

1. Open the repo on GitHub: `https://github.com/kronz/ShadowStudies`
2. Go to **Settings** → **Pages** (left sidebar).
3. Under **Build and deployment** → **Source**, choose **GitHub Actions**  
   - Do **not** choose “Deploy from a branch” unless you want to publish files by hand.  
   - **GitHub Actions** means: “when the workflow runs, take its upload and publish it.”

You only set Source to **GitHub Actions** once. After that, every successful workflow run updates the site.

## One-time: push the workflow

1. Commit and push these files to `master` (or `main`):
   - `.github/workflows/deploy-shadow-study-v3-pages.yml`
   - `initiative/Version3/extension/vite.config.ts` (uses `VITE_BASE_PATH` when building on CI)
2. On GitHub, open the **Actions** tab. You should see **Deploy Shadow Study V3 (GitHub Pages)**.
3. Wait for the run to finish green. If it fails, open the job log and read the error (often missing `package-lock.json` or Node issues).

## After the first successful deploy

1. Go back to **Settings** → **Pages**. GitHub shows the live site URL, usually:
   - `https://kronz.github.io/ShadowStudies/`
2. Open that URL in a normal browser tab. You should see the extension UI (not a 404).
3. In **Autodesk APS** → your app → extension URL for the embedded view, set:
   - `https://kronz.github.io/ShadowStudies/`  
   (trailing slash is fine; must be **github.io**, not **github.com**.)

## If you rename the GitHub repo

Project Pages URLs use the repo name. Edit the workflow file and change:

`VITE_BASE_PATH: /ShadowStudies/`

to `/<NewRepoName>/` (leading slash, trailing slash).

## Local vs CI builds

- **Local** (`npx vite` / `npm run build` with no env): `base` stays `./` — fine for localhost.
- **CI**: the workflow sets `VITE_BASE_PATH=/ShadowStudies/` so assets load under the project path.

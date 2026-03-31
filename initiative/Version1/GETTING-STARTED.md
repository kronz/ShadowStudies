# Getting Started — Shadow Study Extension V2

This guide is written for **product managers and product experts**, not software engineers. It assumes you have no prior experience with Node.js, TypeScript, or Forma extension development. Follow the steps in order.

---

## Prerequisites

You need three things installed on your machine:

### 1. Node.js (version 18 or higher)

Node.js is the runtime that lets you run JavaScript/TypeScript code on your computer.

**Check if you have it:**
Open a terminal (PowerShell on Windows, Terminal on Mac) and run:
```
node --version
```
If you see something like `v18.x.x` or `v20.x.x` or higher, you're good. If you get an error, install it:

**Install:** Go to [https://nodejs.org](https://nodejs.org) and download the LTS (Long Term Support) version. Run the installer with default settings.

### 2. Cursor (your IDE)

You're likely reading this inside Cursor already. If not, download it from [https://cursor.sh](https://cursor.sh).

### 3. Access to Autodesk Forma

You need a Forma account and access to at least one project with buildings in it. You'll also need access to the [APS Developer Portal](https://aps.autodesk.com/) to register your local extension.

---

## Step-by-Step Setup

### Step 1: Open the project in Cursor

Open the `ShadowStudies` folder in Cursor. The full project tree will appear in the sidebar.

### Step 2: Install dependencies

Open a terminal in Cursor (press `` Ctrl+` `` or go to Terminal → New Terminal). Then run:

```
cd initiative/Version1/extension
npm install
```

This downloads all the libraries the extension needs. It may take a minute. You'll see a `node_modules` folder appear — that's normal, don't touch it.

**If you see warnings** about deprecated packages or vulnerabilities, you can ignore them for now. The important thing is that the command finishes without red `ERR!` messages.

### Step 3: Start the dev server

In the same terminal, run:

```
npx vite
```

You should see output like:
```
VITE v5.4.11  ready in 2700 ms

  ➜  Local:   http://localhost:8081/
```

**Leave this terminal running.** The dev server must stay active while you're testing. It serves the extension to Forma.

> **Note for Windows users:** The `npm start` command in package.json uses Unix syntax that doesn't work in PowerShell. Always use `npx vite` instead.

### Step 4: Register your extension in Forma

1. Go to the [APS Developer Portal](https://aps.autodesk.com/) and sign in
2. Navigate to your Forma application (or create one)
3. Add a new extension with these settings:
   - **URL**: `http://localhost:8081`
   - **Placement**: `RIGHT_MENU_ANALYSIS_PANEL`
   - Give it a name you'll recognize (e.g., "Shadow Study V2 - Local Dev")
4. Save the extension

### Step 5: Open Forma and test

1. Open any Forma project that has buildings in it
2. Look for the **analysis panel on the right side** of the screen
3. You should see "Shadow study v2" appear as an option
4. Click it to open the extension

### Step 6: Try the basic workflow

1. **Export mode toggle**: You'll see two buttons at the top — "3×3 Matrix" and "Custom Range"
2. **Color controls**: Below the mode selector, you can set colors for context buildings, design buildings, context shadows, and design shadows
3. **Shadow Preview**: Click the "Shadow Preview" button to see colored shadows rendered in the 3D scene
4. **Export**: Click "Export" to generate images with shadow recoloring

---

## Common Issues

### "The extension doesn't appear in Forma"

- Make sure your dev server is still running (check the terminal for the `http://localhost:8081` message)
- Make sure the extension URL in the APS portal is exactly `http://localhost:8081` (no trailing slash)
- Try refreshing the Forma page (Ctrl+R / Cmd+R)
- Check that the placement is set to `RIGHT_MENU_ANALYSIS_PANEL`

### "npm install fails with errors"

- Make sure you're in the right directory: `initiative/Version1/extension/`
- Make sure Node.js is installed (run `node --version`)
- If you see version conflicts, delete the `node_modules` folder and the `package-lock.json` file, then run `npm install` again

### "The build breaks when I change code"

- The dev server shows errors in real-time in the terminal. Read the error message — it usually points to the exact file and line.
- If you see a `TypeError: Cannot use 'in' operator` error, the `@preact/preset-vite` and `vite` versions may have drifted. The working versions are pinned in `package.json` — run `npm install` to restore them.

### "Shadow colors look wrong in exports"

- The shadow detection algorithm has threshold values that need tuning for your specific scene. The key constants are in `src/lib/shadow-diff.ts`:
  - `SHADOW_DIFF_THRESHOLD = 15` — how much darker a pixel must be to count as "shadow"
  - `CONTEXT_SHADOW_LUMINANCE_CEILING = 180` — how dark a pixel must be to count as "context shadow"
- Try adjusting these values and re-exporting. Ask the AI assistant for help if you're unsure.

### "Shadow preview looks blocky/pixelated"

- This is expected. The live preview uses a grid-based approach (sun analysis data) which is inherently lower resolution than the pixel-perfect export approach. The export images will look much better.

---

## Making Changes

You don't need to be an engineer to make useful changes. Here are common tasks:

### Changing default colors
Open `src/app.tsx` and look for the `shadowSettings` state near the top. You'll see hex color values like `"#999999"` and `"#3366cc"` — change these to your preferred defaults.

### Changing the matrix times
Open `src/components/MatrixSelector.tsx` and look for the `SEASONS` constant and the default hours (`morningHour: 9`, `noonHour: 12`, `eveningHour: 15`).

### Adjusting shadow detection sensitivity
Open `src/lib/shadow-diff.ts` and adjust:
- `SHADOW_DIFF_THRESHOLD` — increase to be more selective (fewer false positives), decrease to catch more shadows
- `CONTEXT_SHADOW_LUMINANCE_CEILING` — increase to classify more pixels as context shadow, decrease for fewer

### Adjusting live preview sensitivity
Open `src/lib/shadow-preview.ts` and adjust `SUN_HOURS_SHADOW_THRESHOLD` — lower values mean only deeply shadowed areas are colored, higher values color lightly shadowed areas too.

---

## Deploying for Others to Use (Without Publishing)

When the extension is ready for others to test:

1. **Host the built files** on any static web server (GitHub Pages, Vercel, Netlify, Azure Static Web Apps)
2. Build the production files: `npx vite build` — this creates a `dist/` folder
3. Upload the `dist/` folder contents to your hosting provider
4. In the APS Developer Portal, update the extension URL to your hosted URL (e.g., `https://your-org.github.io/shadow-study-v2/`)
5. Share the **Extension ID** from the APS portal with anyone who should have access — they can add it to their Forma account without the extension being publicly published

---

## Project Documentation

| Document | What it's for |
|----------|--------------|
| `README.md` | Project overview and architecture |
| `GETTING-STARTED.md` | This file — setup instructions |
| `CLAUDE.md` | Living project doc — decisions, status, blockers, learnings |
| `Shadow-Extension-Meeting-Summary-20260316.md` | Meeting notes from the kickoff discussion |
| `Shadow Extension (1).docx` | Full transcript of the requirements discussion |

---

## Getting Help

Open the AI chat in Cursor and describe what you need. The AI has full context about this project and can help with:
- Explaining what any piece of code does
- Making changes to the extension
- Debugging issues
- Understanding the Forma SDK

Just describe what you want in plain language — you don't need to speak code.

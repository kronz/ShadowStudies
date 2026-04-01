import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Local dev: "./"  |  GitHub Pages project site: set VITE_BASE_PATH=/RepoName/ (see .github/workflows)
const base = process.env.VITE_BASE_PATH?.trim() || "./";

// https://vitejs.dev/config/
export default defineConfig({
  base,
  plugins: [preact()],
  server: {
    port: 8081,
  },
});

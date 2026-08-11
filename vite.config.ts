import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { THEME_INIT_SCRIPT } from "./themeInit";

const host = (import.meta as any).env?.TAURI_DEV_HOST;

function themeInitPlugin() {
  return {
    name: "theme-init",
    transformIndexHtml(html: string) {
      return html.replace(
        '</head>',
        `    <script>${THEME_INIT_SCRIPT}</script>\n  </head>`
      );
    },
  };
}

export default defineConfig(async () => ({
  plugins: [react(), themeInitPlugin()],
  assetsInclude: ['**/*.svg'],
  clearScreen: false,
  server: {
    port: 3030,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 3031,
      }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));

import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  resolve: {
    alias: {
      "@bta/ui": path.resolve(__dirname, "../../shared-ui/components"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true
  }
});

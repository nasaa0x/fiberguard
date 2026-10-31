import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:5001" },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(leaflet|react-leaflet|@react-leaflet)\//.test(id))
            return "maps";
          if (/node_modules\/(recharts|d3-|@reduxjs|immer)/.test(id))
            return "charts";
          if (/node_modules\/(framer-motion|motion-)/.test(id)) return "motion";
        },
      },
    },
  },
});

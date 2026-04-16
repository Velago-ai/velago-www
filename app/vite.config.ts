import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "src/assets"),
      "@workspace/api-client-react": path.resolve(import.meta.dirname, "../lib/api-client-react/src")
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "wouter", "@tanstack/react-query"],
          ui: ["lucide-react", "framer-motion"]
        }
      }
    }
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    host: "0.0.0.0",
    fs: {
      allow: ["../"]
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "wouter", "@tanstack/react-query"]
  }
});

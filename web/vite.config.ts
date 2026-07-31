import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'https://localhost:8443', secure: false },
      '/ws': { target: 'wss://localhost:8443', secure: false, ws: true },
    },
  },
});

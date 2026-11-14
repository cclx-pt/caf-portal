import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Publicado em https://cclx-pt.github.io/poc-portalcaf/
export default defineConfig({
  base: '/poc-portalcaf/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
});

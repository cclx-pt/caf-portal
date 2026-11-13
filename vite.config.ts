import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Publicado em https://cclx-pt.github.io/caf-portal/
export default defineConfig({
  base: '/caf-portal/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
});

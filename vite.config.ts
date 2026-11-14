import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Publicado em https://portalcaf.cclx.pt/ (domínio próprio no GitHub Pages)
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
});

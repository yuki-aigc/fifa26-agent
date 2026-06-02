import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: './src/test/setup.js',
  },
  server: {
    proxy: {
      '/api':    'http://localhost:8787',
      '/health': 'http://localhost:8787',
      '/docs':   'http://localhost:8787',
    },
  },
});

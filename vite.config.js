import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5199,
    proxy: {
      '/lineage': { target: process.env.VITE_LINEAGE_TARGET || 'http://127.0.0.1:5197', changeOrigin: true },
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3000',
        secure: false,
        changeOrigin: true,
      },
    },
  },
});

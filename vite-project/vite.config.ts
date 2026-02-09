import { defineConfig } from 'vite'

export default defineConfig({
  envDir: '.', // Load .env from project root so VITE_* vars are embedded in build for S3
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    }
  },
  base: './', // Relative paths so dist works when served from S3 (or any subpath)
})

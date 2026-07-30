import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8080'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Stable filenames for the entry bundle and its stylesheet. Hashed
        // entry names are the usual default, but they make every update a
        // cliff: a browser holding a cached index.html asks for a hash the new
        // release does not contain and the app renders nothing. With a fixed
        // name the document always points at a file that exists, and nginx
        // revalidates it on each load. Chunks and fonts keep their hashes, so
        // they can still be cached forever.
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: info => {
          const name = info.name || (info.names && info.names[0]) || ''
          return name.endsWith('.css') ? 'assets/index.css' : 'assets/[name]-[hash][extname]'
        }
      }
    }
  }
})

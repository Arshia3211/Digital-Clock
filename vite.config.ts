import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // three is deliberately a large chunk. It is also lazily loaded and never
    // on the critical path, so the default warning is noise here.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        /*
         * Explicit, so the split is deterministic and the critical path can be
         * stated as a number rather than guessed at:
         *
         *   react + index + css  -> the shell. Paints a correct clock.
         *   three + r3f + Scene  -> lazy. Arrives afterwards and fades in.
         */
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three'
          if (id.includes('@react-three')) return 'r3f'
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
        },
      },
    },
  },
})

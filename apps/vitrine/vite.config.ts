import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// A vitrine mostra a versão do Design System (a do @betinhos/ui) e a data do build.
const ui = JSON.parse(readFileSync(new URL('../../packages/ui/package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(ui.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  build: { outDir: 'dist', emptyOutDir: true },
})

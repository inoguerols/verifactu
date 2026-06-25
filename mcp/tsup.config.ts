import { defineConfig } from 'tsup'

// Config propia del subpaquete para que tsup NO herede la del repo raíz
// (en CI el node_modules raíz no está instalado y la resolución falla).
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
})

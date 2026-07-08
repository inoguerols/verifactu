import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/mcp.ts', 'src/sqlite-store.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
})

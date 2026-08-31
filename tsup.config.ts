import { defineConfig } from 'tsup'
import { version } from './package.json'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/mcp.ts', 'src/sqlite-store.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  define: { __VERIFACTU_VERSION__: JSON.stringify(version) },
})

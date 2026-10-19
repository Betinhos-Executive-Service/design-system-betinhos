import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// Gera o logger de erros em JS puro: ESM (bundlers sem TypeScript) e IIFE (HTML único, global BetinhosErrorLogger).
// dist/ é versionado: o CI confere que está em dia e telas sem npm copiam o IIFE direto do repo.
const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = (await import('../package.json', { with: { type: 'json' } })).default
const common = {
  absWorkingDir: root,
  entryPoints: ['src/errorLogger.ts'],
  bundle: true,
  target: 'es2019',
  legalComments: 'none',
  banner: { js: `/* @betinhos-executive-service/ui ${pkg.version} · error-logger. Gerado por scripts/build-error-logger.mjs; não edite. */` },
  logLevel: 'warning',
}

await build({ ...common, format: 'esm', outfile: 'dist/error-logger.js' })
await build({ ...common, format: 'iife', globalName: 'BetinhosErrorLogger', outfile: 'dist/error-logger.iife.js' })
console.log('dist/error-logger.js e dist/error-logger.iife.js gerados.')

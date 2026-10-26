/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { playwright } from '@vitest/browser-playwright'
import { rewriteDevApi } from './server/dev-api'

function cmamsDevApi(mode: string): Plugin {
  return {
    name: 'cmams-dev-api',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '')
      for (const key of ['DATABASE_URL', 'SESSION_SECRET']) {
        if (!process.env[key] && env[key]) process.env[key] = env[key]
      }
      server.middlewares.use(async (req, res, next) => {
        const rewritten = req.url ? rewriteDevApi(req.url) : null
        if (!rewritten) {
          next()
          return
        }
        req.url = rewritten
        const mod = await server.ssrLoadModule('/api/index.ts')
        await (mod.default as (req: unknown, res: unknown) => Promise<void>)(
          req,
          res
        )
      })
    },
  }
}

const nodeTests = [
  'server/**/*.test.ts',
  'api/**/*.test.ts',
  'cmams-routes.test.ts',
  'src/lib/cmams-api.test.ts',
  'src/features/cmams/access.test.ts',
  'src/features/cmams/scan-lock.test.ts',
  'src/components/layout/data/sidebar-data.cmams.test.ts',
]

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    cmamsDevApi(mode),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    silent: 'passed-only',
    unstubEnvs: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: nodeTests,
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: nodeTests,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(
              process.env.CI
                ? undefined
                : { launchOptions: { channel: 'chrome' } }
            ),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    coverage: {
      exclude: [
        'src/components/ui/**',
        'src/assets/**',
        'src/tanstack-table.d.ts',
        'src/routeTree.gen.ts',
        'src/test-utils/**',
        'src/routes/**',
      ],
    },
  },
}))

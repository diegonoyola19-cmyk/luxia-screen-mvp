/// <reference types="vitest" />
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

function apiDevMiddleware(): Plugin {
  return {
    name: 'api-serverless-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/sync-inventory')) {
          try {
            const { default: handler } = await server.ssrLoadModule('/api/sync-inventory.ts');
            await handler(req as any, res as any);
          } catch (err: any) {
            console.error('[ViteDevServer] /api/sync-inventory error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Dev server error' }));
          }
          return;
        }

        if (req.url?.startsWith('/api/cron/sync-inventory')) {
          try {
            const { default: handler } = await server.ssrLoadModule('/api/cron/sync-inventory.ts');
            await handler(req as any, res as any);
          } catch (err: any) {
            console.error('[ViteDevServer] /api/cron/sync-inventory error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Dev server error' }));
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const localEnv = parseEnvFile(path.resolve(process.cwd(), '.env.local'));
  const stdEnv = loadEnv(mode, process.cwd(), '');
  // Populate process.env for server handlers in dev
  Object.assign(process.env, stdEnv, localEnv);

  return {
    plugins: [react(), apiDevMiddleware()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/setupTests.ts'],
    },
  };
});

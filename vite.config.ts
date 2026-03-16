import fs from 'fs';
import path from 'path';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const devPort = 3000;
  const certDir = path.resolve(__dirname, '.cert');
  const pfxPath = path.resolve(certDir, 'local-dev.pfx');
  const passPath = path.resolve(certDir, 'local-dev.pass');
  const httpsOptions =
    fs.existsSync(pfxPath) && fs.existsSync(passPath)
      ? {
          pfx: fs.readFileSync(pfxPath),
          passphrase: fs.readFileSync(passPath, 'utf8').trim()
        }
      : undefined;
  const devHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  };
  const hmrOptions =
    process.env.DISABLE_HMR === 'true'
      ? false
      : {
          protocol: httpsOptions ? 'wss' : 'ws',
          clientPort: devPort,
          port: devPort,
          timeout: 120000,
          overlay: true
        };

  return {
    plugins: [vue()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      preserveSymlinks: true,
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    server: {
      host: '::',
      port: devPort,
      strictPort: true,
      https: httpsOptions,
      headers: devHeaders,
      hmr: hmrOptions,
      allowedHosts: true
    },
    preview: {
      host: '::',
      headers: devHeaders,
      https: httpsOptions,
      allowedHosts: true
    }
  };
});

import fs from 'fs';
import path from 'path';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
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
      https: httpsOptions,
      hmr: process.env.DISABLE_HMR !== 'true',
      allowedHosts: true
    },
    preview: {
      host: '::',
      https: httpsOptions,
      allowedHosts: true
    }
  };
});

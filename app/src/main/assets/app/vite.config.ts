import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

type BuildTarget = 'android' | 'web';

function getBuildTarget(): BuildTarget {
  return process.env.FM_BUILD_TARGET === 'web' ? 'web' : 'android';
}

export default defineConfig(({ command }) => {
  const buildTarget = getBuildTarget();
  const isBuildCommand = command === 'build';

  return {
    plugins: [svelte()],
    build: {
      outDir: buildTarget === 'web' ? 'dist' : '../www',
      emptyOutDir: true,
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          manualChunks: undefined
        }
      }
    },
    base: isBuildCommand && buildTarget === 'android' ? './' : '/',
    resolve: {
      alias: {
        '$lib': path.resolve('./src/lib')
      }
    }
  };
});


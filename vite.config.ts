import { defineConfig } from 'vite';
import { sweepCachePlugin } from './vite-sweep-cache.ts';

export default defineConfig({
  base: './',
  plugins: [sweepCachePlugin()],
  build: { rolldownOptions: { input: ['index.html', 'chassis.html', 'board.html', 'observe.html', 'simulate.html', 'sweep.html'] } },
});

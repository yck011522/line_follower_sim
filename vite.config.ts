import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { rolldownOptions: { input: ['index.html', 'chassis.html'] } },
});

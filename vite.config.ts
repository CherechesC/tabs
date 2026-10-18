import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        dashboard: 'index.html',
        background: 'src/background.ts',
      },
      output: {
        entryFileNames: 'assets/[name].js',
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})

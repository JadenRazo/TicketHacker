import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  server: { port: 5174, host: '0.0.0.0', allowedHosts: ['tickets.jadenrazo.dev'] },
  build: {
    lib: {
      entry: 'src/main.tsx',
      name: 'TicketHackerWidget',
      fileName: 'widget',
      formats: ['iife'],
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
})

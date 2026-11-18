import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from 'vite-tsconfig-paths'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  // Necessário para GitHub Pages em repositórios que não sejam username.github.io.
  base: './',
  plugins: [
    react(),
    tsconfigPaths(),
    glsl({
      warnDuplicatedImports: true,
      removeDuplicatedImports: true,
    }),
  ],
})

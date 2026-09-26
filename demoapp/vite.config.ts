import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react()], server: { host: 'localhost', port: Number(env.APP_PORT || 5173), strictPort: true } }
})

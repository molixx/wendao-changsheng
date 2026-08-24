import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // 相对路径 base：Capacitor（安卓 WebView 用 capacitor://localhost）加载时，绝对路径 /assets 会 404
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
})

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5000',
    },
  },
  build: {
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'index.html'),
        employees: resolve(__dirname, 'employees.html'),
        addEmployee: resolve(__dirname, 'add-employee.html'),
        analytics: resolve(__dirname, 'analytics.html'),
      },
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/deliveryos_test',
      JWT_SECRET: 'test-secret-that-is-long-enough-for-validation',
    },
  },
});

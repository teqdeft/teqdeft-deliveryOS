import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Tests must not depend on a developer's local .env.
    env: {
      NODE_ENV: 'test',
      AI_DEFAULT_PROVIDER: 'ANTHROPIC',
      ANTHROPIC_API_KEY: 'test-key',
      OPENAI_API_KEY: '',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/deliveryos_test',
      JWT_SECRET: 'test-secret-that-is-long-enough-for-validation',
      TEST_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/deliveryos_test?schema=public',
    },
  },
});

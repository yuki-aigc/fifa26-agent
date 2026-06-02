import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      FIRO_API_KEY: '',
      FIRO_PRIVATE_KEY: '',
    },
  },
});

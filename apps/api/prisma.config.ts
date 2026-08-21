import path from 'node:path';
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 6 stops auto-loading .env once a config file exists, so load it here.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});

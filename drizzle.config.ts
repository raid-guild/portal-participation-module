import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/lib/db/schema.ts',
})

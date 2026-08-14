import { migrate } from 'drizzle-orm/node-postgres/migrator'

import { closeDatabase, getDatabase } from './client'

async function main() {
  await migrate(getDatabase(), { migrationsFolder: './drizzle' })
  console.log('Participation database migrations are current.')
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Database migration failed.')
    process.exitCode = 1
  })
  .finally(closeDatabase)

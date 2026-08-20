import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const databaseURL = process.env.DATABASE_URL
if (!databaseURL) throw new Error('DATABASE_URL is not configured.')

const pool = new pg.Pool({ connectionString: databaseURL, max: 1 })

try {
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  console.log('Participation database migrations are current.')
} finally {
  await pool.end()
}

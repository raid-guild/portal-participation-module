import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema'

let pool: Pool | undefined

function databaseURL(): string {
  const value = process.env.DATABASE_URL
  if (!value) throw new Error('DATABASE_URL is not configured.')
  return value
}

export function getPool(): Pool {
  pool ??= new Pool({
    connectionString: databaseURL(),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  })
  return pool
}

export function getDatabase() {
  return drizzle(getPool(), { schema })
}

export async function checkDatabase(): Promise<void> {
  await getPool().query('select 1')
}

export async function closeDatabase(): Promise<void> {
  if (!pool) return
  await pool.end()
  pool = undefined
}

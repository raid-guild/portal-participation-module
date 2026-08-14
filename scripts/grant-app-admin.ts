import { eq } from 'drizzle-orm'

import { closeDatabase, getDatabase } from '../src/lib/db/client'
import { appRoleAssignments, auditEvents, users } from '../src/lib/db/schema'

async function main() {
  const portalUserId = process.argv[2]?.trim()
  const assignedBy = process.argv[3]?.trim()
  if (!portalUserId || !assignedBy) {
    throw new Error('Usage: pnpm admin:grant <portal-user-id> <assigned-by>')
  }

  const database = getDatabase()
  const [user] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.portalUserId, portalUserId))
    .limit(1)
  if (!user) throw new Error('Portal user has not launched the participation module yet.')

  await database.transaction(async (transaction) => {
    await transaction
      .insert(appRoleAssignments)
      .values({ assignedBy, role: 'participation_app_admin', userId: user.id })
      .onConflictDoNothing()
    await transaction.insert(auditEvents).values({
      action: 'app_role.granted',
      actorId: assignedBy,
      actorType: 'operator',
      details: { role: 'participation_app_admin' },
      entityId: user.id,
      entityType: 'user',
    })
  })
  console.log(`Granted participation_app_admin to Portal user ${portalUserId}.`)
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(closeDatabase)

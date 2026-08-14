import { closeDatabase } from '../src/lib/db/client'
import { refreshDaoMembership } from '../src/lib/dao/membership'

async function main() {
  const actor = process.argv[2]?.trim() || 'ops:cli'
  const result = await refreshDaoMembership(actor)
  console.log(JSON.stringify({ ...result, blockNumber: result.blockNumber.toString() }, null, 2))
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(closeDatabase)

import { closeDatabase } from '../src/lib/db/client'
import { reconcileDuePayments } from '../src/lib/payments/live-stablecoin'

const limit = Number(process.env.PAYMENT_RECONCILE_BATCH_SIZE ?? 25)

try {
  const results = await reconcileDuePayments(limit)
  console.log(JSON.stringify({ processed: results.length, results }))
} finally {
  await closeDatabase()
}

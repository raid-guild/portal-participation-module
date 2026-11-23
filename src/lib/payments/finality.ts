import type { TransferVerification } from './verify-transfer'

export const FINALITY_RECHECK_DAYS = 7
export const FINALITY_RECHECK_INTERVAL_MS = 60 * 60 * 1000

export function isWithinFinalityRecheckWindow(minedAt: Date | null, now = new Date()): boolean {
  return minedAt !== null && minedAt.getTime() >= now.getTime() - FINALITY_RECHECK_DAYS * 24 * 60 * 60 * 1000
}

export function confirmedEvidenceException(
  saved: { blockHash: string | null; blockNumber: bigint | null },
  observed: TransferVerification,
): string | null {
  if (observed.status !== 'confirmed') return 'Previously confirmed transaction is no longer confirmed on the canonical chain.'
  if (!saved.blockHash || saved.blockNumber === null) return 'Confirmed payment is missing stored block evidence.'
  if (saved.blockNumber !== observed.blockNumber || saved.blockHash.toLowerCase() !== observed.blockHash.toLowerCase()) {
    return 'Transaction block changed after confirmation; review for a chain reorganization.'
  }
  return null
}

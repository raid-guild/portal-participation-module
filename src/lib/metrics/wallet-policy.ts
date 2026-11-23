export function isActiveVerifiedGnosisWallet(wallet: {
  chainId: number
  verifiedAt: Date | null
  revokedAt: Date | null
}): boolean {
  return wallet.chainId === 100 && wallet.verifiedAt !== null && wallet.revokedAt === null
}

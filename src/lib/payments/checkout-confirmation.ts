export type CheckoutConfirmationState = 'confirming' | 'confirmed' | 'needs_review'

export function classifyCheckoutConfirmation(httpStatus: number, paymentStatus: unknown): CheckoutConfirmationState {
  if (httpStatus === 422 || httpStatus === 409 || paymentStatus === 'needs_review') return 'needs_review'
  return paymentStatus === 'confirmed' ? 'confirmed' : 'confirming'
}

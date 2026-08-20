import { afterEach, describe, expect, it } from 'vitest'

import { authorizeMetricsWriteRequest, authorizeServiceRequest } from './auth'

const originalEntitlementKey = process.env.ENTITLEMENTS_SERVICE_KEY
const originalMetricsKey = process.env.PARTICIPATION_METRICS_WRITE_KEY

afterEach(() => {
  if (originalEntitlementKey === undefined) delete process.env.ENTITLEMENTS_SERVICE_KEY
  else process.env.ENTITLEMENTS_SERVICE_KEY = originalEntitlementKey
  if (originalMetricsKey === undefined) delete process.env.PARTICIPATION_METRICS_WRITE_KEY
  else process.env.PARTICIPATION_METRICS_WRITE_KEY = originalMetricsKey
})

describe('service authorization boundaries', () => {
  it('does not allow the entitlement key to write participation metrics', () => {
    process.env.ENTITLEMENTS_SERVICE_KEY = 'entitlement-secret'
    delete process.env.PARTICIPATION_METRICS_WRITE_KEY
    const headers = new Headers({ authorization: 'Bearer entitlement-secret' })

    expect(authorizeServiceRequest(headers)).toEqual({ ok: true })
    expect(authorizeMetricsWriteRequest(headers)).toEqual({
      ok: false,
      reason: 'not_configured',
    })
  })

  it('requires the dedicated metrics write key', () => {
    process.env.PARTICIPATION_METRICS_WRITE_KEY = 'metrics-secret'

    expect(authorizeMetricsWriteRequest(
      new Headers({ authorization: 'Bearer wrong-secret' }),
    )).toEqual({ ok: false, reason: 'unauthorized' })
    expect(authorizeMetricsWriteRequest(
      new Headers({ authorization: 'Bearer metrics-secret' }),
    )).toEqual({ ok: true })
  })
})

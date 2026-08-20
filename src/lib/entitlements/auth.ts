import { timingSafeEqual } from 'node:crypto'

export type ServiceAuthorization =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'unauthorized' }

function authorizeBearerRequest(
  headers: Headers,
  configuredKey: string | undefined,
): ServiceAuthorization {
  if (!configuredKey) return { ok: false, reason: 'not_configured' }

  const authorization = headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return { ok: false, reason: 'unauthorized' }
  }

  const suppliedKey = authorization.slice('Bearer '.length)
  const configuredBuffer = Buffer.from(configuredKey)
  const suppliedBuffer = Buffer.from(suppliedKey)

  if (configuredBuffer.length !== suppliedBuffer.length) {
    return { ok: false, reason: 'unauthorized' }
  }

  return timingSafeEqual(configuredBuffer, suppliedBuffer)
    ? { ok: true }
    : { ok: false, reason: 'unauthorized' }
}

export function authorizeServiceRequest(headers: Headers): ServiceAuthorization {
  return authorizeBearerRequest(headers, process.env.ENTITLEMENTS_SERVICE_KEY)
}

export function authorizeMetricsWriteRequest(headers: Headers): ServiceAuthorization {
  return authorizeBearerRequest(headers, process.env.PARTICIPATION_METRICS_WRITE_KEY)
}

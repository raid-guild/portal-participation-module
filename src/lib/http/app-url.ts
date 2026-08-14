export function appURL(path: string, requestURL: URL): URL {
  const configured = process.env.APP_BASE_URL?.trim()
  const baseURL = configured ? new URL(configured) : requestURL

  if (process.env.NODE_ENV === 'production' && baseURL.protocol !== 'https:') {
    throw new Error('APP_BASE_URL must use HTTPS in production.')
  }

  return new URL(path, baseURL)
}

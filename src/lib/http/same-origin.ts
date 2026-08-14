import { appURL } from './app-url'

export function hasValidRequestOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  return !origin || origin === appURL('/', new URL(request.url)).origin
}

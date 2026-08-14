import Link from 'next/link'

import { AppShell } from '@/components/AppShell'

export default function PortalAuthErrorPage() {
  return (
    <AppShell>
      <main className="admin-main">
        <section className="section-card">
          <span className="eyebrow">Portal sign-in</span>
          <h1>We couldn&apos;t start your session</h1>
          <p>The launch link may be missing, expired, or already used. Return to Portal and launch Participation again.</p>
          <a className="button button--primary" href="https://portal.raidguild.org/modules">Return to Portal</a>
          <Link className="back-link" href="/">View the public dashboard</Link>
        </section>
      </main>
    </AppShell>
  )
}

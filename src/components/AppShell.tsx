import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

import { getCurrentSession } from '@/lib/portal/session'

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession()

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link aria-label="Participation dashboard" className="brand-lockup" href="/">
          {/* RaidGuild mark is hosted by the brand source of truth. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="RaidGuild crossed swords"
            className="brand-mark"
            src="https://www.brand.raidguild.org/assets/logos/symbol-m800.svg"
          />
          <span>Participation</span>
        </Link>
        <nav aria-label="Primary navigation" className="site-nav">
          <Link href="/">Dashboard</Link>
          {session?.isAppAdmin ? <Link href="/admin">Admin</Link> : null}
          <a href="https://portal.raidguild.org/modules" rel="noreferrer">
            Back to Portal <ArrowUpRight aria-hidden="true" size={15} />
          </a>
          {session ? (
            <form action="/portal/logout" method="post">
              <button className="text-action" type="submit">
                Sign out {session.displayName ? `· ${session.displayName}` : ''}
              </button>
            </form>
          ) : null}
        </nav>
      </header>
      {children}
      <footer className="site-footer">
        <span>RaidGuild participation module</span>
        <span>{session ? 'Signed in through Portal' : 'Public preview · No payments are processed'}</span>
      </footer>
    </div>
  )
}

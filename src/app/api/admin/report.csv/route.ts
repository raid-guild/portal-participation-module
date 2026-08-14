import { NextResponse } from 'next/server'

import { getAdminParticipationReport } from '@/lib/admin/report'
import { getCurrentSession } from '@/lib/portal/session'

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`
}

export async function GET() {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!session.isAppAdmin) return NextResponse.json({ error: 'App admin role required.' }, { status: 403 })

  const report = await getAdminParticipationReport()
  const rows = [
    ['portal_user_id', 'participant', 'wallets', 'rg_balance', 'confirmed_usd', 'discounted_shares', 'status'],
    ...report.rows.map((row) => [
      row.portalUserId,
      row.displayName,
      row.wallets.join(' '),
      row.balance,
      (row.amountMinorUnits / 100).toFixed(2),
      row.shares,
      row.status,
    ]),
  ]
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  return new NextResponse(csv, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="participation-${report.periodKey}.csv"`,
      'Content-Type': 'text/csv; charset=utf-8',
    },
  })
}

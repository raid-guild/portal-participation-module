import { Activity } from 'lucide-react'

import type { getApprovedParticipationMetrics } from '@/lib/metrics/approval'

type ApprovedMetrics = NonNullable<Awaited<ReturnType<typeof getApprovedParticipationMetrics>>>

export function ApprovedParticipationMetrics({ metrics }: { metrics: ApprovedMetrics | null }) {
  if (!metrics) return null
  return <section className="section-card">
    <div className="section-heading"><div><span className="eyebrow">Approved Prism evidence</span><h2>Your participation metrics</h2></div><Activity size={24} /></div>
    <p className="source-note">{metrics.snapshotKey} · cycle {metrics.cycleKey} · generated {new Date(metrics.generatedAt).toLocaleString()} · approved {new Date(metrics.approvedAt).toLocaleString()}</p>
    <p>Engagement {metrics.engagementScore} · stewardship {metrics.stewardshipScore} · contribution {metrics.contributionScore} · total {metrics.totalScore}</p>
    <p className="fine-print">These are approved participation signals only. They do not change your access, billing, DAO membership, or share eligibility.</p>
  </section>
}

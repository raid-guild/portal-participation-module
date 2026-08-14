import type {
  BillingStatus,
  ParticipationCredential,
} from '../domain/participation'

export type MockPersonaKey = 'member' | 'graduate' | 'participant'

export type MockPersona = {
  avatarInitials: string
  credentials: ParticipationCredential[]
  handle: string
  name: string
  portalUserID: string
}

export const mockPersonas: Record<MockPersonaKey, MockPersona> = {
  member: {
    avatarInitials: 'MB',
    credentials: ['raidguild_member', 'cohort_grad'],
    handle: 'moonbuilder',
    name: 'Moon Builder',
    portalUserID: 'portal-1042',
  },
  graduate: {
    avatarInitials: 'AR',
    credentials: ['cohort_grad'],
    handle: 'apprentice-ranger',
    name: 'Apprentice Ranger',
    portalUserID: 'portal-1228',
  },
  participant: {
    avatarInitials: 'NP',
    credentials: ['cohort_participant'],
    handle: 'new-pathfinder',
    name: 'New Pathfinder',
    portalUserID: 'portal-1317',
  },
}

export const mockBillingStatuses: BillingStatus[] = [
  'active',
  'past_due',
  'canceled',
  'not_started',
]

export const mockActivity = [
  { label: 'Sessions joined', value: '7', detail: '+2 this month' },
  { label: 'Bounties completed', value: '3', detail: '1 under review' },
  { label: 'Projects touched', value: '4', detail: 'Across 2 working groups' },
]

export const mockAdminRows = [
  {
    amount: '$80',
    className: 'Member',
    name: 'Moon Builder',
    shares: '32 RG',
    status: 'Ready',
  },
  {
    amount: '$20',
    className: 'Cohort grad',
    name: 'Apprentice Ranger',
    shares: '—',
    status: 'Active',
  },
  {
    amount: '$20',
    className: 'Participant',
    name: 'New Pathfinder',
    shares: '—',
    status: 'Past due',
  },
]

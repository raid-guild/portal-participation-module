import type { Metadata } from 'next'
import { EB_Garamond, Ubuntu_Mono } from 'next/font/google'

import './globals.css'

const ebGaramond = EB_Garamond({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-body',
})

const ubuntuMono = Ubuntu_Mono({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '700'],
})

export const metadata: Metadata = {
  description: 'Subscriptions, access, shares, and participation in one place.',
  title: 'Participation | RaidGuild',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-brand-reign="louchi" lang="en">
      <body className={`${ebGaramond.variable} ${ubuntuMono.variable}`}>{children}</body>
    </html>
  )
}

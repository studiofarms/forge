import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/shell/AppShell';

export const metadata: Metadata = {
  title: 'FrameForge — AI Brand Video Studio',
  description:
    'Free AI video studio: upload your brand kit and generate on-brand video content on free GPUs.',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

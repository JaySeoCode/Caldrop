import type { Metadata, Viewport } from 'next';
import { ServiceWorker } from '@/components/ServiceWorker';
import './globals.css';

export const metadata: Metadata = {
  title: 'CalDrop',
  description: "Drop anything. It's on your calendar.",
  applicationName: 'CalDrop',
  manifest: '/manifest.webmanifest',
  // iPhone "Add to Home Screen": full-screen launch, own title and icon.
  appleWebApp: {
    capable: true,
    title: 'CalDrop',
    statusBarStyle: 'default',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fafaf9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

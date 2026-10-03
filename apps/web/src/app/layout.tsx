import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trò chuyện với nhau sau 1 ngày dài',
  description: 'Một góc nhỏ để hai người kể nhau nghe về một ngày đã qua.',
};

// viewport-fit=cover lets env(safe-area-inset-*) report the notch / home bar on phones;
// resizes-content keeps the chat composer above the on-screen keyboard on Android.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#fff7fa',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}

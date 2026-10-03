import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trò chuyện với nhau sau 1 ngày dài',
  description: 'Một góc nhỏ để hai người kể nhau nghe về một ngày đã qua.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}

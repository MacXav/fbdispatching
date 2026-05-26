import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dispatch Pro - Trucking Dispatch Management',
  description: 'Professional dispatching software for trucking companies',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}

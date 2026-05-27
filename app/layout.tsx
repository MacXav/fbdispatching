import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dispatch Pro - Trucking Dispatch Management',
  description: 'Professional dispatching software for trucking companies',
};

const themeScript = `
(function () {
  try {
    var savedTheme = window.localStorage.getItem('dispatch_pro_theme');
    var theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark';

    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    document.documentElement.style.colorScheme = theme;
  } catch (error) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>

      <body>{children}</body>
    </html>
  );
}
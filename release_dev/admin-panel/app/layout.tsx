import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'MCP Admin Control Plane',
  description: 'Real-time credential printouts and structured thinking viewer for the MCP mesh',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

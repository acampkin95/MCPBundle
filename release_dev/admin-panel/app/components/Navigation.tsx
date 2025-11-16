/**
 * Navigation Component
 *
 * Provides navigation between different sections of the admin panel
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navigation() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/monitoring', label: 'Monitoring' },
  ];

  return (
    <nav className="navigation">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={pathname === link.href ? 'active' : ''}
        >
          {link.label}
        </Link>
      ))}

      <style jsx>{`
        .navigation {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        }

        .navigation a {
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          text-decoration: none;
          color: rgba(248, 250, 252, 0.7);
          transition: all 0.2s;
        }

        .navigation a:hover {
          background: rgba(56, 189, 248, 0.1);
          color: #38bdf8;
        }

        .navigation a.active {
          background: rgba(56, 189, 248, 0.2);
          color: #38bdf8;
          font-weight: 600;
        }
      `}</style>
    </nav>
  );
}

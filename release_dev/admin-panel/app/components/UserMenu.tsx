'use client';

import { signOut } from 'next-auth/react';

interface UserMenuProps {
  readonly name?: string | null;
  readonly email?: string | null;
}

export function UserMenu({ name, email }: UserMenuProps) {
  const label = name ?? email ?? 'Authenticated';
  return (
    <div className="user-menu">
      <span>{label}</span>
      <button type="button" onClick={() => signOut({ callbackUrl: '/' })}>
        Sign out
      </button>
    </div>
  );
}

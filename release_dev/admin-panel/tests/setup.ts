/**
 * Vitest Setup File for Admin Panel
 *
 * This file runs before all tests and sets up the testing environment.
 */

import { beforeAll, afterAll, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Setup DOM environment for React components
beforeAll(() => {
  // Setup any global test environment
  console.log('Setting up test environment for admin-panel...');
});

// Cleanup after all tests
afterAll(() => {
  console.log('Tearing down test environment...');
});

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock Next.js image component
vi.mock('next/image', () => ({
  default: (props: any) => props,
}));

// Mock Next.js link component
vi.mock('next/link', () => ({
  default: (props: any) => props.children,
}));

// Export a global vi instance
globalThis.vi = vi;

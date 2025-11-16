/**
 * Unit Tests for MonitoringDashboard Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MonitoringDashboard } from '../../app/components/MonitoringDashboard';

// Mock fetch globally
global.fetch = vi.fn();

describe('MonitoringDashboard', () => {
  const mockInitialData = {
    health: {
      status: 'healthy' as const,
      timestamp: '2025-11-15T12:00:00.000Z',
      services: {
        postgres: { status: 'healthy', latency_ms: 5 },
        redis: { status: 'healthy', latency_ms: 2 },
      },
    },
    agents: [
      {
        agentId: 'agent-1',
        hostname: 'server-01',
        capabilities: ['postgres', 'redis'],
        tools: ['query', 'backup'],
        status: 'active' as const,
        lastHeartbeat: '2025-11-15T11:59:00.000Z',
        registeredAt: '2025-11-14T00:00:00.000Z',
      },
    ],
    metrics: {
      agents: {
        total: 1,
        active: 1,
        inactive: 0,
        stale: 0,
      },
      healthChecks: {
        lastCheck: '2025-11-15T12:00:00.000Z',
        successRate: 1.0,
      },
    },
    errors: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render health status', () => {
    render(<MonitoringDashboard initialData={mockInitialData} />);

    expect(screen.getByText(/Orchestrator Health/i)).toBeInTheDocument();
    expect(screen.getByText(/HEALTHY/i)).toBeInTheDocument();
  });

  it('should render agent registry', () => {
    render(<MonitoringDashboard initialData={mockInitialData} />);

    expect(screen.getByText(/Agent Registry/i)).toBeInTheDocument();
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('server-01')).toBeInTheDocument();
  });

  it('should render metrics', () => {
    render(<MonitoringDashboard initialData={mockInitialData} />);

    expect(screen.getByText(/System Metrics/i)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // total agents
    expect(screen.getByText('100.0%')).toBeInTheDocument(); // success rate
  });

  it('should display errors when present', () => {
    const dataWithErrors = {
      ...mockInitialData,
      errors: ['Connection to orchestrator failed'],
    };

    render(<MonitoringDashboard initialData={dataWithErrors} />);

    expect(screen.getByText(/Connection Issues/i)).toBeInTheDocument();
    expect(screen.getByText(/Connection to orchestrator failed/i)).toBeInTheDocument();
  });

  it('should handle missing health data', () => {
    const dataWithoutHealth = {
      ...mockInitialData,
      health: null,
    };

    render(<MonitoringDashboard initialData={dataWithoutHealth} />);

    expect(screen.getByText(/Health data unavailable/i)).toBeInTheDocument();
  });

  it('should handle empty agent list', () => {
    const dataWithoutAgents = {
      ...mockInitialData,
      agents: [],
    };

    render(<MonitoringDashboard initialData={dataWithoutAgents} />);

    expect(screen.getByText(/No agents registered/i)).toBeInTheDocument();
  });

  it('should poll for updates', async () => {
    const mockResponse = {
      health: mockInitialData.health,
      agents: mockInitialData.agents,
      metrics: mockInitialData.metrics,
      timestamp: new Date().toISOString(),
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    render(<MonitoringDashboard initialData={mockInitialData} />);

    await waitFor(
      () => {
        expect(global.fetch).toHaveBeenCalledWith('/api/orchestrator/status');
      },
      { timeout: 6000 }
    );
  });

  it('should handle service status colors correctly', () => {
    const dataWithDegraded = {
      ...mockInitialData,
      health: {
        status: 'degraded' as const,
        timestamp: '2025-11-15T12:00:00.000Z',
        services: {
          postgres: { status: 'healthy' },
          redis: { status: 'degraded' },
        },
      },
    };

    render(<MonitoringDashboard initialData={dataWithDegraded} />);

    expect(screen.getByText(/DEGRADED/i)).toBeInTheDocument();
  });
});

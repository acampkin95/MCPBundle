/**
 * Client-side Monitoring Dashboard Component
 *
 * Provides real-time updates using SSE and periodic polling
 */

'use client';

import { useEffect, useState } from 'react';
import type { OrchestratorHealth, AgentRegistration, OrchestratorMetrics } from '../../lib/orchestratorClient';

interface MonitoringDashboardProps {
  initialData: {
    health: OrchestratorHealth | null;
    agents: AgentRegistration[];
    metrics: OrchestratorMetrics | null;
    errors: string[];
  };
}

export function MonitoringDashboard({ initialData }: MonitoringDashboardProps) {
  const [health, setHealth] = useState(initialData.health);
  const [agents, setAgents] = useState(initialData.agents);
  const [metrics, setMetrics] = useState(initialData.metrics);
  const [errors, setErrors] = useState(initialData.errors);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Poll for updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/orchestrator/status');
        if (response.ok) {
          const data = await response.json();
          setHealth(data.health);
          setAgents(data.agents);
          setMetrics(data.metrics);
          setErrors([]);
          setLastUpdate(new Date());
        }
      } catch (error) {
        console.error('Failed to fetch orchestrator status', error);
        setErrors(['Connection to orchestrator failed']);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'healthy':
      case 'active':
        return 'status-healthy';
      case 'degraded':
      case 'inactive':
        return 'status-warning';
      case 'unhealthy':
      case 'stale':
        return 'status-error';
      default:
        return 'status-unknown';
    }
  };

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="monitoring-dashboard">
      {errors.length > 0 && (
        <section className="card error-banner">
          <h2>Connection Issues</h2>
          <ul>
            {errors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="section-header">
          <h2>Orchestrator Health</h2>
          <span className="last-update">Last updated: {lastUpdate.toLocaleTimeString()}</span>
        </div>

        {health ? (
          <div className="health-grid">
            <div className="health-status">
              <div className={`status-badge ${getStatusColor(health.status)}`}>
                {health.status.toUpperCase()}
              </div>
              <span className="health-timestamp">{formatTimestamp(health.timestamp)}</span>
            </div>

            <div className="services-grid">
              {Object.entries(health.services).map(([name, service]) => (
                <div key={name} className="service-card">
                  <h3>{name.charAt(0).toUpperCase() + name.slice(1)}</h3>
                  <div className={`status-badge ${getStatusColor(service.status)}`}>
                    {service.status}
                  </div>
                  {service.latency_ms && (
                    <span className="latency">Latency: {service.latency_ms}ms</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="no-data">Health data unavailable</p>
        )}
      </section>

      <section className="card">
        <h2>Agent Registry ({agents.length} total)</h2>
        {agents.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Agent ID</th>
                  <th>Hostname</th>
                  <th>Status</th>
                  <th>Capabilities</th>
                  <th>Tools</th>
                  <th>Last Heartbeat</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.agentId}>
                    <td className="monospace">{agent.agentId}</td>
                    <td>{agent.hostname}</td>
                    <td>
                      <span className={`badge ${getStatusColor(agent.status)}`}>
                        {agent.status}
                      </span>
                    </td>
                    <td>
                      <span className="badge-count">{agent.capabilities.length}</span>
                    </td>
                    <td>
                      <span className="badge-count">{agent.tools.length}</span>
                    </td>
                    <td>{formatTimestamp(agent.lastHeartbeat)}</td>
                    <td>{formatTimestamp(agent.registeredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="no-data">No agents registered</p>
        )}
      </section>

      {metrics && (
        <section className="card">
          <h2>System Metrics</h2>
          <div className="metrics-grid">
            <div className="metric-card">
              <h3>Agents</h3>
              <div className="metric-value">{metrics.agents.total}</div>
              <div className="metric-breakdown">
                <span className="status-healthy">Active: {metrics.agents.active}</span>
                <span className="status-warning">Inactive: {metrics.agents.inactive}</span>
                <span className="status-error">Stale: {metrics.agents.stale}</span>
              </div>
            </div>

            {metrics.commandQueue && (
              <div className="metric-card">
                <h3>Command Queue</h3>
                <div className="metric-value">{metrics.commandQueue.pending}</div>
                <div className="metric-breakdown">
                  <span>In Progress: {metrics.commandQueue.inProgress}</span>
                  <span className="status-healthy">
                    Completed: {metrics.commandQueue.completed}
                  </span>
                  <span className="status-error">Failed: {metrics.commandQueue.failed}</span>
                </div>
              </div>
            )}

            <div className="metric-card">
              <h3>Health Checks</h3>
              <div className="metric-value">
                {(metrics.healthChecks.successRate * 100).toFixed(1)}%
              </div>
              <div className="metric-breakdown">
                <span>Last Check: {formatTimestamp(metrics.healthChecks.lastCheck)}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      <style jsx>{`
        .monitoring-dashboard {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .last-update {
          font-size: 0.875rem;
          color: #666;
        }

        .error-banner {
          background-color: #fee;
          border-left: 4px solid #c33;
        }

        .error-banner ul {
          margin: 0;
          padding-left: 1.5rem;
        }

        .health-grid {
          display: grid;
          gap: 1.5rem;
        }

        .health-status {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .status-badge {
          padding: 0.5rem 1rem;
          border-radius: 0.25rem;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .status-healthy {
          background-color: #4caf50;
          color: white;
        }

        .status-warning {
          background-color: #ff9800;
          color: white;
        }

        .status-error {
          background-color: #f44336;
          color: white;
        }

        .status-unknown {
          background-color: #9e9e9e;
          color: white;
        }

        .services-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .service-card {
          padding: 1rem;
          border: 1px solid #ddd;
          border-radius: 0.5rem;
        }

        .service-card h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1rem;
        }

        .latency {
          display: block;
          margin-top: 0.5rem;
          font-size: 0.875rem;
          color: #666;
        }

        .table-container {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }

        th {
          background-color: #f5f5f5;
          font-weight: 600;
        }

        .monospace {
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 0.875rem;
        }

        .badge {
          padding: 0.25rem 0.75rem;
          border-radius: 1rem;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .badge-count {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          background-color: #e0e0e0;
          border-radius: 0.25rem;
          font-size: 0.875rem;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .metric-card {
          padding: 1.5rem;
          border: 1px solid #ddd;
          border-radius: 0.5rem;
        }

        .metric-card h3 {
          margin: 0 0 1rem 0;
          font-size: 1rem;
          color: #666;
        }

        .metric-value {
          font-size: 2.5rem;
          font-weight: 700;
          color: #333;
          margin-bottom: 0.5rem;
        }

        .metric-breakdown {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.875rem;
        }

        .no-data {
          padding: 2rem;
          text-align: center;
          color: #666;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}

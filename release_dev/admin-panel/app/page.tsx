import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '../authOptions';
import { UserMenu } from './components/UserMenu';
import { Navigation } from './components/Navigation';
import { fetchPanelData } from '../lib/panelClient';

const DASH = '—';

function formatTimestamp(ts?: string) {
  if (!ts) return DASH;
  return new Date(ts).toLocaleString();
}

function formatInterval(ms?: number | null) {
  if (!ms || Number.isNaN(ms)) return DASH;
  return `${Math.round(ms / 1000)}s`;
}

export default async function Page() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/api/auth/signin?callbackUrl=/');
  }

  const { overview, thoughts } = await fetchPanelData(process.env.PANEL_API_BASE_URL);
  const topThoughts = thoughts.timeline?.slice(-8).reverse() ?? [];

  return (
    <main>
      <header>
        <h1>MCP Admin Control Plane</h1>
        <p>Live heartbeat, credentials, and structured thinking telemetry from Cloudflare MCP.</p>
        <UserMenu name={session.user?.name} email={session.user?.email} />
      </header>

      <Navigation />

      <section className="card">
        <h2>Mesh Status</h2>
        <div className="grid stats">
          {Object.entries(overview.stats).map(([label, value]) => (
            <div key={label}>
              <div className="stat">{label.replace(/([A-Z])/g, ' $1').trim()}</div>
              <div className="stat-value">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Credential Printout</h2>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Hostname</th>
              <th>MAC</th>
              <th>Status</th>
              <th>Heartbeat</th>
              <th>DNS Update</th>
              <th>Interval</th>
            </tr>
          </thead>
          <tbody>
            {overview.credentialPrintout.map((entry) => (
              <tr key={`${entry.agentName}-${entry.macAddress}`}>
                <td>{entry.agentName}</td>
                <td>{entry.hostname}</td>
                <td title={`Fingerprint: ${entry.fingerprint}`}>{entry.macAddress}</td>
                <td>
                  <span className={`badge ${entry.status}`}>{entry.status.replace(/_/g, ' ')}</span>
                </td>
                <td>{formatTimestamp(entry.lastHeartbeat)}</td>
                <td>{formatTimestamp(entry.lastDnsUpdate)}</td>
                <td>{formatInterval(entry.heartbeatIntervalMs ?? null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Structured Thought Timeline</h2>
        <div className="grid">
          <div>
            <h3>Progress</h3>
            <p>{Math.round(thoughts.summary.progress?.percentage ?? 0)}% complete</p>
          </div>
          <div>
            <h3>Sources</h3>
            <ul>
              {thoughts.summary.sources?.map((source) => (
                <li key={source.source}>
                  {source.source} — {source.count}
                </li>
              )) ?? <li>No sources</li>}
            </ul>
          </div>
        </div>
        <ul className="timeline-list">
          {topThoughts.map((item) => (
            <li key={item.id} className="timeline-item">
              <strong>[{item.stage}]</strong> {item.thought}
              <small>ID: {item.id}</small>
            </li>
          ))}
        </ul>
        <details>
          <summary>Rendered Report</summary>
          <pre>{thoughts.rendered}</pre>
        </details>
      </section>
    </main>
  );
}

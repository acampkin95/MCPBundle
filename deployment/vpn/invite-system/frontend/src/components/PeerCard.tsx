import { useState } from 'react';
import { Peer, apiClient } from '@/lib/api';
import { Trash2, Download, QrCode as QrCodeIcon } from 'lucide-react';
import QRCodeDisplay from './QRCodeDisplay';

interface PeerCardProps {
  peer: Peer;
  onUpdate: () => void;
}

export default function PeerCard({ peer, onUpdate }: PeerCardProps) {
  const [revoking, setRevoking] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [platform, setPlatform] = useState<string>('windows');

  const handleRevoke = async () => {
    if (!confirm('Are you sure you want to revoke this VPN connection?')) {
      return;
    }

    try {
      setRevoking(true);
      await apiClient.revokePeer(peer.id);
      onUpdate();
    } catch (error) {
      console.error('Failed to revoke peer:', error);
      alert('Failed to revoke connection');
    } finally {
      setRevoking(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await apiClient.downloadConfig(peer.id, platform);
      const extension = platform === 'ios' ? 'mobileconfig' : 'conf';
      apiClient.downloadFile(blob, `mcp-vpn-${peer.ipAddress}.${extension}`);
    } catch (error) {
      console.error('Failed to download config:', error);
      alert('Failed to download configuration');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getStatusColor = () => {
    switch (peer.status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-yellow-100 text-yellow-800';
      case 'revoked':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <>
      <div className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-medium text-gray-900">
                {peer.deviceName || 'Unnamed Device'}
              </h3>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getStatusColor()}`}
              >
                {peer.status}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">IP Address:</span>
                <p className="font-mono font-medium text-gray-900">{peer.ipAddress}</p>
              </div>
              <div>
                <span className="text-gray-500">Created:</span>
                <p className="font-medium text-gray-900">
                  {new Date(peer.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Last Handshake:</span>
                <p className="font-medium text-gray-900">
                  {peer.lastHandshake ? new Date(peer.lastHandshake).toLocaleString() : 'Never'}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Data Transfer:</span>
                <p className="font-medium text-gray-900">
                  ↓ {formatBytes(peer.bytesReceived)} / ↑ {formatBytes(peer.bytesSent)}
                </p>
              </div>
            </div>

            {peer.status === 'active' && (
              <div className="mt-4 flex flex-wrap gap-2">
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="windows">Windows</option>
                  <option value="macos">macOS</option>
                  <option value="linux">Linux</option>
                  <option value="ios">iOS</option>
                  <option value="android">Android</option>
                </select>

                <button
                  onClick={handleDownload}
                  className="flex items-center space-x-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Config</span>
                </button>

                <button
                  onClick={() => setShowQR(true)}
                  className="flex items-center space-x-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
                >
                  <QrCodeIcon className="h-4 w-4" />
                  <span>QR Code</span>
                </button>
              </div>
            )}
          </div>

          {peer.status === 'active' && (
            <button
              onClick={handleRevoke}
              disabled={revoking}
              className="ml-4 rounded-md p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
              title="Revoke access"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {showQR && <QRCodeDisplay peerId={peer.id} onClose={() => setShowQR(false)} />}
    </>
  );
}

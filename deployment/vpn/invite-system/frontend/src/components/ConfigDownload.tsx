import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { Download, QrCode, CheckCircle } from 'lucide-react';
import QRCodeDisplay from './QRCodeDisplay';
import { useRouter } from 'next/navigation';

interface ConfigDownloadProps {
  peerId: string;
}

export default function ConfigDownload({ peerId }: ConfigDownloadProps) {
  const router = useRouter();
  const [platform, setPlatform] = useState<string>('windows');
  const [showQR, setShowQR] = useState(false);

  const handleDownload = async () => {
    try {
      const blob = await apiClient.downloadConfig(peerId, platform);
      const extension = platform === 'ios' ? 'mobileconfig' : 'conf';
      apiClient.downloadFile(blob, `mcp-vpn.${extension}`);
    } catch (error) {
      console.error('Failed to download config:', error);
      alert('Failed to download configuration');
    }
  };

  const platformInstructions: Record<string, string> = {
    windows:
      '1. Download the configuration file\n2. Open WireGuard application\n3. Click "Import tunnel(s) from file"\n4. Select the downloaded .conf file\n5. Activate the connection',
    macos:
      '1. Download the configuration file\n2. Open WireGuard application\n3. Click "Import tunnel(s) from file"\n4. Select the downloaded .conf file\n5. Activate the connection',
    linux:
      '1. Download the configuration file\n2. Move to /etc/wireguard/wg0.conf\n3. Run: sudo wg-quick up wg0\n4. Enable at boot: sudo systemctl enable wg-quick@wg0',
    ios: '1. Download the mobile configuration profile\n2. Open in Settings app\n3. Follow the profile installation prompts\n4. Open WireGuard app and activate',
    android:
      '1. Tap "Scan QR Code" below\n2. Open WireGuard app\n3. Tap + button and select "Scan from QR code"\n4. Scan the displayed QR code\n5. Activate the connection',
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 px-4">
      <div className="w-full max-w-2xl space-y-6 rounded-lg bg-white p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">VPN Access Granted!</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your VPN invite has been successfully claimed. Download your configuration below.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Your Platform
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {['windows', 'macos', 'linux', 'ios', 'android'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`rounded-md px-4 py-3 text-sm font-medium capitalize ${
                    platform === p
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Setup Instructions</h3>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap">
              {platformInstructions[platform]}
            </pre>
          </div>

          <div className="flex flex-col space-y-3">
            <button
              onClick={handleDownload}
              className="flex items-center justify-center space-x-2 rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500"
            >
              <Download className="h-5 w-5" />
              <span>Download Configuration</span>
            </button>

            {(platform === 'android' || platform === 'ios') && (
              <button
                onClick={() => setShowQR(true)}
                className="flex items-center justify-center space-x-2 rounded-md bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-500"
              >
                <QrCode className="h-5 w-5" />
                <span>Show QR Code</span>
              </button>
            )}

            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>

      {showQR && <QRCodeDisplay peerId={peerId} onClose={() => setShowQR(false)} />}
    </div>
  );
}

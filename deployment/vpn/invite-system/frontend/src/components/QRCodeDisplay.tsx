import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { X } from 'lucide-react';

interface QRCodeDisplayProps {
  peerId: string;
  onClose: () => void;
}

export default function QRCodeDisplay({ peerId, onClose }: QRCodeDisplayProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadQRCode = async () => {
      try {
        const qr = await apiClient.getQRCode(peerId, 'json');
        setQrCode(qr);
      } catch (error) {
        console.error('Failed to load QR code:', error);
      } finally {
        setLoading(false);
      }
    };

    loadQRCode();
  }, [peerId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Scan QR Code</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex flex-col items-center space-y-4">
          {loading ? (
            <div className="h-64 w-64 flex items-center justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            </div>
          ) : qrCode ? (
            <>
              <img src={qrCode} alt="VPN Configuration QR Code" className="w-64 h-64" />
              <p className="text-sm text-gray-600 text-center">
                Scan this QR code with the WireGuard mobile app to configure your VPN connection.
              </p>
            </>
          ) : (
            <p className="text-red-600">Failed to generate QR code</p>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Close
        </button>
      </div>
    </div>
  );
}

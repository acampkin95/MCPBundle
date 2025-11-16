import axios, { AxiosInstance, AxiosError } from 'axios';
import { getToken, updateToken } from './keycloak';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://154.26.158.31:3100';

export interface Invite {
  id: string;
  token: string;
  recipientEmail?: string;
  recipientName?: string;
  notes?: string;
  status: 'pending' | 'claimed' | 'expired' | 'revoked';
  expiresAt: string;
  claimedAt?: string;
  claimedBy?: string;
  createdAt: string;
  hasPeer: boolean;
  inviteUrl?: string;
}

export interface Peer {
  id: string;
  deviceName?: string;
  ipAddress: string;
  status: 'active' | 'inactive' | 'revoked';
  lastHandshake?: string;
  bytesReceived: number;
  bytesSent: number;
  createdAt: string;
}

export interface CreateInviteRequest {
  recipientEmail?: string;
  recipientName?: string;
  notes?: string;
}

export interface ClaimInviteRequest {
  deviceName?: string;
}

export interface InviteStats {
  total: number;
  pending: number;
  claimed: number;
  expired: number;
  revoked: number;
}

class APIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      async (config) => {
        // Refresh token if needed
        await updateToken(30);

        const token = getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Unauthorized - redirect to login
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // Invite endpoints
  async createInvite(data: CreateInviteRequest): Promise<Invite> {
    const response = await this.client.post<Invite>('/api/invites', data);
    return response.data;
  }

  async getMyInvites(): Promise<Invite[]> {
    const response = await this.client.get<{ invites: Invite[] }>('/api/invites');
    return response.data.invites;
  }

  async getAllInvites(limit: number = 100, offset: number = 0): Promise<Invite[]> {
    const response = await this.client.get<{ invites: Invite[] }>('/api/invites/all', {
      params: { limit, offset },
    });
    return response.data.invites;
  }

  async getInviteByToken(token: string): Promise<Invite> {
    const response = await this.client.get<Invite>(`/api/invites/${token}`);
    return response.data;
  }

  async claimInvite(token: string, data: ClaimInviteRequest): Promise<{ peerId: string }> {
    const response = await this.client.post<{ peerId: string }>(
      `/api/invites/${token}/claim`,
      data
    );
    return response.data;
  }

  async revokeInvite(inviteId: string): Promise<void> {
    await this.client.delete(`/api/invites/${inviteId}`);
  }

  async getInviteStats(): Promise<InviteStats> {
    const response = await this.client.get<InviteStats>('/api/invites/stats');
    return response.data;
  }

  // Peer endpoints
  async getMyPeers(): Promise<Peer[]> {
    const response = await this.client.get<{ peers: Peer[] }>('/api/config/peers');
    return response.data.peers;
  }

  async getPeerById(peerId: string): Promise<Peer> {
    const response = await this.client.get<Peer>(`/api/config/peers/${peerId}`);
    return response.data;
  }

  async revokePeer(peerId: string): Promise<void> {
    await this.client.delete(`/api/config/peers/${peerId}`);
  }

  // Config download endpoints
  async downloadConfig(peerId: string, platform: string): Promise<Blob> {
    const response = await this.client.get(`/api/config/download/${peerId}/${platform}`, {
      responseType: 'blob',
    });
    return response.data;
  }

  async getQRCode(peerId: string, format: 'png' | 'svg' | 'json' = 'json'): Promise<string> {
    if (format === 'json') {
      const response = await this.client.get<{ qrCode: string }>(
        `/api/config/qr/${peerId}?format=json`
      );
      return response.data.qrCode;
    } else {
      const response = await this.client.get(`/api/config/qr/${peerId}?format=${format}`, {
        responseType: format === 'png' ? 'blob' : 'text',
      });
      if (format === 'png') {
        return URL.createObjectURL(response.data as Blob);
      }
      return response.data as string;
    }
  }

  // Utility method to download file
  downloadFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const apiClient = new APIClient();

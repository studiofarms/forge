'use client';

// Connection state: tunnel URL, liveness, GPU stats, session timer.
// URL persists to localStorage so a page reload keeps the connection.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ComfyClient } from '../comfy/client';
import type { SystemStats } from '../comfy/types';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ConnectionState {
  url: string;
  status: ConnectionStatus;
  error: string | null;
  stats: SystemStats | null;
  /** Epoch ms when the current connection was established (session timer). */
  connectedAt: number | null;
  setUrl(url: string): void;
  connect(url?: string): Promise<boolean>;
  disconnect(): void;
  /** Re-probe silently; downgrades status on failure. */
  heartbeat(): Promise<void>;
  getClient(): ComfyClient | null;
}

let client: ComfyClient | null = null;

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      url: '',
      status: 'disconnected',
      error: null,
      stats: null,
      connectedAt: null,

      setUrl(url) {
        set({ url });
      },

      async connect(url) {
        const target = (url ?? get().url).trim();
        if (!target) {
          set({ status: 'error', error: 'Paste your tunnel URL first.' });
          return false;
        }
        set({ status: 'connecting', error: null, url: target });
        try {
          const next = new ComfyClient(target);
          const stats = await next.systemStats();
          client = next;
          set({
            status: 'connected',
            stats,
            error: null,
            connectedAt: get().connectedAt ?? Date.now(),
          });
          return true;
        } catch (err) {
          client = null;
          set({
            status: 'error',
            stats: null,
            connectedAt: null,
            error: (err as Error).message || 'Could not connect.',
          });
          return false;
        }
      },

      disconnect() {
        client = null;
        set({ status: 'disconnected', stats: null, error: null, connectedAt: null });
      },

      async heartbeat() {
        if (get().status !== 'connected' || !client) return;
        try {
          const stats = await client.systemStats();
          set({ stats });
        } catch {
          set({
            status: 'error',
            error: 'Lost contact with the backend — the tunnel may have expired.',
          });
        }
      },

      getClient() {
        return get().status === 'connected' ? client : null;
      },
    }),
    {
      name: 'frameforge-connection',
      partialize: (s) => ({ url: s.url }),
    }
  )
);

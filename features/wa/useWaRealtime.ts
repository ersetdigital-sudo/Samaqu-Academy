'use client';

import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSamaquRealtimeClient } from '@/lib/supabase/samaqu-client';

const CHANNEL_NAME = 'wa-inbox-admin';
const EVENT_NAME = 'wa_inbox_change';
const DEBOUNCE_MS = 800;

interface Options {
  enabled?: boolean;
  onSignal: () => void;
}

/**
 * Subscribe ke sinyal perubahan wa_inbox dari SAMAQU.
 * Payload channel sengaja kosong; data tetap diambil lewat Edge Function wa-admin.
 */
export function useWaRealtime({ enabled = true, onSignal }: Options) {
  const signalRef = useRef(onSignal);
  signalRef.current = onSignal;

  useEffect(() => {
    if (!enabled) return;

    const supabase = getSamaquRealtimeClient();
    if (!supabase) {
      console.warn('[wa] Realtime SAMAQU belum dikonfigurasi; memakai fallback polling.');
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let wasSubscribed = false;

    const fire = () => {
      if (cancelled) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        if (!cancelled) signalRef.current();
      }, DEBOUNCE_MS);
    };

    channel = supabase
      .channel(CHANNEL_NAME, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: EVENT_NAME }, () => fire())
      .subscribe((status, error) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          // Reconnect setelah putus: ambil perubahan yang terlewat.
          if (wasSubscribed) fire();
          wasSubscribed = true;
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[wa] Realtime channel', status, error ?? '');
        }
      });

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled]);
}

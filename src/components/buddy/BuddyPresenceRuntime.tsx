import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { buddyPresenceTopic, buddyPresenceUserIds } from '@/lib/buddy';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { useBuddyPresenceStore } from '@/stores/buddyPresence';

interface ActiveBuddyRow {
  id: string;
}

/**
 * Publishes app-wide online presence to every active Buddy pair.
 *
 * Keeping this outside BuddyChat makes the user visible to their buddy while
 * they study elsewhere in the signed-in app.
 */
export default function BuddyPresenceRuntime() {
  const authStatus = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const sandbox = useAuthStore((state) => state.sandbox);

  useEffect(() => {
    if (authStatus !== 'signed_in' || !userId || sandbox || !supabaseConfigured) return;

    let disposed = false;
    const presenceChannels = new Map<string, RealtimeChannel>();
    const presenceStore = useBuddyPresenceStore.getState();

    const track = (channel: RealtimeChannel) =>
      channel.track({ user_id: userId, online_at: new Date().toISOString() });

    const addPresenceChannel = (buddyId: string) => {
      if (presenceChannels.has(buddyId)) return;
      const channel = supabase.channel(buddyPresenceTopic(buddyId), {
        config: { presence: { key: userId } }
      });
      presenceChannels.set(buddyId, channel);
      channel
        .on('presence', { event: 'sync' }, () => {
          useBuddyPresenceStore
            .getState()
            .setOnlineUsers(buddyId, buddyPresenceUserIds(channel.presenceState()));
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED' && !disposed) void track(channel);
        });
    };

    const syncPresenceChannels = async () => {
      const { data, error } = await supabase
        .from('buddies')
        .select('id')
        .eq('status', 'active')
        .or(`user_a.eq.${userId},user_b.eq.${userId}`);
      if (disposed || error) return;

      const activeIds = new Set(((data as ActiveBuddyRow[] | null) ?? []).map((row) => row.id));
      for (const [buddyId, channel] of presenceChannels) {
        if (activeIds.has(buddyId)) continue;
        presenceChannels.delete(buddyId);
        useBuddyPresenceStore.getState().removeBuddy(buddyId);
        void supabase.removeChannel(channel);
      }
      for (const buddyId of activeIds) addPresenceChannel(buddyId);
    };

    void syncPresenceChannels();

    // Keep the channel set current when a request is accepted, paused, or removed.
    const relationshipChannel = supabase
      .channel(`buddy-presence-links:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'buddies', filter: `user_a=eq.${userId}` },
        () => void syncPresenceChannels()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'buddies', filter: `user_b=eq.${userId}` },
        () => void syncPresenceChannels()
      )
      .subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void syncPresenceChannels();
      for (const channel of presenceChannels.values()) void track(channel);
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
      void supabase.removeChannel(relationshipChannel);
      for (const channel of presenceChannels.values()) void supabase.removeChannel(channel);
      presenceChannels.clear();
      presenceStore.reset();
    };
  }, [authStatus, sandbox, userId]);

  return null;
}

"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, type ApiResult } from "@/lib/api/client";
import { auth } from "@/lib/firebase/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
export type InboxNotification = { id: string; title: string; message: string; read: boolean; status: string; category: string; essential: boolean; priority: string; actionUrl: string; createdAt: string };
type InboxPage = { notifications: InboxNotification[]; unreadCount: number; nextCursor: string | null };
export function useNotifications(cursor = "", filter = "all", category = "all") {
  const { user, loading } = useCurrentUser();
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["notification-inbox", user?.uid, cursor, filter, category], enabled: Boolean(user) && !loading,
    queryFn: async ({ signal }) => {
      const result = await apiRequest<InboxPage>(`/api/notifications?cursor=${encodeURIComponent(cursor)}&filter=${encodeURIComponent(filter)}&category=${encodeURIComponent(category)}`, { signal });
      if (!result.ok || !result.data) throw new Error("Notifications could not be loaded.");
      return result.data;
    }, staleTime: 30_000, refetchInterval: 60_000, refetchIntervalInBackground: false, retry: false });
  async function markRead(id?: string) {
    const uid = user?.uid;
    const checkIdentity = () => { if (!uid || auth?.currentUser?.uid !== uid) throw new Error("Please reload your account."); };
    checkIdentity();
    if (id) {
      const response = await apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
      if (!response.ok) throw new Error("This update could not be marked read.");
    } else {
      let cursor: string | null = null, before: string | undefined;
      const seen = new Set<string>();
      do {
        checkIdentity();
        const response: ApiResult<{ nextCursor: string | null; before: string }> = await apiRequest("/api/notifications", { method: "POST", body: JSON.stringify({ cursor, before }) });
        if (!response.ok || !response.data) throw new Error("Some notifications could not be updated. Please retry.");
        cursor = response.data.nextCursor; before = response.data.before;
        if (cursor && seen.has(cursor)) throw new Error("The notification update could not continue.");
        if (cursor) seen.add(cursor);
      } while (cursor);
    }
    await cache.invalidateQueries({ queryKey: ["notification-inbox", uid] });
  }
  return { ...query, markRead, user, authLoading: loading };
}
export function notificationTime(value: string) {
  const time = Date.parse(value); if (!Number.isFinite(time)) return "Time unavailable";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return new Date(time).toLocaleDateString();
}

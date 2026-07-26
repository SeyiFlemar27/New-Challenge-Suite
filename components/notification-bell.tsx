"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

type NotificationRecord = {
  id: string;
  title?: string;
  message?: string;
  body?: string;
  status?: string;
  read?: boolean;
  actionUrl?: string | null;
  createdAt?: string;
};

async function fetchNotifications() {
  const response = await fetch("/api/notifications", { cache: "no-store" });
  return response.json() as Promise<{ ok: boolean; data?: { notifications: NotificationRecord[]; unreadCount: number } }>;
}

export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { data, refetch } = useQuery({ queryKey: ["notification-bell"], queryFn: fetchNotifications, staleTime: 30_000 });
  const notifications = data?.ok ? data.data?.notifications ?? [] : [];
  const unreadCount = data?.ok ? data.data?.unreadCount ?? 0 : 0;

  async function markAllRead() {
    await fetch("/api/notifications", { method: "POST" }).catch(() => null);
    await refetch();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn("relative flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.025] px-3 text-xs font-bold text-slate-300 hover:border-[var(--gold)]/40", compact && "h-10 min-h-10 w-10 px-0")}
        aria-label="Open in-app notifications"
      >
        <Bell size={15} />
        {!compact ? <span>Alerts</span> : null}
        {unreadCount > 0 ? <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--gold)] px-1 text-[10px] font-black text-black">{Math.min(unreadCount, 99)}</span> : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-[8px] border border-[var(--gold)]/20 bg-[#111] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-sm font-black">In-app notifications</p>
            <button type="button" className="text-xs font-black text-[var(--gold)] disabled:text-slate-600" onClick={() => void markAllRead()} disabled={!unreadCount}>Mark read</button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length ? notifications.slice(0, 6).map((notification) => {
              const unread = notification.status === "unread" || notification.read === false;
              const content = (
                <div className={cn("border-b border-white/5 px-4 py-3 text-left hover:bg-white/[0.03]", unread && "bg-[var(--gold)]/5")}>
                  <p className="break-words text-sm font-black">{notification.title ?? "Notification"}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{notification.message ?? notification.body ?? "Notification update"}</p>
                </div>
              );
              return notification.actionUrl ? <Link key={notification.id} href={notification.actionUrl} onClick={() => setOpen(false)}>{content}</Link> : <div key={notification.id}>{content}</div>;
            }) : <p className="px-4 py-6 text-sm text-slate-400">No notifications yet.</p>}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block px-4 py-3 text-center text-sm font-black text-[var(--gold)]">View all notifications</Link>
        </div>
      ) : null}
    </div>
  );
}

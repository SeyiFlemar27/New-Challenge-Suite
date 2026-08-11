"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  const ref = useRef<HTMLDivElement>(null);
  const { data, refetch } = useQuery({ queryKey: ["notification-bell"], queryFn: fetchNotifications, staleTime: 30_000 });
  const notifications = data?.ok ? data.data?.notifications ?? [] : [];
  const unreadCount = data?.ok ? data.data?.unreadCount ?? 0 : 0;

  async function markAllRead() {
    await fetch("/api/notifications", { method: "POST" }).catch(() => null);
    await refetch();
  }
  function openNotification(notification: NotificationRecord) {
    if (notification.status === "unread" || notification.read === false) void fetch(`/api/notifications/${notification.id}/read`, { method: "POST" }).then(() => refetch()).catch(() => undefined);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn("relative flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.025] px-3 text-xs font-bold text-slate-300 hover:border-[var(--gold)]/40", compact && "h-10 min-h-10 w-10 px-0")}
        aria-label="Open notifications"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Bell size={15} />
        {!compact ? <span>Alerts</span> : null}
        {unreadCount > 0 ? <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--gold)] px-1 text-[10px] font-black text-black">{Math.min(unreadCount, 99)}</span> : null}
      </button>
      {open ? (
        <div role="menu" className="fixed inset-x-3 bottom-3 z-[90] max-h-[78dvh] overflow-hidden rounded-[8px] border border-yellow-300 bg-white text-slate-950 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:mt-2 sm:w-[min(92vw,400px)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div><p className="text-sm font-black">Notifications</p><p className="mt-0.5 text-xs text-slate-500">{unreadCount} unread</p></div>
            <button type="button" className="text-xs font-black text-amber-700 disabled:text-slate-400" onClick={() => void markAllRead()} disabled={!unreadCount}>Mark all as read</button>
          </div>
          <div className="max-h-[56dvh] overflow-y-auto sm:max-h-96">
            {notifications.length ? notifications.slice(0, 6).map((notification) => {
              const unread = notification.status === "unread" || notification.read === false;
              const content = (
                <div className={cn("relative border-b border-slate-100 px-4 py-3 text-left hover:bg-yellow-50", unread && "bg-amber-50 pl-7")}>
                  {unread ? <span className="absolute left-3 top-5 h-2 w-2 rounded-full bg-amber-500" aria-label="Unread" /> : null}
                  <p className="break-words text-sm font-black text-slate-950">{notification.title ?? "Notification"}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{notification.message ?? notification.body ?? "Notification update"}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{notification.createdAt ? new Date(notification.createdAt).toLocaleString() : "Time unavailable"}</p>
                </div>
              );
              return notification.actionUrl ? <Link key={notification.id} href={notification.actionUrl} onClick={() => openNotification(notification)}>{content}</Link> : <button type="button" className="block w-full" key={notification.id} onClick={() => openNotification(notification)}>{content}</button>;
            }) : <div className="px-5 py-8 text-center"><p className="text-sm font-black">No notifications yet.</p><p className="mt-1 text-xs text-slate-500">Updates about your challenges and account will appear here.</p></div>}
          </div>
          <div className="grid grid-cols-2 border-t border-slate-200"><Link href="/notifications" onClick={() => setOpen(false)} className="px-4 py-3 text-center text-sm font-black text-amber-700">View all</Link><Link href="/settings/notifications" onClick={() => setOpen(false)} className="border-l border-slate-200 px-4 py-3 text-center text-sm font-bold text-slate-700">Settings</Link></div>
        </div>
      ) : null}
    </div>
  );
}

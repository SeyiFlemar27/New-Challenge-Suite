"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, PageTitle } from "@/components/ui";

type NotificationRecord = {
  id: string;
  title?: string;
  message?: string;
  body?: string;
  status?: string;
  read?: boolean;
  priority?: string;
  type?: string;
  actionUrl?: string | null;
  createdAt?: string;
};

async function fetchNotifications() {
  const response = await fetch("/api/notifications", { cache: "no-store" });
  return response.json() as Promise<{ ok: boolean; message?: string; data?: { notifications: NotificationRecord[]; unreadCount: number } }>;
}

export default function NotificationsPage() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications, staleTime: 15_000 });
  const notifications = data?.ok ? data.data?.notifications ?? [] : [];
  const unreadCount = data?.ok ? data.data?.unreadCount ?? 0 : 0;

  async function markAllRead() {
    await fetch("/api/notifications", { method: "POST" }).catch(() => null);
    await refetch();
  }

  function openNotification(id: string, unread: boolean) {
    if (unread) void fetch(`/api/notifications/${id}/read`, { method: "POST" }).then(() => refetch()).catch(() => undefined);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageTitle title="Notifications" subtitle="In-app updates for challenges, payments, sponsorships, reviews, tournaments, and admin actions." icon={<Bell className="text-[var(--gold)]" />} />
          <Button variant="secondary" onClick={() => void markAllRead()} disabled={!unreadCount}><CheckCheck size={17} /> Mark All Read</Button>
        </div>

        <Card className="mt-6 border-[var(--gold)]/20 bg-[var(--gold)]/5 p-4 text-sm leading-6 text-slate-300">
          V1 notifications are in-app only. Email and push delivery are not active.
        </Card>

        {isLoading ? <div className="mt-8 space-y-3">{[0, 1, 2].map((item) => <Card key={item} className="h-24 animate-pulse bg-[#151515]" />)}</div> : null}

        {!isLoading && !data?.ok ? <Card className="mt-8 p-6 text-slate-300">{data?.message ?? "Notifications could not be loaded."}</Card> : null}

        {!isLoading && data?.ok && !notifications.length ? (
          <Card className="mt-8">
            <EmptyState icon={<Bell className="text-[var(--gold)]" />} title="No notifications yet" body="Real challenge, payment, sponsor, tournament, and admin events will appear here when they occur." />
          </Card>
        ) : null}

        {notifications.length ? (
          <div className="mt-8 space-y-3">
            {notifications.map((notification) => {
              const unread = notification.status === "unread" || notification.read === false;
              return <Link key={notification.id} href={notification.actionUrl ?? "/notifications/unavailable"} onClick={() => openNotification(notification.id, unread)} className="block rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" aria-label={`Open notification: ${notification.title ?? "Notification"}`}>
                <Card className={`p-5 transition hover:border-[var(--gold)]/45 hover:bg-[var(--gold)]/5 ${unread ? "border-[var(--gold)]/35 bg-[var(--gold)]/5" : "bg-[#141414]"}`}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-lg font-black">{notification.title ?? "Notification"}</h2>
                        {unread ? <span className="rounded-full bg-[var(--gold)] px-2 py-1 text-[10px] font-black uppercase text-black">Unread</span> : null}
                        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-slate-400">{notification.type ?? "update"}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{notification.message ?? notification.body ?? "Notification update"}</p>
                      <p className="mt-2 text-xs text-slate-500">{notification.createdAt ? new Date(notification.createdAt).toLocaleString() : "Time not available"}</p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-amber-700">Open</span>
                  </div>
                </Card>
              </Link>;
            })}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

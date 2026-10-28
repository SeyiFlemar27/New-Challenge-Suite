"use client";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { notificationTime, useNotifications } from "@/lib/hooks/use-notifications";
export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLElement>(null);
  const { data, isError, isLoading, markRead, refetch, user } = useNotifications();
  const seen = useRef<{ uid: string; ids: Set<string> }>({ uid: "", ids: new Set() });
  const [announcement, setAnnouncement] = useState({ uid: "", title: "" });
  useEffect(() => {
    if (!user?.uid || !data) return;
    if (seen.current.uid !== user.uid) { seen.current = { uid: user.uid, ids: new Set(data.notifications.map(item => item.id)) }; return; }
    const priority = data.notifications.find(item => !item.read && item.priority === "high" && !seen.current.ids.has(item.id));
    for (const item of data.notifications) seen.current.ids.add(item.id);
    if (!priority) return;
    try {
      const key = `notification-priority-seen:${user.uid}`;
      const shared: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (shared.includes(priority.id)) return;
      localStorage.setItem(key, JSON.stringify([...shared, priority.id].slice(-100)));
    } catch { /* Badge and inbox remain usable when browser storage is unavailable. */ }
    setAnnouncement({ uid: user.uid, title: `Priority update: ${priority.title}` });
  }, [data, user?.uid]);
  const unreadCount = data?.unreadCount ?? 0;
  useEffect(() => {
    if (!open) return;
    dialog.current?.querySelector<HTMLElement>("button, a")?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !dialog.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  async function readAll() { setSaving(true); setError(""); try { await markRead(); } catch (error) { setError(error instanceof Error ? error.message : "Please retry."); } finally { setSaving(false); } }
  return <div className={cn("relative rounded-lg", data?.notifications.some(item => !item.read && item.priority === "high") && "ring-2 ring-amber-300")} ref={root}>
    <p className="sr-only" aria-live="polite">{announcement.uid === user?.uid ? announcement.title : ""}</p>
    <button ref={trigger} type="button" onClick={() => setOpen(value => !value)} className={cn("relative flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:border-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500", compact && "h-11 w-11 px-0")} aria-label={`Open notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={open} aria-haspopup="dialog">
      <Bell size={17} />{!compact ? <span>Alerts</span> : null}{unreadCount > 0 ? <span aria-hidden="true" className="absolute -right-1 -top-1 rounded-full bg-[var(--gold)] px-1.5 text-[10px] leading-5 text-black">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
    </button>
    {open ? createPortal(<section ref={dialog} role="dialog" aria-label="Notifications" className="fixed inset-x-3 bottom-3 z-[90] max-h-[78dvh] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950 shadow-xl sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-20 sm:w-[min(92vw,400px)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h2 className="font-bold">Notifications</h2><p className="text-xs text-slate-500" aria-live="polite">{unreadCount} unread</p></div><button className="text-xs font-bold text-amber-800 disabled:text-slate-400" onClick={() => void readAll()} disabled={!unreadCount || saving}>{saving ? "Updating…" : "Mark all as read"}</button></div>
      {error ? <p role="alert" className="px-4 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="max-h-[52dvh] overflow-y-auto">{isLoading ? <p role="status" className="p-5 text-sm">Loading updates…</p> : isError ? <div className="p-5 text-sm"><p>Updates could not load.</p><button className="mt-2 font-bold text-amber-800" onClick={() => void refetch()}>Retry</button></div> : data?.notifications.length ? data.notifications.slice(0, 6).map(item => <Link key={item.id} href={item.actionUrl ?? "/notifications/unavailable"} onClick={() => { if (!item.read) void markRead(item.id).catch(() => undefined); setOpen(false); }} className={cn("block border-b border-slate-100 p-4 hover:bg-yellow-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500", !item.read && "bg-amber-50/70")}><p className="text-sm font-bold">{!item.read ? <span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-500" aria-label="Unread" /> : null}{item.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.message}</p><time className="mt-1 block text-xs text-slate-500" dateTime={item.createdAt}>{notificationTime(item.createdAt)}</time></Link>) : <p className="p-6 text-center text-sm text-slate-600">No notifications yet.</p>}</div>
      <footer className="flex justify-between border-t border-slate-100 p-4 text-sm font-bold"><Link href="/notifications" onClick={() => setOpen(false)}>View all notifications</Link><Link href="/settings/notifications" onClick={() => setOpen(false)}>Settings</Link></footer>
    </section>, document.body) : null}
  </div>;
}

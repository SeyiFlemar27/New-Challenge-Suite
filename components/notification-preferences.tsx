"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { Button, Card } from "@/components/ui";
import { OPTIONAL_NOTIFICATION_DEFAULTS, type OptionalNotificationCategory } from "@/lib/notification-policy";
import { auth } from "@/lib/firebase/client";
const labels: Record<OptionalNotificationCategory, string> = {
  voterResults: "Official results for challenges I only voted in", votingReminders: "One-hour voting reminders for my subscribed challenges",
  recommendations: "Challenge recommendations", promotions: "Creator and community promotions", communityUpdates: "Comments, replies and follower updates", directMessages: "Direct message updates", otherOptional: "Other nonessential announcements",
};
export function NotificationPreferences() {
  const { user, loading } = useCurrentUser(), cache = useQueryClient();
  const [draft, setDraft] = useState<{ uid: string; values: Partial<Record<OptionalNotificationCategory, boolean>> }>({ uid: "", values: {} });
  const [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  const query = useQuery({ queryKey: ["notification-preferences", user?.uid], enabled: Boolean(user) && !loading, queryFn: async ({ signal }) => {
    const response = await apiRequest<{ preferences: Record<OptionalNotificationCategory, boolean> }>("/api/notifications/preferences", { signal });
    if (!response.ok || !response.data) throw new Error("Settings could not load."); return response.data.preferences;
  } });
  const patch = draft.uid === user?.uid ? draft.values : {};
  async function save() {
    setSaving(true); setMessage("");
    try {
      if (!user?.uid || auth?.currentUser?.uid !== user.uid) throw new Error("Please reload your account.");
      const response = await apiRequest("/api/notifications/preferences", { method: "PATCH", body: JSON.stringify(patch) });
      if (!response.ok) throw new Error("Settings could not be saved. Please retry.");
      await cache.invalidateQueries({ queryKey: ["notification-preferences", user?.uid] });
      setMessage("Notification settings saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please retry."); } finally { setSaving(false); }
  }
  return <div className="space-y-5"><Card className="border-amber-200 bg-amber-50/50 p-5"><h2 className="font-bold text-slate-950">Essential updates are always enabled</h2><p className="mt-2 text-sm leading-6 text-slate-600">Participation deadlines, official results, payments, account security and important event or workspace decisions stay enabled across your accounts.</p></Card>
    {query.isLoading || loading ? <p role="status">Loading notification settings…</p> : query.isError ? <div><p>Settings could not load.</p><Button type="button" onClick={() => void query.refetch()}>Retry</Button></div> : <fieldset disabled={saving || !query.data} className="space-y-3"><legend className="mb-3 font-bold">Optional updates</legend>{(Object.keys(OPTIONAL_NOTIFICATION_DEFAULTS) as OptionalNotificationCategory[]).map(key => <label key={key} className="flex min-h-12 items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700"><span>{labels[key]}</span><input type="checkbox" checked={patch[key] ?? query.data?.[key] ?? OPTIONAL_NOTIFICATION_DEFAULTS[key]} onChange={event => setDraft({ uid: user?.uid ?? "", values: { ...patch, [key]: event.target.checked } })} className="h-5 w-5 accent-amber-500" /></label>)}<Button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save notification settings"}</Button></fieldset>}
    {message ? <p role="status" className="text-sm text-slate-700">{message}</p> : null}<p className="text-sm text-slate-500">These options control in-app updates. External delivery depends on separately verified services.</p>
  </div>;
}

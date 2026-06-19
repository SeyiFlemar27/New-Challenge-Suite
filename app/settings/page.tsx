"use client";

import { useState } from "react";
import { Bell, CheckCircle2, Shield, Settings as SettingsIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, PageTitle } from "@/components/ui";

export default function SettingsPage() {
  const [notifications, setNotifications] = useState(false);
  const [message, setMessage] = useState("");

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setMessage("This browser does not support notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifications(permission === "granted");
    setMessage(permission === "granted" ? "Notifications enabled for challenge updates." : "Notifications were not enabled.");
    await fetch("/api/notifications/enable", { method: "POST", body: JSON.stringify({ permission }) }).catch(() => null);
  }

  return (
    <AppShell>
      <PageTitle title="Settings" subtitle="Manage notification and account preferences." icon={<SettingsIcon className="text-[var(--gold)]" />} />
      <div className="mt-10 grid max-w-5xl gap-6 lg:grid-cols-2">
        <Card className="p-7">
          <h2 className="flex items-center gap-2 text-2xl font-black"><Bell className="text-[var(--gold)]" /> Notifications</h2>
          <p className="mt-3 text-slate-300">Enable alerts for challenge updates, votes, winner notices, and live event reminders.</p>
          <Button className="mt-6" onClick={enableNotifications}>{notifications ? "Notifications Enabled" : "Enable Notifications"}</Button>
          {message ? <p className="mt-4 flex items-center gap-2 rounded-[8px] bg-[#181818] p-3 text-sm text-slate-200"><CheckCircle2 size={17} /> {message}</p> : null}
        </Card>
        <Card className="p-7">
          <h2 className="flex items-center gap-2 text-2xl font-black"><Shield className="text-[var(--gold)]" /> Compliance</h2>
          <p className="mt-3 text-slate-300">Legal agreements are shown contextually for signup, voting, challenge entry, sponsorship, live events, and winner claims.</p>
          <div className="mt-6 rounded-[8px] border border-white/10 bg-black/30 p-4 font-bold">Current account agreement version accepted once per version.</div>
        </Card>
      </div>
    </AppShell>
  );
}

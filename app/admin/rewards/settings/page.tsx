"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Button, Card, Field, inputClass, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

export default function RewardSettingsPage() {
  const [settings, setSettings] = useState<any>({ thresholds: { basic: 100, standard: 250, premium: 500 }, tierEnabled: { basic: true, standard: true, premium: true } });
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiRequest<any>("/api/admin/rewards/settings").then((result) => result.ok && setSettings(result.data?.settings));
  }, []);

  async function save() {
    const result = await apiRequest("/api/admin/rewards/settings", {
      method: "PATCH",
      body: JSON.stringify({ ...settings, kycRequiredForHighValuePrizes: false })
    });
    setMessage(result.message);
  }

  return <>
    <PageTitle title="Reward Settings" subtitle="Configure thresholds, limits, campaign rules, maintenance, and reward safety." icon={<Settings />} />
    {message ? <Card className="mt-6 p-4 text-yellow-100">{message}</Card> : null}
    <Card className="mt-8 p-6">
      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Basic threshold"><input className={inputClass} type="number" value={settings.thresholds?.basic ?? 100} onChange={(event) => setSettings({ ...settings, thresholds: { ...settings.thresholds, basic: Number(event.target.value) } })} /></Field>
        <Field label="Standard threshold"><input className={inputClass} type="number" value={settings.thresholds?.standard ?? 250} onChange={(event) => setSettings({ ...settings, thresholds: { ...settings.thresholds, standard: Number(event.target.value) } })} /></Field>
        <Field label="Premium threshold"><input className={inputClass} type="number" value={settings.thresholds?.premium ?? 500} onChange={(event) => setSettings({ ...settings, thresholds: { ...settings.thresholds, premium: Number(event.target.value) } })} /></Field>
        <Field label="Points per DoroCoin"><input className={inputClass} type="number" value={settings.pointsPerDoroCoin ?? 1} onChange={(event) => setSettings({ ...settings, pointsPerDoroCoin: Number(event.target.value) })} /></Field>
        <Field label="Support contact"><input className={inputClass} value={settings.supportContact ?? ""} onChange={(event) => setSettings({ ...settings, supportContact: event.target.value })} /></Field>
      </div>
      <Field label="Public wheel rules"><textarea className={textareaClass} value={settings.publicWheelRules ?? ""} onChange={(event) => setSettings({ ...settings, publicWheelRules: event.target.value })} /></Field>
      <div className="mt-5 flex flex-wrap gap-4 text-sm font-bold">
        <label><input type="checkbox" checked={settings.rewardsEnabled !== false} onChange={(event) => setSettings({ ...settings, rewardsEnabled: event.target.checked })} /> Rewards enabled</label>
        <label><input type="checkbox" checked={Boolean(settings.maintenanceMode)} onChange={(event) => setSettings({ ...settings, maintenanceMode: event.target.checked })} /> Maintenance mode</label>
        <span>Identity verification is not required for current launch rewards.</span>
      </div>
      <Button onClick={save} className="mt-6">Save settings</Button>
    </Card>
  </>;
}

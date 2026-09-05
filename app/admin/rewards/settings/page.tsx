"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Button, Card, Field, inputClass, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { REWARD_WHEEL_POINT_COSTS } from "@/lib/reward-wheel-contracts";

type RewardSettings = {
  rewardsEnabled: boolean;
  maintenanceMode: boolean;
  tierEnabled: Record<keyof typeof REWARD_WHEEL_POINT_COSTS, boolean>;
  supportContact: string;
  publicWheelRules: string;
};

const initialSettings: RewardSettings = {
  rewardsEnabled: true,
  maintenanceMode: false,
  tierEnabled: { basic: true, standard: true, premium: true },
  supportContact: "",
  publicWheelRules: "",
};

export default function RewardSettingsPage() {
  const [settings, setSettings] = useState<RewardSettings>(initialSettings);
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiRequest<{ settings: RewardSettings }>("/api/admin/rewards/settings").then((result) => result.ok && result.data?.settings && setSettings(result.data.settings));
  }, []);

  async function save() {
    const result = await apiRequest("/api/admin/rewards/settings", {
      method: "PATCH",
      body: JSON.stringify({ ...settings, kycRequiredForHighValuePrizes: false })
    });
    setMessage(result.message);
  }

  return <>
    <PageTitle title="Reward Settings" subtitle="Configure availability, support, campaign rules, and reward safety." icon={<Settings />} />
    {message ? <Card className="mt-6 p-4 text-yellow-100">{message}</Card> : null}
    <Card className="mt-8 p-6">
      <div className="grid gap-5 md:grid-cols-3">
        {(Object.entries(REWARD_WHEEL_POINT_COSTS) as Array<[keyof typeof REWARD_WHEEL_POINT_COSTS, number]>).map(([tier, cost]) => <div key={tier} className="rounded-[8px] border border-[var(--line)] bg-[var(--panel-2)] p-4"><span className="text-xs font-black uppercase text-[var(--muted)]">{tier} Spin</span><strong className="mt-2 block text-xl">{cost.toLocaleString()} points</strong><span className="mt-1 block text-xs text-[var(--muted)]">Fixed platform cost</span><label className="mt-4 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={settings.tierEnabled[tier] !== false} onChange={(event) => setSettings({ ...settings, tierEnabled: { ...settings.tierEnabled, [tier]: event.target.checked } })} /> Tier enabled</label></div>)}
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

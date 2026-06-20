"use client";

import { useEffect, useState } from "react";
import { LockKeyhole, Palette, Save, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, LinkButton, PageTitle, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { fetchProfileCustomization, updateProfileCustomization } from "@/lib/api/services";
import { customizationOptions, defaultCustomization, type CustomizationOption, type ProfileCustomization } from "@/lib/customization/options";
import { getCustomizationAccess } from "@/lib/customization/access";

const sections: Array<{ key: keyof typeof customizationOptions; field: keyof ProfileCustomization; title: string; upgrade: string }> = [
  { key: "themes", field: "appThemeId", title: "App Theme", upgrade: "Upgrade to Premium" },
  { key: "accentColors", field: "accentColorId", title: "Accent Color", upgrade: "Upgrade to Premium" },
  { key: "badges", field: "profileBadgeId", title: "Profile Badge", upgrade: "Upgrade to Premium" },
  { key: "avatarRings", field: "avatarRingId", title: "Avatar Ring", upgrade: "Upgrade to Premium" },
  { key: "profileFrames", field: "profileFrameId", title: "Profile Frame", upgrade: "Upgrade to Premium" },
  { key: "dashboardStyles", field: "dashboardStyleId", title: "Dashboard Style", upgrade: "Upgrade to Premium" },
  { key: "celebrationEffects", field: "celebrationEffectId", title: "Celebration Effect", upgrade: "Upgrade to Premium" }
];

const planRank = { free: 0, premium: 1, creator_pro: 2, verified_host: 3 };

function requiredPlanLabel(planId: string) {
  if (planId === "creator_pro") return "Creator Pro";
  if (planId === "verified_host") return "Verified Host";
  if (planId === "premium") return "Premium";
  return "Free Member";
}

export default function CustomizationSettingsPage() {
  const [customization, setCustomization] = useState<ProfileCustomization>(defaultCustomization);
  const [access, setAccess] = useState(getCustomizationAccess({ planId: "free" }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await fetchProfileCustomization();
      if (cancelled) return;
      if (!result.ok || !result.data) {
        setError(result.message || "Customization could not be loaded.");
        setLoading(false);
        return;
      }
      setCustomization({ ...defaultCustomization, ...result.data.customization });
      setAccess(result.data.access as ReturnType<typeof getCustomizationAccess>);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function isLocked(option: CustomizationOption) {
    return planRank[access.planId] < planRank[option.requiredPlan];
  }

  function selectOption(field: keyof ProfileCustomization, option: CustomizationOption) {
    if (isLocked(option)) return;
    setCustomization((current) => ({ ...current, [field]: option.id }));
    setMessage("");
    setError("");
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    const result = await updateProfileCustomization(customization);
    setSaving(false);
    if (!result.ok) {
      setError(result.message || "Customization could not be saved.");
      return;
    }
    setMessage("Customization saved.");
  }

  return (
    <AppShell>
      <div className="max-w-6xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <PageTitle title="Customize Your Experience" subtitle="Personalize your Challenge Suite identity with approved premium presets." icon={<Palette className="text-[var(--gold)]" />} />
          <LinkButton href="/settings" variant="ghost">Back to Settings</LinkButton>
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_340px]">
          <div className="space-y-7">
            {loading ? <Card className="h-64 animate-pulse bg-[#151515]" /> : sections.map((section) => (
              <Card key={section.key} className="p-6">
                <h2 className="text-2xl font-black text-[var(--gold-2)]">{section.title}</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {customizationOptions[section.key].map((option) => {
                    const locked = isLocked(option);
                    const selected = customization[section.field] === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => selectOption(section.field, option)}
                        className={cn(
                          "min-h-32 rounded-[8px] border p-4 text-left transition",
                          selected ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-white/10 bg-[#171717]",
                          locked && "opacity-60"
                        )}
                      >
                        <div className={cn("h-10 rounded-[8px] border", option.previewClass)} />
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span className="font-black text-white">{option.name}</span>
                          {locked ? <LockKeyhole size={17} className="text-[var(--gold)]" /> : selected ? <ShieldCheck size={17} className="text-emerald-300" /> : null}
                        </div>
                        <p className="mt-2 text-xs font-bold text-[#8fa6ca]">{locked ? `${requiredPlanLabel(option.requiredPlan)} required` : "Available"}</p>
                      </button>
                    );
                  })}
                </div>
              </Card>
            ))}

            <Card className="p-6">
              <h2 className="text-2xl font-black text-[var(--gold-2)]">Creator Branding</h2>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <Field label="Profile Tagline">
                  <input className={inputClass} maxLength={120} value={customization.profileTagline ?? ""} onChange={(event) => setCustomization((current) => ({ ...current, profileTagline: event.target.value }))} />
                </Field>
                <Field label="Creator Brand Color">
                  <select className={inputClass} value={customization.creatorBrandColorId ?? ""} disabled={!access.canUseCreatorBranding} onChange={(event) => setCustomization((current) => ({ ...current, creatorBrandColorId: event.target.value }))}>
                    <option value="">Default</option>
                    {customizationOptions.accentColors.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </Field>
              </div>
              <p className="mt-4 text-sm text-[#8fa6ca]">{access.canUseCreatorBranding ? "Creator branding is available on your plan." : "Creator logo, public creator theme, and advanced brand controls require Creator Pro."}</p>
            </Card>

            <Card className="p-6">
              <h2 className="text-2xl font-black text-[var(--gold-2)]">Verified Host Branding</h2>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <Field label="Host Badge Style">
                  <select className={inputClass} value={customization.hostBadgeStyleId ?? ""} disabled={!access.canUseVerifiedHostBranding} onChange={(event) => setCustomization((current) => ({ ...current, hostBadgeStyleId: event.target.value }))}>
                    <option value="">Default</option>
                    <option value="verified_host">Verified Host</option>
                    <option value="elite_host">Elite Host</option>
                  </select>
                </Field>
                <Field label="Host Organization Logo">
                  <input className={inputClass} type="file" disabled />
                </Field>
              </div>
              <p className="mt-4 text-sm text-[#8fa6ca]">{access.canUseVerifiedHostBranding ? "Official host branding is available on your plan." : "Verified host frame, trust badge, and live-event branding require Verified Host approval."}</p>
            </Card>
          </div>

          <div className="xl:sticky xl:top-8">
            <Card className="p-6">
              <h2 className="text-2xl font-black">Live Preview</h2>
              <div className="mt-5 rounded-[8px] border border-[var(--gold)]/40 bg-black p-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-[var(--gold)] bg-indigo-500 font-black">CS</div>
                  <div>
                    <div className="text-xl font-black">Challenge Suite</div>
                    <div className="text-sm text-[#8fa6ca]">{customization.profileTagline || access.planName}</div>
                  </div>
                </div>
                <div className="mt-5 rounded-[8px] border border-white/10 bg-[#151515] p-4">
                  <div className="text-sm font-bold text-[var(--gold)]">Selected badge</div>
                  <div className="mt-2 text-lg font-black">{customization.profileBadgeId.replaceAll("_", " ")}</div>
                </div>
              </div>
              {error ? <p className="mt-4 rounded-[8px] bg-red-950/50 p-3 text-sm font-bold text-red-200">{error}</p> : null}
              {message ? <p className="mt-4 rounded-[8px] bg-emerald-950/40 p-3 text-sm font-bold text-emerald-200">{message}</p> : null}
              <Button className="mt-5 w-full" onClick={save} disabled={saving || loading}><Save size={17} /> {saving ? "Saving..." : "Save Customization"}</Button>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}


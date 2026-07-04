"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Award, BadgeCheck, BarChart3, CheckCircle2, Crown, Diamond, Flame, Gem, LockKeyhole, Palette, RotateCcw, Save, ShieldCheck, Sparkles, Star, Trophy, UserRound, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, LinkButton, PageTitle, inputClass } from "@/components/ui";
import { PremiumBadge } from "@/components/brand";
import { cn } from "@/lib/utils";
import { fetchProfileCustomization, updateProfileCustomization } from "@/lib/api/services";
import { customizationOptions, defaultCustomization, findCustomizationOption, type CustomizationOption, type ProfileCustomization } from "@/lib/customization/options";
import { getCustomizationAccess } from "@/lib/customization/access";
import type { ProductPlanId } from "@/lib/plan-access";

type CategoryKey = "identity" | "badges" | "theme" | "profile" | "dashboard" | "effects" | "creator" | "host";
type PreviewTab = "profile" | "badge" | "dashboard" | "challenge";

const planRank: Record<ProductPlanId, number> = { free: 0, premium: 1, creator_pro: 2, verified_host: 3 };

const categories: Array<{ id: CategoryKey; label: string; icon: ReactNode; summary: string }> = [
  { id: "identity", label: "Identity", icon: <UserRound size={16} />, summary: "Name presence, tagline, and account expression." },
  { id: "badges", label: "Badges", icon: <BadgeCheck size={16} />, summary: "Collectible premium badge styles." },
  { id: "theme", label: "Theme", icon: <Palette size={16} />, summary: "App theme and approved accent color." },
  { id: "profile", label: "Profile", icon: <Gem size={16} />, summary: "Avatar rings and profile frames." },
  { id: "dashboard", label: "Dashboard", icon: <BarChart3 size={16} />, summary: "Cards and dashboard atmosphere." },
  { id: "effects", label: "Effects", icon: <Sparkles size={16} />, summary: "Celebration and premium vote effects." },
  { id: "creator", label: "Creator Studio", icon: <Crown size={16} />, summary: "Creator Pro brand controls." },
  { id: "host", label: "Verified Host", icon: <ShieldCheck size={16} />, summary: "Official live-event host identity." }
];

const categorySections: Record<CategoryKey, Array<{ title: string; field: keyof ProfileCustomization; options: CustomizationOption[] }>> = {
  identity: [
    { title: "Profile Badge", field: "profileBadgeId", options: customizationOptions.badges },
    { title: "Accent Color", field: "accentColorId", options: customizationOptions.accentColors }
  ],
  badges: [{ title: "Collectible Badge Style", field: "profileBadgeId", options: customizationOptions.badges }],
  theme: [
    { title: "App Theme", field: "appThemeId", options: customizationOptions.themes },
    { title: "Accent Color", field: "accentColorId", options: customizationOptions.accentColors }
  ],
  profile: [
    { title: "Avatar Ring", field: "avatarRingId", options: customizationOptions.avatarRings },
    { title: "Profile Frame", field: "profileFrameId", options: customizationOptions.profileFrames }
  ],
  dashboard: [
    { title: "Dashboard Style", field: "dashboardStyleId", options: customizationOptions.dashboardStyles },
    { title: "Challenge Card Style", field: "cardStyleId", options: customizationOptions.dashboardStyles }
  ],
  effects: [
    { title: "Celebration Effect", field: "celebrationEffectId", options: customizationOptions.celebrationEffects },
    { title: "Premium Vote Effect", field: "voteEffectId", options: customizationOptions.voteEffects }
  ],
  creator: [
    { title: "Creator Theme", field: "publicProfileThemeId", options: customizationOptions.themes.filter((option) => option.requiredPlan !== "free") },
    { title: "Creator Brand Color", field: "creatorBrandColorId", options: customizationOptions.accentColors }
  ],
  host: [
    { title: "Host Badge Style", field: "hostBadgeStyleId", options: customizationOptions.badges.filter((option) => option.requiredPlan === "verified_host") },
    { title: "Host Event Card Style", field: "cardStyleId", options: customizationOptions.dashboardStyles.filter((option) => option.requiredPlan !== "free") }
  ]
};

const badgeIconById: Record<string, React.ReactNode> = {
  free_member: <BadgeCheck size={18} />,
  premium_gold: <Star size={18} />,
  premium_diamond: <Diamond size={18} />,
  creator_pro: <Crown size={18} />,
  top_voter: <Flame size={18} />,
  rising_star: <Sparkles size={18} />,
  verified_host: <ShieldCheck size={18} />,
  elite_host: <Award size={18} />
};

function requiredPlanLabel(planId: string) {
  if (planId === "creator_pro") return "Creator Pro";
  if (planId === "verified_host") return "Verified Host";
  if (planId === "premium") return "Premium";
  return "Free Member";
}

function unlockCta(planId: ProductPlanId) {
  if (planId === "verified_host") return { href: "/live-events/host/apply", label: "Apply for Verified Host" };
  if (planId === "creator_pro") return { href: "/subscriptions", label: "Upgrade to Creator Pro" };
  return { href: "/subscriptions", label: "Upgrade to Premium" };
}

function countChanges(a: ProfileCustomization, b: ProfileCustomization) {
  const keys = Object.keys({ ...a, ...b }) as Array<keyof ProfileCustomization>;
  return keys.filter((key) => (a[key] ?? "") !== (b[key] ?? "")).length;
}

export default function CustomizationSettingsPage() {
  const [customization, setCustomization] = useState<ProfileCustomization>(defaultCustomization);
  const [savedCustomization, setSavedCustomization] = useState<ProfileCustomization>(defaultCustomization);
  const [access, setAccess] = useState(getCustomizationAccess({ planId: "free" }));
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("identity");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("profile");
  const [lockedOption, setLockedOption] = useState<CustomizationOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const changeCount = useMemo(() => countChanges(customization, savedCustomization), [customization, savedCustomization]);
  const hasChanges = changeCount > 0;
  const selectedBadge = findCustomizationOption(customization.profileBadgeId, "badge");
  const selectedTheme = findCustomizationOption(customization.appThemeId, "theme");
  const selectedDashboardStyle = findCustomizationOption(customization.dashboardStyleId, "dashboardStyle");

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
      const loaded = { ...defaultCustomization, ...result.data.customization };
      setCustomization(loaded);
      setSavedCustomization(loaded);
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
    if (isLocked(option)) {
      setLockedOption(option);
      return;
    }
    setCustomization((current) => ({ ...current, [field]: option.id }));
    setMessage("");
    setError("");
  }

  function updateField(field: keyof ProfileCustomization, value: string) {
    setCustomization((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  }

  function resetChanges() {
    setCustomization(savedCustomization);
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
    setSavedCustomization(customization);
    setMessage("Customization saved.");
  }

  const currentCategory = categories.find((category) => category.id === activeCategory) ?? categories[0];

  return (
    <AppShell>
      <div className="max-w-7xl pb-24 lg:pb-0">
        <div className="overflow-hidden rounded-[8px] border border-[var(--gold)]/25 bg-[radial-gradient(circle_at_top_left,rgba(245,217,10,.16),transparent_30%),#090909] p-5 md:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <PageTitle title="Profile Appearance" subtitle="Choose approved visual options for your public profile and creator presence." icon={<Palette className="text-[var(--gold)]" />} />
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/settings" variant="ghost">Back to Settings</LinkButton>
              <LinkButton href="/subscriptions" variant="secondary">View Plans</LinkButton>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[["Plan", access.planName], ["Unlocked", access.isVerifiedHost ? "Host Elite" : access.isCreatorPro ? "Creator Studio" : access.isPremium ? "Premium" : "Basics"], ["Active Style", selectedTheme?.name ?? "Default"], ["Unsaved", hasChanges ? `${changeCount} changes` : "All saved"]].map(([label, value]) => (
              <div key={label} className="rounded-[8px] border border-white/10 bg-black/40 p-4">
                <div className="text-xs font-bold uppercase tracking-[.18em] text-[#8fa6ca]">{label}</div>
                <div className="mt-2 text-lg font-black text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="sticky top-0 z-10 -mx-5 mt-5 bg-black/90 px-5 py-3 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:py-0">
          <div className="scrollbar-dark flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={cn("inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-black transition", activeCategory === category.id ? "border-[var(--gold)] bg-[var(--gold)] text-black gold-glow" : "border-white/10 bg-[#141414] text-slate-200")}
              >
                {category.icon}
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0 space-y-6">
            <Card className="p-5 md:p-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-2xl font-black text-[var(--gold-2)]">{currentCategory.icon}{currentCategory.label}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#8fa6ca]">{currentCategory.summary}</p>
                </div>
                {hasChanges ? <span className="rounded-full border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-3 py-1 text-xs font-black text-[var(--gold-2)]">Unsaved changes</span> : null}
              </div>
            </Card>

            {loading ? (
              <Card className="h-80 animate-pulse bg-[#151515]" />
            ) : (
              categorySections[activeCategory].map((section) => (
                <Card key={`${activeCategory}-${section.title}`} className="p-5 md:p-6">
                  <h3 className="text-xl font-black text-white">{section.title}</h3>
                  <div className="scrollbar-dark mt-5 flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-3">
                    {section.options.map((option) => (
                      <OptionCard
                        key={`${section.field}-${option.id}`}
                        option={option}
                        selected={customization[section.field] === option.id}
                        locked={isLocked(option)}
                        onClick={() => selectOption(section.field, option)}
                      />
                    ))}
                  </div>
                </Card>
              ))
            )}

            {activeCategory === "identity" || activeCategory === "creator" ? (
              <Card className="p-5 md:p-6">
                <h3 className="text-xl font-black text-white">Premium Profile Text</h3>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <Field label="Profile Tagline">
                    <input className={inputClass} maxLength={120} value={customization.profileTagline ?? ""} onChange={(event) => updateField("profileTagline", event.target.value)} placeholder="Competing to win." disabled={!access.canUsePremiumCustomization} />
                  </Field>
                  <Field label="Creator Logo">
                    <input className={inputClass} type="file" disabled />
                  </Field>
                </div>
                <p className="mt-4 text-sm text-[#8fa6ca]">{access.canUsePremiumCustomization ? "Taglines are saved safely with a 120 character limit. Logo upload is a backend-ready placeholder." : "Profile tagline unlocks with Premium."}</p>
              </Card>
            ) : null}

            {activeCategory === "host" ? (
              <Card className="p-5 md:p-6">
                <h3 className="text-xl font-black text-white">Official Host Branding</h3>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <Field label="Host Organization Logo">
                    <input className={inputClass} type="file" disabled />
                  </Field>
                  <Field label="Event Banner">
                    <input className={inputClass} type="file" disabled />
                  </Field>
                </div>
                <p className="mt-4 text-sm text-[#8fa6ca]">{access.canUseVerifiedHostBranding ? "Upload controls are placeholders until the storage workflow is connected." : "Official host branding requires Verified Host approval."}</p>
              </Card>
            ) : null}
          </div>

          <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
            <Card className="overflow-hidden border-[var(--gold)]/25 bg-[#101010]">
              <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(245,217,10,.12),transparent_45%)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-black">Live Preview</h2>
                    <p className="mt-1 text-sm text-[#8fa6ca]">See how your identity appears.</p>
                  </div>
                  <PremiumBadge planId={access.planId} badgeStyleId={customization.profileBadgeId} compact />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {(["profile", "badge", "dashboard", "challenge"] as PreviewTab[]).map((tab) => (
                    <button key={tab} onClick={() => setPreviewTab(tab)} className={cn("h-10 rounded-[8px] text-xs font-black capitalize", previewTab === tab ? "bg-[var(--gold)] text-black" : "bg-black/40 text-slate-200")}>{tab}</button>
                  ))}
                </div>
              </div>
              <div className="p-5">
                {previewTab === "profile" ? <ProfilePreview customization={customization} access={access} /> : null}
                {previewTab === "badge" ? <BadgePreview option={selectedBadge} access={access} /> : null}
                {previewTab === "dashboard" ? <DashboardPreview dashboardStyle={selectedDashboardStyle} /> : null}
                {previewTab === "challenge" ? <ChallengePreview customization={customization} access={access} /> : null}
                {error ? <p className="mt-4 rounded-[8px] bg-red-950/50 p-3 text-sm font-bold text-red-200">{error}</p> : null}
                {message ? <p className="mt-4 rounded-[8px] bg-emerald-950/40 p-3 text-sm font-bold text-emerald-200">{message}</p> : null}
                <div className="mt-5 hidden gap-3 xl:flex">
                  <Button className="flex-1" onClick={save} disabled={saving || loading || !hasChanges}><Save size={17} /> {saving ? "Saving..." : "Save"}</Button>
                  <Button variant="ghost" onClick={resetChanges} disabled={!hasChanges}><RotateCcw size={17} /> Reset</Button>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </div>

      {lockedOption ? <UnlockPanel option={lockedOption} onClose={() => setLockedOption(null)} /> : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/90 p-3 backdrop-blur xl:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black">{hasChanges ? `${changeCount} unsaved change${changeCount === 1 ? "" : "s"}` : "All customization saved"}</div>
            <div className="truncate text-xs text-[#8fa6ca]">{selectedBadge?.name ?? "Free Member"} selected</div>
          </div>
          <Button variant="ghost" onClick={resetChanges} disabled={!hasChanges}>Reset</Button>
          <Button onClick={save} disabled={saving || loading || !hasChanges}>{saving ? "Saving" : "Save"}</Button>
        </div>
      </div>
    </AppShell>
  );
}

function OptionCard({ option, selected, locked, onClick }: { option: CustomizationOption; selected: boolean; locked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-[250px] shrink-0 rounded-[8px] border p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--gold)]/60 md:w-auto",
        selected ? "border-[var(--gold)] bg-[var(--gold)]/10 gold-glow" : "border-white/10 bg-[#151515]",
        locked && "opacity-70"
      )}
    >
      <div className={cn("relative flex h-24 items-center justify-center overflow-hidden rounded-[8px] border", option.previewClass)}>
        {option.category === "badge" ? <div className="scale-110"><PremiumVisualBadge option={option} /></div> : <div className="h-10 w-20 rounded-[8px] border border-white/20 bg-black/35" />}
        {locked ? <div className="absolute right-3 top-3 rounded-full bg-black/70 p-2 text-[var(--gold)]"><LockKeyhole size={15} /></div> : null}
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-black text-white">{option.name}</div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#8fa6ca]">{option.description ?? "Approved customization preset."}</p>
        </div>
        {selected ? <CheckCircle2 className="shrink-0 text-emerald-300" size={18} /> : null}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] font-black text-slate-300">{requiredPlanLabel(option.requiredPlan)}</span>
        <span className={cn("text-[11px] font-black", selected ? "text-[var(--gold)]" : locked ? "text-slate-400" : "text-emerald-300")}>{selected ? "Currently using" : locked ? "Locked" : "Unlocked"}</span>
      </div>
    </button>
  );
}

function PremiumVisualBadge({ option }: { option: CustomizationOption }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black", option.previewClass)}>
      {badgeIconById[option.id] ?? <BadgeCheck size={18} />}
      {option.name}
    </span>
  );
}

function ProfilePreview({ customization, access }: { customization: ProfileCustomization; access: ReturnType<typeof getCustomizationAccess> }) {
  const ring = findCustomizationOption(customization.avatarRingId, "avatarRing")?.previewClass;
  const frame = findCustomizationOption(customization.profileFrameId, "profileFrame")?.previewClass;
  return (
    <div className={cn("rounded-[8px] border bg-black/40 p-5", frame)}>
      <div className="flex items-center gap-4">
        <div className={cn("flex h-20 w-20 items-center justify-center rounded-full border-4 bg-indigo-500 text-2xl font-black", ring)}>CS</div>
        <div className="min-w-0">
          <div className="text-xl font-black">Demo Member</div>
          <div className="mt-1 text-sm text-[#8fa6ca]">{customization.profileTagline || access.planName}</div>
          <div className="mt-3"><PremiumBadge planId={access.planId} badgeStyleId={customization.profileBadgeId} compact /></div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {["Points", "Wins", "Votes"].map((label, index) => <div key={label} className="rounded-[8px] bg-[#161616] p-3 text-center"><div className="text-lg font-black">{[12840, 12, 500][index]}</div><div className="text-xs text-[#8fa6ca]">{label}</div></div>)}
      </div>
    </div>
  );
}

function BadgePreview({ option, access }: { option: CustomizationOption | null; access: ReturnType<typeof getCustomizationAccess> }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(245,217,10,.18),transparent_45%),#050505] p-6 text-center">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-[var(--gold)]/40 bg-[var(--gold)]/10 gold-glow">
        {option ? badgeIconById[option.id] ?? <BadgeCheck size={38} /> : <BadgeCheck size={38} />}
      </div>
      <div className="mt-5 flex justify-center">{option ? <PremiumVisualBadge option={option} /> : <PremiumBadge planId={access.planId} />}</div>
      <p className="mt-4 text-sm leading-6 text-[#8fa6ca]">{option?.description ?? "Choose a badge to define your public identity."}</p>
    </div>
  );
}

function DashboardPreview({ dashboardStyle }: { dashboardStyle: CustomizationOption | null }) {
  return (
    <div className={cn("rounded-[8px] border border-white/10 p-4", dashboardStyle?.previewClass ?? "bg-[#121212]")}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[8px] bg-black/45 p-3"><Wallet size={18} className="text-[var(--gold)]" /><div className="mt-3 text-xl font-black">500</div><div className="text-xs text-[#8fa6ca]">DoroCoins</div></div>
        <div className="rounded-[8px] bg-black/45 p-3"><Trophy size={18} className="text-[var(--gold)]" /><div className="mt-3 text-xl font-black">12.8k</div><div className="text-xs text-[#8fa6ca]">Points</div></div>
      </div>
      <div className="mt-3 rounded-[8px] border border-white/10 bg-black/45 p-4">
        <div className="text-sm font-black">Neon City Photo Battle</div>
        <div className="mt-2 h-2 rounded-full bg-[var(--gold)]/60" />
      </div>
    </div>
  );
}

function ChallengePreview({ customization, access }: { customization: ProfileCustomization; access: ReturnType<typeof getCustomizationAccess> }) {
  const cardStyle = findCustomizationOption(customization.cardStyleId, "dashboardStyle")?.previewClass;
  return (
    <div className={cn("rounded-[8px] border border-white/10 p-4", cardStyle ?? "bg-[#121212]")}>
      <div className="h-28 rounded-[8px] bg-[linear-gradient(135deg,#111827,#f5d90a)]" />
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-black">Creator Showdown</div>
          <div className="mt-1 text-sm text-[#8fa6ca]">Challenge card preview</div>
        </div>
        {access.isVerifiedHost ? <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-200">Verified Host</span> : access.isCreatorPro ? <span className="rounded-full bg-fuchsia-400/15 px-3 py-1 text-xs font-black text-fuchsia-200">Creator Pro</span> : null}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-xs font-black">{access.isCreatorPro ? "LOGO" : "CS"}</div>
        <div className="text-sm text-[#8fa6ca]">{access.isCreatorPro ? "Creator branding visible" : "Upgrade to unlock creator branding"}</div>
      </div>
    </div>
  );
}

function UnlockPanel({ option, onClose }: { option: CustomizationOption; onClose: () => void }) {
  const cta = unlockCta(option.requiredPlan);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-4 backdrop-blur sm:items-center sm:justify-center">
      <Card className="w-full max-w-lg border-[var(--gold)]/30 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-[8px] bg-[var(--gold)]/15 p-3 text-[var(--gold)]"><LockKeyhole size={24} /></div>
          <div>
            <h2 className="text-2xl font-black">{option.name}</h2>
            <p className="mt-2 text-sm leading-6 text-[#8fa6ca]">{option.description ?? "This premium customization is locked on your current plan."}</p>
            <p className="mt-4 rounded-[8px] border border-white/10 bg-black/30 p-3 text-sm font-bold">Requires {requiredPlanLabel(option.requiredPlan)}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <LinkButton href={cta.href} className="flex-1">{cta.label}</LinkButton>
          <Button variant="ghost" onClick={onClose} className="flex-1">Keep Current Style</Button>
        </div>
      </Card>
    </div>
  );
}

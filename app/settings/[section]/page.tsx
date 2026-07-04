"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, CreditCard, LockKeyhole, Palette, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type SettingsData = {
  account: { displayName: string; username: string; email: string; phone: string; accountType: string; planId: string; subscriptionStatus: string; effectiveTier?: { id: string; displayName: string } };
  profile: { avatarUrl: string; coverImageUrl: string; bio: string; location: string; website: string; socialLinks: string[]; categoryInterests: string[] };
  profileVisibility: string;
  privacy: Record<string, boolean>;
  notifications: Record<string, boolean>;
  preferences: { favoriteCategories: string[]; preferredChallengeTypes: string[]; locationPreference: string; contentLanguage: string; matureContent: boolean; appearance: "system" | "light" | "dark" };
};

type Group = "account" | "profile" | "privacy" | "notifications" | "preferences";
type Update = (group: Group, field: string, value: unknown) => void;

const defaults: SettingsData = {
  account: { displayName: "", username: "", email: "", phone: "", accountType: "user", planId: "free", subscriptionStatus: "free" },
  profile: { avatarUrl: "", coverImageUrl: "", bio: "", location: "", website: "", socialLinks: [], categoryInterests: [] },
  profileVisibility: "public",
  privacy: { showFollowersFollowing: true, showActivity: true, showWins: true, showParticipatedChallenges: true, allowMessages: true, allowSponsorMessages: true, showEarnings: false },
  notifications: { challengeReminders: true, liveChallengeReminders: true, voteNotifications: true, commentsReplies: true, followerNotifications: true, sponsorRequestUpdates: true, billingAlerts: true, email: true, push: false, inApp: true },
  preferences: { favoriteCategories: [], preferredChallengeTypes: [], locationPreference: "", contentLanguage: "English", matureContent: false, appearance: "system" }
};

const sections = new Set(["account", "profile", "appearance", "notifications", "privacy", "security", "billing", "wallet", "preferences", "danger"]);

export default function SettingsSectionPage() {
  const params = useParams<{ section: string }>();
  const section = sections.has(params.section) ? params.section : "account";
  const [settings, setSettings] = useState<SettingsData>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  useEffect(() => {
    void apiRequest<SettingsData>("/api/settings").then((result) => {
      if (result.ok && result.data) {
        setSettings({
          ...defaults,
          ...result.data,
          account: { ...defaults.account, ...result.data.account },
          profile: { ...defaults.profile, ...result.data.profile },
          privacy: { ...defaults.privacy, ...result.data.privacy },
          notifications: { ...defaults.notifications, ...result.data.notifications },
          preferences: { ...defaults.preferences, ...result.data.preferences }
        });
      } else setNotice(result.message);
      setLoading(false);
    });
  }, []);

  function update(group: Group, field: string, value: unknown) {
    setSettings((current) => ({ ...current, [group]: { ...current[group], [field]: value } }));
  }

  function list(value: string) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  async function save() {
    setSaving(true);
    const result = await apiRequest("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: settings.account.displayName,
        username: settings.account.username,
        phone: settings.account.phone,
        avatarUrl: settings.profile.avatarUrl,
        coverImageUrl: settings.profile.coverImageUrl,
        bio: settings.profile.bio,
        location: settings.profile.location,
        website: settings.profile.website,
        socialLinks: settings.profile.socialLinks,
        categoryInterests: settings.profile.categoryInterests,
        profileVisibility: settings.profileVisibility,
        privacy: settings.privacy,
        notifications: settings.notifications,
        preferences: settings.preferences
      })
    });
    setNotice(result.message);
    setSaving(false);
  }

  async function cancelSubscription() {
    setCanceling(true);
    const result = await apiRequest<{ webhookPending: boolean }>("/api/stripe/subscription", { method: "PATCH", body: JSON.stringify({ action: "cancel" }) });
    setNotice(result.message);
    setCanceling(false);
    if (result.ok) setConfirmCancel(false);
  }

  function chooseAppearance(value: "system" | "light" | "dark") {
    update("preferences", "appearance", value);
    document.documentElement.dataset.theme = value;
    localStorage.setItem("challenge-suite-appearance", value);
  }

  if (loading) return <AppShell><Card className="h-[420px] animate-pulse bg-[#171717]" /></AppShell>;
  const editable = ["account", "profile", "appearance", "notifications", "privacy", "preferences"].includes(section);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <LinkButton href="/settings" variant="ghost"><ArrowLeft size={17} /> All Settings</LinkButton>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <PageTitle title={title(section)} subtitle={description(section)} />
          {editable ? <Button className="w-full sm:w-auto" onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button> : null}
        </div>
        {notice ? <Card className="mt-5 p-4 text-sm text-slate-300">{notice}</Card> : null}
        <Card className={`mt-7 p-5 sm:p-7 ${section === "danger" ? "border-red-500/30" : ""}`}>
          {section === "account" ? <Account settings={settings} update={update} /> : null}
          {section === "profile" ? <Profile settings={settings} update={update} list={list} /> : null}
          {section === "appearance" ? <Appearance value={settings.preferences.appearance} choose={chooseAppearance} /> : null}
          {section === "notifications" ? <ToggleList values={settings.notifications} onChange={(key, value) => update("notifications", key, value)} /> : null}
          {section === "privacy" ? <Privacy settings={settings} update={update} setSettings={setSettings} /> : null}
          {section === "security" ? <Security /> : null}
          {section === "billing" ? <Billing settings={settings} confirmCancel={confirmCancel} setConfirmCancel={setConfirmCancel} canceling={canceling} cancelSubscription={cancelSubscription} /> : null}
          {section === "wallet" ? <Wallet /> : null}
          {section === "preferences" ? <Preferences settings={settings} update={update} list={list} /> : null}
          {section === "danger" ? <Danger deleteText={deleteText} setDeleteText={setDeleteText} /> : null}
        </Card>
      </div>
    </AppShell>
  );
}

function Account({ settings, update }: { settings: SettingsData; update: Update }) {
  return <div className="space-y-6"><Field label="Name"><input className={inputClass} value={settings.account.displayName} onChange={(event) => update("account", "displayName", event.target.value)} /></Field><Field label="Username"><input className={inputClass} value={settings.account.username} onChange={(event) => update("account", "username", event.target.value)} /></Field><Field label="Email"><input className={inputClass} value={settings.account.email} disabled /></Field><Field label="Phone"><input className={inputClass} value={settings.account.phone} onChange={(event) => update("account", "phone", event.target.value)} /></Field><p className="rounded-[8px] bg-black/30 p-4 text-sm capitalize text-slate-300">Account type: <b>{settings.account.accountType}</b> · Access: <b>{settings.account.effectiveTier?.displayName ?? settings.account.planId}</b></p></div>;
}

function Profile({ settings, update, list }: { settings: SettingsData; update: Update; list: (value: string) => string[] }) {
  return <div className="space-y-6"><Field label="Avatar URL"><input className={inputClass} value={settings.profile.avatarUrl} onChange={(event) => update("profile", "avatarUrl", event.target.value)} /></Field><Field label="Cover Image URL"><input className={inputClass} value={settings.profile.coverImageUrl} onChange={(event) => update("profile", "coverImageUrl", event.target.value)} /></Field><Field label="Bio"><textarea className={textareaClass} value={settings.profile.bio} onChange={(event) => update("profile", "bio", event.target.value)} /></Field><Field label="Location"><input className={inputClass} value={settings.profile.location} onChange={(event) => update("profile", "location", event.target.value)} /></Field><Field label="Website"><input className={inputClass} value={settings.profile.website} onChange={(event) => update("profile", "website", event.target.value)} /></Field><Field label="Social Links"><input className={inputClass} value={settings.profile.socialLinks.join(", ")} onChange={(event) => update("profile", "socialLinks", list(event.target.value))} /></Field><Field label="Category Interests"><input className={inputClass} value={settings.profile.categoryInterests.join(", ")} onChange={(event) => update("profile", "categoryInterests", list(event.target.value))} /></Field></div>;
}

function Appearance({ value, choose }: { value: string; choose: (value: "system" | "light" | "dark") => void }) {
  return <div><div className="flex items-center gap-3"><Palette className="text-[var(--gold)]" /><h2 className="text-xl font-black">Display Preference</h2></div><div className="mt-6 grid gap-3 sm:grid-cols-3">{(["system", "light", "dark"] as const).map((option) => <button key={option} type="button" onClick={() => choose(option)} className={`min-h-14 rounded-[8px] border px-4 font-bold capitalize ${value === option ? "border-[var(--gold)] bg-[var(--gold)] text-black" : "border-white/10 bg-black/30"}`}>{option === "system" ? "System Default" : `${option} Mode`}</button>)}</div><p className="mt-5 text-sm text-slate-400">This preference is persisted as a theme foundation. Complete light-theme token coverage remains future visual work.</p></div>;
}

function Privacy({ settings, update, setSettings }: { settings: SettingsData; update: Update; setSettings: React.Dispatch<React.SetStateAction<SettingsData>> }) {
  return <div className="space-y-5"><Field label="Profile Visibility"><select className={inputClass} value={settings.profileVisibility} onChange={(event) => setSettings((current) => ({ ...current, profileVisibility: event.target.value }))}><option value="public">Public</option><option value="private">Private</option></select></Field><ToggleList values={settings.privacy} onChange={(key, value) => update("privacy", key, value)} /></div>;
}

function Security() {
  return <div><div className="flex items-center gap-3"><LockKeyhole className="text-[var(--gold)]" /><h2 className="text-xl font-black">Security Controls</h2></div><div className="mt-6 grid gap-3"><LinkButton href="/auth/forgot-password" variant="secondary">Change Password</LinkButton><Button variant="secondary" disabled>Two-Factor Authentication (Coming Later)</Button><Button variant="secondary" disabled>Login Sessions (Coming Later)</Button></div></div>;
}

function Billing({ settings, confirmCancel, setConfirmCancel, canceling, cancelSubscription }: { settings: SettingsData; confirmCancel: boolean; setConfirmCancel: (value: boolean) => void; canceling: boolean; cancelSubscription: () => Promise<void> }) {
  const hasPaidPlan = settings.account.planId !== "free" && ["active", "trial", "trialing"].includes(settings.account.subscriptionStatus);
  const tierId = settings.account.effectiveTier?.id;
  const upgradeLabel = tierId === "free_competitor" ? "Become a Creator" : ["creator_starter", "creator"].includes(String(tierId)) ? "Become a Host" : "Change Plan";
  return <div><div className="flex items-center gap-3"><CreditCard className="text-[var(--gold)]" /><h2 className="text-xl font-black">Current Subscription</h2></div><div className="mt-6 rounded-[8px] bg-black/30 p-5"><p className="font-black">{settings.account.effectiveTier?.displayName ?? settings.account.planId}</p><p className="mt-1 text-sm capitalize text-slate-400">Status: {settings.account.subscriptionStatus.replaceAll("_", " ")} · Billing cycle appears after Stripe invoice sync.</p></div><div className="mt-5 flex flex-wrap gap-3"><LinkButton href="/subscriptions">{upgradeLabel}</LinkButton><Button variant="secondary" disabled>View Invoices (After Stripe Sync)</Button><Button variant="secondary" disabled>Payment History (Foundation)</Button>{hasPaidPlan ? <Button variant="secondary" onClick={() => setConfirmCancel(true)}>Cancel Subscription</Button> : null}</div>{confirmCancel ? <div className="mt-6 rounded-[8px] border border-red-500/30 bg-red-950/20 p-5"><h3 className="font-black text-red-100">Confirm cancellation</h3><p className="mt-2 text-sm leading-6 text-red-100/80">Are you sure you want to cancel your subscription? Your paid access will be removed according to the current cancellation policy. The verified Stripe webhook remains the source of truth for the access change.</p><div className="mt-4 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep Subscription</Button><Button onClick={() => void cancelSubscription()} disabled={canceling}>{canceling ? "Requesting..." : "Confirm Cancellation"}</Button></div></div> : null}</div>;
}

function Wallet() {
  return <div><h2 className="text-xl font-black">Wallet & DoroCoin</h2><p className="mt-3 leading-7 text-slate-300">DoroCoins are internal platform credits. They cannot be withdrawn or converted to cash.</p><LinkButton href="/wallet" className="mt-6">Open Wallet & History</LinkButton></div>;
}

function Preferences({ settings, update, list }: { settings: SettingsData; update: Update; list: (value: string) => string[] }) {
  return <div className="space-y-6"><Field label="Favorite Categories"><input className={inputClass} value={settings.preferences.favoriteCategories.join(", ")} onChange={(event) => update("preferences", "favoriteCategories", list(event.target.value))} /></Field><Field label="Preferred Challenge Types"><input className={inputClass} value={settings.preferences.preferredChallengeTypes.join(", ")} onChange={(event) => update("preferences", "preferredChallengeTypes", list(event.target.value))} /></Field><Field label="Location Preference"><input className={inputClass} value={settings.preferences.locationPreference} onChange={(event) => update("preferences", "locationPreference", event.target.value)} /></Field><Field label="Content Language"><input className={inputClass} value={settings.preferences.contentLanguage} onChange={(event) => update("preferences", "contentLanguage", event.target.value)} /></Field><Toggle label="Show mature or age-restricted content" checked={settings.preferences.matureContent} onChange={(value) => update("preferences", "matureContent", value)} /></div>;
}

function Danger({ deleteText, setDeleteText }: { deleteText: string; setDeleteText: (value: string) => void }) {
  return <div><div className="flex items-center gap-3 text-red-300"><TriangleAlert /><h2 className="text-xl font-black">Danger Zone</h2></div><div className="mt-6 grid gap-6"><div className="rounded-[8px] border border-red-500/20 p-5"><h3 className="font-black">Deactivate Account</h3><p className="mt-2 text-sm text-slate-400">Temporary account deactivation is not connected yet.</p><Button className="mt-4" variant="secondary" disabled>Deactivate (Coming Later)</Button></div><div className="rounded-[8px] border border-red-500/20 p-5"><h3 className="font-black">Delete Account</h3><p className="mt-2 text-sm leading-6 text-slate-400">Type DELETE to confirm your intent. Permanent deletion remains disabled until a protected server-side deletion and retention workflow is implemented.</p><div className="mt-4"><Field label="Confirmation"><input className={inputClass} value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="DELETE" /></Field></div><Button className="mt-4" disabled>{deleteText === "DELETE" ? "Deletion Backend Not Active" : "Type DELETE to Continue"}</Button></div></div></div>;
}

function ToggleList({ values, onChange }: { values: Record<string, boolean>; onChange: (key: string, value: boolean) => void }) {
  return <div className="space-y-3">{Object.entries(values).filter(([key]) => !["userId", "updatedAt"].includes(key)).map(([key, value]) => <Toggle key={key} label={label(key)} checked={Boolean(value)} onChange={(checked) => onChange(key, checked)} />)}</div>;
}

function Toggle({ label: text, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-12 items-center justify-between gap-4 rounded-[8px] border border-white/10 bg-black/30 px-4 py-3"><span className="font-bold">{text}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function label(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function title(section: string) {
  return ({ account: "Account", profile: "Profile", appearance: "Appearance", notifications: "Notifications", privacy: "Privacy", security: "Security", billing: "Billing & Subscription", wallet: "Wallet & DoroCoin", preferences: "Challenge Preferences", danger: "Danger Zone" } as Record<string, string>)[section];
}

function description(section: string) {
  return ({ account: "Manage your identity and contact details.", profile: "Shape your public competition profile.", appearance: "Choose how Challenge Suite should look.", notifications: "Control the alerts you receive.", privacy: "Choose what other people can see and do.", security: "Protect access to your account.", billing: "Review plan access and manage subscription actions.", wallet: "Review internal platform credits and purchase history.", preferences: "Personalize challenge discovery and content.", danger: "Protected account lifecycle controls." } as Record<string, string>)[section];
}

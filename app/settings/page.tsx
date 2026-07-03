"use client";

import { useEffect, useState } from "react";
import { Bell, CreditCard, LockKeyhole, Settings as SettingsIcon, Shield, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

const defaultSettings: any = {
  account: { displayName: "", username: "", email: "", phone: "", accountType: "user", planId: "free", subscriptionStatus: "free" },
  profile: { avatarUrl: "", coverImageUrl: "", bio: "", location: "", website: "", socialLinks: [], categoryInterests: [] },
  profileVisibility: "public",
  privacy: { showFollowersFollowing: true, showActivity: true, showWins: true, showParticipatedChallenges: true, allowMessages: true, allowSponsorMessages: true, showEarnings: false },
  notifications: { challengeReminders: true, liveChallengeReminders: true, voteNotifications: true, commentsReplies: true, followerNotifications: true, sponsorRequestUpdates: true, billingAlerts: true, email: true, push: false, inApp: true },
  preferences: { favoriteCategories: [], preferredChallengeTypes: [], locationPreference: "", contentLanguage: "English", matureContent: false },
  sponsorDefaults: null
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void apiRequest<any>("/api/settings").then((result) => {
      if (result.ok && result.data) setSettings({ ...defaultSettings, ...result.data });
      else setNotice(result.message);
      setLoading(false);
    });
  }, []);

  function update(group: string, field: string, value: any) {
    setSettings((current: any) => ({ ...current, [group]: { ...current[group], [field]: value } }));
  }
  function list(value: string) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  async function save() {
    setSaving(true);
    setNotice("");
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
        preferences: settings.preferences,
        sponsorDefaults: settings.sponsorDefaults ? {
          ctaButtonText: settings.sponsorDefaults.ctaButtonText,
          ctaDestinationLink: settings.sponsorDefaults.ctaDestinationLink,
          campaignPreferences: settings.sponsorDefaults.campaignPreferences ?? []
        } : undefined
      })
    });
    setNotice(result.message);
    setSaving(false);
  }

  if (loading) return <AppShell><Card className="h-[420px] animate-pulse bg-[#171717]" /></AppShell>;
  return (
    <AppShell>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle title="Settings" subtitle="Manage your account, public profile, privacy, notifications, security, billing, and challenge preferences." icon={<SettingsIcon className="text-[var(--gold)]" />} />
        <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save Settings"}</Button>
      </div>
      {notice ? <Card className="mt-6 p-4 text-slate-300">{notice}</Card> : null}
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Section icon={<UserRound />} title="Account">
          <Field label="Name"><input className={inputClass} value={settings.account.displayName} onChange={(event) => update("account", "displayName", event.target.value)} /></Field>
          <Field label="Username"><input className={inputClass} value={settings.account.username} onChange={(event) => update("account", "username", event.target.value)} /></Field>
          <Field label="Email"><input className={inputClass} value={settings.account.email} disabled /></Field>
          <Field label="Phone"><input className={inputClass} value={settings.account.phone} onChange={(event) => update("account", "phone", event.target.value)} /></Field>
          <div className="rounded-[8px] bg-black/30 p-4 text-sm text-slate-300">Account type: <b>{settings.account.accountType}</b> · Plan: <b>{settings.account.planId}</b></div>
          <Button variant="secondary" disabled>Deactivate Account (Coming Later)</Button>
        </Section>

        <Section icon={<UserRound />} title="Profile">
          <Field label="Avatar URL"><input className={inputClass} value={settings.profile.avatarUrl} onChange={(event) => update("profile", "avatarUrl", event.target.value)} /></Field>
          <Field label="Cover Image URL"><input className={inputClass} value={settings.profile.coverImageUrl} onChange={(event) => update("profile", "coverImageUrl", event.target.value)} /></Field>
          <Field label="Bio"><textarea className={textareaClass} value={settings.profile.bio} onChange={(event) => update("profile", "bio", event.target.value)} /></Field>
          <Field label="Location"><input className={inputClass} value={settings.profile.location} onChange={(event) => update("profile", "location", event.target.value)} /></Field>
          <Field label="Website"><input className={inputClass} value={settings.profile.website} onChange={(event) => update("profile", "website", event.target.value)} /></Field>
          <Field label="Social Links (comma separated)"><input className={inputClass} value={(settings.profile.socialLinks ?? []).join(", ")} onChange={(event) => update("profile", "socialLinks", list(event.target.value))} /></Field>
          <Field label="Category Interests"><input className={inputClass} value={(settings.profile.categoryInterests ?? []).join(", ")} onChange={(event) => update("profile", "categoryInterests", list(event.target.value))} /></Field>
        </Section>

        <Section icon={<Shield />} title="Privacy">
          <Field label="Profile Visibility"><select className={inputClass} value={settings.profileVisibility} onChange={(event) => setSettings((current: any) => ({ ...current, profileVisibility: event.target.value }))}><option value="public">Public</option><option value="private">Private</option></select></Field>
          {Object.entries(settings.privacy).map(([key, value]) => <Toggle key={key} label={label(key)} checked={Boolean(value)} onChange={(checked) => update("privacy", key, checked)} />)}
        </Section>

        <Section icon={<Bell />} title="Notifications">
          {Object.entries(settings.notifications).filter(([key]) => key !== "userId" && key !== "updatedAt").map(([key, value]) => <Toggle key={key} label={label(key)} checked={Boolean(value)} onChange={(checked) => update("notifications", key, checked)} />)}
        </Section>

        <Section icon={<LockKeyhole />} title="Security">
          <LinkButton href="/auth/forgot-password" variant="secondary">Change Password</LinkButton>
          <Button variant="secondary" disabled>Two-Factor Authentication (Coming Later)</Button>
          <Button variant="secondary" disabled>Login Sessions (Coming Later)</Button>
        </Section>

        <Section icon={<CreditCard />} title="Billing">
          <div className="rounded-[8px] bg-black/30 p-4 text-sm text-slate-300">Current plan: <b>{settings.account.planId}</b> · Subscription: <b>{settings.account.subscriptionStatus}</b></div>
          <LinkButton href="/subscriptions">Upgrade, Downgrade or Cancel</LinkButton>
          <LinkButton href="/wallet" variant="secondary">DoroCoin Purchase History</LinkButton>
          <Button variant="secondary" disabled>Invoices (Available after Stripe invoice sync)</Button>
        </Section>

        <Section icon={<SettingsIcon />} title="Challenge Preferences">
          <Field label="Favorite Categories"><input className={inputClass} value={(settings.preferences.favoriteCategories ?? []).join(", ")} onChange={(event) => update("preferences", "favoriteCategories", list(event.target.value))} /></Field>
          <Field label="Preferred Challenge Types"><input className={inputClass} value={(settings.preferences.preferredChallengeTypes ?? []).join(", ")} onChange={(event) => update("preferences", "preferredChallengeTypes", list(event.target.value))} /></Field>
          <Field label="Location Preference"><input className={inputClass} value={settings.preferences.locationPreference} onChange={(event) => update("preferences", "locationPreference", event.target.value)} /></Field>
          <Field label="Content Language"><input className={inputClass} value={settings.preferences.contentLanguage} onChange={(event) => update("preferences", "contentLanguage", event.target.value)} /></Field>
          <Toggle label="Show mature / age-restricted content" checked={Boolean(settings.preferences.matureContent)} onChange={(checked) => update("preferences", "matureContent", checked)} />
        </Section>

        {settings.sponsorDefaults ? <Section icon={<CreditCard />} title="Sponsor Settings">
          <Field label="Default CTA Text"><input className={inputClass} value={settings.sponsorDefaults.ctaButtonText} onChange={(event) => update("sponsorDefaults", "ctaButtonText", event.target.value)} /></Field>
          <Field label="Default CTA Link"><input className={inputClass} value={settings.sponsorDefaults.ctaDestinationLink} onChange={(event) => update("sponsorDefaults", "ctaDestinationLink", event.target.value)} /></Field>
          <Field label="Campaign Preferences"><input className={inputClass} value={(settings.sponsorDefaults.campaignPreferences ?? []).join(", ")} onChange={(event) => update("sponsorDefaults", "campaignPreferences", list(event.target.value))} /></Field>
          <div className="rounded-[8px] bg-black/30 p-4 text-sm text-slate-300">Verification: <b>{settings.sponsorDefaults.verificationStatus}</b>. Campaign budget remains separate from subscription billing.</div>
        </Section> : null}
      </div>
    </AppShell>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <Card className="p-5 sm:p-7"><h2 className="flex items-center gap-2 text-2xl font-black"><span className="text-[var(--gold)]">{icon}</span>{title}</h2><div className="mt-6 space-y-5">{children}</div></Card>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-12 items-center justify-between gap-4 rounded-[8px] border border-white/10 bg-black/30 px-4 py-3"><span className="font-bold">{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}
function label(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

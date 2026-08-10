"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CreditCard, LockKeyhole, Palette, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { MediaUploadField } from "@/components/media-upload-field";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { profileMediaPath } from "@/lib/media-upload-paths";
import { setAppTheme } from "@/components/app-theme-provider";
import { logout } from "@/lib/firebase/auth-service";

type SettingsData = {
  account: { displayName: string; username: string; email: string; phone: string; accountType: string; planId: string; subscriptionStatus: string; effectiveTier?: { id: string; displayName: string } };
  profile: { avatarUrl: string; avatarPath: string; coverImageUrl: string; coverImagePath: string; bio: string; location: string; website: string; socialLinks: string[]; categoryInterests: string[] };
  profileVisibility: string;
  privacy: Record<string, boolean>;
  notifications: Record<string, boolean>;
  preferences: { favoriteCategories: string[]; preferredChallengeTypes: string[]; locationPreference: string; contentLanguage: string; matureContent: boolean; appearance: "system" | "light" | "dark" };
};

type Group = "account" | "profile" | "privacy" | "notifications" | "preferences";
type Update = (group: Group, field: string, value: unknown) => void;

const defaults: SettingsData = {
  account: { displayName: "", username: "", email: "", phone: "", accountType: "user", planId: "free", subscriptionStatus: "free" },
  profile: { avatarUrl: "", avatarPath: "", coverImageUrl: "", coverImagePath: "", bio: "", location: "", website: "", socialLinks: [], categoryInterests: [] },
  profileVisibility: "public",
  privacy: { showFollowersFollowing: true, showActivity: true, showWins: true, showParticipatedChallenges: true, allowMessages: true, allowSponsorMessages: true, showEarnings: false },
  notifications: { challengeReminders: true, liveChallengeReminders: true, voteNotifications: true, commentsReplies: true, followerNotifications: true, sponsorRequestUpdates: true, billingAlerts: true, email: false, push: false, inApp: true },
  preferences: { favoriteCategories: [], preferredChallengeTypes: [], locationPreference: "", contentLanguage: "English", matureContent: false, appearance: "light" }
};

const sections = new Set(["account", "profile", "appearance", "notifications", "privacy", "security", "billing", "wallet", "preferences", "danger"]);

export default function SettingsSectionPage() {
  const params = useParams<{ section: string }>();
  const auth = useAuth();
  const router = useRouter();
  const section = sections.has(params.section) ? params.section : "account";
  const [settings, setSettings] = useState<SettingsData>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void apiRequest<SettingsData>("/api/settings").then((result) => {
      if (result.ok && result.data) {
        const nextSettings = {
          ...defaults,
          ...result.data,
          account: { ...defaults.account, ...result.data.account },
          profile: { ...defaults.profile, ...result.data.profile },
          privacy: { ...defaults.privacy, ...result.data.privacy },
          notifications: { ...defaults.notifications, ...result.data.notifications },
          preferences: { ...defaults.preferences, ...result.data.preferences }
        };
        setSettings(nextSettings);
        setAppTheme(nextSettings.preferences.appearance);
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
        avatarPath: settings.profile.avatarPath,
        coverImageUrl: settings.profile.coverImageUrl,
        coverImagePath: settings.profile.coverImagePath,
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

  async function deleteAccount() {
    if (deleteText !== "DELETE") return;
    setDeleting(true);
    setNotice("");
    const result = await apiRequest<{ status: string; directDeletion: boolean }>("/api/account/delete", {
      method: "POST",
      body: JSON.stringify({ confirmation: deleteText })
    });
    setNotice(result.message);
    setDeleting(false);
    if (result.ok) {
      await logout().catch(() => undefined);
      router.replace(`/auth/login?account=${encodeURIComponent(result.data?.status ?? "deactivated")}`);
    }
  }

  function chooseAppearance(value: "system" | "light" | "dark") {
    update("preferences", "appearance", value);
    setAppTheme(value);
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
          {section === "profile" ? <Profile settings={settings} update={update} list={list} userId={auth.user?.uid ?? "anonymous"} /> : null}
          {section === "appearance" ? <Appearance value={settings.preferences.appearance} choose={chooseAppearance} /> : null}
          {section === "notifications" ? <NotificationSettings values={settings.notifications} onChange={(key, value) => update("notifications", key, value)} /> : null}
          {section === "privacy" ? <Privacy settings={settings} update={update} setSettings={setSettings} /> : null}
          {section === "security" ? <Security /> : null}
          {section === "billing" ? <Billing settings={settings} confirmCancel={confirmCancel} setConfirmCancel={setConfirmCancel} canceling={canceling} cancelSubscription={cancelSubscription} /> : null}
          {section === "wallet" ? <Wallet /> : null}
          {section === "preferences" ? <Preferences settings={settings} update={update} list={list} /> : null}
          {section === "danger" ? <Danger deleteText={deleteText} setDeleteText={setDeleteText} deleting={deleting} onDelete={deleteAccount} /> : null}
        </Card>
      </div>
    </AppShell>
  );
}

function Account({ settings, update }: { settings: SettingsData; update: Update }) {
  return <div className="space-y-6"><Field label="Name"><input className={inputClass} value={settings.account.displayName} onChange={(event) => update("account", "displayName", event.target.value)} /></Field><Field label="Username"><input className={inputClass} value={settings.account.username} onChange={(event) => update("account", "username", event.target.value)} /></Field><Field label="Email"><input className={inputClass} value={settings.account.email} disabled /></Field><Field label="Phone"><input className={inputClass} value={settings.account.phone} onChange={(event) => update("account", "phone", event.target.value)} /></Field><p className="rounded-[8px] bg-black/30 p-4 text-sm capitalize text-slate-300">Account type: <b>{settings.account.accountType}</b> - Access: <b>{settings.account.effectiveTier?.displayName ?? settings.account.planId}</b></p></div>;
}

function Profile({ settings, update, list, userId }: { settings: SettingsData; update: Update; list: (value: string) => string[]; userId: string }) {
  return <div className="space-y-6"><MediaUploadField label="Profile Avatar" value={settings.profile.avatarUrl} onChange={(url, metadata) => { update("profile", "avatarUrl", url); update("profile", "avatarPath", metadata?.path ?? ""); }} storagePath={profileMediaPath(userId, "avatar")} kind="image" buttonLabel="Upload Avatar" /><MediaUploadField label="Profile Cover Image" value={settings.profile.coverImageUrl} onChange={(url, metadata) => { update("profile", "coverImageUrl", url); update("profile", "coverImagePath", metadata?.path ?? ""); }} storagePath={profileMediaPath(userId, "banner")} kind="image" buttonLabel="Upload Cover Image" /><Field label="Bio"><textarea className={textareaClass} value={settings.profile.bio} onChange={(event) => update("profile", "bio", event.target.value)} /></Field><Field label="Location"><input className={inputClass} value={settings.profile.location} onChange={(event) => update("profile", "location", event.target.value)} /></Field><Field label="Website"><input className={inputClass} value={settings.profile.website} onChange={(event) => update("profile", "website", event.target.value)} /></Field><Field label="Social Links"><input className={inputClass} value={settings.profile.socialLinks.join(", ")} onChange={(event) => update("profile", "socialLinks", list(event.target.value))} /></Field><Field label="Category Interests"><input className={inputClass} value={settings.profile.categoryInterests.join(", ")} onChange={(event) => update("profile", "categoryInterests", list(event.target.value))} /></Field></div>;
}

function Appearance({ value, choose }: { value: string; choose: (value: "system" | "light" | "dark") => void }) {
  return <div><div className="flex items-center gap-3"><Palette className="text-[var(--gold)]" /><h2 className="text-xl font-black">Display Preference</h2></div><div className="mt-6 grid gap-3 sm:grid-cols-3">{(["system", "light", "dark"] as const).map((option) => <button key={option} type="button" onClick={() => choose(option)} className={`min-h-14 rounded-[8px] border px-4 font-bold capitalize ${value === option ? "border-[var(--gold)] bg-[var(--gold)] text-black" : "border-white/10 bg-black/30"}`}>{option === "system" ? "System Default" : `${option} Mode`}</button>)}</div><p className="mt-5 text-sm text-slate-400">Applied to signed-in workspaces and saved to this browser and your Challenge Suite profile. Public marketing pages keep their own presentation.</p></div>;
}

function Privacy({ settings, update, setSettings }: { settings: SettingsData; update: Update; setSettings: React.Dispatch<React.SetStateAction<SettingsData>> }) {
  return <div className="space-y-5"><Field label="Profile Visibility"><select className={inputClass} value={settings.profileVisibility} onChange={(event) => setSettings((current) => ({ ...current, profileVisibility: event.target.value }))}><option value="public">Public</option><option value="private">Private</option></select></Field><ToggleList values={settings.privacy} onChange={(key, value) => update("privacy", key, value)} /></div>;
}

function Security() {
  return <div><div className="flex items-center gap-3"><LockKeyhole className="text-[var(--gold)]" /><h2 className="text-xl font-black">Security Controls</h2></div><div className="mt-6 grid gap-3"><LinkButton href="/auth/forgot-password" variant="secondary">Change Password</LinkButton><p className="rounded-[8px] border border-white/10 bg-black/30 p-4 text-sm leading-6 text-slate-300">Sensitive account and administrator actions require a recent sign-in and server-side permission checks.</p></div></div>;
}

function Billing({ settings, confirmCancel, setConfirmCancel, canceling, cancelSubscription }: { settings: SettingsData; confirmCancel: boolean; setConfirmCancel: (value: boolean) => void; canceling: boolean; cancelSubscription: () => Promise<void> }) {
  const hasPaidPlan = settings.account.planId !== "free" && ["active", "trial", "trialing", "payment_warning_1", "payment_warning_2"].includes(settings.account.subscriptionStatus);
  const tierId = settings.account.effectiveTier?.id;
  const upgradeLabel = tierId === "free_competitor" ? "Become a Creator" : ["creator_starter", "creator"].includes(String(tierId)) ? "Become a Host" : "Change Plan";
  return <div><div className="flex items-center gap-3"><CreditCard className="text-[var(--gold)]" /><h2 className="text-xl font-black">Subscription</h2></div><div className="mt-6 rounded-[8px] bg-black/30 p-5"><p className="font-black">{settings.account.effectiveTier?.displayName ?? settings.account.planId}</p><p className="mt-1 text-sm capitalize text-slate-400">Status: {settings.account.subscriptionStatus.replaceAll("_", " ")}. Billing cycle appears after Stripe invoice sync.</p></div><div className="mt-5 flex flex-wrap gap-3"><LinkButton href="/subscriptions">{upgradeLabel}</LinkButton><Button variant="secondary" disabled>Manage Billing - Billing portal setup required</Button><Button variant="secondary" disabled>Invoices appear after successful payment</Button>{hasPaidPlan ? <Button variant="secondary" onClick={() => setConfirmCancel(true)}>Cancel Subscription</Button> : null}</div>{confirmCancel ? <div className="mt-6 rounded-[8px] border border-red-500/30 bg-red-950/20 p-5"><h3 className="font-black text-red-100">Confirm cancellation</h3><p className="mt-2 text-sm leading-6 text-red-100/80">Are you sure you want to cancel your subscription? Cancellation changes are applied only after verified Stripe webhook confirmation.</p><div className="mt-4 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep Subscription</Button><Button onClick={() => void cancelSubscription()} disabled={canceling}>{canceling ? "Requesting..." : "Confirm Cancellation"}</Button></div></div> : null}</div>;
}

function Wallet() {
  return <div><h2 className="text-xl font-black">DoroCoins</h2><p className="mt-3 leading-7 text-slate-300">DoroCoins are internal platform credits. They cannot be withdrawn or converted to cash.</p><div className="mt-6 flex flex-wrap gap-3"><LinkButton href="/dorocoins">Open DoroCoins</LinkButton><LinkButton href="/earnings" variant="secondary">Open Earnings</LinkButton></div></div>;
}

function Preferences({ settings, update, list }: { settings: SettingsData; update: Update; list: (value: string) => string[] }) {
  return <div className="space-y-6"><Field label="Favorite Categories"><input className={inputClass} value={settings.preferences.favoriteCategories.join(", ")} onChange={(event) => update("preferences", "favoriteCategories", list(event.target.value))} /></Field><Field label="Preferred Challenge Types"><input className={inputClass} value={settings.preferences.preferredChallengeTypes.join(", ")} onChange={(event) => update("preferences", "preferredChallengeTypes", list(event.target.value))} /></Field><Field label="Location Preference"><input className={inputClass} value={settings.preferences.locationPreference} onChange={(event) => update("preferences", "locationPreference", event.target.value)} /></Field><Field label="Content Language"><input className={inputClass} value={settings.preferences.contentLanguage} onChange={(event) => update("preferences", "contentLanguage", event.target.value)} /></Field><Toggle label="Show mature or age-restricted content" checked={settings.preferences.matureContent} onChange={(value) => update("preferences", "matureContent", value)} /></div>;
}

function Danger({ deleteText, setDeleteText, deleting, onDelete }: { deleteText: string; setDeleteText: (value: string) => void; deleting: boolean; onDelete: () => Promise<void> }) {
  return <div><div className="flex items-center gap-3 text-red-300"><TriangleAlert /><h2 className="text-xl font-black">Danger Zone</h2></div><div className="mt-6 rounded-[8px] border border-red-500/20 p-5"><h3 className="font-black">Delete Account</h3><p className="mt-2 text-sm leading-6 text-slate-400">Type DELETE to confirm. A recent sign-in is required. Accounts without retained history can be deleted directly; accounts with payment, wallet, challenge, KYC, withdrawal, settlement, provider, or audit history are deactivated and queued for privacy review. Required financial and legal records are preserved.</p><div className="mt-4"><Field label="Type DELETE to confirm"><input className={inputClass} value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="DELETE" autoComplete="off" /></Field></div><div className="mt-4 flex flex-col gap-3 sm:flex-row"><Button onClick={() => void onDelete()} disabled={deleteText !== "DELETE" || deleting}>{deleting ? "Processing..." : deleteText === "DELETE" ? "Delete Account" : "Type DELETE to Continue"}</Button><LinkButton href="/contact" variant="secondary">Get deletion help</LinkButton></div></div></div>;
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
  return ({ account: "Account", profile: "Profile", appearance: "Appearance", notifications: "Notifications", privacy: "Privacy", security: "Security", billing: "Subscription", wallet: "Wallet & DoroCoin", preferences: "Challenge Preferences", danger: "Danger Zone" } as Record<string, string>)[section];
}

function description(section: string) {
  return ({ account: "Manage your identity and contact details.", profile: "Shape your public competition profile.", appearance: "Choose how Challenge Suite should look.", notifications: "Control the alerts you receive.", privacy: "Choose what other people can see and do.", security: "Protect access to your account.", billing: "Review plan access and billing portal status.", wallet: "Review internal platform credits and purchase history.", preferences: "Personalize challenge discovery and content.", danger: "Protected account lifecycle controls." } as Record<string, string>)[section];
}
function NotificationSettings({ values, onChange }: { values: Record<string, boolean>; onChange: (key: string, value: boolean) => void }) {
  const active = Object.fromEntries(Object.entries(values).filter(([key]) => !["email", "push", "inApp", "userId", "updatedAt"].includes(key)));
  return <div className="space-y-5"><Card className="border-emerald-500/20 bg-emerald-500/5 p-4"><p className="font-black text-emerald-100">In-app notifications are active</p><p className="mt-2 text-sm leading-6 text-slate-300">Challenge Suite records supported alerts in your notification center.</p></Card><ToggleList values={active} onChange={onChange} /><div className="grid gap-3 sm:grid-cols-2"><DeliveryState title="Email notifications" body="Setup required. Email delivery is not active yet." /><DeliveryState title="Push notifications" body="Setup required. Push delivery is not active yet." /></div></div>;
}

function DeliveryState({ title, body }: { title: string; body: string }) {
  return <div className="rounded-[8px] border border-white/10 bg-black/30 p-4"><p className="font-black">{title}</p><p className="mt-2 text-sm text-slate-400">{body}</p><span className="mt-3 inline-flex rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-slate-400">Unavailable</span></div>;
}

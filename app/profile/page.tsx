"use client";

import { useEffect, useState } from "react";
import { Award, BadgeCheck, LockKeyhole, Settings, Share2, Trophy, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton } from "@/components/ui";
import { PremiumBadge } from "@/components/brand";
import { fetchMyProfile } from "@/lib/api/services";
import type { UserPlanId } from "@/lib/types";
import type { ProfileCustomization } from "@/lib/customization/options";
import { findCustomizationOption } from "@/lib/customization/options";
import { cn } from "@/lib/utils";

interface ProfileState {
  profileExists: boolean;
  user: {
    email: string;
    displayName: string;
    username?: string | null;
    initials: string;
    avatarUrl?: string | null;
    role?: string | null;
    accountType?: string | null;
    selectedAccountType?: string | null;
    planId?: string | null;
    verified?: boolean;
    effectiveTier?: {
      displayName: string;
      badgeLabel: string;
      memberLabel: string;
    };
    joinedAt?: string | null;
    doroBalance: number;
    customization?: ProfileCustomization;
  };
  stats: {
    totalPoints: number;
    submissions: number;
    totalLikes?: number;
    wins?: number;
    followers: number;
    following: number;
  };
  badges: Array<{ id?: string; name?: string; title?: string; description?: string }>;
  submissions: Array<{ id?: string; title?: string; challengeTitle?: string }>;
  challenges: Array<{ id: string; title?: string; status?: string; lifecycleStatus?: string }>;
  wins: Array<{ id: string; challengeId?: string; challengeTitle?: string; placement?: number }>;
  activity: Array<{ id: string; type: string; title?: string; createdAt?: string | null }>;
}

function planLabel(planId?: string | null) {
  if (!planId) return "Free Competitor";
  return planId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function roleLabel(profile: ProfileState) {
  return String(profile.user.selectedAccountType ?? profile.user.role ?? profile.user.accountType ?? "competitor").replaceAll("_", " ");
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "challenges" | "entries" | "wins" | "achievements" | "activity">("overview");

  async function loadProfile() {
    setLoading(true);
    setError(null);
    setUnauthenticated(false);
    const result = await fetchMyProfile();
    if (!result.ok || !result.data) {
      const code = (result as any).code;
      setUnauthenticated(code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED");
      setError(result.message || "Profile could not be loaded.");
      setProfile(null);
      setLoading(false);
      return;
    }
    setProfile(result.data as ProfileState);
    setLoading(false);
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function shareProfile() {
    if (!profile) return;
    const url = profile.user.username ? `${window.location.origin}/profile/${profile.user.username}` : window.location.href;
    if (navigator.share) await navigator.share({ title: profile.user.displayName, url });
    else await navigator.clipboard?.writeText(url);
    setShareMessage("Profile link copied.");
  }

  if (loading) {
    return (
      <AppShell>
        <Card className="bg-yellow-500/5 p-6 sm:p-10">
          <div className="flex animate-pulse flex-col gap-8 sm:flex-row">
            <div className="h-32 w-32 rounded-full bg-white/10" />
            <div className="flex-1 space-y-5">
              <div className="h-10 w-72 max-w-full rounded bg-white/10" />
              <div className="h-5 w-56 max-w-full rounded bg-white/10" />
              <div className="h-11 w-36 rounded bg-white/10" />
            </div>
          </div>
        </Card>
      </AppShell>
    );
  }

  if (unauthenticated) {
    return (
      <AppShell>
        <Card>
          <EmptyState icon={<LockKeyhole />} title="Sign in required" body={error ?? "Sign in with a verified account to view your profile."} action={<LinkButton href="/auth/login">Sign In</LinkButton>} />
        </Card>
      </AppShell>
    );
  }

  if (error || !profile) {
    return (
      <AppShell>
        <Card>
          <EmptyState icon={<UserRound />} title="Profile unavailable" body={error ?? "Your profile could not be loaded."} action={<Button onClick={loadProfile}>Retry</Button>} />
        </Card>
      </AppShell>
    );
  }

  if (!profile.profileExists) {
    return (
      <AppShell>
        <Card>
          <EmptyState icon={<UserRound />} title="Profile setup needed" body="Your account exists, but your profile document has not been created yet." action={<LinkButton href="/profile/edit">Complete Profile</LinkButton>} />
        </Card>
      </AppShell>
    );
  }

  const wins = Number(profile.stats.wins ?? 0);
  const joinedDate = profile.user.joinedAt ? new Date(profile.user.joinedAt).toLocaleDateString() : "Joined date unavailable";
  const publicHref = profile.user.username ? `/profile/${profile.user.username}` : "/profile";

  return (
    <AppShell>
      <Card className={cn("overflow-hidden bg-[#111111]", findCustomizationOption(profile.user.customization?.profileFrameId, "profileFrame")?.previewClass)}>
        <div data-profile-cover className="h-44 bg-[radial-gradient(circle_at_top_left,rgba(246,198,75,.24),transparent_35%),linear-gradient(135deg,#171717,#0b0b0b)] sm:h-56 lg:h-64" />
        <div className="p-5 sm:p-8 lg:p-10">
          <div data-mobile-profile-hero data-profile-social-hero className="-mt-24 flex flex-col items-center gap-6 text-center sm:-mt-28 sm:items-stretch sm:text-left lg:-mt-32 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-col items-center gap-5 sm:flex-row sm:items-end sm:gap-7">
              <div className={cn("flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-[#101010] bg-[var(--gold)] text-3xl font-black text-black shadow-[0_18px_45px_rgba(0,0,0,.35)] sm:h-36 sm:w-36 sm:text-4xl", findCustomizationOption(profile.user.customization?.avatarRingId, "avatarRing")?.previewClass)}>
                {profile.user.avatarUrl ? <img src={profile.user.avatarUrl} alt={profile.user.displayName} className="h-full w-full object-cover" /> : profile.user.initials}
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                  <h1 data-user-content className="break-words text-3xl font-black sm:text-4xl">{profile.user.displayName}</h1>
                  {profile.user.verified === true ? <BadgeCheck className="text-[var(--gold)]" size={24} aria-label="Verified profile" /> : null}
                  <PremiumBadge planId={profile.user.planId as UserPlanId} badgeStyleId={profile.user.customization?.profileBadgeId} labelOverride={profile.user.effectiveTier?.badgeLabel} />
                </div>
                <p className="mt-2 text-sm font-bold text-slate-300">{profile.user.username ? `@${profile.user.username}` : "Username not set"}</p>
                {profile.user.customization?.profileTagline ? <p data-user-content className="mt-4 max-w-2xl text-base font-semibold leading-7 text-[var(--gold-2)]">{profile.user.customization.profileTagline}</p> : <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">Build your competition record through challenges, submissions, votes, and wins.</p>}
                <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-black uppercase tracking-[0.14em] sm:justify-start">
                  <span className="rounded-full bg-[var(--gold)]/10 px-3 py-2 text-[var(--gold)] capitalize">{roleLabel(profile)}</span>
                  <span className="rounded-full border border-white/10 px-3 py-2 text-slate-300">{profile.user.effectiveTier?.memberLabel ?? planLabel(profile.user.planId)}</span>
                  <span className="rounded-full border border-white/10 px-3 py-2 text-slate-300">{joinedDate}</span>
                </div>
              </div>
            </div>
            <div data-profile-compact-actions className="flex w-full flex-wrap justify-center gap-2 sm:w-auto sm:justify-start lg:max-w-md lg:justify-end">
              <LinkButton href="/profile/edit">Edit Profile</LinkButton>
              <LinkButton href="/settings" variant="secondary"><Settings size={16} /> Settings</LinkButton>
              <Button variant="secondary" onClick={() => void shareProfile()} title="Share Profile" aria-label="Share Profile"><Share2 size={16} /> <span className="sm:hidden xl:inline">Share</span></Button>
              <LinkButton href={publicHref} variant="ghost">View Public Profile</LinkButton>
            </div>
          </div>
          {!profile.user.username ? <p className="mt-5 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-3 text-sm text-yellow-100">Add a username in settings to make your public profile easier to share.</p> : null}
          {shareMessage ? <p className="mt-4 text-sm text-slate-300">{shareMessage}</p> : null}
          <div data-mobile-profile-stats className="mt-10 grid grid-cols-2 gap-3 border-t border-white/10 pt-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-5">
            {[ ["Total Points", profile.stats.totalPoints], ["Submissions", profile.stats.submissions], ["Wins", wins], ["Followers", profile.stats.followers], ["Following", profile.stats.following] ].map(([label, value]) => <Card key={String(label)} className="p-4 text-center sm:p-5"><div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</div><div className="mt-3 text-2xl font-black text-[var(--gold)] sm:text-3xl">{Number(value).toLocaleString()}</div></Card>)}
          </div>
        </div>
      </Card>

      <nav className="mt-8 flex gap-2 overflow-x-auto border-b border-white/10 pb-3" aria-label="Profile sections">{(["overview", "challenges", "entries", "wins", "achievements", "activity"] as const).map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`shrink-0 rounded-[8px] px-4 py-2 text-sm font-black capitalize ${activeTab === tab ? "bg-[var(--gold)] text-black" : "bg-white/5 text-slate-300"}`}>{tab}</button>)}</nav>

      {activeTab === "overview" ? <section data-profile-overview className="mt-10 grid gap-5 lg:grid-cols-[1.4fr_.8fr]"><Card className="p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--gold)]">Profile overview</p><h2 className="mt-3 text-2xl font-black">Your Challenge Suite record</h2><p className="mt-3 max-w-2xl leading-7 text-slate-300">Your public competition identity is built from verified profile details and activity recorded across challenges.</p><div className="mt-6 flex flex-wrap gap-2"><LinkButton href="/my-challenges" variant="secondary">View Challenges</LinkButton><LinkButton href="/my-entries" variant="secondary">View Entries</LinkButton></div></Card><Card className="p-6"><h2 className="text-lg font-black">At a glance</h2><dl className="mt-5 grid gap-4 text-sm"><div className="flex justify-between"><dt className="text-slate-400">Badges</dt><dd className="font-black">{profile.badges.length}</dd></div><div className="flex justify-between"><dt className="text-slate-400">Entries</dt><dd className="font-black">{profile.submissions.length}</dd></div><div className="flex justify-between"><dt className="text-slate-400">Confirmed wins</dt><dd className="font-black">{wins}</dd></div></dl></Card></section> : null}

      {activeTab === "achievements" ? <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-3xl font-black">Achievements</h2>
          <span className="rounded-full border border-white/10 px-4 py-1 text-sm text-slate-300">{profile.badges.length} badges</span>
        </div>
        {profile.badges.length ? <div className="mt-6 grid gap-4 md:grid-cols-3">{profile.badges.map((badge) => <Card key={badge.id ?? badge.name ?? badge.title} className="p-5"><div data-user-content className="flex items-center gap-3 text-xl font-black"><Award className="text-[var(--gold)]" size={20} />{badge.title ?? badge.name}</div><p data-user-content className="mt-2 text-sm leading-6 text-[#8fa6ca]">{badge.description ?? "Earned through Challenge Suite activity."}</p></Card>)}</div> : <Card className="mt-6 border-dashed p-8 text-center text-[#8fa6ca]"><Trophy className="mx-auto text-[var(--gold)]" size={36} /><h3 className="mt-4 text-2xl font-black text-white">No achievements yet</h3><p className="mt-3">Verified badges will appear when you earn them through recorded activity.</p></Card>}
      </section> : null}

      {activeTab === "entries" ? <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-3xl font-black">Submissions</h2>
          <LinkButton href="/my-entries" variant="secondary">View My Entries</LinkButton>
        </div>
        {profile.submissions.length ? <div className="mt-6 grid gap-4">{profile.submissions.map((submission) => <Card key={submission.id ?? submission.title} className="p-5"><div data-user-content className="font-black">{submission.title ?? "Untitled Submission"}</div><p data-user-content className="mt-2 text-sm text-slate-400">{submission.challengeTitle ?? "Challenge entry"}</p></Card>)}</div> : <Card className="mt-6 border-dashed p-8 text-center text-slate-400"><h3 className="text-2xl font-black text-white">No submissions yet</h3><p className="mt-3">Entries submitted to challenges will appear here.</p><LinkButton href="/my-entries" className="mt-5">View My Entries</LinkButton></Card>}
      </section> : null}
      {activeTab === "activity" ? <ProfileRecordSection title="Activity" emptyTitle="No public activity yet" emptyBody="Real submissions, wins, and verified achievements will appear here as they are recorded." items={profile.activity.map((item) => ({ id: item.id, title: item.title ?? "Profile activity", detail: item.type.replaceAll("_", " ") }))} /> : null}
      {activeTab === "challenges" ? <ProfileRecordSection title="Challenges" emptyTitle="No challenges yet" emptyBody="Created challenge records will appear here after you save or publish them." items={profile.challenges.map((item) => ({ id: item.id, title: item.title ?? "Untitled challenge", detail: String(item.lifecycleStatus ?? item.status ?? "draft").replaceAll("_", " "), href: `/challenges/${item.id}` }))} /> : null}
      {activeTab === "wins" ? <ProfileRecordSection title="Confirmed wins" emptyTitle="No confirmed wins yet" emptyBody="Admin-confirmed winner records will appear here after results are approved." items={profile.wins.map((item) => ({ id: item.id, title: item.challengeTitle ?? "Challenge result", detail: item.placement ? `Placement ${item.placement}` : "Winner confirmed", href: item.challengeId ? `/challenges/${item.challengeId}` : undefined }))} /> : null}
    </AppShell>
  );
}

function ProfileRecordSection({ title, emptyTitle, emptyBody, items }: { title: string; emptyTitle: string; emptyBody: string; items: Array<{ id: string; title: string; detail: string; href?: string }> }) {
  return <section className="mt-12"><h2 className="text-3xl font-black">{title}</h2>{items.length ? <div className="mt-6 grid gap-4 sm:grid-cols-2">{items.map((item) => <Card key={item.id} className="p-5"><h3 data-user-content className="break-words text-lg font-black">{item.title}</h3><p className="mt-2 text-sm capitalize text-slate-400">{item.detail}</p>{item.href ? <LinkButton href={item.href} variant="secondary" className="mt-4">View</LinkButton> : null}</Card>)}</div> : <Card className="mt-6 border-dashed p-8 text-center"><h3 className="text-2xl font-black">{emptyTitle}</h3><p className="mt-3 text-slate-400">{emptyBody}</p></Card>}</section>;
}

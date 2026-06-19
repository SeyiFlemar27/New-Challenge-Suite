"use client";

import { useEffect, useState } from "react";
import { LockKeyhole, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton } from "@/components/ui";
import { PremiumBadge } from "@/components/brand";
import { fetchMyProfile } from "@/lib/api/services";
import type { UserPlanId } from "@/lib/types";

interface ProfileState {
  profileExists: boolean;
  user: {
    email: string;
    displayName: string;
    username?: string | null;
    initials: string;
    avatarUrl?: string | null;
    role?: string | null;
    planId?: string | null;
    joinedAt?: string | null;
    doroBalance: number;
  };
  stats: {
    totalPoints: number;
    submissions: number;
    totalLikes: number;
    followers: number;
    following: number;
  };
  badges: Array<{ id?: string; name?: string; title?: string; description?: string }>;
  submissions: Array<{ id?: string; title?: string; challengeTitle?: string }>;
}

function planLabel(planId?: string | null) {
  if (!planId) return "No plan";
  return planId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);

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

  if (loading) {
    return (
      <AppShell>
        <Card className="bg-yellow-500/5 p-10">
          <div className="flex animate-pulse gap-8">
            <div className="h-32 w-32 rounded-full bg-white/10" />
            <div className="flex-1 space-y-5">
              <div className="h-10 w-72 rounded bg-white/10" />
              <div className="h-5 w-56 rounded bg-white/10" />
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
          <EmptyState icon={<UserRound />} title="Profile unavailable" body={error ?? "Your profile could not be loaded."} action={<button className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[var(--gold)] px-5 text-sm font-bold text-black" onClick={loadProfile}>Retry</button>} />
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

  return (
    <AppShell>
      <Card className="bg-yellow-500/5 p-10">
        <div className="flex items-start justify-between">
          <div className="flex gap-8">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-yellow-500/30 bg-indigo-500 text-4xl">
              {profile.user.avatarUrl ? <img src={profile.user.avatarUrl} alt={profile.user.displayName} className="h-full w-full object-cover" /> : profile.user.initials}
            </div>
            <div>
              <h1 className="flex items-center gap-3 text-4xl font-black">{profile.user.displayName}<PremiumBadge planId={profile.user.planId as UserPlanId} /></h1>
              <p className="mt-3 font-bold">{profile.user.username ? `@${profile.user.username} · ` : ""}{profile.user.email}</p>
              <p className="mt-2 text-sm font-bold text-slate-300">{profile.user.role ?? "Role unavailable"} · {profile.user.joinedAt ? `Joined ${new Date(profile.user.joinedAt).toLocaleDateString()}` : "Joined date unavailable"} · {profile.user.doroBalance} DoroCoins</p>
              <LinkButton href="/profile/edit" className="mt-8 w-36">Edit Profile</LinkButton>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--gold)] px-8 py-4 text-lg font-black text-black gold-glow">{planLabel(profile.user.planId)}</span>
        </div>
        <div className="mt-10 grid grid-cols-5 gap-6 border-t border-white/10 pt-8">
          {[["Total Points", profile.stats.totalPoints], ["Submissions", profile.stats.submissions], ["Total Likes", profile.stats.totalLikes], ["Followers", profile.stats.followers], ["Following", profile.stats.following]].map(([label, value]) => <Card key={label} className="p-7 text-center"><div className="font-bold">{label}</div><div className="mt-4 text-4xl font-black">{value}</div></Card>)}
        </div>
      </Card>
      <h2 className="mt-12 text-3xl font-black">My Collection <span className="rounded-full border border-white/10 px-4 py-1 text-sm text-slate-300">{profile.badges.length} Badges</span></h2>
      {profile.badges.length ? <div className="mt-6 grid gap-4 md:grid-cols-3">{profile.badges.map((badge) => <Card key={badge.id ?? badge.name ?? badge.title} className="p-5"><div className="text-xl font-black">{badge.title ?? badge.name}</div><p className="mt-2 text-sm text-[#8fa6ca]">{badge.description ?? ""}</p></Card>)}</div> : <Card className="mt-6 border-dashed p-16 text-center text-[#8fa6ca]"><div className="text-2xl">No badges unlocked yet</div><p className="mt-4">Complete challenges to build your collection.</p></Card>}
      <h2 className="mt-12 text-3xl font-black">My Submissions</h2>
      {profile.submissions.length ? <div className="mt-6 grid gap-4">{profile.submissions.map((submission) => <Card key={submission.id ?? submission.title} className="p-5"><div className="font-black">{submission.title ?? "Untitled Submission"}</div><p className="mt-2 text-sm text-slate-400">{submission.challengeTitle ?? ""}</p></Card>)}</div> : <p className="mt-12 text-lg text-slate-400">You haven't submitted anything yet.</p>}
    </AppShell>
  );
}

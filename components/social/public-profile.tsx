"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, MapPin, MessageSquare, Share2, UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Item = Record<string, any>;
type SocialProfileData = {
  profile: Item;
  stats: Record<string, number>;
  created: Item[];
  participating: Item[];
  entries: Item[];
  wins: Item[];
  badges: Item[];
  activity: Item[];
};

const tabs = ["created", "participating", "entries", "wins", "activity", "about"];

export function PublicProfileView({ username, initialSection = "created" }: { username: string; initialSection?: string }) {
  const section = [...tabs, "followers", "following"].includes(initialSection) ? initialSection : "created";
  const [data, setData] = useState<SocialProfileData | null>(null);
  const [connections, setConnections] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    const result = await apiRequest<SocialProfileData>(`/api/public/profiles/${encodeURIComponent(username)}`);
    if (result.ok && result.data) setData(result.data);
    else setNotice(result.message);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [username]);
  useEffect(() => {
    if (!["followers", "following"].includes(section)) return;
    void apiRequest<{ profiles: Item[] }>(`/api/public/profiles/${encodeURIComponent(username)}/connections?mode=${section}`)
      .then((result) => setConnections(result.ok ? result.data?.profiles ?? [] : []));
  }, [section, username]);

  async function follow() {
    const result = await apiRequest<{ following: boolean }>(`/api/public/profiles/${encodeURIComponent(username)}/follow`, { method: "POST" });
    setNotice(result.message);
    if (result.ok) await load();
  }

  if (loading) return <AppShell><Card className="h-[420px] animate-pulse bg-[#171717]" /></AppShell>;
  if (!data) return <AppShell><EmptyState icon={<UserPlus />} title="Profile unavailable" body={notice || "This profile could not be loaded."} /></AppShell>;
  const { profile, stats } = data;
  const activeItems = section === "created" ? data.created : section === "participating" ? data.participating : section === "entries" ? data.entries : section === "wins" ? data.wins : section === "activity" ? data.activity : [];

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <Card className="overflow-hidden">
          <div className="h-36 bg-[var(--gold)]/10 bg-cover bg-center sm:h-48" style={profile.coverImageUrl ? { backgroundImage: `url(${profile.coverImageUrl})` } : undefined} />
          <div className="p-5 sm:p-8">
            <div className="-mt-20 flex flex-col gap-5 sm:-mt-24 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-black bg-[var(--gold)] text-2xl font-black text-black sm:h-36 sm:w-36">
                  {profile.avatarUrl ? <img src={profile.avatarUrl} alt={profile.displayName} className="h-full w-full object-cover" /> : profile.initials}
                </div>
                <div className="min-w-0 pb-1">
                  <h1 className="flex flex-wrap items-center gap-2 text-3xl font-black sm:text-4xl">{profile.displayName}{profile.verified ? <BadgeCheck className="text-[var(--gold)]" /> : null}</h1>
                  <p className="mt-1 text-slate-300">@{profile.username || username}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--gold)]/10 px-3 py-1 text-xs font-black text-[var(--gold)]">{profile.effectiveTier?.displayName ?? "Free Competitor"}</span>{profile.role ? <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black capitalize">{profile.role}</span> : null}</div>
                </div>
              </div>
              <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:flex sm:flex-wrap">
                {profile.isOwner ? <LinkButton href="/profile/edit" className="col-span-2 sm:col-span-1">Edit Profile</LinkButton> : <Button onClick={() => void follow()}><UserPlus size={17} /> {profile.isFollowing ? "Unfollow" : "Follow"}</Button>}
                <Button variant="secondary" disabled={!profile.allowMessages}><MessageSquare size={17} /> Message</Button>
                <Button className="col-span-2 sm:col-span-1" variant="secondary" onClick={() => navigator.share?.({ title: profile.displayName, url: window.location.href })}><Share2 size={17} /> Share</Button>
              </div>
            </div>
            {profile.bio ? <p className="mt-6 max-w-3xl leading-7 text-slate-200">{profile.bio}</p> : null}
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-400">{profile.location ? <span className="flex items-center gap-1"><MapPin size={15} /> {profile.location}</span> : null}{profile.website ? <a className="text-[var(--gold)]" href={profile.website} target="_blank" rel="noreferrer">{profile.website}</a> : null}</div>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Stat label="Followers" value={stats.followerCount} href={`/profile/${username}/followers`} />
              <Stat label="Following" value={stats.followingCount} href={`/profile/${username}/following`} />
              <Stat label="Created" value={stats.createdChallengeCount} />
              <Stat label="Joined" value={stats.participatedChallengeCount} />
              <Stat label="Entries" value={stats.entryCount} />
              <Stat label="Wins" value={stats.winCount} />
              <Stat label="Badges" value={stats.badgeCount} />
            </div>
          </div>
        </Card>

        <nav className="scrollbar-dark mt-6 flex gap-2 overflow-x-auto pb-2">
          {tabs.map((tab) => <LinkButton key={tab} href={`/profile/${username}/${tab}`} variant={section === tab ? "primary" : "secondary"} className="shrink-0 capitalize">{tab}</LinkButton>)}
        </nav>
        {notice ? <p className="mt-4 rounded-[8px] bg-[#191919] p-3 text-sm text-slate-300">{notice}</p> : null}

        {section === "about" ? <About profile={profile} badges={data.badges} /> : ["followers", "following"].includes(section) ? <ConnectionList title={section} profiles={connections} /> : <ContentGrid section={section} items={activeItems} badges={data.badges} />}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const content = <><div className="text-2xl font-black text-[var(--gold)]">{value}</div><div className="text-xs font-bold text-slate-400">{label}</div></>;
  return href ? <a href={href} className="rounded-[8px] bg-[#171717] p-3 text-center">{content}</a> : <div className="rounded-[8px] bg-[#171717] p-3 text-center">{content}</div>;
}

function ContentGrid({ section, items, badges }: { section: string; items: Item[]; badges: Item[] }) {
  return <section className="mt-8"><h2 className="text-2xl font-black capitalize">{section}</h2>{items.length ? <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Card key={item.id} className="overflow-hidden">{item.mediaUrl || item.coverImageUrl ? <img src={item.mediaUrl || item.coverImageUrl} alt={item.title || "Profile item"} className="h-48 w-full object-cover" /> : null}<div className="p-5"><h3 className="break-words text-lg font-black">{item.title || item.challengeTitle || item.type?.replaceAll("_", " ") || "Challenge activity"}</h3><p className="mt-2 text-sm capitalize text-slate-400">Status: {String(item.status || item.position ? item.position ? `Placement ${item.position}` : item.status : "recorded").replaceAll("_", " ")}</p>{item.voteCount !== undefined ? <p className="mt-2 text-sm text-slate-300">{item.voteCount} votes · {item.viewCount ?? 0} views</p> : null}{item.challengeId || item.id ? <LinkButton href={`/challenges/${item.challengeId || item.id}`} variant="ghost" className="mt-4 w-full">Open</LinkButton> : null}</div></Card>)}</div> : <Card className="mt-5 border-dashed p-8 text-center text-slate-400">No public {section} yet.</Card>}{section === "wins" && badges.length ? <div className="mt-8 flex flex-wrap gap-2">{badges.map((badge) => <span key={badge.id} className="rounded-full border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 text-xs font-black text-[var(--gold)]">{badge.title || badge.name}</span>)}</div> : null}</section>;
}

function About({ profile, badges }: { profile: Item; badges: Item[] }) {
  return <section className="mt-8 grid gap-5 lg:grid-cols-2"><Card className="p-6"><h2 className="text-2xl font-black">About</h2><p className="mt-4 text-slate-300">{profile.bio || "No bio provided."}</p><p className="mt-4 text-sm text-slate-400">Location: {profile.location || "Not shared"}</p><p className="mt-2 text-sm text-slate-400">Joined: {profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString() : "Unavailable"}</p><p className="mt-2 text-sm text-slate-400">Categories: {profile.categories?.join(", ") || "Not provided"}</p></Card><Card className="p-6"><h2 className="text-2xl font-black">Badges & Achievements</h2><div className="mt-4 flex flex-wrap gap-2">{badges.length ? badges.map((badge) => <span key={badge.id} className="rounded-full bg-[var(--gold)]/10 px-3 py-2 text-sm font-black text-[var(--gold)]">{badge.title || badge.name}</span>) : <p className="text-slate-400">No public badges yet.</p>}</div></Card></section>;
}

function ConnectionList({ title, profiles }: { title: string; profiles: Item[] }) {
  return <section className="mt-8"><h2 className="text-2xl font-black capitalize">{title}</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{profiles.length ? profiles.map((profile) => <Card key={profile.id} className="flex items-center gap-4 p-4"><div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[var(--gold)] font-black text-black">{profile.avatarUrl ? <img src={profile.avatarUrl} alt={profile.displayName} className="h-full w-full object-cover" /> : String(profile.displayName).slice(0, 2).toUpperCase()}</div><div className="min-w-0"><a href={`/profile/${profile.username}`} className="font-black">{profile.displayName}</a><p className="truncate text-sm text-slate-400">@{profile.username}</p></div></Card>) : <Card className="p-8 text-slate-400">No {title} yet.</Card>}</div></section>;
}

"use client";

import { useEffect, useState } from "react";
import { Award, BadgeCheck, MapPin, MessageSquare, Settings, Share2, Trophy, UserPlus } from "lucide-react";
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

function valueOf(stats: Record<string, number>, ...keys: string[]) {
  for (const key of keys) {
    if (typeof stats[key] === "number") return stats[key];
  }
  return 0;
}

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
    setNotice(result.message || (result.ok ? "Profile follow status updated." : "Follow will be available soon."));
    if (result.ok) await load();
  }

  async function shareProfile(displayName: string) {
    if (navigator.share) await navigator.share({ title: displayName, url: window.location.href });
    else await navigator.clipboard?.writeText(window.location.href);
    setNotice("Profile link copied.");
  }

  if (loading) return <AppShell><Card className="h-[420px] animate-pulse bg-[#171717]" /></AppShell>;
  if (!data) return <AppShell><EmptyState icon={<UserPlus />} title="Profile unavailable" body={notice || "This profile could not be loaded."} /></AppShell>;
  const { profile, stats } = data;
  const activeItems = section === "created" ? data.created : section === "participating" ? data.participating : section === "entries" ? data.entries : section === "wins" ? data.wins : section === "activity" ? data.activity : [];
  const displayName = String(profile.displayName ?? "Challenge Suite member");
  const joinedDate = profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString() : "Joined date unavailable";

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <Card className="overflow-hidden bg-[#111111]">
          <div className="h-32 bg-[radial-gradient(circle_at_top_left,rgba(246,198,75,.24),transparent_36%),linear-gradient(135deg,#1b1b1b,#090909)] bg-cover bg-center sm:h-48" style={profile.coverImageUrl ? { backgroundImage: `linear-gradient(135deg,rgba(0,0,0,.34),rgba(0,0,0,.7)),url(${profile.coverImageUrl})` } : undefined} />
          <div className="p-5 sm:p-8">
            <div className="-mt-20 flex flex-col gap-5 sm:-mt-24 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-[#101010] bg-[var(--gold)] text-2xl font-black text-black shadow-[0_18px_45px_rgba(0,0,0,.35)] sm:h-36 sm:w-36">
                  {profile.avatarUrl ? <img src={profile.avatarUrl} alt={displayName} className="h-full w-full object-cover" /> : profile.initials}
                </div>
                <div className="min-w-0 pb-1">
                  <h1 className="flex flex-wrap items-center gap-2 break-words text-3xl font-black sm:text-4xl">{displayName}{profile.verified ? <BadgeCheck className="text-[var(--gold)]" aria-label="Verified profile" /> : null}</h1>
                  <p className="mt-2 text-sm font-bold text-slate-300">@{profile.username || username}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--gold)]/10 px-3 py-1 text-xs font-black text-[var(--gold)]">{profile.effectiveTier?.displayName ?? "Free Competitor"}</span>{profile.role ? <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black capitalize">{String(profile.role).replaceAll("_", " ")}</span> : null}<span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-slate-300">{joinedDate}</span></div>
                </div>
              </div>
              <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-4 lg:flex lg:flex-wrap lg:justify-end">
                {profile.isOwner ? <><LinkButton href="/profile/edit" className="w-full">Edit Profile</LinkButton><LinkButton href="/settings" variant="secondary" className="w-full"><Settings size={16} /> Settings</LinkButton><Button variant="secondary" onClick={() => void shareProfile(displayName)} className="w-full"><Share2 size={16} /> Share Profile</Button><LinkButton href={`/profile/${profile.username || username}`} variant="ghost" className="w-full">View Public Profile</LinkButton></> : <><Button onClick={() => void follow()}><UserPlus size={17} /> {profile.isFollowing ? "Unfollow" : "Follow"}</Button><Button variant="secondary" disabled={!profile.allowMessages} title={profile.allowMessages ? undefined : "Messaging will be available soon"}><MessageSquare size={17} /> {profile.allowMessages ? "Message" : "Messaging soon"}</Button><Button variant="secondary" onClick={() => void shareProfile(displayName)}><Share2 size={17} /> Share Profile</Button><LinkButton href={`/profile/${username}/entries`} variant="ghost">View Entries</LinkButton></>}
              </div>
            </div>
            {profile.bio ? <p className="mt-6 max-w-3xl leading-7 text-slate-200">{profile.bio}</p> : <p className="mt-6 max-w-3xl leading-7 text-slate-300">Competition activity, entries, wins, and achievements appear here as this member participates.</p>}
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-400">{profile.location ? <span className="flex items-center gap-1"><MapPin size={15} /> {profile.location}</span> : null}{profile.website ? <a className="text-[var(--gold)]" href={profile.website} target="_blank" rel="noreferrer">{profile.website}</a> : null}</div>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Total Points" value={valueOf(stats, "totalPoints", "points")} />
              <Stat label="Submissions" value={valueOf(stats, "entryCount", "submissions")} />
              <Stat label="Wins" value={valueOf(stats, "winCount", "wins")} />
              <Stat label="Followers" value={valueOf(stats, "followerCount", "followers")} href={`/profile/${username}/followers`} />
              <Stat label="Following" value={valueOf(stats, "followingCount", "following")} href={`/profile/${username}/following`} />
            </div>
          </div>
        </Card>

        <nav className="scrollbar-dark mt-6 flex gap-2 overflow-x-auto pb-2" aria-label="Profile sections">
          {tabs.map((tab) => <LinkButton key={tab} href={`/profile/${username}/${tab}`} variant={section === tab ? "primary" : "secondary"} className="shrink-0 capitalize">{tab === "entries" ? "Submissions" : tab}</LinkButton>)}
        </nav>
        {notice ? <p className="mt-4 rounded-[8px] bg-[#191919] p-3 text-sm text-slate-300">{notice}</p> : null}

        {section === "about" ? <About profile={profile} badges={data.badges} /> : ["followers", "following"].includes(section) ? <ConnectionList title={section} profiles={connections} /> : <ContentGrid section={section} username={username} items={activeItems} badges={data.badges} />}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const content = <><div className="text-2xl font-black text-[var(--gold)]">{Number(value ?? 0).toLocaleString()}</div><div className="text-xs font-bold text-slate-400">{label}</div></>;
  return href ? <a href={href} className="rounded-[8px] bg-[#171717] p-3 text-center transition hover:bg-[#202020] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]">{content}</a> : <div className="rounded-[8px] bg-[#171717] p-3 text-center">{content}</div>;
}

function ContentGrid({ section, username, items, badges }: { section: string; username: string; items: Item[]; badges: Item[] }) {
  const title = section === "entries" ? "Submissions" : section;
  const emptyTitle = section === "entries" ? "No submissions yet" : `No public ${title} yet`;
  const emptyBody = section === "entries" ? "Entries submitted to challenges will appear here." : "Public competition activity will appear here when available.";
  return <section className="mt-8"><h2 className="text-2xl font-black capitalize">{title}</h2>{items.length ? <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Card key={item.id} className="overflow-hidden">{item.mediaUrl || item.coverImageUrl ? <img src={item.mediaUrl || item.coverImageUrl} alt={item.title || "Profile item"} className="h-48 w-full object-cover" /> : <div className="flex h-48 items-center justify-center bg-[radial-gradient(circle_at_top,rgba(246,198,75,.16),transparent_45%),#111] px-4 text-center text-sm font-black text-[var(--gold)]">Challenge Suite Entry</div>}<div className="p-5"><h3 className="break-words text-lg font-black">{item.title || item.challengeTitle || item.type?.replaceAll("_", " ") || "Challenge activity"}</h3><p className="mt-2 text-sm capitalize text-slate-400">Status: {String(item.status || (item.position ? `Placement ${item.position}` : "recorded")).replaceAll("_", " ")}</p>{item.voteCount !== undefined ? <p className="mt-2 text-sm text-slate-300">{item.voteCount} votes · {item.viewCount ?? 0} views</p> : null}{item.challengeId || item.id ? <LinkButton href={`/challenges/${item.challengeId || item.id}`} variant="ghost" className="mt-4 w-full">Open</LinkButton> : null}</div></Card>)}</div> : <Card className="mt-5 border-dashed p-8 text-center text-slate-400"><h3 className="text-2xl font-black text-white">{emptyTitle}</h3><p className="mt-3">{emptyBody}</p>{section === "entries" ? <LinkButton href="/challenges" className="mt-5">Explore Challenges</LinkButton> : null}</Card>}{section === "wins" && badges.length ? <div className="mt-8 flex flex-wrap gap-2">{badges.map((badge) => <span key={badge.id} className="rounded-full border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 text-xs font-black text-[var(--gold)]">{badge.title || badge.name}</span>)}</div> : null}</section>;
}

function About({ profile, badges }: { profile: Item; badges: Item[] }) {
  return <section className="mt-8 grid gap-5 lg:grid-cols-2"><Card className="p-6"><h2 className="text-2xl font-black">About</h2><p className="mt-4 text-slate-300">{profile.bio || "No bio provided."}</p><p className="mt-4 text-sm text-slate-400">Location: {profile.location || "Not shared"}</p><p className="mt-2 text-sm text-slate-400">Joined: {profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString() : "Unavailable"}</p><p className="mt-2 text-sm text-slate-400">Categories: {profile.categories?.join(", ") || "Not provided"}</p></Card><Card className="p-6"><h2 className="text-2xl font-black">Achievements</h2><div className="mt-4 flex flex-wrap gap-2">{badges.length ? badges.map((badge) => <span key={badge.id} className="inline-flex items-center gap-2 rounded-full bg-[var(--gold)]/10 px-3 py-2 text-sm font-black text-[var(--gold)]"><Award size={14} />{badge.title || badge.name}</span>) : <div className="text-slate-400"><h3 className="font-black text-white">No achievements yet</h3><p className="mt-2">Badges will appear as this member competes, votes, and wins challenges.</p></div>}</div></Card></section>;
}

function ConnectionList({ title, profiles }: { title: string; profiles: Item[] }) {
  return <section className="mt-8"><h2 className="text-2xl font-black capitalize">{title}</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{profiles.length ? profiles.map((profile) => <Card key={profile.id} className="flex items-center gap-4 p-4"><div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[var(--gold)] font-black text-black">{profile.avatarUrl ? <img src={profile.avatarUrl} alt={profile.displayName} className="h-full w-full object-cover" /> : String(profile.displayName).slice(0, 2).toUpperCase()}</div><div className="min-w-0"><a href={`/profile/${profile.username}`} className="font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]">{profile.displayName}</a><p className="truncate text-sm text-slate-400">@{profile.username}</p></div></Card>) : <Card className="p-8 text-slate-400">No {title} yet.</Card>}</div></section>;
}

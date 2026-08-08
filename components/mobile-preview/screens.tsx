"use client";

import { Award, Camera, CheckCircle2, Coins, Eye, LockKeyhole, Mail, Radio, Search, ShieldCheck, Trophy, UploadCloud, Vote } from "lucide-react";
import { useState } from "react";
import { badges, challenges, leaderboard, liveEvents, previewUser, quickActions, stats, submissions, walletPackages, type MobileScreen, type MobileTab, type PreviewChallenge, type PreviewSubmission } from "@/lib/mobile-preview/data";
import { MobileBadge, MobileButton, MobileCard, MobileInput, MobileListRow, MiniMetric, ScreenTitle, SectionHeader, StickyActions, logoUrl } from "./ui";
import { EmptyPreview, LeaderboardRow, MobileChallengeCard, SearchBox, SegmentedTabs, StatusMetrics, StepPill, SubmissionRow, UploadDropzone, VoteAmountGrid, WalletPackage, WinnerCard } from "./cards";
import { cn } from "@/lib/utils";

export type ScreenProps = {
  screen: MobileScreen;
  tab: MobileTab;
  selectedChallenge: PreviewChallenge;
  selectedSubmission: PreviewSubmission;
  onGo: (screen: MobileScreen, tab?: MobileTab) => void;
  onChallenge: (challenge: PreviewChallenge) => void;
  onSubmission: (submission: PreviewSubmission) => void;
  onSheet: (sheet: { title: string; body: string; action: string }) => void;
};

export function ScreenRenderer(props: ScreenProps) {
  switch (props.screen) {
    case "splash": return <SplashScreen onGo={props.onGo} />;
    case "welcome": return <WelcomeScreen onGo={props.onGo} />;
    case "login": return <LoginScreen onGo={props.onGo} onSheet={props.onSheet} />;
    case "signup": return <SignupScreen onGo={props.onGo} />;
    case "otp": return <OtpScreen onGo={props.onGo} />;
    case "home": return <HomeScreen {...props} />;
    case "explore": return <ExploreScreen {...props} />;
    case "challenges": return <ChallengeListingScreen {...props} />;
    case "challenge-detail": return <ChallengeDetailScreen {...props} />;
    case "join": return <JoinScreen {...props} />;
    case "submission": return <SubmissionScreen {...props} />;
    case "vote": return <VoteScreen {...props} />;
    case "wallet": return <WalletScreen {...props} />;
    case "leaderboard": return <LeaderboardScreen />;
    case "winners": return <WinnersScreen {...props} />;
    case "events": return <EventsScreen {...props} />;
    case "profile": return <ProfileScreen {...props} />;
    case "settings": return <SettingsScreen {...props} />;
    default: return null;
  }
}

function SplashScreen({ onGo }: Pick<ScreenProps, "onGo">) {
  return (
    <div className="flex min-h-[760px] flex-col items-center justify-between px-1 py-8 text-center">
      <div className="h-12" />
      <div className="flex flex-col items-center">
        <div className="relative flex h-36 w-36 items-center justify-center rounded-full border border-yellow-400/35 bg-yellow-500/10 shadow-[0_0_54px_rgba(245,217,10,.22)]">
          <div className="absolute inset-3 rounded-full border border-yellow-400/10" />
          <img src={logoUrl} alt="Challenge Suite" className="h-24 w-24 rounded-full object-cover" />
        </div>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.3em] text-[var(--gold)]">Challenge Suite</p>
        <h1 className="mt-4 text-4xl font-black leading-tight">Compete. Vote. Win.</h1>
        <p className="mt-4 max-w-[285px] text-sm leading-6 text-slate-300">Premium challenges, verified submissions, daily voting, and real winner moments.</p>
      </div>
      <div className="w-full space-y-3">
        <div className="mx-auto mb-2 h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-2/3 rounded-full bg-[var(--gold)] shadow-[0_0_18px_rgba(245,217,10,.45)]" />
        </div>
        <MobileButton onClick={() => onGo("welcome")}>Enter Preview</MobileButton>
      </div>
    </div>
  );
}

function WelcomeScreen({ onGo }: Pick<ScreenProps, "onGo">) {
  return (
    <div className="flex min-h-[760px] flex-col justify-between py-3 text-center">
      <div className="space-y-5">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-yellow-500/35 bg-yellow-500/10 shadow-[0_0_30px_rgba(245,217,10,.16)]">
          <img src={logoUrl} alt="Challenge Suite" className="h-16 w-16 rounded-full object-cover" />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--gold)]">Premium Competition Platform</p>
          <h1 className="mt-4 text-4xl font-black leading-tight">Your arena for creator-led challenges.</h1>
          <p className="mx-auto mt-4 max-w-[300px] text-sm leading-6 text-slate-300">Join challenges, submit polished media, cast a daily free vote, and watch verified winners rise.</p>
        </div>
        <div className="grid gap-3 text-left">
          <MobileCard className="p-4"><div className="flex items-center gap-3"><Trophy className="text-[var(--gold)]" size={20} /><div><h3 className="font-black">Compete with purpose</h3><p className="text-xs text-slate-400">Image and video challenges built for serious creators.</p></div></div></MobileCard>
          <MobileCard className="p-4"><div className="flex items-center gap-3"><Vote className="text-[var(--gold)]" size={20} /><div><h3 className="font-black">Vote your way</h3><p className="text-xs text-slate-400">Cast a daily free vote or use Challenge Credits for eligible additional votes.</p></div></div></MobileCard>
        </div>
      </div>
      <div className="space-y-3 pb-2">
        <MobileButton onClick={() => onGo("login")}>Sign In</MobileButton>
        <MobileButton variant="secondary" onClick={() => onGo("signup")}>Create Account</MobileButton>
        <button onClick={() => onGo("home", "home")} className="text-sm font-bold text-slate-400">Preview without account</button>
      </div>
    </div>
  );
}
function LoginScreen({ onGo, onSheet }: Pick<ScreenProps, "onGo" | "onSheet">) {
  return <AuthPanel mode="login" title="Welcome back" subtitle="Enter the arena with your Challenge Suite account." primary="Sign In" onPrimary={() => onGo("home", "home")} footer="Create account" onFooter={() => onGo("signup")} onForgot={() => onSheet({ title: "Reset password", body: "Password reset will be connected in production. For this preview, continue with the demo account.", action: "Reset preview opened" })} />;
}

function SignupScreen({ onGo }: Pick<ScreenProps, "onGo">) {
  return <AuthPanel mode="signup" title="Create Account" subtitle="Set up your competition profile and verify your email to continue." primary="Create Account" onPrimary={() => onGo("otp")} footer="Already have an account" onFooter={() => onGo("login")} />;
}

function AuthPanel({ mode, title, subtitle, primary, footer, onPrimary, onFooter, onForgot }: { mode: "login" | "signup"; title: string; subtitle: string; primary: string; footer: string; onPrimary: () => void; onFooter: () => void; onForgot?: () => void }) {
  const isSignup = mode === "signup";
  return (
    <div className="flex min-h-[760px] flex-col justify-between py-2">
      <div className="space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-yellow-500/35 bg-yellow-500/10 shadow-[0_0_26px_rgba(245,217,10,.16)]">
            <img src={logoUrl} alt="Challenge Suite" className="h-14 w-14 rounded-full object-cover" />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-[var(--gold)]">Secure preview access</p>
          <h1 className="mt-3 text-4xl font-black leading-tight">{title}</h1>
          <p className="mx-auto mt-3 max-w-[300px] text-sm leading-6 text-slate-300">{subtitle}</p>
        </div>

        <MobileCard className="border-yellow-500/15 bg-[#101010]/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,.35)]">
          <div className="space-y-4">
            <GooglePreviewButton label={isSignup ? "Sign up with Google" : "Continue with Google"} />
            <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500"><span className="h-px flex-1 bg-white/10" />or use email<span className="h-px flex-1 bg-white/10" /></div>
            {isSignup ? <PreviewAuthInput label="Full name" value="Amara Cole" icon={<ShieldCheck size={18} />} /> : null}
            <PreviewAuthInput label="Email" value="amara@demo.com" icon={<Mail size={18} />} />
            <PreviewAuthInput label="Password" value="********" icon={<LockKeyhole size={18} />} secure />
            {isSignup ? <PreviewAuthInput label="Confirm password" value="********" icon={<LockKeyhole size={18} />} secure /> : null}
            {isSignup ? <RoleSelector /> : null}
            {onForgot ? <button onClick={onForgot} className="w-full text-right text-xs font-black text-[var(--gold)]">Forgot password?</button> : null}
            {isSignup ? <label className="flex items-start gap-3 rounded-[14px] border border-yellow-500/20 bg-yellow-500/[.06] p-3 text-xs leading-5 text-slate-300"><input type="checkbox" defaultChecked className="mt-1 accent-yellow-400" /> <span>I agree to the Terms, Privacy Policy, Community Guidelines, and challenge platform rules.</span></label> : null}
          </div>
        </MobileCard>
      </div>
      <div className="space-y-3 pb-2 pt-6">
        <MobileButton onClick={onPrimary}>{primary}</MobileButton>
        <button onClick={onFooter} className="w-full text-sm font-bold text-slate-400">{footer}</button>
      </div>
    </div>
  );
}

function GooglePreviewButton({ label }: { label: string }) {
  return <button className="flex h-14 min-h-14 w-full items-center justify-center gap-3 rounded-[14px] border border-white/10 bg-[#181818] px-4 text-sm font-black text-white transition hover:border-yellow-400/30"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-black text-black">G</span>{label}</button>;
}

function RoleSelector() {
  return <div><p className="mb-2 text-xs font-black text-slate-300">Role</p><div className="grid grid-cols-2 gap-2">{["Participant", "Creator"].map((role, index) => <button key={role} className={cn("h-12 rounded-[14px] border text-xs font-black transition", index === 0 ? "border-yellow-400 bg-yellow-500/10 text-[var(--gold)]" : "border-white/10 bg-[#161616] text-slate-300")}>{role}</button>)}</div></div>;
}
function PreviewAuthInput({ label, value, icon, secure }: { label: string; value: string; icon: React.ReactNode; secure?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black text-slate-300">{label}</span>
      <div className="flex h-14 items-center gap-3 rounded-[14px] border border-white/10 bg-[#181818] px-4 text-sm font-bold text-white outline-none transition focus-within:border-[var(--gold)] focus-within:shadow-[0_0_0_3px_rgba(245,217,10,.08)]">
        <span className="text-[var(--gold)]">{icon}</span>
        <input readOnly type={secure ? "password" : "text"} value={value} className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-500" />
        {secure ? <Eye size={17} className="text-slate-500" /> : null}
      </div>
    </label>
  );
}

function OtpScreen({ onGo }: Pick<ScreenProps, "onGo">) {
  return (
    <div className="flex min-h-[760px] flex-col justify-between py-4 text-center">
      <div className="space-y-7">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-yellow-400/40 bg-yellow-500/10 text-[var(--gold)] shadow-[0_0_26px_rgba(245,217,10,.14)]"><ShieldCheck size={34} /></div>
        <div>
          <h1 className="text-3xl font-black leading-tight">We sent a verification code to your email</h1>
          <p className="mx-auto mt-3 max-w-[300px] text-sm leading-6 text-slate-300">Enter the 6-digit code sent to <b className="text-white">amara@demo.com</b>.</p>
        </div>
        <MobileCard className="p-4">
          <div className="grid grid-cols-6 gap-2">{"428915".split("").map((digit, i) => <div key={`${digit}-${i}`} className="flex h-14 items-center justify-center rounded-[13px] border border-yellow-400/30 bg-[#151515] text-xl font-black shadow-[inset_0_0_0_1px_rgba(255,255,255,.03)]">{digit}</div>)}</div>
          <p className="mt-4 text-xs font-bold text-slate-500">Code expires in 10 minutes</p>
        </MobileCard>
      </div>
      <div className="space-y-3 pb-2">
        <MobileButton onClick={() => onGo("home", "home")}>Verify Code</MobileButton>
        <MobileButton variant="secondary">Resend Code</MobileButton>
        <button onClick={() => onGo("signup")} className="text-sm font-bold text-slate-400">Change Email</button>
      </div>
    </div>
  );
}
function HomeScreen({ onGo, onChallenge }: ScreenProps) {
  return <div className="space-y-5"><HeroGreeting /><div className="grid grid-cols-3 gap-3">{stats.map((stat) => { const Icon = stat.icon; return <MobileCard key={stat.label} className="p-3"><div className={cn("flex h-9 w-9 items-center justify-center rounded-[12px]", stat.tone === "gold" ? "bg-yellow-500/10 text-[var(--gold)]" : stat.tone === "purple" ? "bg-indigo-500/15 text-indigo-300" : "bg-emerald-500/10 text-emerald-300")}><Icon size={18} /></div><div className="mt-3 text-xl font-black">{stat.value}</div><div className="text-[11px] font-bold text-slate-400">{stat.label}</div></MobileCard>; })}</div><section><SectionHeader title="Quick Actions" action="See all" onClick={() => onGo("explore", "explore")} /><div className="grid grid-cols-4 gap-3">{quickActions.map((action) => { const Icon = action.icon; return <button key={action.label} onClick={() => onGo(action.screen, action.screen === "challenges" ? "explore" : undefined)} className="rounded-[16px] border border-white/10 bg-[#121212] p-3 text-center"><Icon className="mx-auto text-[var(--gold)]" size={20} /><div className="mt-2 text-xs font-black">{action.label}</div></button>; })}</div></section><section><SectionHeader title="Trending Challenges" action="Explore" onClick={() => onGo("explore", "explore")} /><div className="space-y-3">{challenges.slice(0, 2).map((challenge) => <MobileChallengeCard key={challenge.id} challenge={challenge} onClick={() => onChallenge(challenge)} />)}</div></section><LeaderboardMini onGo={onGo} /></div>;
}

function HeroGreeting() {
  return <MobileCard className="overflow-hidden p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Welcome back</p><h2 className="mt-2 text-2xl font-black">{previewUser.name}</h2><p className="mt-1 text-sm text-slate-300">Ready to take on new challenges?</p></div><div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 font-black">{previewUser.initials}</div></div><div className="mt-5 flex items-center justify-between rounded-[14px] border border-yellow-500/20 bg-yellow-500/10 p-3"><span className="text-sm font-bold text-slate-200">Available DoroCoins</span><span className="text-xl font-black text-[var(--gold)]">{previewUser.doroBalance}</span></div></MobileCard>;
}

function ExploreScreen({ onGo, onChallenge }: ScreenProps) {
  return <div className="space-y-5"><ScreenTitle title="Explore" subtitle="Find active challenges you can join, vote on, or follow." /><SearchBox /><SegmentedTabs items={["Active", "Trending", "Open", "Private"]} /><div className="grid grid-cols-2 gap-3"><MobileButton variant="secondary" onClick={() => onGo("challenges", "explore")}>All Challenges</MobileButton><MobileButton variant="ghost" onClick={() => onGo("events")}>Live Events</MobileButton></div><div className="space-y-3">{challenges.map((challenge) => <MobileChallengeCard key={challenge.id} challenge={challenge} onClick={() => onChallenge(challenge)} />)}</div></div>;
}

function ChallengeListingScreen({ onChallenge }: ScreenProps) {
  return <div className="space-y-4"><ScreenTitle title="Challenges" subtitle="Browse active, upcoming, and private competitions." /><SearchBox />{challenges.map((challenge) => <MobileChallengeCard key={challenge.id} challenge={challenge} onClick={() => onChallenge(challenge)} compact />)}</div>;
}

function ChallengeDetailScreen({ selectedChallenge, onGo, onSheet }: ScreenProps) {
  const challenge = selectedChallenge;
  return <div className="-mx-4 -mt-3 pb-20"><div className="relative h-72 overflow-hidden"><img src={challenge.imageUrl} alt={challenge.title} className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" /><div className="absolute bottom-5 left-4 right-4"><MobileBadge>{challenge.status}</MobileBadge><h1 className="mt-3 text-3xl font-black leading-tight">{challenge.title}</h1><p className="mt-2 text-sm text-slate-200">{challenge.description}</p></div></div><div className="space-y-5 px-4 pt-5"><StatusMetrics challenge={challenge} /><MobileCard className="p-4"><h3 className="font-black text-[var(--gold)]">Challenge Guide</h3><p className="mt-2 text-sm leading-6 text-slate-300">{challenge.acceptedMedia}. Entry fee: {challenge.entryFee}. Registration closes in {challenge.deadline}.</p></MobileCard><MobileCard className="p-4"><h3 className="font-black">Rules</h3><div className="mt-3 space-y-2">{challenge.rules.map((rule) => <p key={rule} className="text-sm text-slate-300">- {rule}</p>)}</div></MobileCard><section><SectionHeader title="Top submissions" action="Vote" onClick={() => onGo("vote")} /><div className="space-y-3">{submissions.slice(0, 2).map((submission) => <SubmissionRow key={submission.id} submission={submission} onClick={() => onGo("submission")} />)}</div></section></div><StickyActions><MobileButton onClick={() => onGo("join")}>Join Challenge</MobileButton><MobileButton variant="secondary" onClick={() => onGo("vote")}>Vote</MobileButton><button onClick={() => onSheet({ title: "Sponsorship", body: "Sponsor proposals are submitted for review before public display.", action: "Sponsorship interest saved" })} className="text-xs font-black text-slate-400">Sponsor this challenge</button></StickyActions></div>;
}

function JoinScreen({ selectedChallenge, onGo, onSheet }: ScreenProps) {
  return <div className="space-y-5 pb-24"><ScreenTitle title="Submit Entry" subtitle={selectedChallenge.title} /><StepPill step="1" title="Review rules" done /><StepPill step="2" title="Upload media" /><UploadDropzone /><MobileInput label="Submission title" value="Rainline Reflections" /><MobileInput label="Caption" value="A cinematic city moment after midnight rain." multiline /><label className="flex gap-3 rounded-[14px] border border-white/10 bg-[#121212] p-4 text-sm font-bold text-slate-200"><input type="checkbox" defaultChecked /> I accept the rules, prize terms, and voting policy.</label><StickyActions><MobileButton onClick={() => onSheet({ title: "Entry submitted", body: "Your upload is pending creator/admin approval before public display.", action: "Entry saved" })}>Submit Entry</MobileButton><MobileButton variant="ghost" onClick={() => onGo("challenge-detail")}>Back to Challenge</MobileButton></StickyActions></div>;
}

function SubmissionScreen({ selectedSubmission, onGo }: ScreenProps) {
  const submission = selectedSubmission;
  return <div className="-mx-4 -mt-3 pb-20"><img src={submission.mediaUrl} alt={submission.title} className="h-[430px] w-full object-cover" /><div className="space-y-5 px-4 pt-5"><div><MobileBadge>Rank #{submission.rank}</MobileBadge><h1 className="mt-3 text-3xl font-black">{submission.title}</h1><p className="mt-2 text-sm text-slate-300">by {submission.creator} - {submission.challengeTitle}</p></div><div className="grid grid-cols-3 gap-3"><MiniMetric label="Votes" value={submission.votes.toLocaleString()} /><MiniMetric label="Rank" value={`#${submission.rank}`} /><MiniMetric label="Status" value="Live" /></div><MobileCard className="p-4"><h3 className="font-black text-[var(--gold)]">Submission Preview</h3><p className="mt-2 text-sm leading-6 text-slate-300">Verified voting is active. Users get one free vote per challenge/day. Additional votes use Challenge Credits.</p></MobileCard></div><StickyActions><MobileButton onClick={() => onGo("vote")}>Vote for Entry</MobileButton><MobileButton variant="secondary" onClick={() => onGo("challenge-detail")}>Challenge</MobileButton></StickyActions></div>;
}

function VoteScreen({ onSheet }: ScreenProps) {
  const [selected, setSelected] = useState("100");
  return <div className="space-y-5 pb-24"><ScreenTitle title="Vote" subtitle="Use Challenge Credits for additional votes." /><SubmissionRow submission={submissions[0]} /><MobileCard className="p-4"><div className="flex items-center justify-between"><span className="font-bold text-slate-300">Challenge Credit balance</span><span className="text-2xl font-black text-[var(--gold)]">500</span></div></MobileCard><VoteAmountGrid selected={selected} setSelected={setSelected} /><label className="flex gap-3 rounded-[14px] border border-white/10 bg-[#121212] p-4 text-sm font-bold text-slate-200"><input type="checkbox" defaultChecked /> Additional votes are final and subject to voting policy.</label><StickyActions><MobileButton onClick={() => onSheet({ title: "Confirm votes", body: `${selected} votes will be recorded for Rainline Reflections. ${Number(selected) * 10} Challenge Credits will be deducted.`, action: "Votes recorded" })}>Confirm Vote Purchase</MobileButton></StickyActions></div>;
}

function WalletScreen({ onSheet }: ScreenProps) {
  return <div className="space-y-5 pb-4"><ScreenTitle title="Wallet" subtitle="Use DoroCoins for eligible community, boost, and reward features." /><MobileCard className="border-yellow-400/30 bg-yellow-500/10 p-5"><p className="text-sm font-bold text-slate-300">Available Balance</p><div className="mt-2 text-5xl font-black text-[var(--gold)]">500</div></MobileCard><section><SectionHeader title="Buy DoroCoins" /><div className="space-y-3">{walletPackages.map((pack) => <WalletPackage key={pack.id} pack={pack} onClick={() => onSheet({ title: `${pack.coins} DoroCoins`, body: `${pack.label} package for ${pack.price}. Checkout will connect to Stripe in production.`, action: "Checkout preview started" })} />)}</div></section><section><SectionHeader title="Recent activity" /><MobileListRow title="Boost spend" meta="Challenge visibility" value="-100" danger /><MobileListRow title="Admin grant" meta="Launch reward" value="+500" /></section></div>;
}

function LeaderboardScreen() {
  return <div className="space-y-4"><ScreenTitle title="Leaderboard" subtitle="Verified rankings across current competitions." />{leaderboard.map((row) => <LeaderboardRow key={row.rank} row={row} />)}</div>;
}

function WinnersScreen({ onSubmission }: ScreenProps) {
  return <div className="space-y-4"><ScreenTitle title="Winners" subtitle="Champion entries and final results." />{submissions.map((submission) => <WinnerCard key={submission.id} submission={submission} onClick={() => onSubmission(submission)} />)}</div>;
}

function EventsScreen({ onSheet }: ScreenProps) {
  return <div className="space-y-4"><ScreenTitle title="Live Events" subtitle="Offline competitions and verified host gatherings." />{liveEvents.map((event) => <MobileCard key={event.id} className="overflow-hidden"><img src={event.imageUrl} alt={event.title} className="h-40 w-full object-cover" /><div className="p-4"><div className="flex items-center justify-between"><MobileBadge>{event.planRequired ? "Premium" : "Open"}</MobileBadge><span className="text-xs text-slate-400">{event.attending} attending</span></div><h3 className="mt-3 text-xl font-black">{event.title}</h3><p className="mt-2 text-sm text-slate-300">{event.location} - {event.date}</p><MobileButton className="mt-4" variant={event.planRequired ? "secondary" : "primary"} onClick={() => onSheet({ title: event.title, body: event.planRequired ? "Upgrade required to register for this event." : "Your event registration is reserved in preview mode.", action: "Event action saved" })}>{event.planRequired ? "Upgrade Required" : "Register"}</MobileButton></div></MobileCard>)}</div>;
}

function ProfileScreen({ onGo }: ScreenProps) {
  return <div className="space-y-5"><MobileCard className="p-5 text-center"><div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-4 border-yellow-500/30 bg-indigo-600 text-3xl font-black">{previewUser.initials}</div><h1 className="mt-4 text-3xl font-black">{previewUser.name}</h1><p className="mt-1 text-sm text-slate-300">{previewUser.role} - {previewUser.plan}</p><MobileBadge className="mt-4">Premium</MobileBadge></MobileCard><div className="grid grid-cols-3 gap-3"><MiniMetric label="Points" value="12.8k" /><MiniMetric label="Badges" value="9" /><MiniMetric label="Entries" value="18" /></div><section><SectionHeader title="Collection" action="Settings" onClick={() => onGo("settings")} /><div className="grid grid-cols-2 gap-3">{badges.slice(0, 4).map((badge) => { const Icon = badge.icon; return <MobileCard key={badge.label} className="p-4"><Icon className="text-[var(--gold)]" size={20} /><div className="mt-3 font-black">{badge.label}</div></MobileCard>; })}</div></section></div>;
}

function SettingsScreen({ onGo }: ScreenProps) {
  return <div className="space-y-4"><ScreenTitle title="Settings" subtitle="Preview account controls." />{["Notifications", "Legal agreements", "Region", "Payment methods", "Privacy"].map((item) => <MobileListRow key={item} title={item} meta="Configured" />)}<EmptyPreview title="Loading state" body="Preview loaders and empty states share the same premium card language." /><MobileButton variant="secondary" onClick={() => onGo("splash")}>Sign Out Preview</MobileButton></div>;
}

function LeaderboardMini({ onGo }: Pick<ScreenProps, "onGo">) {
  return <section><SectionHeader title="Top Performers" action="View" onClick={() => onGo("leaderboard")} /><div className="space-y-2">{leaderboard.slice(0, 3).map((row) => <LeaderboardRow key={row.rank} row={row} compact />)}</div></section>;
}





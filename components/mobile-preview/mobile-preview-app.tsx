"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { challenges, submissions, type MobileScreen, type MobileTab, type PreviewChallenge, type PreviewSubmission } from "@/lib/mobile-preview/data";
import { BottomSheet, BottomTabs, MobileFrame, MobileTopBar, type SheetState, logoUrl, tabToScreen } from "./ui";
import { ScreenRenderer } from "./screens";
import { cn } from "@/lib/utils";

export function MobilePreviewApp() {
  const [screen, setScreen] = useState<MobileScreen>("splash");
  const [tab, setTab] = useState<MobileTab>("home");
  const [selectedChallenge, setSelectedChallenge] = useState(challenges[0]);
  const [selectedSubmission, setSelectedSubmission] = useState(submissions[0]);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState("");

  function go(next: MobileScreen, nextTab?: MobileTab) {
    setScreen(next);
    if (nextTab) setTab(nextTab);
  }

  function openChallenge(challenge: PreviewChallenge) {
    setSelectedChallenge(challenge);
    go("challenge-detail");
  }

  function openSubmission(submission: PreviewSubmission) {
    setSelectedSubmission(submission);
    go("submission");
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  }

  const navVisible = !["splash", "welcome", "login", "signup", "otp"].includes(screen);

  const previewScreens: Array<{ label: string; screen: MobileScreen; tab?: MobileTab }> = [
    { label: "Splash", screen: "splash" },
    { label: "Welcome", screen: "welcome" },
    { label: "Login", screen: "login" },
    { label: "Sign up", screen: "signup" },
    { label: "OTP", screen: "otp" },
    { label: "Home", screen: "home", tab: "home" },
    { label: "Explore", screen: "explore", tab: "explore" },
    { label: "Challenges", screen: "challenges", tab: "explore" },
    { label: "Detail", screen: "challenge-detail", tab: "explore" },
    { label: "Join", screen: "join", tab: "create" },
    { label: "Submission", screen: "submission", tab: "explore" },
    { label: "Vote", screen: "vote", tab: "explore" },
    { label: "Wallet", screen: "wallet", tab: "wallet" },
    { label: "Leaderboard", screen: "leaderboard", tab: "home" },
    { label: "Winners", screen: "winners", tab: "home" },
    { label: "Events", screen: "events", tab: "explore" },
    { label: "Profile", screen: "profile", tab: "profile" },
    { label: "Settings", screen: "settings", tab: "profile" }
  ];

  return (
    <div className="min-h-screen bg-[#050505] px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 xl:flex-row xl:items-start xl:justify-center">
        <aside className="max-w-md pt-4 text-center xl:sticky xl:top-10 xl:text-left">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-yellow-500/40 bg-yellow-500/10 xl:mx-0">
            <img src={logoUrl} alt="Challenge Suite" className="h-16 w-16 rounded-full object-cover" />
          </div>
          <p className="text-sm font-black uppercase tracking-[0.24em] text-[var(--gold)]">Mobile Preview</p>
          <h1 className="mt-4 text-4xl font-black leading-tight md:text-5xl">Challenge Suite in your pocket.</h1>
          <p className="mt-4 text-slate-300">An isolated investor-demo prototype for the mobile app experience. It uses preview-only data and local state.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm font-bold text-slate-300">
            {["Dark premium UI", "Bottom sheets", "Sticky CTAs", "No backend calls"].map((label) => <span key={label} className="rounded-full border border-white/10 bg-white/[.04] px-4 py-2">{label}</span>)}
          </div>
          <div className="mt-7 rounded-[20px] border border-white/10 bg-white/[.035] p-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Preview map</p>
              <span className="text-[11px] font-bold text-slate-500">local only</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {previewScreens.map((item) => <button key={item.label} onClick={() => go(item.screen, item.tab)} className={cn("rounded-[11px] border px-2 py-2 text-xs font-black transition", screen === item.screen ? "border-yellow-400 bg-yellow-500/10 text-[var(--gold)]" : "border-white/10 bg-black/30 text-slate-400 hover:border-white/20 hover:text-white")}>{item.label}</button>)}
            </div>
          </div>
        </aside>

        <MobileFrame>
          <div className="relative z-10 flex h-full flex-col">
            {navVisible ? <MobileTopBar screen={screen} tab={tab} onBack={() => go(tabToScreen(tab), tab)} onSettings={() => go("settings")} /> : null}
            <main className={cn("scrollbar-dark flex-1 overflow-y-auto", navVisible ? "px-4 pb-28 pt-3" : "px-5 pb-8 pt-12")}>
              <AnimatePresence mode="wait">
                <motion.div key={screen} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  <ScreenRenderer screen={screen} tab={tab} selectedChallenge={selectedChallenge} selectedSubmission={selectedSubmission} onGo={go} onChallenge={openChallenge} onSubmission={openSubmission} onSheet={setSheet} />
                </motion.div>
              </AnimatePresence>
            </main>
            {navVisible ? <BottomTabs active={tab} onSelect={(next) => { setTab(next); setScreen(tabToScreen(next)); }} /> : null}
            {toast ? <div className="absolute bottom-24 left-5 right-5 z-30 rounded-[14px] border border-emerald-400/30 bg-emerald-950/90 p-3 text-center text-sm font-bold text-emerald-100">{toast}</div> : null}
          </div>
          <BottomSheet sheet={sheet} onClose={() => setSheet(null)} onConfirm={() => { showToast(sheet?.action ?? "Confirmed"); setSheet(null); }} />
        </MobileFrame>
      </div>
    </div>
  );
}



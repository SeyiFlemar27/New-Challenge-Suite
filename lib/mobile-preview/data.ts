import type { LucideIcon } from "lucide-react";
import { Award, Camera, Coins, Flame, Radio, ShieldCheck, Sparkles, Trophy, Users, Vote, Zap } from "lucide-react";

export type MobileTab = "home" | "explore" | "create" | "wallet" | "profile";
export type MobileScreen =
  | "splash"
  | "welcome"
  | "login"
  | "signup"
  | "otp"
  | "home"
  | "explore"
  | "challenges"
  | "challenge-detail"
  | "join"
  | "submission"
  | "vote"
  | "wallet"
  | "leaderboard"
  | "winners"
  | "events"
  | "profile"
  | "settings";

export interface PreviewChallenge {
  id: string;
  title: string;
  creator: string;
  category: string;
  status: "Open" | "Voting Open" | "Closing Soon" | "Private";
  imageUrl: string;
  prize: string;
  participants: number;
  votes: number;
  deadline: string;
  description: string;
  acceptedMedia: string;
  entryFee: string;
  rules: string[];
  boosted?: boolean;
}

export interface PreviewSubmission {
  id: string;
  title: string;
  creator: string;
  initials: string;
  challengeTitle: string;
  mediaUrl: string;
  votes: number;
  rank: number;
  premium?: boolean;
}

export interface PreviewEvent {
  id: string;
  title: string;
  host: string;
  imageUrl: string;
  date: string;
  location: string;
  attending: number;
  planRequired?: boolean;
}

export interface PreviewStat {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "gold" | "purple" | "green";
}

export const previewUser = {
  name: "Amara Cole",
  email: "amara@challengesuite.demo",
  initials: "AC",
  role: "Creator",
  plan: "Chief Producer",
  doroBalance: 500,
  points: 12840,
  badges: 9,
  submissions: 18
};

export const stats: PreviewStat[] = [
  { label: "Active", value: "12", icon: Flame, tone: "gold" },
  { label: "Points", value: "12.8k", icon: Trophy, tone: "purple" },
  { label: "DoroCoin", value: "500", icon: Coins, tone: "green" }
];

export const challenges: PreviewChallenge[] = [
  {
    id: "neon-city-photo",
    title: "Neon City Photo Battle",
    creator: "Lens League",
    category: "Photography",
    status: "Voting Open",
    imageUrl: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=80",
    prize: "$2,500",
    participants: 248,
    votes: 18420,
    deadline: "2 days left",
    description: "Capture a cinematic night city moment using light, reflection, motion, and mood.",
    acceptedMedia: "Image uploads",
    entryFee: "$10",
    boosted: true,
    rules: ["Original photo only", "No AI-generated images", "One entry per participant", "Voting closes Sunday at 9 PM"]
  },
  {
    id: "street-dance-finals",
    title: "Street Dance Finals",
    creator: "Move District",
    category: "Dance",
    status: "Open",
    imageUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=900&q=80",
    prize: "$5,000",
    participants: 96,
    votes: 7200,
    deadline: "5 days left",
    description: "Upload your strongest 45-second routine and compete for crowd-ranked finals.",
    acceptedMedia: "Video uploads",
    entryFee: "$25",
    rules: ["45 seconds maximum", "Solo or duo allowed", "No copyrighted overlays", "Top 8 advance"]
  },
  {
    id: "founder-pitch",
    title: "Founder Pitch Sprint",
    creator: "Capital Arena",
    category: "Business",
    status: "Private",
    imageUrl: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80",
    prize: "Investor Review",
    participants: 32,
    votes: 0,
    deadline: "Invite only",
    description: "A private pitch challenge for verified founders and sponsors.",
    acceptedMedia: "Video uploads",
    entryFee: "Invite",
    rules: ["Invite required", "Deck optional", "Video under 2 minutes", "Creator approval before public display"]
  }
];

export const submissions: PreviewSubmission[] = [
  {
    id: "sub-1",
    title: "Rainline Reflections",
    creator: "Nia Stone",
    initials: "NS",
    challengeTitle: "Neon City Photo Battle",
    mediaUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
    votes: 4382,
    rank: 1,
    premium: true
  },
  {
    id: "sub-2",
    title: "Midnight Crosswalk",
    creator: "Theo Grant",
    initials: "TG",
    challengeTitle: "Neon City Photo Battle",
    mediaUrl: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=80",
    votes: 3910,
    rank: 2
  },
  {
    id: "sub-3",
    title: "Gold Hour Spin",
    creator: "Kemi Vale",
    initials: "KV",
    challengeTitle: "Street Dance Finals",
    mediaUrl: "https://images.unsplash.com/photo-1547153760-18fc86324498?auto=format&fit=crop&w=900&q=80",
    votes: 2877,
    rank: 3,
    premium: true
  }
];

export const walletPackages = [
  { id: "doro-50", coins: 50, price: "$1.99", label: "Starter", bestFor: "Quick votes" },
  { id: "doro-100", coins: 100, price: "$7.99", label: "Popular", bestFor: "Vote packs" },
  { id: "doro-500", coins: 500, price: "$19.99", label: "Power", bestFor: "Boosts + voting" }
];

export const leaderboard = [
  { rank: 1, name: "Nia Stone", points: "18,420", badge: "Photo Champion" },
  { rank: 2, name: "Theo Grant", points: "16,900", badge: "Top Voter" },
  { rank: 3, name: "Kemi Vale", points: "14,775", badge: "Finalist" },
  { rank: 4, name: "Amara Cole", points: "12,840", badge: "Creator" }
];

export const liveEvents: PreviewEvent[] = [
  {
    id: "lagos-live",
    title: "Lagos Creator Night",
    host: "Challenge Suite Live",
    imageUrl: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=900&q=80",
    date: "Aug 24, 2026",
    location: "Victoria Island, Lagos",
    attending: 180
  },
  {
    id: "atlanta-finals",
    title: "Atlanta Finals Showcase",
    host: "Brand Partner Studio",
    imageUrl: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=900&q=80",
    date: "Sep 12, 2026",
    location: "Atlanta, GA",
    attending: 340,
    planRequired: true
  }
];

export const quickActions = [
  { label: "Join", icon: Users, screen: "challenges" as MobileScreen },
  { label: "Vote", icon: Vote, screen: "vote" as MobileScreen },
  { label: "Create", icon: Camera, screen: "join" as MobileScreen },
  { label: "Events", icon: Radio, screen: "events" as MobileScreen }
];

export const badges = [
  { label: "Verified", icon: ShieldCheck },
  { label: "Winner", icon: Trophy },
  { label: "Boosted", icon: Zap },
  { label: "Elite", icon: Award },
  { label: "Featured", icon: Sparkles }
];




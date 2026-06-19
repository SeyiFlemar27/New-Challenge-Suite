export const doroTransactions = [
  { id: "txn_001", type: "Reward", description: "Winner bonus for Kitchen Remix Showdown", amount: 125, date: "2026-06-12" },
  { id: "txn_002", type: "Spend", description: "Boosted Neon City Photo Sprint", amount: -60, date: "2026-06-10" },
  { id: "txn_003", type: "Purchase", description: "Starter DoroCoin bundle", amount: 250, date: "2026-06-01" }
];

export const doroPackages = [
  { id: "starter", name: "Starter Pack", coins: 250, price: 4.99, bestFor: "Voting and small boosts" },
  { id: "creator", name: "Creator Pack", coins: 750, price: 12.99, bestFor: "Challenge boosts and premium entries" },
  { id: "producer", name: "Producer Pack", coins: 1800, price: 29.99, bestFor: "Sponsorship experiments and rewards" }
];

export const votePackages = [
  { id: "votes_10", votes: 10, coins: 25, label: "10 votes" },
  { id: "votes_50", votes: 50, coins: 100, label: "50 votes" },
  { id: "votes_100", votes: 100, coins: 180, label: "100 votes" }
];

export const boostPackages = [
  { id: "spark", name: "Spark Boost", coins: 40, reach: "1,200 estimated views", duration: "2 days" },
  { id: "surge", name: "Surge Boost", coins: 90, reach: "4,800 estimated views", duration: "5 days" },
  { id: "spotlight", name: "Spotlight Boost", coins: 180, reach: "12,000 estimated views", duration: "7 days" }
];

export const liveEvents = [
  {
    id: "summer-miami-fitness-showdown",
    title: "Summer Miami Fitness Showdown",
    host: "FitnessKing",
    image: "https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?auto=format&fit=crop&w=900&q=80",
    location: "South Beach, Miami, FL",
    date: "June 22, 2026",
    time: "10:16 PM",
    description: "A live fitness challenge meetup with judged rounds, audience voting, and creator networking.",
    attending: 120
  },
  {
    id: "nyc-gaming-lan-tournament",
    title: "NYC Gaming LAN Tournament",
    host: "GamerPro",
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=80",
    location: "Barclays Center, Brooklyn, NY",
    date: "June 17, 2026",
    time: "9:16 PM",
    description: "An in-person gaming tournament with live brackets, team check-ins, and audience voting.",
    attending: 45
  }
];

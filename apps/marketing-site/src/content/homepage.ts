export const navLinks = [
  { label: "Platform", href: "#pillars" },
  { label: "Showcase", href: "#showcase" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Results", href: "#results" },
] as const;

export const trustItems = [
  "High school varsity programs",
  "AAU and club operations",
  "College prep staff",
  "Player development labs",
  "Game-day operator crews",
] as const;

export const pillars = [
  {
    title: "Live Game Operations",
    summary:
      "Capture every possession in real time with resilient controls built for pressure.",
    outcomes: ["Subs and fouls tracked instantly", "Bench-ready pace controls", "Clean operator handoff"],
    stat: "0.4s avg event commit",
  },
  {
    title: "Coach Dashboard",
    summary:
      "Monitor lineups, pace, and shot quality from one command view while the game moves.",
    outcomes: ["Lineup impact at a glance", "Quarter trend reads", "Bench and timeout context"],
    stat: "+27% faster adjustments",
  },
  {
    title: "Film and Stats Sync",
    summary:
      "Jump from a stat to the exact clip with linked timeline markers and possession context.",
    outcomes: ["Tagged possessions", "Auto-linked clips", "Review by player or action"],
    stat: "1 click from stat to film",
  },
  {
    title: "AI Coaching Insights",
    summary:
      "Receive clear, testable prompts built on your live data, not generic summaries.",
    outcomes: ["Lineup recommendation cues", "Coverage tendency alerts", "Actionable halftime notes"],
    stat: "Live insights under 5s",
  },
] as const;

export const useCases = [
  {
    role: "Coaches",
    detail: "Get decisive context on matchups, pace swings, and lineup impact before each possession matters.",
  },
  {
    role: "Operators",
    detail: "Run reliable stat entry workflows built for noisy gyms, fast possessions, and corrections.",
  },
  {
    role: "Programs",
    detail: "Standardize game operations, review, and reporting across every team in one system.",
  },
  {
    role: "Player Development",
    detail: "Connect practice clips and game outcomes to build plans rooted in evidence.",
  },
] as const;

export const proofCards = [
  {
    quote: "We stopped juggling three tools and started coaching from one live picture.",
    attribution: "Head Coach, Varsity Program",
    metric: "2.1x faster review turnaround",
  },
  {
    quote: "Operators can keep pace through chaos without losing clean data.",
    attribution: "Basketball Ops Coordinator",
    metric: "99.6% event integrity in pilot",
  },
  {
    quote: "Film sync changed how we teach. Every correction is tied to a clip.",
    attribution: "Player Development Lead",
    metric: "34% faster postgame sessions",
  },
] as const;

export const footerGroups = [
  {
    title: "Platform",
    links: ["Live Operations", "Coach Dashboard", "Film Sync", "AI Insights"],
  },
  {
    title: "Solutions",
    links: ["Varsity Teams", "Club Programs", "Training Staff", "Operations"],
  },
  {
    title: "Resources",
    links: ["Product Tour", "How It Works", "Security", "Support"],
  },
  {
    title: "Company",
    links: ["About", "Contact", "Careers", "Status"],
  },
] as const;

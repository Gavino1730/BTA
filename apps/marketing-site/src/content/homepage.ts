export const navLinks = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Support", href: "/support" },
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
    metric: "99.6% event integrity in live play",
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
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Get Started", href: "/get-started" },
      { label: "About", href: "/about" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: "/contact" },
      { label: "Support", href: "/support" },
      { label: "Security", href: "/security" },
      { label: "Acceptable Use", href: "/acceptable-use" },
    ],
  },
  {
    title: "Policies",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Cookie Policy", href: "/cookie-policy" },
      { label: "Acceptable Use", href: "/acceptable-use" },
      { label: "Billing and Refund", href: "/billing-refund-policy" },
      { label: "Copyright Policy", href: "/copyright-policy" },
      { label: "Data Retention and Deletion", href: "/data-deletion" },
      { label: "Youth and Student Data", href: "/youth-student-data-policy" },
      { label: "Community Standards", href: "/community-standards" },
      { label: "AI Accuracy Disclaimer", href: "/ai-accuracy-disclaimer" },
      { label: "Notice Procedure", href: "/contact-notice-procedure" },
    ],
  },
  {
    title: "Access",
    links: [
      { label: "Coach Login", href: "https://dashboard.btaintel.com/login" },
      { label: "Start Signup", href: "/get-started" },
      { label: "Contact Team", href: "/contact" },
      { label: "Support", href: "/support" },
    ],
  },
] as const;

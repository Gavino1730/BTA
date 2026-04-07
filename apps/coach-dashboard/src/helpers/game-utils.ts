/**
 * Pure utility functions for game session management (no React dependencies).
 */

export function generateGameId(opponent: string, date: string): string {
  const slug = (opponent || "game")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20) || "game";
  const d = date || new Date().toISOString().slice(0, 10);
  return `${d}-${slug}`;
}

export function applyGameSessionToUrl(
  nextGameId: string,
  myTeamId: string,
  myTeamName: string,
  opponentName: string,
  vcSide: "home" | "away",
  homeColor: string,
  awayColor: string,
): void {
  const params = new URLSearchParams(window.location.search);
  params.set("gameId", nextGameId);
  params.set("myTeamId", myTeamId);
  if (myTeamName) {
    params.set("myTeamName", myTeamName);
  } else {
    params.delete("myTeamName");
  }
  params.set("opponentName", opponentName);
  params.set("vcSide", vcSide);
  params.set("homeColor", homeColor);
  params.set("awayColor", awayColor);
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}?${params.toString()}`,
  );
}

export function formatFoulTroubleLabel(playerId: string, fouls: number): string {
  if (fouls >= 5) {
    return `${playerId} (${fouls}) FOULED OUT`;
  }

  if (fouls >= 4) {
    return `${playerId} (${fouls}) foul-out risk`;
  }

  return `${playerId} (${fouls})`;
}
export function filterReportData(games, rows, filters = {}) {
  const start = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null;
  const end = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : null;
  const selectedGames = games.filter((game) => {
    if (filters.side && filters.side !== 'all' && game.userColor !== filters.side) return false;
    if (filters.timeClass && filters.timeClass !== 'all' && String(game.timeClass).toLowerCase() !== filters.timeClass.toLowerCase()) return false;
    if ((start != null || end != null) && !game.endTime) return false;
    if (start != null && game.endTime < start) return false;
    if (end != null && game.endTime > end) return false;
    return true;
  });
  const ids = new Set(selectedGames.map((game) => game.url));
  return { games: selectedGames, rows: rows.filter((row) => ids.has(row.gameKey)) };
}

export function availableTimeClasses(games) {
  const priority = ['bullet', 'blitz', 'rapid', 'daily'];
  return [...new Set(games.map((game) => String(game.timeClass || '').toLowerCase()).filter(Boolean))]
    .sort((a, b) => (priority.indexOf(a) < 0 ? Infinity : priority.indexOf(a)) - (priority.indexOf(b) < 0 ? Infinity : priority.indexOf(b)) || a.localeCompare(b));
}

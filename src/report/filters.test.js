import { describe, expect, it } from 'vitest';
import { availableTimeClasses, filterReportData } from './filters.js';

const games = [
  { url: 'w-blitz', userColor: 'white', timeClass: 'blitz', endTime: Date.UTC(2026, 0, 10) },
  { url: 'b-rapid', userColor: 'black', timeClass: 'rapid', endTime: Date.UTC(2026, 1, 10) },
  { url: 'w-bullet', userColor: 'white', timeClass: 'bullet', endTime: 0 },
];
const rows = games.map((game, ply) => ({ gameKey: game.url, ply }));

describe('report filters', () => {
  it('filters by user color, time class and inclusive date range without changing source data', () => {
    const result = filterReportData(games, rows, { side: 'white', timeClass: 'blitz', from: '2026-01-10', to: '2026-01-10' });
    expect(result.games.map((game) => game.url)).toEqual(['w-blitz']);
    expect(result.rows.map((row) => row.gameKey)).toEqual(['w-blitz']);
    expect(games).toHaveLength(3);
  });

  it('does not include games with unknown dates in a date-filtered result', () => {
    expect(filterReportData(games, rows, { from: '2026-01-01' }).games.map((game) => game.url)).toEqual(['w-blitz', 'b-rapid']);
  });

  it('lists available time classes in a predictable order', () => {
    expect(availableTimeClasses(games)).toEqual(['bullet', 'blitz', 'rapid']);
  });
});

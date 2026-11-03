import { describe, expect, it } from 'vitest';
import { buildRadialLayout, fitRadialView, moveTreeSelection, nodePerformanceToken, nodeRadius, visibleTreeTable } from './radialLayout.js';

const node = (id, games = 4, extra = {}) => ({ id, color: 'white', positionKey: id, move: id, name: id, games, wins: 2, draws: 1, losses: 1, averageWinProbabilityChange: 0.1, mistakeRate: 0.2, lowConfidence: false, depthPly: id === 'a' ? 0 : id === 'b' ? 1 : 2, ...extra });
const tree = {
  nodes: [node('a'), node('b', 1, { lowConfidence: true }), node('c')],
  links: [{ source: 'a', target: 'b', move: 'e4' }, { source: 'a', target: 'c', move: 'd4' }, { source: 'b', target: 'c', move: 'Nf3' }],
};

describe('radial opening tree data', () => {
  it('places nodes on depth rings and clips at the selected depth', () => {
    const layout = buildRadialLayout(tree, { maxDepth: 2, showLowConfidence: true, expandedTailIds: ['tail:b:b'] });
    expect(layout.nodes.find((entry) => entry.id === 'a').depth).toBe(1);
    expect(layout.nodes.find((entry) => entry.id === 'b').depth).toBe(2);
    expect(layout.rings.map((ring) => ring.depth)).toEqual([1, 2]);
    expect(layout.nodes.every((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y))).toBe(true);
    expect(visibleTreeTable(layout)).toHaveLength(3);
  });

  it('hides below-minimum nodes unless explicitly shown', () => {
    expect(buildRadialLayout(tree).nodes.some((entry) => entry.id === 'b')).toBe(false);
    expect(buildRadialLayout(tree, { showLowConfidence: true }).nodes.some((entry) => entry.tail)).toBe(true);
  });

  it('scales node size by frequency and performance by theme token', () => {
    expect(nodeRadius(16, 16)).toBeGreaterThan(nodeRadius(1, 16));
    expect(nodePerformanceToken(0.2)).toBe('var(--yellow)');
    expect(nodePerformanceToken(-0.2)).toBe('var(--purple)');
    expect(nodePerformanceToken(0)).toBe('var(--surface-alt)');
    expect(nodePerformanceToken(null)).toBe('var(--surface-alt)');
  });

  it('supports parent, child, and sibling keyboard movement', () => {
    const layout = buildRadialLayout(tree, { showLowConfidence: true, expandedTailIds: ['tail:b:b'] });
    expect(moveTreeSelection(layout.nodes, 'root:white', 'ArrowDown')).toBe('a');
    expect(moveTreeSelection(layout.nodes, 'a', 'ArrowUp')).toBe('root:white');
    expect(moveTreeSelection(layout.nodes, 'b', 'ArrowUp')).toBe('a');
    expect(moveTreeSelection(layout.nodes, 'a', 'ArrowDown')).toBe('b');
    expect(moveTreeSelection(layout.nodes, 'b', 'ArrowRight')).toBe('c');
    expect(moveTreeSelection(layout.nodes, 'b', 'Escape')).toBeNull();
  });

  it('keeps White and Black trees separate', () => {
    const black = node('black-root', 4, { color: 'black' });
    expect(buildRadialLayout({ nodes: [...tree.nodes, black], links: tree.links }, { color: 'black' }).nodes.map((entry) => entry.id)).toContain('black-root');
  });

  it('collapses one-game chains into a tail and expands the same line on request', () => {
    const chain = {
      nodes: [node('start', 5, { depthPly: 0 }), node('a', 1, { depthPly: 2 }), node('b', 1, { depthPly: 4 }), node('c', 1, { depthPly: 6 })],
      links: [
        { source: 'start', target: 'a', move: '1. e4', opponentReplyNotation: '1... e5', games: 1 },
        { source: 'a', target: 'b', move: '2. Nf3', opponentReplyNotation: '2... Nc6', games: 1 },
        { source: 'b', target: 'c', move: '3. Bb5', opponentReplyNotation: '3... a6', games: 1 },
      ],
    };
    const collapsed = buildRadialLayout(chain, { showLowConfidence: true, maxDepth: 10 });
    const tail = collapsed.nodes.find((entry) => entry.tail);
    expect(tail).toMatchObject({ tailMoves: 3, games: 1, label: '+3 moves · 1 game' });
    const expanded = buildRadialLayout(chain, { showLowConfidence: true, expandedTailIds: [tail.id] });
    expect(expanded.nodes.filter((entry) => ['a', 'b', 'c'].includes(entry.id))).toHaveLength(3);
    expect(expanded.nodes.some((entry) => entry.tail)).toBe(false);
    expect(expanded.nodes.find((entry) => entry.id === 'c').lineBefore).toEqual(['1.e4', '1...e5', '2.Nf3', '2...Nc6', '3.Bb5', '3...a6']);
  });

  it('allocates branch angle by the number of games and returns a padded fit transform', () => {
    const branching = {
      nodes: [node('a', 8, { depthPly: 0 }), node('b', 6, { depthPly: 2 }), node('c', 2, { depthPly: 2 })],
      links: [{ source: 'a', target: 'b', move: '1. e4', games: 6 }, { source: 'a', target: 'c', move: '1. d4', games: 2 }],
    };
    const layout = buildRadialLayout(branching, { maxDepth: 10 });
    const heavier = layout.nodes.find((entry) => entry.id === 'b');
    const lighter = layout.nodes.find((entry) => entry.id === 'c');
    expect(heavier.sectorWeight / lighter.sectorWeight).toBe(3);
    const fit = fitRadialView(layout, { width: 390, height: 390, padding: 24 });
    const bounds = fit.bounds;
    const edges = layout.nodes.map((entry) => ({
      x: fit.x + layout.center + fit.scale * (entry.x - layout.center),
      y: fit.y + layout.center + fit.scale * (entry.y - layout.center),
      radius: entry.radius * fit.scale,
    }));
    expect(fit.scale).toBeGreaterThan(0);
    expect(Math.min(...edges.map((edge) => edge.x - edge.radius))).toBeGreaterThanOrEqual(bounds.padding - 0.1);
    expect(Math.max(...edges.map((edge) => edge.x + edge.radius))).toBeLessThanOrEqual(layout.width - bounds.padding + 0.1);
    expect(Math.min(...edges.map((edge) => edge.y - edge.radius))).toBeGreaterThanOrEqual(bounds.padding - 0.1);
    expect(Math.max(...edges.map((edge) => edge.y + edge.radius))).toBeLessThanOrEqual(layout.width - bounds.padding + 0.1);
  });
});

import { describe, expect, it } from 'vitest';
import { buildRadialLayout, moveTreeSelection, nodePerformanceToken, nodeRadius, visibleTreeTable } from './radialLayout.js';

const node = (id, games = 4, extra = {}) => ({ id, color: 'white', positionKey: id, move: id, name: id, games, wins: 2, draws: 1, losses: 1, averageWinProbabilityChange: 0.1, mistakeRate: 0.2, lowConfidence: false, ...extra });
const tree = {
  nodes: [node('a'), node('b', 1, { lowConfidence: true }), node('c')],
  links: [{ source: 'a', target: 'b', move: 'e4' }, { source: 'a', target: 'c', move: 'd4' }, { source: 'b', target: 'c', move: 'Nf3' }],
};

describe('radial opening tree data', () => {
  it('places nodes on depth rings and clips at the selected depth', () => {
    const layout = buildRadialLayout(tree, { maxDepth: 2, showLowConfidence: true });
    expect(layout.nodes.find((entry) => entry.id === 'a').depth).toBe(1);
    expect(layout.nodes.find((entry) => entry.id === 'b').depth).toBe(2);
    expect(layout.rings.map((ring) => ring.depth)).toEqual([1, 2]);
    expect(layout.nodes.every((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y))).toBe(true);
    expect(visibleTreeTable(layout)).toHaveLength(3);
  });

  it('hides below-minimum nodes unless explicitly shown', () => {
    expect(buildRadialLayout(tree).nodes.some((entry) => entry.id === 'b')).toBe(false);
    expect(buildRadialLayout(tree, { showLowConfidence: true }).nodes.some((entry) => entry.id === 'b')).toBe(true);
  });

  it('scales node size by frequency and performance by theme token', () => {
    expect(nodeRadius(16, 16)).toBeGreaterThan(nodeRadius(1, 16));
    expect(nodePerformanceToken(0.2)).toBe('var(--green)');
    expect(nodePerformanceToken(-0.2)).toBe('var(--pink)');
    expect(nodePerformanceToken(0)).toBe('var(--yellow)');
    expect(nodePerformanceToken(null)).toBe('var(--surface-alt)');
  });

  it('supports parent, child, and sibling keyboard movement', () => {
    const layout = buildRadialLayout(tree, { showLowConfidence: true });
    expect(moveTreeSelection(layout.nodes, 'b', 'ArrowUp')).toBe('a');
    expect(moveTreeSelection(layout.nodes, 'a', 'ArrowDown')).toBe('b');
    expect(moveTreeSelection(layout.nodes, 'b', 'ArrowRight')).toBe('c');
    expect(moveTreeSelection(layout.nodes, 'b', 'Escape')).toBeNull();
  });

  it('keeps White and Black trees separate', () => {
    const black = node('black-root', 4, { color: 'black' });
    expect(buildRadialLayout({ nodes: [...tree.nodes, black], links: tree.links }, { color: 'black' }).nodes.map((entry) => entry.id)).toContain('black-root');
  });
});

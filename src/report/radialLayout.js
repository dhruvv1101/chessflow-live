import { hierarchy, cluster } from 'd3-hierarchy';
import { FREE_LIMITS } from './config.js';

export const RADIAL_SIZE = 760;
export const RADIAL_CENTER = RADIAL_SIZE / 2;

function polar(angle, radius) {
  const adjusted = angle - Math.PI / 2;
  return { x: RADIAL_CENTER + Math.cos(adjusted) * radius, y: RADIAL_CENTER + Math.sin(adjusted) * radius };
}

export function nodeRadius(games, maxGames) {
  return 5 + Math.sqrt(Math.max(0, games) / Math.max(1, maxGames)) * 10;
}

export function nodePerformanceToken(change) {
  if (!Number.isFinite(change)) return 'var(--surface-alt)';
  if (change > 0.015) return 'var(--green)';
  if (change < -0.015) return 'var(--pink)';
  return 'var(--yellow)';
}

export function buildRadialLayout(tree, {
  color = 'white', maxDepth = 12, showLowConfidence = false,
  minimumSampleGames = FREE_LIMITS.reportInsights.minimumSampleGames, width = RADIAL_SIZE,
} = {}) {
  const all = (tree?.nodes || []).filter((node) => node.color === color);
  const selected = new Map(all.filter((node) => showLowConfidence || (node.games || 0) >= minimumSampleGames).map((node) => [node.id, node]));
  const parentOf = new Map();
  for (const link of tree?.links || []) {
    if (selected.has(link.source) && selected.has(link.target) && link.source !== link.target && !parentOf.has(link.target)) {
      parentOf.set(link.target, { id: link.source, link });
    }
  }

  const roots = [...selected.values()].filter((node) => !parentOf.has(node.id));
  const childrenByParent = new Map();
  for (const [target, parent] of parentOf) {
    const children = childrenByParent.get(parent.id) || [];
    children.push({ node: selected.get(target), link: parent.link });
    childrenByParent.set(parent.id, children);
  }
  const visited = new Set();
  const dataFor = (node) => {
    if (visited.has(node.id)) return null;
    visited.add(node.id);
    const children = (childrenByParent.get(node.id) || [])
      .sort((a, b) => a.node.move.localeCompare(b.node.move) || b.node.games - a.node.games)
      .map(({ node: child, link }) => {
        const childData = dataFor(child);
        return childData ? { ...childData, _edge: link } : null;
      })
      .filter(Boolean);
    return { ...node, children };
  };
  const rootData = { id: `root:${color}`, name: color === 'white' ? 'White positions' : 'Black positions', children: roots.sort((a, b) => a.move.localeCompare(b.move)).map((node) => dataFor(node)).filter(Boolean) };
  const root = hierarchy(rootData);
  cluster().size([Math.PI * 2, 1])(root);
  const visibleDepth = Math.max(1, Number(maxDepth) || 12);
  const visible = root.descendants().filter((entry) => entry.depth === 0 || (entry.data.depthPly ?? entry.depth) <= visibleDepth);
  const maxGames = Math.max(1, ...visible.map((entry) => entry.data.games || 0));
  const radius = Math.min(width / 2 - 36, RADIAL_SIZE / 2 - 36);
  const radialNodes = visible.filter((entry) => entry.depth > 0).map((entry) => {
    const level = entry.depth;
    const ply = entry.data.depthPly ?? level;
    const point = level === 0 ? { x: RADIAL_CENTER, y: RADIAL_CENTER } : polar(entry.x, Math.min(radius, ply / visibleDepth * radius));
    return {
      ...entry.data, parentId: entry.parent?.depth > 0 ? entry.parent.data.id : null, depth: level, depthPly: ply, x: point.x, y: point.y,
      radius: level === 0 ? 9 : nodeRadius(entry.data.games || 0, maxGames),
      fill: level === 0 ? 'var(--purple)' : nodePerformanceToken(entry.data.expectedScoreGap ?? entry.data.averageWinProbabilityChange),
    };
  });
  const pointById = new Map(radialNodes.map((node) => [node.id, node]));
  const radialLinks = root.links().filter((link) => link.target.depth <= visibleDepth).map((link) => ({
    source: pointById.get(link.source.data.id), target: pointById.get(link.target.data.id),
    move: link.target.data._edge?.move || link.target.data.move,
    games: link.target.data._edge?.games || 1,
  })).filter((link) => link.source && link.target);
  return {
    nodes: radialNodes, links: radialLinks,
    rings: [...new Set(radialNodes.map((node) => node.depthPly).filter((depth) => depth > 0))].sort((a, b) => a - b)
      .map((depth) => ({ depth, radius: Math.min(radius, depth / visibleDepth * radius) })),
    maxDepth: visibleDepth, color, width: RADIAL_SIZE, center: RADIAL_CENTER,
  };
}

export function visibleTreeTable(layout) {
  return layout.nodes.filter((node) => node.depth > 0).sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
}

export function moveTreeSelection(nodes, selectedId, key) {
  if (!nodes.length) return null;
  const currentIndex = Math.max(0, nodes.findIndex((node) => node.id === selectedId));
  const current = nodes[currentIndex];
  if (!current || key === 'Escape') return null;
  const candidates = nodes.filter((node) => node.depth === current.depth && node.id !== current.id);
  if (key === 'ArrowUp') return nodes.find((node) => node.id === current.parentId)?.id || current.parentId || current.id;
  if (key === 'ArrowDown') return nodes.find((node) => node.parentId === current.id)?.id || current.id;
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const siblings = nodes.filter((node) => node.parentId === current.parentId);
    const index = siblings.findIndex((node) => node.id === current.id);
    return siblings[(index + (key === 'ArrowRight' ? 1 : -1) + siblings.length) % siblings.length]?.id || candidates[0]?.id || current.id;
  }
  return current.id;
}

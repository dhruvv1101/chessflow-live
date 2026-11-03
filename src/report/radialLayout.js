import { hierarchy } from 'd3-hierarchy';
import { FREE_LIMITS } from './config.js';

export const RADIAL_SIZE = 760;
export const RADIAL_CENTER = RADIAL_SIZE / 2;

function polar(angle, radius) {
  const adjusted = angle - Math.PI / 2;
  return { x: RADIAL_CENTER + Math.cos(adjusted) * radius, y: RADIAL_CENTER + Math.sin(adjusted) * radius };
}

function moveLabel(move) {
  return String(move || '').replace(/^(\d+)\.(\.\.)?\s*/, (_, number, black) => `${number}${black ? '...' : '.'}`);
}

export function nodeRadius(games, maxGames) {
  return 6 + Math.sqrt(Math.max(0, games) / Math.max(1, maxGames)) * 10;
}

export function nodePerformanceToken(change) {
  if (!Number.isFinite(change)) return 'var(--surface-alt)';
  if (change > 0.015) return 'var(--yellow)';
  if (change < -0.015) return 'var(--purple)';
  return 'var(--surface-alt)';
}

function uniqueTail(children, expanded) {
  const projected = [];
  for (const first of children) {
    if (first.data.games !== 1) {
      projected.push(displayEntry(first, new Set(), expanded));
      continue;
    }
    const chain = [first];
    let last = first;
    while (last.children?.length === 1 && last.children[0].data.games === 1) {
      last = last.children[0];
      chain.push(last);
    }
    const tailId = `tail:${chain[0].data.id}:${last.data.id}`;
    if (expanded.has(tailId)) {
      const ids = new Set(chain.map((entry) => entry.data.id));
      projected.push(displayEntry(chain[0], ids, expanded));
      continue;
    }
    const continuation = last.children || [];
    projected.push({
      ...last.data,
      id: tailId,
      tail: true,
      tailMoves: chain.length,
      label: `+${chain.length} moves · 1 game`,
      lineBefore: last.data.lineBefore,
      pathIds: chain.flatMap((entry) => entry.data.pathIds || [entry.data.id]),
      parentId: chain[0].parent?.data.id || null,
      children: continuation.flatMap((entry) => uniqueTail([entry], expanded)),
    });
  }
  return projected;
}

function displayEntry(entry, preserveUniqueIds = new Set(), expanded = new Set()) {
  const data = entry.data;
  const children = entry.children || [];
  if (!preserveUniqueIds.has(data.id)) return { ...data, children: uniqueTail(children, expanded) };
  return { ...data, children: children.map((child) => displayEntry(child, preserveUniqueIds, expanded)) };
}

function assignWeightedSectors(node, start = 0, end = Math.PI * 2) {
  node.sectorStart = start;
  node.sectorEnd = end;
  node.angle = (start + end) / 2;
  const children = node.children || [];
  const weights = children.map((child) => Math.max(1, Number(child.data.games) || 0));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = start;
  children.forEach((child, index) => {
    const next = cursor + (end - start) * weights[index] / totalWeight;
    child.sectorWeight = weights[index];
    assignWeightedSectors(child, cursor, next);
    cursor = next;
  });
}

function makeTree(tree, color, maxDepth, minimumSampleGames, showLowConfidence) {
  const all = (tree?.nodes || []).filter((node) => node.color === color && (showLowConfidence || (node.games || 0) >= minimumSampleGames)
    && (node.depthPly ?? 0) <= maxDepth);
  const selected = new Map(all.map((node) => [node.id, node]));
  const parentOf = new Map();
  const incoming = new Map();
  for (const link of tree?.links || []) {
    if (selected.has(link.source) && selected.has(link.target) && link.source !== link.target && !parentOf.has(link.target)) {
      parentOf.set(link.target, link.source);
      incoming.set(link.target, link);
    }
  }
  const roots = [...selected.values()].filter((node) => !parentOf.has(node.id));
  const childrenByParent = new Map();
  for (const [target, parent] of parentOf) {
    const children = childrenByParent.get(parent) || [];
    children.push(selected.get(target));
    childrenByParent.set(parent, children);
  }

  const visited = new Set();
  const makeEntry = (node, parentPath = [], parentOpening = null, edge = null) => {
    if (visited.has(node.id)) return null;
    visited.add(node.id);
    const lineBefore = [...parentPath];
    if (edge?.move) lineBefore.push(moveLabel(edge.move));
    if (edge?.opponentReplyNotation || edge?.opponentReply) lineBefore.push(moveLabel(edge.opponentReplyNotation || edge.opponentReply));
    const openingChanged = Boolean(node.openingName && node.openingName !== parentOpening);
    const data = {
      ...node,
      label: moveLabel(node.move),
      lineBefore,
      pathIds: [...(edge ? [edge.source] : []), node.id],
      lastMoveUci: edge?.opponentResponseUci || edge?.opponentReplyUci || null,
      openingChanged,
    };
    data.children = (childrenByParent.get(node.id) || [])
      .sort((a, b) => a.move.localeCompare(b.move) || b.games - a.games)
      .map((child) => makeEntry(child, lineBefore, node.openingName, incoming.get(child.id)))
      .filter(Boolean);
    return data;
  };
  const rootsData = roots.sort((a, b) => (a.depthPly ?? 0) - (b.depthPly ?? 0) || a.move.localeCompare(b.move))
    .map((node) => makeEntry(node)).filter(Boolean);
  const root = {
    id: `root:${color}`, name: 'Start', color, games: Math.max(1, ...rootsData.map((node) => node.games || 1)),
    wins: 0, draws: 0, losses: 0, depthPly: -1, children: rootsData,
  };
  return hierarchy(root, (data) => data.children);
}

function flattenVisible(root) {
  const nodes = root.descendants().filter((entry) => entry.depth > 0);
  const links = root.links().filter((link) => link.target.depth > 0);
  return { nodes, links };
}

export function buildRadialLayout(tree, {
  color = 'white', maxDepth = FREE_LIMITS.reportInsights.initialTreeDepth, showLowConfidence = false,
  minimumSampleGames = FREE_LIMITS.reportInsights.minimumSampleGames, width = RADIAL_SIZE,
  expandedTailIds = [],
} = {}) {
  const depthLimit = Math.max(1, Number(maxDepth) || FREE_LIMITS.reportInsights.initialTreeDepth);
  const hierarchyRoot = makeTree(tree, color, depthLimit, minimumSampleGames, showLowConfidence);
  const expanded = new Set(expandedTailIds);
  const projected = {
    ...hierarchyRoot.data,
    children: uniqueTail(hierarchyRoot.children || [], expanded),
  };
  const root = hierarchy(projected, (data) => data.children);
  assignWeightedSectors(root);

  const visibleEntries = flattenVisible(root);
  const maxGames = Math.max(1, ...visibleEntries.nodes.map((entry) => entry.data.games || 0));
  const radius = Math.min(width / 2 - 44, RADIAL_SIZE / 2 - 44);
  const pointById = new Map();
  const radialNodes = visibleEntries.nodes.map((entry) => {
    const data = entry.data;
    const ply = data.tail ? (data.depthPly ?? entry.depth) : Math.max(0, Number(data.depthPly) || 0);
    const radialStep = Math.max(1, ply);
    const point = polar(entry.angle, Math.min(radius, radialStep / (depthLimit + 1) * radius));
    const parent = entry.parent?.data || null;
    const node = {
      ...data,
      parentId: parent?.id || null,
      depth: entry.depth,
      depthPly: ply,
      x: point.x,
      y: point.y,
      radius: nodeRadius(data.games || 0, maxGames),
      fill: nodePerformanceToken(data.expectedScoreGap ?? data.averageWinProbabilityChange),
      sectorWeight: entry.sectorWeight ?? Math.max(1, data.games || 0),
      lineBefore: data.lineBefore || [],
      pathIds: data.pathIds || [data.id],
    };
    pointById.set(data.id, node);
    return node;
  });
  const radialLinks = visibleEntries.links.map((link) => {
    const source = pointById.get(link.source.data.id);
    const target = pointById.get(link.target.data.id);
    return source && target ? {
      id: `${source.id}->${target.id}`,
      source, target,
      move: target.tail ? target.label : link.target.data._edge?.move || link.target.data.move,
      games: link.target.data._edge?.games || target.games || 1,
      isTail: Boolean(target.tail),
    } : null;
  }).filter(Boolean);
  return {
    nodes: radialNodes,
    links: radialLinks,
    root: { id: `root:${color}`, name: 'Start', x: RADIAL_CENTER, y: RADIAL_CENTER, radius: 9, color },
    rings: Array.from({ length: depthLimit }, (_, index) => index + 1).map((depth) => ({
      depth,
      radius: Math.min(radius, depth / (depthLimit + 1) * radius),
    })),
    maxDepth: depthLimit,
    color,
    width: RADIAL_SIZE,
    height: RADIAL_SIZE,
    center: RADIAL_CENTER,
  };
}

function nodeBounds(node) {
  const reach = node.radius || 0;
  const labelText = node.tail ? node.label : node.label;
  const openingText = node.openingChanged ? (node.eco ? node.eco + ' · ' : '') + (node.openingName || '') : '';
  const labelWidth = Math.max(labelText?.length || 0, openingText.length) * 5.5 + 8;
  const labelStart = node.x + reach + 5;
  return {
    minX: Math.min(node.x - reach, labelStart),
    maxX: Math.max(node.x + reach, labelStart + labelWidth),
    minY: node.y - Math.max(reach, labelText || openingText ? 10 : 0),
    maxY: node.y + Math.max(reach, openingText ? 13 : labelText ? 3 : 0),
  };
}

export function fitRadialView(layout, { width = layout.width, height = layout.height, padding = 28 } = {}) {
  const bounds = (layout.nodes || []).map(nodeBounds);
  if (!bounds.length) return { x: 0, y: 0, scale: 1, bounds: { padding } };
  const minX = Math.min(...bounds.map((box) => box.minX));
  const maxX = Math.max(...bounds.map((box) => box.maxX));
  const minY = Math.min(layout.center, ...bounds.map((box) => box.minY));
  const maxY = Math.max(layout.center, ...bounds.map((box) => box.maxY));
  const paddingX = padding * layout.width / Math.max(1, width);
  const paddingY = padding * layout.height / Math.max(1, height);
  const availableWidth = Math.max(1, layout.width - paddingX * 2);
  const availableHeight = Math.max(1, layout.height - paddingY * 2);
  const scale = Math.min(1, availableWidth / Math.max(1, maxX - minX), availableHeight / Math.max(1, maxY - minY));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    x: scale * (layout.center - centerX),
    y: scale * (layout.center - centerY),
    scale,
    bounds: { minX, maxX, minY, maxY, padding: Math.max(paddingX, paddingY) },
  };
}

export function visibleTreeTable(layout) {
  return layout.nodes.filter((node) => node.depth > 0).sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
}

export function moveTreeSelection(nodes, selectedId, key) {
  if (!nodes.length) return null;
  if (selectedId?.startsWith('root:')) {
    if (key === 'ArrowDown') return nodes.find((node) => node.parentId === selectedId)?.id || selectedId;
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const roots = nodes.filter((node) => node.parentId === selectedId);
      return roots[key === 'ArrowRight' ? 0 : roots.length - 1]?.id || selectedId;
    }
    return selectedId;
  }
  const current = nodes.find((node) => node.id === selectedId);
  if (!current || key === 'Escape') return null;
  if (key === 'ArrowUp') return nodes.find((node) => node.id === current.parentId)?.id || current.parentId || current.id;
  if (key === 'ArrowDown') return nodes.find((node) => node.parentId === current.id)?.id || current.id;
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const siblings = nodes.filter((node) => node.parentId === current.parentId);
    const index = siblings.findIndex((node) => node.id === current.id);
    return siblings[(index + (key === 'ArrowRight' ? 1 : -1) + siblings.length) % siblings.length]?.id || current.id;
  }
  return current.id;
}

export function treePathIds(nodes, nodeId) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path = new Set();
  let current = byId.get(nodeId);
  while (current && !path.has(current.id)) {
    path.add(current.id);
    if (current.pathIds) current.pathIds.forEach((id) => path.add(id));
    current = byId.get(current.parentId);
  }
  return path;
}

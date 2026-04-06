/** Escapa string para uso em RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Próximo id sequencial curto: n1, n2, … (considera só ids no formato n<number>).
 */
export function nextSequentialNodeId(existingIds: Iterable<string>): string {
  const used = new Set(existingIds);
  let max = 0;
  for (const id of used) {
    const m = /^n(\d+)$/.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  let n = max + 1;
  while (used.has(`n${n}`)) n += 1;
  return `n${n}`;
}

/**
 * Raiz da “família” de duplicatas: n1(2) → n1; n1 → n1.
 */
export function getDuplicateRootId(id: string): string {
  const m = /^(.*)\((\d+)\)$/.exec(id);
  return m ? m[1] : id;
}

/**
 * Próximo id ao duplicar: n5 → n5(1) → n5(2) …; cópia de n5(1) continua na série do n5.
 */
export function nextDuplicateNodeId(sourceId: string, usedIds: Set<string>): string {
  const root = getDuplicateRootId(sourceId);
  const re = new RegExp(`^${escapeRegex(root)}\\((\\d+)\\)$`);
  let maxCopy = 0;
  for (const id of usedIds) {
    const m = re.exec(id);
    if (m) maxCopy = Math.max(maxCopy, parseInt(m[1], 10));
  }
  let next = maxCopy + 1;
  let candidate = `${root}(${next})`;
  while (usedIds.has(candidate)) {
    next += 1;
    candidate = `${root}(${next})`;
  }
  return candidate;
}

/**
 * Próximo id de aresta curto: e1, e2, …
 */
export function nextSequentialEdgeId(existingIds: Iterable<string>): string {
  const used = new Set(existingIds);
  let max = 0;
  for (const id of used) {
    const m = /^e(\d+)$/.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  let n = max + 1;
  while (used.has(`e${n}`)) n += 1;
  return `e${n}`;
}

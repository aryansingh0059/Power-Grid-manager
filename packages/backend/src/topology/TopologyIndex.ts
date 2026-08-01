import type { PoleRecord } from '@pgm/shared';
import type { TopologyNode } from './types';

/**
 * TopologyIndex — immutable in-memory index of the LT pole network.
 *
 * ## Data structure
 *
 * The LT network is a forest of rooted trees: each Distribution Transformer
 * (DT) is the logical root, and its LT poles form a tree beneath it.
 *
 * Internally this is stored as an adjacency list using Maps:
 *
 *   nodes:    Map<poleId, TopologyNode>  — holds the pole record + pre-built
 *             children list for each node.
 *   byDt:     Map<dtId, Set<poleId>>    — secondary index for DT-level lookup.
 *   byFeeder: Map<feederId, Set<poleId>> — secondary index for feeder-level.
 *
 * ## Time complexity
 *
 * | Operation               | Complexity   | Notes                           |
 * |-------------------------|--------------|---------------------------------|
 * | getPole(id)             | O(1) avg     | Map lookup                      |
 * | getParentId(id)         | O(1) avg     | stored in PoleRecord            |
 * | getChildrenIds(id)      | O(1) avg     | pre-built during construction   |
 * | getDtRootIds(dtId)      | O(|DT|)      | filter set of DT's pole IDs     |
 * | getPoleIdsByDt(dtId)    | O(|DT|)      | iterate Set → Array             |
 * | getPoleIdsByFeeder(fid) | O(|feeder|)  | iterate Set → Array             |
 * | getDescendantIds(id)    | O(k)         | BFS over subtree of size k      |
 * | getAncestorIds(id)      | O(d)         | walk up d levels to root        |
 * | getPathFromRoot(id)     | O(d)         | ancestors reversed + pole       |
 * | build(poles)            | O(n)         | two passes over n poles         |
 *
 * ## How this supports fault localization (Task 4)
 *
 * Given a set of dark-pole events for a DT, the localization algorithm:
 *  1. Gets DT root(s) with getDtRootIds(dtId).
 *  2. Does a BFS/DFS downward using getChildrenIds — stops at the first edge
 *     where the parent is energized and the child is dark.
 *  3. Uses getDescendantIds(darkChild) to collect ALL affected poles for
 *     the incident (the full subtree below the fault).
 *  4. Uses getAncestorIds to confirm the upstream pole is energized.
 *
 * The index itself is topology-source-agnostic: both recorded and geo-inferred
 * trees are built the same way. topologySource on each PoleRecord tells the
 * localization layer what confidence to assign.
 */
export class TopologyIndex {
  private readonly nodes: Map<string, TopologyNode>;
  private readonly byDt: Map<string, Set<string>>;
  private readonly byFeeder: Map<string, Set<string>>;

  private constructor(
    nodes: Map<string, TopologyNode>,
    byDt: Map<string, Set<string>>,
    byFeeder: Map<string, Set<string>>
  ) {
    this.nodes = nodes;
    this.byDt = byDt;
    this.byFeeder = byFeeder;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  /**
   * Build a TopologyIndex from a flat array of PoleRecord objects.
   *
   * Two-pass algorithm:
   *   Pass 1 — create a node for every pole; populate secondary indexes.
   *   Pass 2 — wire up children (requires all nodes to exist first so that
   *             out-of-order input is handled correctly).
   *
   * Unknown parentPoleIds (referencing poles not in the input) are silently
   * ignored — the orphaned pole becomes a root-level node for its DT.
   */
  static build(poles: PoleRecord[]): TopologyIndex {
    const mutableChildren = new Map<string, string[]>();
    const byDt = new Map<string, Set<string>>();
    const byFeeder = new Map<string, Set<string>>();

    // Pass 1: initialise nodes and secondary indexes
    for (const pole of poles) {
      mutableChildren.set(pole.poleId, []);

      if (!byDt.has(pole.dtId)) byDt.set(pole.dtId, new Set());
      byDt.get(pole.dtId)!.add(pole.poleId);

      if (!byFeeder.has(pole.feederId)) byFeeder.set(pole.feederId, new Set());
      byFeeder.get(pole.feederId)!.add(pole.poleId);
    }

    // Pass 2: wire up parent → child relationships
    for (const pole of poles) {
      if (pole.parentPoleId && mutableChildren.has(pole.parentPoleId)) {
        mutableChildren.get(pole.parentPoleId)!.push(pole.poleId);
      }
      // If parentPoleId references a pole not in the index, this pole
      // is treated as a root. This handles partial imports gracefully.
    }

    // Freeze into TopologyNodes (childrenIds are now immutable)
    const nodes = new Map<string, TopologyNode>();
    for (const pole of poles) {
      nodes.set(pole.poleId, {
        pole,
        childrenIds: Object.freeze(mutableChildren.get(pole.poleId)!),
      });
    }

    return new TopologyIndex(nodes, byDt, byFeeder);
  }

  // ── O(1) lookups ──────────────────────────────────────────────────────────

  /** Returns the PoleRecord, or undefined if poleId is not in the index. */
  getPole(poleId: string): PoleRecord | undefined {
    return this.nodes.get(poleId)?.pole;
  }

  /** Returns the internal TopologyNode (pole + childrenIds). */
  getNode(poleId: string): TopologyNode | undefined {
    return this.nodes.get(poleId);
  }

  /**
   * Returns the parent's poleId, or null if this pole is a root.
   * Returns null (not undefined) for unknown poleIds — callers should
   * check getPole() first if they need to distinguish missing vs root.
   */
  getParentId(poleId: string): string | null {
    return this.nodes.get(poleId)?.pole.parentPoleId ?? null;
  }

  /** Returns direct child pole IDs. Empty array for leaves or unknown poles. */
  getChildrenIds(poleId: string): ReadonlyArray<string> {
    return this.nodes.get(poleId)?.childrenIds ?? [];
  }

  /** Returns all pole IDs belonging to a DT, in insertion order. */
  getPoleIdsByDt(dtId: string): string[] {
    return Array.from(this.byDt.get(dtId) ?? []);
  }

  /** Returns all pole IDs on a feeder, in insertion order. */
  getPoleIdsByFeeder(feederId: string): string[] {
    return Array.from(this.byFeeder.get(feederId) ?? []);
  }

  /**
   * Returns pole IDs that are roots of the DT's pole tree.
   * A root is a pole whose parentPoleId is null/undefined — i.e. the pole
   * directly hung from the DT breaker with no upstream LT parent.
   *
   * Most DTs have exactly one root; ring-feed or multi-feed DTs can have more.
   */
  getDtRootIds(dtId: string): string[] {
    return this.getPoleIdsByDt(dtId).filter((id) => {
      const parentId = this.nodes.get(id)?.pole.parentPoleId;
      // A pole is a root if it has no parentPoleId OR its parent is not in the index
      return !parentId || !this.nodes.has(parentId);
    });
  }

  /** Total number of poles in the index. */
  size(): number {
    return this.nodes.size;
  }

  // ── O(k) traversals ───────────────────────────────────────────────────────

  /**
   * Returns all descendant pole IDs in BFS order (breadth-first).
   * The starting pole itself is NOT included.
   *
   * BFS is chosen over DFS because it naturally produces the closest
   * (shallowest) poles first — useful for localisation reporting.
   *
   * Includes cycle-detection guard for corrupted data.
   */
  getDescendantIds(poleId: string): string[] {
    const result: string[] = [];
    const visited = new Set<string>([poleId]);
    const queue = [...this.getChildrenIds(poleId)] as string[];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue; // defensive: real trees have no cycles
      visited.add(current);
      result.push(current);
      for (const childId of this.getChildrenIds(current)) {
        if (!visited.has(childId)) queue.push(childId);
      }
    }

    return result;
  }

  // ── O(d) traversals ───────────────────────────────────────────────────────

  /**
   * Returns ancestor pole IDs from nearest to root.
   * e.g. for P4 in the fixture: ['P3', 'P2', 'P1']
   *
   * Includes cycle-detection guard (terminates if a loop is detected).
   */
  getAncestorIds(poleId: string): string[] {
    const result: string[] = [];
    const visited = new Set<string>([poleId]);
    let currentId: string | null = this.getParentId(poleId);

    while (currentId !== null) {
      if (visited.has(currentId)) break; // cycle guard
      visited.add(currentId);
      result.push(currentId);
      currentId = this.getParentId(currentId);
    }

    return result;
  }

  /**
   * Returns the path from the DT root pole down to the given pole (inclusive).
   * e.g. for P4 in the fixture: ['P1', 'P2', 'P3', 'P4']
   */
  getPathFromRoot(poleId: string): string[] {
    return [...this.getAncestorIds(poleId).reverse(), poleId];
  }
}

import type { PoleRecord } from '@pgm/shared';

/**
 * One node in the in-memory topology forest.
 * Wraps a PoleRecord and adds the pre-computed children list so
 * downward traversal is O(1) per step rather than O(n) scan.
 */
export interface TopologyNode {
  readonly pole: PoleRecord;
  /**
   * Ordered list of direct child pole IDs.
   * Order matches the insertion order from the build pass, which
   * in practice follows seqOnLine when available.
   */
  readonly childrenIds: ReadonlyArray<string>;
}

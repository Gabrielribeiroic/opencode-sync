/**
 * Vector Clock Operations
 *
 * Implements distributed conflict detection using vector clocks.
 * Each machine maintains a logical timestamp that increments on updates.
 */

import type { VectorClock, VectorClockComparison } from '../types/index.js';

/**
 * Compare two vector clocks to determine their relationship.
 *
 * @returns
 * - 'equal': Clocks are identical (in sync)
 * - 'local-ahead': Local has updates remote doesn't (safe to push)
 * - 'remote-ahead': Remote has updates local doesn't (need to pull)
 * - 'concurrent': Both have unique updates (conflict!)
 */
export function compareVectorClocks(
  local: VectorClock,
  remote: VectorClock
): VectorClockComparison {
  const allMachines = new Set([...Object.keys(local), ...Object.keys(remote)]);

  let localAhead = false;
  let remoteAhead = false;

  for (const machine of allMachines) {
    const localVal = local[machine] ?? 0;
    const remoteVal = remote[machine] ?? 0;

    if (localVal > remoteVal) {
      localAhead = true;
    }
    if (remoteVal > localVal) {
      remoteAhead = true;
    }
  }

  if (localAhead && remoteAhead) {
    return 'concurrent'; // CONFLICT
  }
  if (localAhead) {
    return 'local-ahead'; // Safe to push
  }
  if (remoteAhead) {
    return 'remote-ahead'; // Need to pull first
  }
  return 'equal'; // Already in sync
}

/**
 * Merge two vector clocks by taking the maximum of each counter.
 * Used after successful sync to combine knowledge from both sides.
 */
export function mergeVectorClocks(local: VectorClock, remote: VectorClock): VectorClock {
  const merged: VectorClock = { ...local };

  for (const [machine, count] of Object.entries(remote)) {
    merged[machine] = Math.max(merged[machine] ?? 0, count);
  }

  return merged;
}

/**
 * Increment the counter for a specific machine.
 * Called before pushing changes to indicate this machine made an update.
 */
export function incrementClock(clock: VectorClock, machineId: string): VectorClock {
  return {
    ...clock,
    [machineId]: (clock[machineId] ?? 0) + 1,
  };
}

/**
 * Create a new vector clock with initial counter for a machine.
 */
export function createVectorClock(machineId: string): VectorClock {
  return { [machineId]: 0 };
}

/**
 * Check if a vector clock dominates another (has all updates the other has, plus more).
 * Returns true if 'a' has seen all updates that 'b' has seen.
 */
export function dominates(a: VectorClock, b: VectorClock): boolean {
  for (const [machine, count] of Object.entries(b)) {
    if ((a[machine] ?? 0) < count) {
      return false;
    }
  }
  return true;
}

/**
 * Get the list of machines that have updates in clock A that clock B doesn't have.
 */
export function getAheadMachines(a: VectorClock, b: VectorClock): string[] {
  const ahead: string[] = [];

  for (const [machine, count] of Object.entries(a)) {
    if (count > (b[machine] ?? 0)) {
      ahead.push(machine);
    }
  }

  return ahead;
}

/**
 * Clone a vector clock.
 */
export function cloneVectorClock(clock: VectorClock): VectorClock {
  return { ...clock };
}

/**
 * Check if two vector clocks are equal.
 */
export function vectorClocksEqual(a: VectorClock, b: VectorClock): boolean {
  const allMachines = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const machine of allMachines) {
    if ((a[machine] ?? 0) !== (b[machine] ?? 0)) {
      return false;
    }
  }

  return true;
}

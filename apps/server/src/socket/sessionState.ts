/** @module apps/server/src/socket/sessionState.ts */

const socketPersistenceUserIds = new Map<string, string>();
const scopeSnapshotSeq = new Map<string, number>();
const socketLastProcessedInputSeq = new Map<string, number>();

export function getSocketPersistenceUserId(socketId: string): string | undefined {
  return socketPersistenceUserIds.get(socketId);
}

export function setSocketPersistenceUserId(socketId: string, userId: string): void {
  socketPersistenceUserIds.set(socketId, userId);
}

export function deleteSocketPersistenceUserId(socketId: string): void {
  socketPersistenceUserIds.delete(socketId);
}

export function getLastProcessedInputSeq(socketId: string): number | undefined {
  return socketLastProcessedInputSeq.get(socketId);
}

export function setLastProcessedInputSeq(socketId: string, inputSeq: number): void {
  socketLastProcessedInputSeq.set(socketId, inputSeq);
}

export function deleteLastProcessedInputSeq(socketId: string): void {
  socketLastProcessedInputSeq.delete(socketId);
}

export function getNextScopeSnapshotSeq(scopeId: string): number {
  const previousSnapshotSeq = scopeSnapshotSeq.get(scopeId) ?? 0;
  const nextSnapshotSeq = previousSnapshotSeq + 1;
  scopeSnapshotSeq.set(scopeId, nextSnapshotSeq);
  return nextSnapshotSeq;
}

export function pruneScopeMetadata(activeScopeIds: string[]): void {
  const activeScopeIdSet = new Set(activeScopeIds);
  for (const scopeId of scopeSnapshotSeq.keys()) {
    if (!activeScopeIdSet.has(scopeId)) {
      scopeSnapshotSeq.delete(scopeId);
    }
  }
}

import { MAX_CHAT_MESSAGES, type RoomChatMessage } from '@metaverse2d/shared';

import { createObservableStore } from '@/lib/createObservableStore';

type RoomChatState = {
  roomScopeId: string;
  messages: RoomChatMessage[];
};

const DEFAULT_ROOM_SCOPE_ID = '1::1';
const DEFAULT_STATE: RoomChatState = {
  roomScopeId: DEFAULT_ROOM_SCOPE_ID,
  messages: [],
};

const store = createObservableStore(DEFAULT_STATE);

export function subscribeToRoomChatState(listener: () => void): () => void {
  return store.subscribe(listener);
}

export function getRoomChatState(): RoomChatState {
  return store.getState();
}

export function resetRoomChatState(): void {
  store.reset();
}

export function setRoomChatScope(worldId: string, roomId: string): void {
  const state = store.getState();
  const nextScopeId = buildRoomScopeId(worldId, roomId);
  if (state.roomScopeId === nextScopeId) {
    return;
  }

  store.setState(() => ({
    roomScopeId: nextScopeId,
    messages: [],
  }));
}

export function appendRoomChatMessage(message: RoomChatMessage): void {
  const state = store.getState();
  if (!message || message.roomScopeId !== state.roomScopeId) {
    return;
  }

  if (state.messages.some((entry) => entry.id === message.id)) {
    return;
  }

  const nextMessages = appendAndTrimRoomChatMessages(state.messages, message);
  store.setState((previous) => ({
    ...previous,
    messages: nextMessages,
  }));
}

function appendAndTrimRoomChatMessages(
  existingMessages: RoomChatMessage[],
  message: RoomChatMessage,
): RoomChatMessage[] {
  const withNext = [...existingMessages, message];
  if (withNext.length <= MAX_CHAT_MESSAGES) {
    return withNext;
  }

  return withNext.slice(withNext.length - MAX_CHAT_MESSAGES);
}

function buildRoomScopeId(worldId: string, roomId: string): string {
  const normalizedWorldId = normalizeScopeSegment(worldId);
  const normalizedRoomId = normalizeScopeSegment(roomId);
  return `${normalizedWorldId}::${normalizedRoomId}`;
}

function normalizeScopeSegment(value: string): string {
  const trimmed = value.trim();
  return trimmed || '1';
}

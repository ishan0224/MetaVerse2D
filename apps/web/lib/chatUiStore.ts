import { MAX_CHAT_MESSAGES, type RoomChatMessage } from '@metaverse2d/shared';

type RoomChatState = {
  roomScopeId: string;
  messages: RoomChatMessage[];
};

const DEFAULT_ROOM_SCOPE_ID = '1::1';
const DEFAULT_STATE: RoomChatState = {
  roomScopeId: DEFAULT_ROOM_SCOPE_ID,
  messages: [],
};

let state: RoomChatState = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();

export function subscribeToRoomChatState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRoomChatState(): RoomChatState {
  return state;
}

export function resetRoomChatState(): void {
  state = { ...DEFAULT_STATE };
  emit();
}

export function setRoomChatScope(worldId: string, roomId: string): void {
  const nextScopeId = buildRoomScopeId(worldId, roomId);
  if (state.roomScopeId === nextScopeId) {
    return;
  }

  state = {
    roomScopeId: nextScopeId,
    messages: [],
  };
  emit();
}

export function appendRoomChatMessage(message: RoomChatMessage): void {
  if (!message || message.roomScopeId !== state.roomScopeId) {
    return;
  }

  if (state.messages.some((entry) => entry.id === message.id)) {
    return;
  }

  const nextMessages = appendAndTrimRoomChatMessages(state.messages, message);
  state = {
    ...state,
    messages: nextMessages,
  };
  emit();
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

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

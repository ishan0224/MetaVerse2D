export const CHAT_EVENT_SEND = 'chat:send';
export const CHAT_EVENT_MESSAGE = 'chat:message';

export const MAX_CHAT_MESSAGES = 20;
export const MAX_CHAT_TEXT_LENGTH = 240;
export const CHAT_DRAFT_PLACEHOLDER = 'Message room...';

export type RoomChatMessageKind = 'USER' | 'SYSTEM';

export type RoomChatMessage = {
  id: string;
  roomScopeId: string;
  senderId: string;
  senderName: string;
  avatarId?: number;
  text: string;
  sentAt: number;
  kind?: RoomChatMessageKind;
};

export type RoomChatSendPayload = {
  text: string;
};

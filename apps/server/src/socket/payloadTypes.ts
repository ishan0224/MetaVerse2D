/** @module apps/server/src/socket/payloadTypes.ts */

import type {
  InputState,
  NearbyPlayersMap,
} from '@metaverse2d/shared';

export type MovePayload = {
  playerId: string;
  input: InputState;
  delta: number;
  inputSeq?: number;
  clientSentAtMs?: number;
};

export type SessionDescriptionPayload = {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
};

export type IceCandidatePayload = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

export type JoinPayload = {
  name?: string;
  worldId: string;
  roomId: string;
  avatarId?: number;
  avatarUrl?: string;
};

export type WebRTCOfferPayload = {
  targetId: string;
  offer: SessionDescriptionPayload;
};

export type WebRTCAnswerPayload = {
  targetId: string;
  answer: SessionDescriptionPayload;
};

export type WebRTCIceCandidateRelayPayload = {
  targetId: string;
  candidate: IceCandidatePayload;
};

export type PlayersUpdatePayload = {
  snapshotSeq: number;
  serverTimeMs: number;
  players: Array<{
    id: string;
    x: number;
    y: number;
    name: string;
    worldId: string;
    color: number;
    roomId: string;
    avatarId?: number;
    avatarUrl?: string;
    timestamp: number;
    serverTimeMs: number;
    lastProcessedInputSeq?: number;
  }>;
  proximity: NearbyPlayersMap;
};

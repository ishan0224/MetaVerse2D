import type { InactivityPhase } from './Inactivity';

export type Player = {
  id: string;
  x: number;
  y: number;
  name: string;
  worldId: string;
  roomId: string;
  color: number;
  avatarId?: number;
  avatarUrl?: string;
  inactivityPhase?: InactivityPhase;
  lastMovedAt?: number;
};

import type { AvatarId } from '@/game/config/characterSpriteConfig';

export type OnboardingStep = 'name' | 'avatar' | 'world' | 'roomConfirm';

export type AuthMode = 'LOGIN' | 'SIGN_UP';

export type AvailabilityState = 'idle' | 'checking' | 'available' | 'taken' | 'error';

export interface OnboardingDraft {
  name: string;
  avatarId: AvatarId;
  worldId: string;
  roomId: string;
}

export interface WorldOption {
  id: string;
  title: string;
  subtitle: string;
  previewImage: string;
}

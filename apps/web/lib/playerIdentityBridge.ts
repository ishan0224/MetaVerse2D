import type { OnboardingDraft } from '@/components/OnboardingOverlay';
import { normalizeAvatarId } from '@/game/config/characterSpriteConfig';
import {
  setRuntimeAvatar,
  setRuntimeIdentity,
} from '@/lib/runtimeUiStore';
import {
  setPlayerAvatarId,
  setPlayerAvatarUrl,
  setPlayerName,
  setRoomId,
  setWorldId,
} from '@/network';

export function applyJoinIdentity(draft: OnboardingDraft): void {
  const requestedName = draft.name;
  const requestedWorldId = draft.worldId;
  const requestedRoomId = draft.roomId;
  const requestedAvatarId = normalizeAvatarId(draft.avatarId);

  setRuntimeAvatar(null, 0x3b82f6, requestedAvatarId);
  setRuntimeIdentity(requestedName, requestedRoomId);
  setPlayerName(requestedName);
  setWorldId(requestedWorldId);
  setRoomId(requestedRoomId);
  setPlayerAvatarId(requestedAvatarId);
  setPlayerAvatarUrl(null);
}

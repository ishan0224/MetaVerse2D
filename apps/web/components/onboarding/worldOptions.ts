import type { WorldOption } from './onboardingTypes';

export const DEFAULT_WORLD_ID = '1';

export const WORLD_OPTIONS: readonly WorldOption[] = [
  {
    id: DEFAULT_WORLD_ID,
    title: 'World 1',
    subtitle: 'Starter District',
    previewImage: '/world-previews/world1-selection.png',
  },
] as const;

export function resolveWorldId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return WORLD_OPTIONS[0].id;
  }

  const match = WORLD_OPTIONS.find((world) => world.id === trimmed);
  return match?.id ?? WORLD_OPTIONS[0].id;
}

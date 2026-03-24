import type { Game } from 'phaser';

import { createGame } from '@/game/core/Game';

export function initializeGame(container: HTMLDivElement): Game {
  return createGame(container);
}

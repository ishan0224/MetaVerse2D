import * as Phaser from 'phaser';

import { MainScene } from '@/game/scenes/MainScene';

const GAME_WIDTH = 1024;
const GAME_HEIGHT = 576;

export function createGame(container: HTMLDivElement): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    autoRound: true,
    parent: container,
    backgroundColor: '#0a0a0a',
    scene: [MainScene],
    scale: {
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };

  return new Phaser.Game(config);
}

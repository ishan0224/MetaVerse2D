import * as Phaser from 'phaser';

import { MainScene } from '@/game/scenes/MainScene';

const GAME_WIDTH = 1024;
const GAME_HEIGHT = 576;

export function createGame(container: HTMLDivElement): Phaser.Game {
  const touchDevice = isTouchGameplayDevice();
  const scaleMode = touchDevice ? Phaser.Scale.RESIZE : Phaser.Scale.ENVELOP;
  const autoCenter = touchDevice ? Phaser.Scale.NO_CENTER : Phaser.Scale.CENTER_BOTH;

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
      mode: scaleMode,
      autoCenter,
    },
  };

  return new Phaser.Game(config);
}

function isTouchGameplayDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const maxTouchPoints = window.navigator?.maxTouchPoints ?? 0;
  return coarsePointer || maxTouchPoints > 0;
}

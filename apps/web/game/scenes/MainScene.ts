import * as Phaser from 'phaser';

import { PLAYER_CONFIG } from '@/game/config/playerConfig';
import { WORLD_CONFIG } from '@/game/config/worldConfig';
import { Player } from '@/game/entities/Player';
import { RemotePlayer } from '@/game/entities/RemotePlayer';
import { InputHandler } from '@/game/systems/InputHandler';
import { MultiplayerSystem } from '@/game/systems/MultiplayerSystem';

const REMOTE_RENDER_DELAY_MS = 100;

export class MainScene extends Phaser.Scene {
  public static readonly KEY = 'MainScene';
  private player!: Player;
  private inputHandler!: InputHandler;
  private multiplayerSystem!: MultiplayerSystem;
  private readonly remotePlayers = new Map<string, RemotePlayer>();

  public constructor() {
    super(MainScene.KEY);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(WORLD_CONFIG.backgroundColor);
    this.cameras.main.setBounds(0, 0, WORLD_CONFIG.width, WORLD_CONFIG.height);

    const grid = this.add.graphics();
    grid.lineStyle(1, WORLD_CONFIG.gridColor, 1);

    for (let x = 0; x <= WORLD_CONFIG.width; x += WORLD_CONFIG.gridSize) {
      grid.moveTo(x, 0);
      grid.lineTo(x, WORLD_CONFIG.height);
    }

    for (let y = 0; y <= WORLD_CONFIG.height; y += WORLD_CONFIG.gridSize) {
      grid.moveTo(0, y);
      grid.lineTo(WORLD_CONFIG.width, y);
    }

    grid.strokePath();

    this.player = new Player({
      id: PLAYER_CONFIG.id,
      x: PLAYER_CONFIG.spawnX,
      y: PLAYER_CONFIG.spawnY,
      name: '',
      scene: this,
    });

    this.inputHandler = new InputHandler(this);
    this.multiplayerSystem = new MultiplayerSystem();
    this.multiplayerSystem.start();

    this.cameras.main.startFollow(this.player.getSprite());

    this.events.once('shutdown', () => {
      this.multiplayerSystem.stop();
      this.player.destroy();

      for (const remotePlayer of this.remotePlayers.values()) {
        remotePlayer.destroy();
      }

      this.remotePlayers.clear();
    });
  }

  public update(_time: number, delta: number): void {
    const inputState = this.inputHandler.getInputState();
    this.multiplayerSystem.pushInput(inputState, delta);
    this.syncPlayersFromServer(performance.now());
  }

  private syncPlayersFromServer(nowMs: number): void {
    const localPlayerState = this.multiplayerSystem.getLocalPlayer();
    if (localPlayerState) {
      this.player.setPosition(localPlayerState.x, localPlayerState.y);
      this.player.setName(localPlayerState.name);
      this.player.setColor(localPlayerState.color);
      this.player.update();
    }

    const remoteStates = this.multiplayerSystem.getRemotePlayers();
    const activeRemoteIds = new Set(remoteStates.map((state) => state.id));

    for (const remoteState of remoteStates) {
      const existingRemotePlayer = this.remotePlayers.get(remoteState.id);
      if (existingRemotePlayer) {
        existingRemotePlayer.addServerPosition(remoteState.x, remoteState.y, remoteState.timestamp);
        existingRemotePlayer.setName(remoteState.name);
        existingRemotePlayer.setColor(remoteState.color);
        continue;
      }

      const remotePlayer = new RemotePlayer({
        id: remoteState.id,
        x: remoteState.x,
        y: remoteState.y,
        timestamp: remoteState.timestamp,
        name: remoteState.name,
        color: remoteState.color,
        scene: this,
      });

      this.remotePlayers.set(remoteState.id, remotePlayer);
    }

    const renderTime = nowMs - REMOTE_RENDER_DELAY_MS;
    for (const remotePlayer of this.remotePlayers.values()) {
      remotePlayer.update(renderTime);
    }

    for (const [playerId, remotePlayer] of this.remotePlayers.entries()) {
      if (activeRemoteIds.has(playerId)) {
        continue;
      }

      remotePlayer.destroy();
      this.remotePlayers.delete(playerId);
    }
  }
}

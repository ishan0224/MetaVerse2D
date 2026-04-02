import {
  buildStaticCollisionIndexFromTilemap,
  type StaticCollisionIndex,
  type TilemapData,
} from '@metaverse2d/shared/utils/staticCollision';
import * as Phaser from 'phaser';

import {
  CHARACTER_SPRITE_FRAME_HEIGHT,
  CHARACTER_SPRITE_FRAME_WIDTH,
  CHARACTER_SPRITE_SHEET_KEY,
  CHARACTER_SPRITE_SHEET_PATH,
} from '@/game/config/characterSpriteConfig';
import { PLAYER_CONFIG } from '@/game/config/playerConfig';
import {
  FULL_MAP_TILEMAP_JSON_PATH,
  FULL_MAP_TILEMAP_KEY,
  FULL_MAP_TILESET_ASSETS,
} from '@/game/config/tilemapConfig';
import { WORLD_CONFIG } from '@/game/config/worldConfig';
import { Player } from '@/game/entities/Player';
import { RemotePlayer } from '@/game/entities/RemotePlayer';
import { InputHandler } from '@/game/systems/InputHandler';
import { MovementSystem } from '@/game/systems/MovementSystem';
import { MultiplayerSystem } from '@/game/systems/MultiplayerSystem';
import { ProximityVoiceSystem } from '@/game/systems/ProximityVoiceSystem';
import { setVoiceUIRemotePlayers } from '@/game/systems/voiceControlStore';
import { ensureCharacterAnimations } from '@/game/utils/characterAnimations';
import { getRTCManager } from '@/network/rtc/rtcManager';

const REMOTE_RENDER_DELAY_MS = 100;
const MAX_FRAME_DELTA_TOTAL_MS = 250;
const MOVEMENT_STEP_DELTA_MS = 100;
const LOCAL_IDLE_RECONCILE_LERP = 0.2;
const LOCAL_ACTIVE_RECONCILE_LERP = 0.32;
const LOCAL_IDLE_RECONCILE_DEADBAND_DISTANCE = 2;
const LOCAL_RECONCILE_EMERGENCY_SNAP_DISTANCE = 192;
const MAX_REPLAY_COMMANDS_PER_RECONCILE = 32;
const PLAYER_STATIC_COLLIDER_SIZE = 26;
const PLAYER_TOUCH_DISTANCE = PLAYER_STATIC_COLLIDER_SIZE + 10;
const STILL_PLAYER_WINDOW_MS = 300;
const BUMP_WARNING_COOLDOWN_MS = 15_000;
const MOTION_EPSILON = 0.6;

type LocalPlayerSnapshot = NonNullable<ReturnType<MultiplayerSystem['getLocalPlayer']>>;
type InputState = ReturnType<InputHandler['getInputState']>;
type MotionSnapshot = { x: number; y: number; lastMovedAtMs: number };
type RenderedPlayerHandle = {
  id: string;
  entity: Player | RemotePlayer;
  position: { x: number; y: number };
  isLocal: boolean;
};

export class MainScene extends Phaser.Scene {
  public static readonly KEY = 'MainScene';
  private player!: Player;
  private inputHandler!: InputHandler;
  private localMovementSystem!: MovementSystem;
  private multiplayerSystem!: MultiplayerSystem;
  private proximityVoiceSystem!: ProximityVoiceSystem;
  private readonly remotePlayers = new Map<string, RemotePlayer>();
  private predictedLocalPosition: { x: number; y: number } | null = null;
  private lastAuthoritativeLocalSnapshotSeq = Number.NEGATIVE_INFINITY;
  private staticCollisionIndex: StaticCollisionIndex | null = null;
  private mapWorldWidth: number = WORLD_CONFIG.width;
  private mapWorldHeight: number = WORLD_CONFIG.height;
  private readonly bumpWarningCooldownByPlayerId = new Map<string, number>();
  private readonly motionSnapshotsByPlayerId = new Map<string, MotionSnapshot>();

  public constructor() {
    super(MainScene.KEY);
  }

  public preload(): void {
    this.load.tilemapTiledJSON(FULL_MAP_TILEMAP_KEY, FULL_MAP_TILEMAP_JSON_PATH);
    this.load.spritesheet(CHARACTER_SPRITE_SHEET_KEY, CHARACTER_SPRITE_SHEET_PATH, {
      frameWidth: CHARACTER_SPRITE_FRAME_WIDTH,
      frameHeight: CHARACTER_SPRITE_FRAME_HEIGHT,
    });
    for (const tilesetAsset of FULL_MAP_TILESET_ASSETS) {
      this.load.image(tilesetAsset.imageKey, tilesetAsset.imagePath);
    }
  }

  public create(): void {
    ensureCharacterAnimations(this);
    this.cameras.main.setBackgroundColor(WORLD_CONFIG.backgroundColor);
    this.createWorldTilemap();
    this.cameras.main.setBounds(0, 0, this.mapWorldWidth, this.mapWorldHeight);
    this.cameras.main.roundPixels = true;
    this.localMovementSystem = new MovementSystem({
      speed: PLAYER_CONFIG.speed,
      bounds: {
        minX: 0,
        maxX: this.mapWorldWidth,
        minY: 0,
        maxY: this.mapWorldHeight,
      },
      staticCollisionIndex: this.staticCollisionIndex,
      playerColliderSize: PLAYER_STATIC_COLLIDER_SIZE,
    });

    this.player = new Player({
      id: PLAYER_CONFIG.id,
      x: PLAYER_CONFIG.spawnX,
      y: PLAYER_CONFIG.spawnY,
      name: '',
      scene: this,
      avatarId: 1,
      avatarUrl: undefined,
    });

    this.inputHandler = new InputHandler(this);
    this.multiplayerSystem = new MultiplayerSystem();
    this.multiplayerSystem.start();
    this.proximityVoiceSystem = new ProximityVoiceSystem({
      adapter: {
        createConnection: async (targetId) => {
          await getRTCManager().createConnection(targetId);
        },
        closeConnection: (targetId) => {
          getRTCManager().closeConnection(targetId);
        },
        setPeerVolume: (targetId, volume) => {
          getRTCManager().setPeerVolume(targetId, volume);
        },
        setPeerMuted: (targetId, muted) => {
          getRTCManager().setPeerMuted(targetId, muted);
        },
        setLocalMicEnabled: (enabled) => {
          getRTCManager().setLocalMicEnabled(enabled);
        },
      },
      disconnectDebounceMs: 300,
    });

    this.cameras.main.startFollow(this.player.getSprite(), true, 1, 1);

    this.events.once('shutdown', () => {
      this.multiplayerSystem.stop();
      this.proximityVoiceSystem.destroy();
      this.player.destroy();

      for (const remotePlayer of this.remotePlayers.values()) {
        remotePlayer.destroy();
      }

      this.remotePlayers.clear();
      this.bumpWarningCooldownByPlayerId.clear();
      this.motionSnapshotsByPlayerId.clear();
    });
  }

  public update(_time: number, delta: number): void {
    const frameDeltaMs = Math.min(Math.max(delta, 0), MAX_FRAME_DELTA_TOTAL_MS);
    const inputState = this.inputHandler.getInputState(frameDeltaMs);
    this.multiplayerSystem.pushInput(inputState, frameDeltaMs);
    const nowMs = performance.now();
    this.syncPlayersFromServer(nowMs, inputState, frameDeltaMs);
    this.evaluateStillPlayerBumpWarnings(nowMs, inputState);
    const localPlayerState = this.multiplayerSystem.getLocalPlayer();
    const remotePlayers = this.multiplayerSystem.getRemotePlayers();
    const localPlayerPosition = this.getLocalRenderPosition(localPlayerState);
    this.proximityVoiceSystem.update({
      localPlayerId: localPlayerState?.id ?? null,
      localPlayerPosition,
      nearbyPlayerIds: this.multiplayerSystem.getLocalNearbyPlayerIds(),
      remotePlayers,
    });
    setVoiceUIRemotePlayers(
      remotePlayers.map((player) => ({
        id: player.id,
        name: player.name,
      })),
    );
  }

  private syncPlayersFromServer(nowMs: number, inputState: InputState, deltaMs: number): void {
    const localPlayerState = this.multiplayerSystem.getLocalPlayer();
    if (localPlayerState) {
      this.player.setMovementIntent(this.hasMovementIntent(inputState));
      const localRenderPosition = this.getReconciledLocalPosition(localPlayerState, inputState, deltaMs);
      this.player.setPosition(localRenderPosition.x, localRenderPosition.y);
      this.player.setName(localPlayerState.name);
      this.player.setColor(localPlayerState.color);
      this.player.setAvatarId(localPlayerState.avatarId);
      this.player.setAvatarUrl(localPlayerState.avatarUrl);
      this.player.update();
    } else if (this.lastAuthoritativeLocalSnapshotSeq === Number.NEGATIVE_INFINITY) {
      // Keep first-input movement responsive while awaiting initial authoritative snapshot.
      this.player.setMovementIntent(this.hasMovementIntent(inputState));
      if (!this.predictedLocalPosition) {
        this.predictedLocalPosition = this.player.getPosition();
      }
      this.predictedLocalPosition = this.applyLocalMovementSteps(
        this.predictedLocalPosition,
        inputState,
        deltaMs,
      );
      this.player.setPosition(this.predictedLocalPosition.x, this.predictedLocalPosition.y);
      this.player.update();
    } else {
      this.player.setMovementIntent(false);
      this.predictedLocalPosition = null;
      this.lastAuthoritativeLocalSnapshotSeq = Number.NEGATIVE_INFINITY;
    }

    const remoteStates = this.multiplayerSystem.getRemotePlayers();
    const activeRemoteIds = new Set(remoteStates.map((state) => state.id));

    for (const remoteState of remoteStates) {
      const existingRemotePlayer = this.remotePlayers.get(remoteState.id);
      if (existingRemotePlayer) {
        existingRemotePlayer.addServerPosition(remoteState.x, remoteState.y, remoteState.timestamp);
        existingRemotePlayer.setName(remoteState.name);
        existingRemotePlayer.setColor(remoteState.color);
        existingRemotePlayer.setAvatarId(remoteState.avatarId);
        existingRemotePlayer.setAvatarUrl(remoteState.avatarUrl);
        continue;
      }

      const remotePlayer = new RemotePlayer({
        id: remoteState.id,
        x: remoteState.x,
        y: remoteState.y,
        timestamp: remoteState.timestamp,
        name: remoteState.name,
        color: remoteState.color,
        avatarId: remoteState.avatarId,
        avatarUrl: remoteState.avatarUrl,
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
      this.motionSnapshotsByPlayerId.delete(playerId);
      this.bumpWarningCooldownByPlayerId.delete(playerId);
    }
  }

  private createWorldTilemap(): void {
    this.staticCollisionIndex = null;
    const cachedTilemap = this.cache.tilemap.get(FULL_MAP_TILEMAP_KEY) as { data?: TilemapData } | undefined;
    if (cachedTilemap?.data) {
      this.staticCollisionIndex = buildStaticCollisionIndexFromTilemap(cachedTilemap.data);
    }

    const map = this.make.tilemap({ key: FULL_MAP_TILEMAP_KEY });
    const tilesets: Phaser.Tilemaps.Tileset[] = [];

    for (const tilesetAsset of FULL_MAP_TILESET_ASSETS) {
      this.textures.get(tilesetAsset.imageKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
      const tileset = map.addTilesetImage(tilesetAsset.tilesetName, tilesetAsset.imageKey);
      if (tileset) {
        tilesets.push(tileset);
      }
    }

    for (const layerData of map.layers) {
      const layer = map.createLayer(layerData.name, tilesets, 0, 0);
      layer?.setCullPadding(1, 1);
    }

    this.mapWorldWidth = map.widthInPixels;
    this.mapWorldHeight = map.heightInPixels;
  }

  private getReconciledLocalPosition(
    localPlayerState: LocalPlayerSnapshot,
    inputState: InputState,
    deltaMs: number,
  ): { x: number; y: number } {
    if (!this.predictedLocalPosition) {
      this.predictedLocalPosition = { x: localPlayerState.x, y: localPlayerState.y };
      this.lastAuthoritativeLocalSnapshotSeq = localPlayerState.snapshotSeq;
    } else {
      this.predictedLocalPosition = this.applyLocalMovementSteps(
        this.predictedLocalPosition,
        inputState,
        deltaMs,
      );
    }

    if (localPlayerState.snapshotSeq > this.lastAuthoritativeLocalSnapshotSeq) {
      this.lastAuthoritativeLocalSnapshotSeq = localPlayerState.snapshotSeq;
      let replayedAuthoritativePosition = {
        x: localPlayerState.x,
        y: localPlayerState.y,
      };

      const pendingReplayCommands = this.multiplayerSystem.getPendingReplayCommands(
        localPlayerState.lastProcessedInputSeq,
      );
      const replayCommandStartIndex =
        pendingReplayCommands.length > MAX_REPLAY_COMMANDS_PER_RECONCILE
          ? pendingReplayCommands.length - MAX_REPLAY_COMMANDS_PER_RECONCILE
          : 0;

      for (let commandIndex = replayCommandStartIndex; commandIndex < pendingReplayCommands.length; commandIndex += 1) {
        const replayCommand = pendingReplayCommands[commandIndex];
        replayedAuthoritativePosition = this.applyLocalMovementSteps(
          replayedAuthoritativePosition,
          replayCommand.input,
          replayCommand.deltaMs,
        );
      }

      const errorX = replayedAuthoritativePosition.x - this.predictedLocalPosition.x;
      const errorY = replayedAuthoritativePosition.y - this.predictedLocalPosition.y;
      const errorDistance = Math.hypot(errorX, errorY);
      const hasMovementIntent = this.hasMovementIntent(inputState);
      const reconcileLerp = hasMovementIntent
        ? LOCAL_ACTIVE_RECONCILE_LERP
        : LOCAL_IDLE_RECONCILE_LERP;

      if (!hasMovementIntent && errorDistance <= LOCAL_IDLE_RECONCILE_DEADBAND_DISTANCE) {
        this.predictedLocalPosition = replayedAuthoritativePosition;
        return { ...this.predictedLocalPosition };
      }

      if (errorDistance >= LOCAL_RECONCILE_EMERGENCY_SNAP_DISTANCE) {
        this.predictedLocalPosition = replayedAuthoritativePosition;
      } else {
        this.predictedLocalPosition = {
          x: this.predictedLocalPosition.x + errorX * reconcileLerp,
          y: this.predictedLocalPosition.y + errorY * reconcileLerp,
        };
      }
    }

    return { ...this.predictedLocalPosition };
  }

  private getLocalRenderPosition(localPlayerState: LocalPlayerSnapshot | null): { x: number; y: number } | null {
    if (this.predictedLocalPosition) {
      return { ...this.predictedLocalPosition };
    }

    if (!localPlayerState) {
      return null;
    }

    return {
      x: localPlayerState.x,
      y: localPlayerState.y,
    };
  }

  private evaluateStillPlayerBumpWarnings(nowMs: number, inputState: InputState): void {
    const renderedPlayers = this.getRenderedPlayers();
    const activeIds = new Set(renderedPlayers.map((player) => player.id));
    this.pruneMotionAndCooldownEntries(activeIds);
    this.updateMotionSnapshots(renderedPlayers, nowMs, inputState);

    if (renderedPlayers.length < 2) {
      return;
    }

    for (let firstIndex = 0; firstIndex < renderedPlayers.length - 1; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < renderedPlayers.length; secondIndex += 1) {
        const firstPlayer = renderedPlayers[firstIndex];
        const secondPlayer = renderedPlayers[secondIndex];
        const distance = Phaser.Math.Distance.Between(
          firstPlayer.position.x,
          firstPlayer.position.y,
          secondPlayer.position.x,
          secondPlayer.position.y,
        );
        if (distance > PLAYER_TOUCH_DISTANCE) {
          continue;
        }

        const firstPlayerStill = this.isStillPlayer(firstPlayer.id, firstPlayer.isLocal, nowMs, inputState);
        const secondPlayerStill = this.isStillPlayer(secondPlayer.id, secondPlayer.isLocal, nowMs, inputState);

        if (!firstPlayerStill && secondPlayerStill) {
          this.tryTriggerBumpWarning(secondPlayer, nowMs);
        } else if (!secondPlayerStill && firstPlayerStill) {
          this.tryTriggerBumpWarning(firstPlayer, nowMs);
        }
      }
    }
  }

  private getRenderedPlayers(): RenderedPlayerHandle[] {
    const players: RenderedPlayerHandle[] = [
      {
        id: this.player.getId(),
        entity: this.player,
        position: this.player.getPosition(),
        isLocal: true,
      },
    ];

    for (const remotePlayer of this.remotePlayers.values()) {
      players.push({
        id: remotePlayer.getId(),
        entity: remotePlayer,
        position: remotePlayer.getPosition(),
        isLocal: false,
      });
    }

    return players;
  }

  private pruneMotionAndCooldownEntries(activePlayerIds: Set<string>): void {
    for (const playerId of this.motionSnapshotsByPlayerId.keys()) {
      if (!activePlayerIds.has(playerId)) {
        this.motionSnapshotsByPlayerId.delete(playerId);
      }
    }

    for (const playerId of this.bumpWarningCooldownByPlayerId.keys()) {
      if (!activePlayerIds.has(playerId)) {
        this.bumpWarningCooldownByPlayerId.delete(playerId);
      }
    }
  }

  private updateMotionSnapshots(
    renderedPlayers: RenderedPlayerHandle[],
    nowMs: number,
    inputState: InputState,
  ): void {
    for (const player of renderedPlayers) {
      const existingSnapshot = this.motionSnapshotsByPlayerId.get(player.id);
      if (!existingSnapshot) {
        this.motionSnapshotsByPlayerId.set(player.id, {
          x: player.position.x,
          y: player.position.y,
          lastMovedAtMs: nowMs,
        });
        continue;
      }

      const distance = Phaser.Math.Distance.Between(
        existingSnapshot.x,
        existingSnapshot.y,
        player.position.x,
        player.position.y,
      );
      const localMovementIntent = player.isLocal && this.hasMovementIntent(inputState);
      const movedThisFrame = localMovementIntent || distance > MOTION_EPSILON;

      this.motionSnapshotsByPlayerId.set(player.id, {
        x: player.position.x,
        y: player.position.y,
        lastMovedAtMs: movedThisFrame ? nowMs : existingSnapshot.lastMovedAtMs,
      });
    }
  }

  private isStillPlayer(
    playerId: string,
    isLocalPlayer: boolean,
    nowMs: number,
    inputState: InputState,
  ): boolean {
    if (isLocalPlayer && this.hasMovementIntent(inputState)) {
      return false;
    }

    const snapshot = this.motionSnapshotsByPlayerId.get(playerId);
    if (!snapshot) {
      return false;
    }

    return nowMs - snapshot.lastMovedAtMs >= STILL_PLAYER_WINDOW_MS;
  }

  private tryTriggerBumpWarning(target: RenderedPlayerHandle, nowMs: number): void {
    const lastTriggeredAt = this.bumpWarningCooldownByPlayerId.get(target.id);
    if (lastTriggeredAt !== undefined && nowMs - lastTriggeredAt < BUMP_WARNING_COOLDOWN_MS) {
      return;
    }

    target.entity.showBumpWarning();
    this.bumpWarningCooldownByPlayerId.set(target.id, nowMs);
  }

  private hasMovementIntent(inputState: InputState): boolean {
    if (inputState.up || inputState.down || inputState.left || inputState.right) {
      return true;
    }

    return Math.hypot(inputState.moveX ?? 0, inputState.moveY ?? 0) > 0.05;
  }

  private applyLocalMovementSteps(
    currentPosition: { x: number; y: number },
    inputState: InputState,
    totalDeltaMs: number,
  ): { x: number; y: number } {
    let nextPosition = currentPosition;
    let remainingDeltaMs = totalDeltaMs;

    while (remainingDeltaMs > 0) {
      const stepDeltaMs = Math.min(MOVEMENT_STEP_DELTA_MS, remainingDeltaMs);
      nextPosition = this.localMovementSystem.updatePosition(nextPosition, inputState, stepDeltaMs);
      remainingDeltaMs -= stepDeltaMs;
      if (remainingDeltaMs < 0.001) {
        break;
      }
    }

    return nextPosition;
  }
}

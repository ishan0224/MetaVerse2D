/** @module apps/server/src/domain/roomManager.ts */

import type { Player } from '@metaverse2d/shared';

export class RoomManager {
  private readonly roomPlayers = new Map<string, Set<string>>();
  private readonly playerRooms = new Map<string, string>();

  public createRoom(roomId: string): void {
    if (!this.roomPlayers.has(roomId)) {
      this.roomPlayers.set(roomId, new Set<string>());
    }
  }

  public addPlayerToRoom(player: Player, roomId: string): void {
    this.createRoom(roomId);
    const previousRoomId = this.playerRooms.get(player.id);

    if (previousRoomId && previousRoomId !== roomId) {
      this.removePlayerFromRoom(player.id);
    }

    const room = this.roomPlayers.get(roomId);
    room?.add(player.id);
    this.playerRooms.set(player.id, roomId);
  }

  public removePlayerFromRoom(playerId: string): string | null {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) {
      return null;
    }

    const room = this.roomPlayers.get(roomId);
    room?.delete(playerId);
    if (room && room.size === 0) {
      this.roomPlayers.delete(roomId);
    }

    this.playerRooms.delete(playerId);
    return roomId;
  }

  public getPlayersInRoom(roomId: string): string[] {
    const room = this.roomPlayers.get(roomId);
    if (!room) {
      return [];
    }

    return Array.from(room);
  }

  public getRoomForPlayer(playerId: string): string | null {
    return this.playerRooms.get(playerId) ?? null;
  }

  public getAllRoomIds(): string[] {
    return Array.from(this.roomPlayers.keys());
  }
}

import { v4 as uuidv4 } from 'uuid'
import type { GameRoom, Player, GameType, RoomListItem } from '../../../shared/types'

/** How long to keep a disconnected player's seat before dropping them (ms). */
const DISCONNECT_GRACE_MS = 600_000 // 10 minutes

function normalizePlayerName(name: string): string {
  return name.trim().toLowerCase()
}

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map()
  /** rejoinToken -> { roomId, socketId } */
  private rejoinByToken = new Map<string, { roomId: string; socketId: string }>()
  /** socketId -> rejoinToken */
  private socketToToken = new Map<string, string>()
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Socket IDs still seated but disconnected (grace window); can reclaim seat with matching name. */
  private disconnectedSocketIds = new Set<string>()

  async createRoom(roomConfig: Partial<GameRoom>): Promise<GameRoom> {
    const roomId = uuidv4()
    const room: GameRoom = {
      id: roomId,
      name: roomConfig.name || `Room ${roomId.slice(0, 6)}`,
      gameType: roomConfig.gameType || 'poker',
      players: [],
      maxPlayers: roomConfig.maxPlayers || 4,
      isStarted: false,
      isPrivate: roomConfig.isPrivate || false,
      createdAt: new Date(),
      settings: {
        maxPlayers: roomConfig.maxPlayers || 4,
        allowSpectators: roomConfig.settings?.allowSpectators || false,
        turnTimeLimit: roomConfig.settings?.turnTimeLimit || 60,
        ...roomConfig.settings,
      },
      sessionScores304: roomConfig.gameType === '304' ? {} : undefined,
    }

    this.rooms.set(roomId, room)
    return room
  }

  async joinRoom(
    roomId: string,
    playerId: string,
    playerName: string
  ): Promise<{ room: GameRoom; rejoinToken: string; previousSocketId?: string }> {
    console.log(`RoomManager: joinRoom called - roomId: ${roomId}, playerId: ${playerId}, playerName: ${playerName}`)
    const room = this.rooms.get(roomId)
    if (!room) {
      throw new Error('Room not found')
    }

    const existingPlayer = room.players.find((p) => p.id === playerId)
    if (existingPlayer) {
      console.log(
        `RoomManager: Player ${playerId} already in room, returning existing room with ${room.players.length} players`
      )
      const rejoinToken = this.ensureRejoinToken(roomId, playerId)
      return { room, rejoinToken }
    }

    if (room.players.length >= room.maxPlayers) {
      const claimed = this.claimDisconnectedSeat(roomId, playerId, playerName)
      if (claimed) {
        return claimed
      }
      const hasDisconnectedSeat = room.players.some((p) => this.disconnectedSocketIds.has(p.id))
      if (hasDisconnectedSeat) {
        throw new Error(
          'Room is full — use the exact same name as your disconnected seat to reclaim it (case-insensitive)'
        )
      }
      throw new Error('Room is full')
    }

    const player: Player = {
      id: playerId,
      name: playerName,
      hand: [],
      score: 0,
      isReady: false,
      isActive: false,
    }

    room.players.push(player)
    this.rooms.set(roomId, room)
    console.log(`RoomManager: Added player ${playerId} to room ${roomId}, room now has ${room.players.length} players`)

    const rejoinToken = this.bindRejoinToken(roomId, playerId)
    return { room, rejoinToken }
  }

  /**
   * If the room is full but a seated player is disconnected (grace), hand their seat to this socket
   * when the display name matches (case-insensitive). Insecure by design — no password.
   */
  private claimDisconnectedSeat(
    roomId: string,
    newSocketId: string,
    playerName: string
  ): { room: GameRoom; rejoinToken: string; previousSocketId: string } | null {
    const room = this.rooms.get(roomId)
    if (!room) return null
    const norm = normalizePlayerName(playerName)
    if (!norm) return null

    const target = room.players.find(
      (p) => this.disconnectedSocketIds.has(p.id) && normalizePlayerName(p.name) === norm
    )
    if (!target) return null

    const oldId = target.id
    this.revokeRejoinForSocket(oldId)
    this.cancelDisconnectRemoval(oldId)
    this.disconnectedSocketIds.delete(oldId)

    target.id = newSocketId
    this.rooms.set(roomId, room)

    const rejoinToken = this.bindRejoinToken(roomId, newSocketId)
    console.log(
      `RoomManager: Claimed disconnected seat ${oldId} -> ${newSocketId} in ${roomId} by name "${playerName}"`
    )
    return { room, rejoinToken, previousSocketId: oldId }
  }

  /** Mark socket as disconnected but still seated (grace). Call from socket disconnect handler. */
  markSocketDisconnected(socketId: string): void {
    for (const room of this.rooms.values()) {
      if (room.players.some((p) => p.id === socketId)) {
        this.disconnectedSocketIds.add(socketId)
        return
      }
    }
  }

  /**
   * Restore a disconnected player's seat using a secret token (new socket id).
   */
  rejoinRoom(roomId: string, newSocketId: string, token: string): { room: GameRoom; previousSocketId: string } {
    const sess = this.rejoinByToken.get(token)
    if (!sess || sess.roomId !== roomId) {
      throw new Error('[rejoin] Invalid or expired rejoin token')
    }
    const room = this.rooms.get(roomId)
    if (!room) {
      this.rejoinByToken.delete(token)
      throw new Error('[rejoin] Room not found')
    }
    const player = room.players.find((p) => p.id === sess.socketId)
    if (!player) {
      this.rejoinByToken.delete(token)
      throw new Error('[rejoin] Seat no longer available — join as a new player')
    }

    this.cancelDisconnectRemoval(sess.socketId)

    const oldId = sess.socketId
    player.id = newSocketId
    this.disconnectedSocketIds.delete(oldId)
    this.rejoinByToken.set(token, { roomId, socketId: newSocketId })
    this.socketToToken.delete(oldId)
    this.socketToToken.set(newSocketId, token)
    this.rooms.set(roomId, room)

    return { room, previousSocketId: oldId }
  }

  private bindRejoinToken(roomId: string, socketId: string): string {
    const existing = this.socketToToken.get(socketId)
    if (existing) return existing
    const token = uuidv4()
    this.rejoinByToken.set(token, { roomId, socketId })
    this.socketToToken.set(socketId, token)
    return token
  }

  private ensureRejoinToken(roomId: string, socketId: string): string {
    return this.socketToToken.get(socketId) ?? this.bindRejoinToken(roomId, socketId)
  }

  revokeRejoinForSocket(socketId: string): void {
    this.cancelDisconnectRemoval(socketId)
    const token = this.socketToToken.get(socketId)
    if (token) {
      this.rejoinByToken.delete(token)
      this.socketToToken.delete(socketId)
    }
  }

  cancelDisconnectRemoval(socketId: string): void {
    const t = this.disconnectTimers.get(socketId)
    if (t) {
      clearTimeout(t)
      this.disconnectTimers.delete(socketId)
    }
  }

  /** Call on socket disconnect: remove player after grace period unless they rejoin with a token. */
  scheduleDisconnectRemoval(socketId: string, onRemove: () => void): void {
    this.cancelDisconnectRemoval(socketId)
    const t = setTimeout(() => {
      this.disconnectTimers.delete(socketId)
      onRemove()
    }, DISCONNECT_GRACE_MS)
    this.disconnectTimers.set(socketId, t)
  }

  /** @returns true if the room was removed (last player left). */
  async leaveRoom(roomId: string, playerId: string): Promise<boolean> {
    this.revokeRejoinForSocket(playerId)
    this.disconnectedSocketIds.delete(playerId)

    const room = this.rooms.get(roomId)
    if (!room) {
      throw new Error('Room not found')
    }

    room.players = room.players.filter((p) => p.id !== playerId)

    if (room.players.length === 0) {
      this.rooms.delete(roomId)
      return true
    }

    this.rooms.set(roomId, room)
    return false
  }

  async setPlayerReady(roomId: string, playerId: string, isReady: boolean): Promise<GameRoom> {
    const room = this.rooms.get(roomId)
    if (!room) {
      throw new Error('Room not found')
    }

    const player = room.players.find((p) => p.id === playerId)
    if (!player) {
      throw new Error('Player not found in room')
    }

    player.isReady = isReady
    this.rooms.set(roomId, room)

    return room
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId)
  }

  /** Rooms where this socket id is still listed as a player (used before purge on disconnect). */
  getRoomIdsContainingPlayer(playerId: string): string[] {
    const ids: string[] = []
    for (const [rid, room] of this.rooms) {
      if (room.players.some((p) => p.id === playerId)) ids.push(rid)
    }
    return ids
  }

  getAllRooms(): RoomListItem[] {
    return Array.from(this.rooms.values())
      .filter((room) => room.players.length > 0)
      .map((room) => {
        let disconnectedCount = 0
        for (const p of room.players) {
          if (this.disconnectedSocketIds.has(p.id)) disconnectedCount++
        }
        return {
          id: room.id,
          name: room.name,
          gameType: room.gameType,
          playerCount: room.players.length,
          maxPlayers: room.maxPlayers,
          isStarted: room.isStarted,
          isPrivate: room.isPrivate,
          disconnectedCount,
        }
      })
  }

  getPublicRooms(): RoomListItem[] {
    return this.getAllRooms().filter((room) => !room.isPrivate)
  }

  /** Room IDs that were deleted because they became empty. */
  removePlayerFromAllRooms(playerId: string): string[] {
    this.revokeRejoinForSocket(playerId)
    this.disconnectedSocketIds.delete(playerId)

    const deleted: string[] = []
    const roomIds = Array.from(this.rooms.keys())
    for (const roomId of roomIds) {
      const room = this.rooms.get(roomId)
      if (!room) continue
      const playerIndex = room.players.findIndex((p) => p.id === playerId)
      if (playerIndex === -1) continue
      room.players.splice(playerIndex, 1)
      if (room.players.length === 0) {
        this.rooms.delete(roomId)
        deleted.push(roomId)
      } else {
        this.rooms.set(roomId, room)
      }
    }
    return deleted
  }

  canStartGame(roomId: string): boolean {
    const room = this.rooms.get(roomId)
    if (!room) {
      return false
    }

    return (
      room.players.length >= 2 &&
      room.players.every((p) => p.isReady) &&
      !room.isStarted
    )
  }

  startGame(roomId: string): GameRoom {
    const room = this.rooms.get(roomId)
    if (!room) {
      throw new Error('Room not found')
    }

    if (!this.canStartGame(roomId)) {
      throw new Error('Cannot start game: not enough players or players not ready')
    }

    room.isStarted = true
    room.players.forEach((player) => {
      player.isActive = true
    })

    this.rooms.set(roomId, room)
    return room
  }

  updateRoom(roomId: string, updatedRoom: GameRoom): void {
    this.rooms.set(roomId, updatedRoom)
  }
}

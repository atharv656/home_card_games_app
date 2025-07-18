import { v4 as uuidv4 } from 'uuid'
import type { GameRoom, Player, GameType, RoomListItem } from '../../../shared/types'

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map()

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
    }

    this.rooms.set(roomId, room)
    return room
  }

  async joinRoom(roomId: string, playerId: string, playerName: string): Promise<GameRoom> {
    console.log(`RoomManager: joinRoom called - roomId: ${roomId}, playerId: ${playerId}, playerName: ${playerName}`)
    const room = this.rooms.get(roomId)
    if (!room) {
      throw new Error('Room not found')
    }

    if (room.players.length >= room.maxPlayers) {
      throw new Error('Room is full')
    }

    // If player is already in room, just return the room (no error)
    const existingPlayer = room.players.find(p => p.id === playerId)
    if (existingPlayer) {
      console.log(`RoomManager: Player ${playerId} already in room, returning existing room with ${room.players.length} players`)
      return room
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

    return room
  }

  async leaveRoom(roomId: string, playerId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) {
      throw new Error('Room not found')
    }

    room.players = room.players.filter(p => p.id !== playerId)
    
    // Remove empty rooms
    if (room.players.length === 0) {
      this.rooms.delete(roomId)
    } else {
      this.rooms.set(roomId, room)
    }
  }

  async setPlayerReady(roomId: string, playerId: string, isReady: boolean): Promise<GameRoom> {
    const room = this.rooms.get(roomId)
    if (!room) {
      throw new Error('Room not found')
    }

    const player = room.players.find(p => p.id === playerId)
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

  getAllRooms(): RoomListItem[] {
    return Array.from(this.rooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      gameType: room.gameType,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      isStarted: room.isStarted,
      isPrivate: room.isPrivate,
    }))
  }

  getPublicRooms(): RoomListItem[] {
    return this.getAllRooms().filter(room => !room.isPrivate)
  }

  removePlayerFromAllRooms(playerId: string): void {
    for (const [roomId, room] of this.rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === playerId)
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1)
        
        // Remove empty rooms
        if (room.players.length === 0) {
          this.rooms.delete(roomId)
        } else {
          this.rooms.set(roomId, room)
        }
      }
    }
  }

  canStartGame(roomId: string): boolean {
    const room = this.rooms.get(roomId)
    if (!room) {
      return false
    }

    // Check if room has enough players and all are ready
    return room.players.length >= 2 && 
           room.players.every(p => p.isReady) &&
           !room.isStarted
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
    room.players.forEach(player => {
      player.isActive = true
    })

    this.rooms.set(roomId, room)
    return room
  }

  updateRoom(roomId: string, updatedRoom: GameRoom): void {
    this.rooms.set(roomId, updatedRoom)
  }
} 
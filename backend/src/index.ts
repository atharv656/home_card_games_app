import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { GameManager } from './game/GameManager'
import { RoomManager } from './game/RoomManager'
import type { 
  ServerToClientEvents, 
  ClientToServerEvents,
  GameRoom 
} from '../../shared/types'

dotenv.config()

const app = express()
const server = createServer(app)
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'https://home-card-games-app.onrender.com',
      ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])
    ],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true
})

// Middleware
app.use(cors())
app.use(express.json())

// Serve static files from frontend build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../../../frontend/dist')))
}

// Game managers
const roomManager = new RoomManager()
const gameManager = new GameManager(roomManager)

/** One in-flight start/action per room so concurrent sockets cannot corrupt game state (e.g. overlapping restart_game). */
const roomGameOpChain = new Map<string, Promise<unknown>>()

function enqueueRoomGameOp(roomId: string, op: () => Promise<void>): void {
  const prev = roomGameOpChain.get(roomId) ?? Promise.resolve()
  const next = prev
    .catch(() => {})
    .then(() => op())
    .catch(() => {})
  roomGameOpChain.set(roomId, next)
}

console.log('🏗️ RoomManager created:', !!roomManager)
console.log('🏗️ GameManager created:', !!gameManager)

// Log Socket.IO configuration
const allowedOrigins = [
  'http://localhost:3000',
  'https://home-card-games-app.onrender.com',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])
]
console.log('🔌 Socket.IO CORS origins:', allowedOrigins)
console.log('🌍 NODE_ENV:', process.env.NODE_ENV)
console.log('🌍 FRONTEND_URL:', process.env.FRONTEND_URL || 'not set')
console.log('🚀 Socket.IO server configured with transports: polling, websocket')

// Add connection attempt logging
io.engine.on('initial_headers', (headers, req) => {
  console.log('🔍 Socket.IO initial headers from:', req.headers.origin || 'no origin header')
})

io.engine.on('connection_error', (err) => {
  console.log('❌ Socket.IO connection error:', err.req?.headers?.origin, err.message, err.description)
})

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Get all rooms
app.get('/api/rooms', (req, res) => {
  console.log('🌍 HTTP /api/rooms endpoint called')
  console.log('🔍 RoomManager instance check:', !!roomManager)
  const rooms = roomManager.getAllRooms()
  console.log(`API: /api/rooms called - returning ${rooms.length} rooms:`, rooms.map(r => ({ id: r.id, name: r.name, players: r.playerCount })))
  res.json(rooms)
})

// Test endpoint to create a room via HTTP (for debugging)
app.post('/api/test-create-room', async (req, res) => {
  try {
    console.log('🧪 HTTP Test: Creating room without Socket.IO')
    const room = await roomManager.createRoom({ 
      name: 'HTTP Test Room', 
      gameType: 'poker',
      maxPlayers: 4
    })
    
    // Simulate adding a player
    const testPlayerId = 'http-test-player'
    const updatedRoom = await roomManager.joinRoom(room.id, testPlayerId, 'HTTP Test Player')
    
    const allRooms = roomManager.getAllRooms()
    console.log(`✅ HTTP Test room created: ${room.id} with ${updatedRoom.players.length} players`)
    console.log(`📊 Total rooms after HTTP creation: ${allRooms.length}`)
    
    res.json({ 
      success: true, 
      room: updatedRoom, 
      totalRooms: allRooms.length, 
      allRooms: allRooms.map(r => ({ id: r.id, name: r.name, players: r.playerCount }))
    })
  } catch (error) {
    console.error('❌ HTTP Test room creation failed:', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

// Check specific room by ID
app.get('/api/rooms/:roomId', (req, res) => {
  const roomId = req.params.roomId
  console.log(`🔍 Checking for room: ${roomId}`)
  const room = roomManager.getRoom(roomId)
  const allRooms = roomManager.getAllRooms()
  console.log(`📊 Room exists: ${!!room}, Total rooms: ${allRooms.length}`)
  if (room) {
    res.json({ exists: true, room })
  } else {
    res.json({ exists: false, roomId, totalRooms: allRooms.length, allRooms })
  }
})

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌🔌🔌 USER CONNECTED: ${socket.id} at ${new Date().toISOString()} 🔌🔌🔌`)
  console.log(`🔌 Socket.IO connection established successfully!`)
  const currentConnections = io.engine.clientsCount
  console.log(`📊 Total active connections: ${currentConnections}`)

  // Join room
  socket.on('room:join', async (roomId: string, playerName: string) => {
    try {
      console.log(`Socket ${socket.id} attempting to join room ${roomId} as ${playerName}`)
      const room = await roomManager.joinRoom(roomId, socket.id, playerName)
      socket.join(roomId)
      
      // Send room info to the player
      socket.emit('room:joined', room)
      
      // Notify other players in the room
      socket.to(roomId).emit('player:joined', room.players.find(p => p.id === socket.id)!)
      
      // Send updated room info to all players
      io.to(roomId).emit('room:updated', room)
      
    } catch (error) {
      console.error(`Failed to join room ${roomId}:`, error)
      socket.emit('error', `Failed to join room: ${error}`)
    }
  })

  // Leave room
  socket.on('room:leave', async (roomId: string) => {
    try {
      const roomRemoved = await roomManager.leaveRoom(roomId, socket.id)
      socket.leave(roomId)

      socket.to(roomId).emit('player:left', socket.id)

      if (roomRemoved) {
        gameManager.removeGameState(roomId)
      } else {
        const room = roomManager.getRoom(roomId)
        if (room) {
          io.to(roomId).emit('room:updated', room)
        }
      }
    } catch (error) {
      socket.emit('error', `Failed to leave room: ${error}`)
    }
  })

  // Create room
  socket.on('room:create', async (roomConfig: Partial<GameRoom> & { playerName?: string }) => {
    console.log(`🚨🚨🚨 ROOM:CREATE EVENT RECEIVED 🚨🚨🚨`)
    console.log(`Socket ID: ${socket.id}`)
    console.log(`Timestamp: ${new Date().toISOString()}`)
    console.log(`Config:`, JSON.stringify(roomConfig, null, 2))
    
    try {
      console.log(`🏠 Creating room for socket ${socket.id} with config:`, { playerName: roomConfig.playerName, gameType: roomConfig.gameType, maxPlayers: roomConfig.maxPlayers })
      const room = await roomManager.createRoom(roomConfig)
      console.log('✅ Empty room created:', { id: room.id, name: room.name, playersCount: room.players.length })
      
      // Add creator as a player to the room
      const playerName = roomConfig.playerName || 'Player'
      const updatedRoom = await roomManager.joinRoom(room.id, socket.id, playerName)
      const totalRooms = roomManager.getAllRooms().length
      console.log('👤 Creator added to room:', { id: updatedRoom.id, name: updatedRoom.name, playersCount: updatedRoom.players.length, players: updatedRoom.players.map(p => ({ id: p.id, name: p.name })) })
      console.log(`📊 Total rooms in system: ${totalRooms}`)
      
      // Join the socket to the room BEFORE emitting events
      socket.join(room.id)
      
      // Send room info to the creator (with creator included)
      console.log('Emitting room:joined with room containing creator')
      socket.emit('room:joined', updatedRoom)
      
      // Send updated room info to all players (in case others are already in the room)
      io.to(room.id).emit('room:updated', updatedRoom)
      
      // Final verification
      const finalRoomCheck = roomManager.getRoom(room.id)
      const allRoomsAfterCreation = roomManager.getAllRooms()
      console.log(`🔍 Final room verification:`, { 
        roomExists: !!finalRoomCheck, 
        roomId: room.id, 
        totalRooms: allRoomsAfterCreation.length,
        allRoomIds: allRoomsAfterCreation.map(r => r.id)
      })
      console.log(`🚨🚨🚨 ROOM CREATION COMPLETE 🚨🚨🚨`)
      
    } catch (error) {
      console.error('❌❌❌ ERROR IN ROOM CREATION:', error)
      socket.emit('error', `Failed to create room: ${error}`)
    }
  })

  // Start game
  socket.on('game:start', (roomId: string) => {
    enqueueRoomGameOp(roomId, async () => {
      try {
        const gameState = await gameManager.startGame(roomId, socket.id)

        const updatedRoom = roomManager.getRoom(roomId)

        io.to(roomId).emit('game:started', gameState)

        if (updatedRoom) {
          io.to(roomId).emit('room:updated', updatedRoom)
        }
      } catch (error) {
        socket.emit('error', `Failed to start game: ${error}`)
      }
    })
  })

  // Handle game actions
  socket.on('game:action', (roomId: string, action) => {
    enqueueRoomGameOp(roomId, async () => {
      try {
        const gameState = await gameManager.processAction(roomId, action)
        io.to(roomId).emit('game:updated', gameState)

        const updatedRoom = roomManager.getRoom(roomId)
        if (updatedRoom) {
          io.to(roomId).emit('room:updated', updatedRoom)
        }

        const winner = gameManager.checkGameEnd(roomId)
        if (winner) {
          io.to(roomId).emit('game:ended', winner)
        }
      } catch (error) {
        socket.emit('error', `Failed to process action: ${error}`)
      }
    })
  })

  // Player ready status
  socket.on('player:ready', async (roomId: string, isReady: boolean) => {
    try {
      const room = await roomManager.setPlayerReady(roomId, socket.id, isReady)
      io.to(roomId).emit('room:updated', room)
      
    } catch (error) {
      socket.emit('error', `Failed to update ready status: ${error}`)
    }
  })

  // Handle disconnection
  socket.on('disconnect', () => {
    const roomsBefore = roomManager.getAllRooms().length
    const roomsBeforeDetails = roomManager.getAllRooms().map(r => ({ id: r.id, name: r.name, players: r.playerCount }))
    console.log(`🚪🚪🚪 User disconnected: ${socket.id} 🚪🚪🚪`)
    console.log(`📊 Rooms before disconnect: ${roomsBefore}`, roomsBeforeDetails)
    
    const emptiedRoomIds = roomManager.removePlayerFromAllRooms(socket.id)
    emptiedRoomIds.forEach((rid) => gameManager.removeGameState(rid))

    const roomsAfter = roomManager.getAllRooms().length
    const roomsAfterDetails = roomManager.getAllRooms().map(r => ({ id: r.id, name: r.name, players: r.playerCount }))
    console.log(`📊 Rooms after disconnect: ${roomsAfter}`, roomsAfterDetails)
    console.log(`🚪🚪🚪 DISCONNECT PROCESSING COMPLETE 🚪🚪🚪`)
    
    // Notify other players in affected rooms
    // This is a simplified version - in production, you'd want to track which rooms the player was in
    socket.broadcast.emit('player:left', socket.id)
  })
})

// Catch-all handler for frontend routing in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../frontend/dist/index.html'))
  })
}

const PORT = process.env.PORT || 5001

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`🎮 Game server ready for multiplayer connections`)
}) 
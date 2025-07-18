import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSocket } from '../contexts/SocketContext'

interface Room {
  id: string
  name: string
  gameType: string
  playerCount: number
  maxPlayers: number
  isStarted: boolean
  isPrivate: boolean
}

const RoomList: React.FC = () => {
  const { socket, isConnected } = useSocket()
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [playerName, setPlayerName] = useState('')

  useEffect(() => {
    // Fetch rooms from the API
    const fetchRooms = async () => {
      try {
        const response = await fetch('/api/rooms')
        const roomData = await response.json()
        setRooms(roomData)
      } catch (error) {
        console.error('Failed to fetch rooms:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchRooms()
    
    // Refresh rooms every 3 seconds
    const interval = setInterval(fetchRooms, 3000)

    // Set up socket event listeners
    if (socket) {
      socket.on('room:joined', (room) => {
        console.log('Successfully joined room:', room)
        navigate(`/room/${room.id}`, { state: { playerName: playerName.trim(), roomData: room } })
      })

      socket.on('error', (error) => {
        console.error('Failed to join room:', error)
        alert(`Failed to join room: ${error}`)
      })
    }

    return () => {
      clearInterval(interval)
      if (socket) {
        socket.off('room:joined')
        socket.off('error')
      }
    }
  }, [socket, navigate, playerName])

  const handleJoinRoom = (roomId: string) => {
    if (!playerName.trim()) {
      alert('Please enter your name first!')
      return
    }

    if (socket && isConnected) {
      socket.emit('room:join', roomId, playerName.trim())
    }
  }

  const getGameTypeIcon = (gameType: string) => {
    switch (gameType) {
      case 'war': return '⚔️'
      case 'speed': return '⚡'
      case 'poker': return '♠️'
      case 'blackjack': return '♥️'
      case 'hearts': return '♦️'
      case 'spades': return '♣️'
      case 'go-fish': return '🐟'
      default: return '🎯'
    }
  }

  const getGameTypeColor = (gameType: string) => {
    switch (gameType) {
      case 'war': return 'bg-red-500'
      case 'speed': return 'bg-yellow-500'
      case 'poker': return 'bg-purple-500'
      case 'blackjack': return 'bg-red-500'
      case 'hearts': return 'bg-pink-500'
      case 'spades': return 'bg-gray-700'
      case 'go-fish': return 'bg-blue-500'
      default: return 'bg-teal-500'
    }
  }

  const getGameTypeDescription = (gameType: string) => {
    switch (gameType) {
      case 'war': return 'Battle card game'
      case 'speed': return 'Fast-paced racing'
      case 'poker': return 'Classic poker'
      case 'blackjack': return 'Beat the dealer'
      case 'hearts': return 'Trick-taking game'
      case 'spades': return 'Partnership game'
      case 'go-fish': return 'Matching game'
      default: return 'Card game'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-800 to-teal-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="text-teal-200 hover:text-white mb-4 inline-block">
            ← Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">🎮 Game Rooms</h1>
          <p className="text-teal-200">Join a room to start playing with others</p>
        </div>

        {/* Player Name Input */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <label className="text-white font-semibold">Your Name:</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="flex-1 px-4 py-2 rounded-lg bg-white/20 text-white placeholder-gray-300 border border-white/30 focus:outline-none focus:ring-2 focus:ring-teal-400"
              maxLength={20}
            />
            <div className="text-sm text-teal-200">
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
          </div>
        </div>

        {/* Room List */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Available Rooms</h2>
            <Link to="/" className="btn btn-primary">
              ➕ Create Room
            </Link>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="loading-spinner mb-4"></div>
              <div className="text-white">Loading rooms...</div>
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-teal-200 mb-4">No rooms available</div>
              <p className="text-teal-300 text-sm mb-6">
                Create the first room to get started!
              </p>
              <Link to="/" className="btn btn-primary">
                Create the First Room
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onJoin={handleJoinRoom}
                  getGameTypeIcon={getGameTypeIcon}
                  getGameTypeColor={getGameTypeColor}
                  getGameTypeDescription={getGameTypeDescription}
                  canJoin={!!playerName.trim() && isConnected}
                />
              ))}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-6 text-center text-teal-200 text-sm">
          <p>💡 Tip: Enter your name above, then click "Join" on any room to start playing!</p>
          <p className="mt-2">🎯 Try the new <strong>War</strong> game for quick 2-player battles!</p>
        </div>
      </div>
    </div>
  )
}

// Room Card Component
interface RoomCardProps {
  room: Room
  onJoin: (roomId: string) => void
  getGameTypeIcon: (gameType: string) => string
  getGameTypeColor: (gameType: string) => string
  getGameTypeDescription: (gameType: string) => string
  canJoin: boolean
}

const RoomCard: React.FC<RoomCardProps> = ({
  room,
  onJoin,
  getGameTypeIcon,
  getGameTypeColor,
  getGameTypeDescription,
  canJoin
}) => {
  const isRoomFull = room.playerCount >= room.maxPlayers
  const isWarGame = room.gameType === 'war'

  return (
    <div className="bg-white/20 rounded-lg p-4 hover:bg-white/30 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${getGameTypeColor(room.gameType)} flex items-center justify-center text-white font-bold text-lg shadow-md`}>
            {getGameTypeIcon(room.gameType)}
          </div>
          <div>
            <h3 className="font-semibold text-white">{room.name}</h3>
            <p className="text-xs text-teal-200">{getGameTypeDescription(room.gameType)}</p>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-1">
          {room.isPrivate && (
            <div className="text-yellow-400 text-xs">🔒 Private</div>
          )}
          {isWarGame && (
            <div className="text-red-400 text-xs">⚔️ Battle</div>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-teal-200">
          Players: {room.playerCount}/{room.maxPlayers}
          {isWarGame && room.playerCount === 0 && (
            <span className="text-yellow-400"> • Ready to battle!</span>
          )}
        </div>
        
        {room.isStarted && (
          <div className="text-xs text-orange-400">🎮 In Progress</div>
        )}
      </div>

      <button
        onClick={() => onJoin(room.id)}
        disabled={!canJoin || isRoomFull || room.isStarted}
        className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
          !canJoin || isRoomFull || room.isStarted
            ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
            : isWarGame
              ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-xl'
              : 'bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl'
        }`}
      >
        {!canJoin 
          ? 'Enter Name First' 
          : isRoomFull 
            ? 'Room Full' 
            : room.isStarted 
              ? 'Game Started' 
              : isWarGame
                ? '⚔️ Join Battle'
                : 'Join Game'
        }
      </button>
    </div>
  )
}

export default RoomList 
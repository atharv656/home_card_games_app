import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSocket } from '../contexts/SocketContext'

const Home: React.FC = () => {
  const { socket, isConnected, connectionError } = useSocket()
  const navigate = useNavigate()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [gameType, setGameType] = useState<'war' | 'poker' | 'blackjack' | 'hearts' | 'go-fish' | 'speed'>('war')

  const handleCreateRoom = async () => {
    if (!socket || !isConnected) {
      alert('Please wait for connection to establish')
      return
    }

    if (!roomName.trim()) {
      alert('Please enter a room name')
      return
    }

    if (!playerName.trim()) {
      alert('Please enter your name')
      return
    }

    setIsCreatingRoom(true)

    try {
      // Create room via socket
      socket.emit('room:create', {
        name: roomName.trim(),
        gameType: gameType,
        maxPlayers: gameType === 'war' || gameType === 'speed' ? 2 : 4,
        isPrivate: false,
        playerName: playerName.trim(),
        settings: {
          maxPlayers: gameType === 'war' || gameType === 'speed' ? 2 : 4,
          allowSpectators: false,
          turnTimeLimit: 60
        }
      })

      // Listen for room creation response
      socket.once('room:joined', (room) => {
        console.log('HOME: Room created via room:joined event:', room)
        console.log('HOME: Room has players:', room.players)
        console.log('HOME: Room players count:', room.players.length)
        setShowCreateModal(false)
        setIsCreatingRoom(false)
        navigate(`/room/${room.id}`, { state: { playerName: playerName.trim(), roomData: room } })
      })

      socket.once('error', (error) => {
        console.error('Failed to create room:', error)
        alert(`Failed to create room: ${error}`)
        setIsCreatingRoom(false)
      })

    } catch (error) {
      console.error('Error creating room:', error)
      alert('Failed to create room')
      setIsCreatingRoom(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-800 to-teal-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold text-white mb-4">🎮 Card Game App</h1>
          <p className="text-xl text-teal-200 mb-8">
            Play classic card games with friends online
          </p>
          
          {/* Connection Status */}
          <div className="mb-6">
            {isConnected ? (
              <div className="flex items-center justify-center text-green-400">
                <div className="w-3 h-3 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                Connected to server
              </div>
            ) : (
              <div className="flex items-center justify-center text-red-400">
                <div className="w-3 h-3 bg-red-400 rounded-full mr-2"></div>
                {connectionError ? `Connection error: ${connectionError}` : 'Connecting...'}
              </div>
            )}
          </div>
        </div>

        {/* Game Options */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-8 shadow-2xl">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            Choose Your Game
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <GameCard 
              title="⚔️ War" 
              description="Simple battle card game"
              players="2 players"
              isNew={true}
            />
            <GameCard 
              title="⚡ Speed" 
              description="Fast-paced card racing game"
              players="2 players"
              isNew={true}
            />
            <GameCard 
              title="♠️ Poker" 
              description="Classic 5-card poker game"
              players="2-4 players"
            />
            <GameCard 
              title="♥️ Blackjack" 
              description="Beat the dealer to 21"
              players="1-6 players"
            />
            <GameCard 
              title="♦️ Hearts" 
              description="Trick-taking strategy game"
              players="4 players"
            />
            <GameCard 
              title="♣️ Go Fish" 
              description="Collect sets of four cards"
              players="2-6 players"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              to="/rooms" 
              className="btn btn-primary text-center py-3 px-6 text-lg font-semibold"
            >
              🎯 Join Game Room
            </Link>
            <button 
              onClick={() => setShowCreateModal(true)}
              className="btn btn-secondary py-3 px-6 text-lg font-semibold"
            >
              ➕ Create Room
            </button>
          </div>
        </div>

        {/* Create Room Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-8 max-w-md w-full mx-4">
              <h3 className="text-2xl font-bold text-white mb-6 text-center">
                Create New Room
              </h3>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-white font-semibold mb-2">Room Name</label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Enter room name"
                    className="w-full px-4 py-2 rounded-lg bg-white/20 text-white placeholder-gray-300 border border-white/30 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    maxLength={30}
                  />
                </div>
                
                <div>
                  <label className="block text-white font-semibold mb-2">Your Name</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-4 py-2 rounded-lg bg-white/20 text-white placeholder-gray-300 border border-white/30 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    maxLength={20}
                  />
                </div>
                
                <div>
                  <label className="block text-white font-semibold mb-2">Game Type</label>
                  <select
                    value={gameType}
                    onChange={(e) => setGameType(e.target.value as any)}
                    className="w-full px-4 py-2 rounded-lg bg-white/20 text-white border border-white/30 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="war" className="bg-gray-800">⚔️ War (2 players)</option>
                    <option value="speed" className="bg-gray-800">⚡ Speed (2 players)</option>
                    <option value="poker" className="bg-gray-800">♠️ Poker (2-4 players)</option>
                    <option value="blackjack" className="bg-gray-800">♥️ Blackjack (1-6 players)</option>
                    <option value="hearts" className="bg-gray-800">♦️ Hearts (4 players)</option>
                    <option value="go-fish" className="bg-gray-800">♣️ Go Fish (2-6 players)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleCreateRoom}
                  disabled={!isConnected || !roomName.trim() || !playerName.trim() || isCreatingRoom}
                  className={`flex-1 py-3 px-6 rounded-lg font-semibold ${
                    isConnected && roomName.trim() && playerName.trim() && !isCreatingRoom
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  {isCreatingRoom ? 'Creating...' : '🚀 Create Room'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateModal(false)
                    setRoomName('')
                    setPlayerName('')
                  }}
                  className="flex-1 py-3 px-6 rounded-lg font-semibold bg-gray-600 hover:bg-gray-700 text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Features */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard 
            icon="🎲" 
            title="Real-time Multiplayer"
            description="Play with friends in real-time"
          />
          <FeatureCard 
            icon="🎨" 
            title="Beautiful Cards"
            description="Stunning card designs with animations"
          />
          <FeatureCard 
            icon="📱" 
            title="Cross-platform"
            description="Play on desktop, tablet, or mobile"
          />
        </div>
      </div>
    </div>
  )
}

// Game Card Component
interface GameCardProps {
  title: string
  description: string
  players: string
  isNew?: boolean
}

const GameCard: React.FC<GameCardProps> = ({ title, description, players, isNew = false }) => (
  <div className="bg-white/20 rounded-lg p-4 hover:bg-white/30 transition-colors cursor-pointer relative">
    {isNew && (
      <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold">
        NEW!
      </div>
    )}
    <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
    <p className="text-teal-200 text-sm mb-1">{description}</p>
    <p className="text-teal-300 text-xs">{players}</p>
  </div>
)

// Feature Card Component
interface FeatureCardProps {
  icon: string
  title: string
  description: string
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description }) => (
  <div className="text-center">
    <div className="text-3xl mb-2">{icon}</div>
    <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
    <p className="text-teal-200 text-sm">{description}</p>
  </div>
)

export default Home 
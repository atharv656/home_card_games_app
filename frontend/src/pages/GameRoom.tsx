import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useSocket } from '../contexts/SocketContext'
import { useGameState } from '../contexts/GameStateContext'
import Card from '../components/Card'
import Hand from '../components/Hand'

// Import game data types from shared types
import type { WarGameData, SpeedGameData, Card as CardType } from '../../../shared/types'

const GameRoom: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { socket, isConnected } = useSocket()
  const { 
    currentRoom, 
    gameState, 
    currentPlayer, 
    selectedCards, 
    isPlayerTurn, 
    isGameStarted,
    setCurrentRoom,
    setGameState,
    setCurrentPlayer,
    setIsGameStarted
  } = useGameState()

  const [isReady, setIsReady] = useState(false)
  const [battleResult, setBattleResult] = useState<any>(null)
  const [showBattleResult, setShowBattleResult] = useState(false)

  const isWarGame = currentRoom?.gameType === 'war'
  const isSpeedGame = currentRoom?.gameType === 'speed'
  const warData = gameState?.gameData as WarGameData | undefined
  const speedData = gameState?.gameData as SpeedGameData | undefined

  useEffect(() => {
    if (!roomId) {
      navigate('/')
      return
    }

    // If we have room data from navigation, use it initially
    if (location.state?.roomData) {
      console.log('FRONTEND: Using room data from navigation:', location.state.roomData)
      setCurrentRoom(location.state.roomData)
    }

    // Set up socket event listeners
    if (socket) {
      socket.on('room:joined', (room) => {
        console.log('FRONTEND: Joined room via socket:', room)
        setCurrentRoom(room)
        
        // Set current player based on socket ID and sync ready state
        const myPlayer = room.players.find(p => p.id === socket.id)
        if (myPlayer) {
          setCurrentPlayer(myPlayer)
          setIsReady(myPlayer.isReady)
        }
      })

      socket.on('room:updated', (room) => {
        console.log('Room updated:', room)
        setCurrentRoom(room)
        
        // Update current player information and sync ready state
        const myPlayer = room.players.find(p => p.id === socket.id)
        if (myPlayer) {
          setCurrentPlayer(myPlayer)
          setIsReady(myPlayer.isReady)
        }
      })

      socket.on('game:started', (gameStateData) => {
        console.log('Game started:', gameStateData)
        setGameState(gameStateData)
        setIsGameStarted(true)
      })

      socket.on('game:updated', (gameStateData) => {
        console.log('Game updated:', gameStateData)
        setGameState(gameStateData)
        
        // Handle Speed game restart - reset to waiting state
        if (isSpeedGame && gameStateData.gameData?.gamePhase === 'waiting_for_ready') {
          setIsGameStarted(false)
          console.log('Speed game restarted - resetting to waiting state')
        }
        
        // Handle War-specific battle results
        if (isWarGame && gameStateData.phase === 'battle') {
          const warGameData = gameStateData.gameData as WarGameData
          if (warGameData.battleResult === 'winner' && warGameData.lastBattleWinner) {
            setBattleResult({
              winner: warGameData.lastBattleWinner,
              isWar: false
            })
            setShowBattleResult(true)
          }
        } else if (isWarGame && gameStateData.phase === 'war') {
          setBattleResult({
            winner: null,
            isWar: true
          })
          setShowBattleResult(true)
        }
      })

      socket.on('game:ended', (winner) => {
        console.log('Game ended, winner:', winner)
        alert(`Game Over! Winner: ${winner.name}`)
      })

      socket.on('battle:result', (result) => {
        console.log('Battle result:', result)
        setBattleResult(result)
        setShowBattleResult(true)
      })

      socket.on('error', (error) => {
        console.error('Socket error:', error)
        alert(`Error: ${error}`)
      })

      // Only try to join if we don't have room data or we're not in the room
      const timeoutId = setTimeout(() => {
        const playerName = location.state?.playerName || `Player_${Date.now()}`
        const roomData = location.state?.roomData
        
        // Check if we're already in the room
        const isAlreadyInRoom = roomData?.players?.some((p: any) => p.id === socket.id)
        
        if (!isAlreadyInRoom) {
          console.log('Attempting to join room:', playerName)
          socket.emit('room:join', roomId, playerName)
        } else {
          console.log('Already in room, skipping join attempt')
        }
      }, 100) // Small delay to allow navigation state to be processed

      return () => {
        clearTimeout(timeoutId)
        socket.off('room:joined')
        socket.off('room:updated')
        socket.off('game:started')
        socket.off('game:updated')
        socket.off('game:ended')
        socket.off('battle:result')
        socket.off('error')
      }
    }

    return () => {
      // No cleanup needed if no socket
    }
  }, [roomId, socket, navigate, location.state])

  const handleReady = () => {
    if (socket && roomId) {
      const newReadyState = !isReady
      setIsReady(newReadyState)
      socket.emit('player:ready', roomId, newReadyState)
    }
  }

  const handleStartGame = () => {
    if (socket && roomId) {
      socket.emit('game:start', roomId)
    }
  }

  const handleLeaveRoom = () => {
    if (socket && roomId) {
      socket.emit('room:leave', roomId)
    }
    navigate('/')
  }

  // War-specific actions
  const handleRevealCard = () => {
    if (socket && roomId && currentPlayer) {
      console.log('Revealing card for player:', currentPlayer.id)
      socket.emit('game:action', roomId, {
        type: 'reveal_card',
        playerId: currentPlayer.id,
        data: {}
      })
    }
  }

  const handleAcknowledgeResult = () => {
    if (socket && roomId && currentPlayer) {
      socket.emit('game:action', roomId, {
        type: 'acknowledge_result',
        playerId: currentPlayer.id,
        data: {}
      })
      setShowBattleResult(false)
    }
  }

  // const getPlayerById = (playerId: string) => {
  //   return currentRoom?.players?.find(p => p.id === playerId)
  // }

  const getMyPlayer = () => {
    return currentRoom?.players?.find(p => p.id === currentPlayer?.id)
  }

  const getOpponentPlayer = () => {
    return currentRoom?.players?.find(p => p.id !== currentPlayer?.id)
  }

  // Speed game helper functions
  const handleSpeedReadyToStart = () => {
    if (socket && roomId && currentPlayer) {
      socket.emit('game:action', roomId, {
        type: 'ready_to_start',
        playerId: currentPlayer.id,
        data: {}
      })
    }
  }

  const handlePlayCard = (cardId: string, targetPile: 'left' | 'right') => {
    if (socket && roomId && currentPlayer) {
      socket.emit('game:action', roomId, {
        type: 'play_card',
        playerId: currentPlayer.id,
        data: { cardId, targetPile }
      })
    }
  }

  const handleFlipNewCards = () => {
    if (socket && roomId && currentPlayer) {
      socket.emit('game:action', roomId, {
        type: 'flip_new_cards',
        playerId: currentPlayer.id,
        data: {}
      })
    }
  }

  const handleRestartGame = () => {
    if (socket && roomId && currentPlayer) {
      socket.emit('game:action', roomId, {
        type: 'restart_game',
        playerId: currentPlayer.id,
        data: {}
      })
    }
  }

  const canPlayCard = (card: CardType, targetPile: 'left' | 'right') => {
    if (!speedData) return false
    
    const playPile = targetPile === 'left' ? speedData.leftPlayPile : speedData.rightPlayPile
    if (playPile.length === 0) return false
    
    const topCard = playPile[playPile.length - 1]
    
    const cardValue = getCardValue(card)
    const topValue = getCardValue(topCard)
    
    const diff = Math.abs(cardValue - topValue)
    return diff === 1 || (cardValue === 14 && topValue === 13) || (cardValue === 13 && topValue === 14) || (cardValue === 14 && topValue === 2) || (cardValue === 2 && topValue === 14)
  }

  const getCardValue = (card: CardType) => {
    switch (card.rank) {
      case 'A': return 14
      case 'K': return 13
      case 'Q': return 12
      case 'J': return 11
      case '10': return 10
      case '9': return 9
      case '8': return 8
      case '7': return 7
      case '6': return 6
      case '5': return 5
      case '4': return 4
      case '3': return 3
      case '2': return 2
      default: return 0
    }
  }

  const renderSpeedGameBoard = () => {
    if (!isSpeedGame || !gameState || !speedData) {
      return null
    }

    const myPlayer = getMyPlayer()
    const opponent = getOpponentPlayer()

    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 mb-2">
        <div className="flex gap-4">
          {/* Main Game Board */}
          <div className="flex-1">
            {/* Game Board */}
            <div className="flex justify-center items-center mb-4">
              <div className="grid grid-cols-4 gap-8">
                {/* Left Stock Pile */}
                <div className="text-center">
                  <div className="text-white font-semibold mb-1 text-sm">Stock</div>
                  <div className="w-24 h-28 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                    {speedData.leftStockPile.length}
                  </div>
                </div>

                {/* Left Play Pile */}
                <div className="text-center">
                  <div className="text-white font-semibold mb-1 text-sm">Play</div>
                  <div className="w-24 h-28  rounded-lg flex items-center justify-center">
                    {speedData.leftPlayPile.length > 0 ? (
                      <div className="scale-[0.65]">
                        <Card
                          card={speedData.leftPlayPile[speedData.leftPlayPile.length - 1]}
                          isDraggable={false}
                          isPlayable={false}
                        />
                      </div>
                    ) : (
                      <div className="text-white font-bold text-xs">Empty</div>
                    )}
                  </div>
                </div>

                {/* Right Play Pile */}
                <div className="text-center">
                  <div className="text-white font-semibold mb-1 text-sm">Play</div>
                  <div className="w-24 h-28 rounded-lg flex items-center justify-center">
                    {speedData.rightPlayPile.length > 0 ? (
                      <div className="scale-[0.65]">
                        <Card
                          card={speedData.rightPlayPile[speedData.rightPlayPile.length - 1]}
                          isDraggable={false}
                          isPlayable={false}
                        />
                      </div>
                    ) : (
                      <div className="text-white font-bold text-xs">Empty</div>
                    )}
                  </div>
                </div>

                {/* Right Stock Pile */}
                <div className="text-center">
                  <div className="text-white font-semibold mb-1 text-sm">Stock</div>
                  <div className="w-24 h-28 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                    {speedData.rightStockPile.length}
                  </div>
                </div>
              </div>
            </div>

            {/* Player Information */}
            <div className="grid grid-cols-2 gap-8 mb-4">
              <div className="text-center">
                <div className="text-white font-semibold text-sm">{myPlayer?.name} (You)</div>
                <div className="text-teal-200 text-xs">
                  Hand: {currentPlayer?.hand?.length || 0} • Deck: {speedData.playerDecks[currentPlayer?.id || '']?.length || 0}
                </div>
              </div>
              <div className="text-center">
                <div className="text-white font-semibold text-sm">{opponent?.name}</div>
                <div className="text-teal-200 text-xs">
                  Hand: {opponent?.hand?.length || 0} • Deck: {speedData.playerDecks[opponent?.id || '']?.length || 0}
                </div>
              </div>
            </div>
          </div>

          {/* Game Controls - Right Side */}
          <div className="w-48 flex flex-col justify-center">
            {speedData.gamePhase === 'waiting_for_ready' && (
              <button
                onClick={handleSpeedReadyToStart}
                className="px-4 py-3 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white text-sm mb-4"
              >
                ⚡ Start Speed Game
              </button>
            )}

            {speedData.gamePhase === 'playing' && (
              <div className="space-y-3">
                <div className="text-white font-semibold text-sm text-center">
                  Click cards in your hand to play them!
                </div>
                <button
                  onClick={handleFlipNewCards}
                  className="w-full px-3 py-2 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white text-sm"
                >
                  🔄 Flip New Cards {speedData.flipRequests?.length > 0 && `(${speedData.flipRequests.length}/2)`}
                </button>
                <button
                  onClick={handleRestartGame}
                  className="w-full px-3 py-2 rounded-lg font-semibold bg-orange-600 hover:bg-orange-700 text-white text-sm"
                >
                  🔄 Restart Game {speedData.restartRequests?.length > 0 && `(${speedData.restartRequests.length}/2)`}
                </button>
                {speedData.flipRequests?.length > 0 && speedData.flipRequests.length < 2 && (
                  <div className="text-teal-200 text-xs text-center">
                    Waiting for other player...
                  </div>
                )}
                {speedData.restartRequests?.length > 0 && speedData.restartRequests.length < 2 && (
                  <div className="text-orange-200 text-xs text-center">
                    Waiting for other player...
                  </div>
                )}
              </div>
            )}

            {speedData.gamePhase === 'ended' && (
              <div className="text-center space-y-3">
                <div className="text-lg font-bold text-white">
                  {speedData.winner === currentPlayer?.id ? "🏆 You Won!" : "😞 You Lost!"}
                </div>
                <button
                  onClick={handleRestartGame}
                  className="w-full px-3 py-2 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white text-sm"
                >
                  🔄 Play Again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderWarGameBoard = () => {
    if (!isWarGame || !gameState || !warData) {
      return null
    }

    const myPlayer = getMyPlayer()
    const opponent = getOpponentPlayer()

    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-3">
        <div className="game-table rounded-xl p-8">
          <div className="text-center mb-4">
            <h3 className="text-2xl font-bold text-white mb-2">War Battle</h3>
            <div className="text-teal-200">
              Round: {gameState.round} • Wars: {warData.warCount || 0}
            </div>
          </div>

          {/* Battle Area */}
          <div className="flex justify-center items-center gap-12 mb-8">
            {/* Opponent's Battle Card */}
            <div className="text-center">
              <div className="text-white font-semibold mb-2">{opponent?.name}</div>
              <div className="mb-2 text-teal-200">Cards: {opponent?.score || 0}</div>
              <div className="flex justify-center">
                {warData.battleCards && warData.battleCards[opponent?.id || ''] && warData.battleCards[opponent?.id || ''].length > 0 ? (
                  <Card
                    card={warData.battleCards![opponent?.id || ''][warData.battleCards![opponent?.id || ''].length - 1]}
                    isDraggable={false}
                    isPlayable={false}
                  />
                ) : (
                  <div className="w-20 h-28 bg-gray-600 rounded-lg flex items-center justify-center text-white">
                    ?
                  </div>
                )}
              </div>
            </div>

            {/* VS */}
            <div className="text-4xl font-bold text-white">VS</div>

            {/* My Battle Card */}
            <div className="text-center">
              <div className="text-white font-semibold mb-2">{myPlayer?.name} (You)</div>
              <div className="mb-2 text-teal-200">Cards: {myPlayer?.score || 0}</div>
              <div className="flex justify-center">
                {warData.battleCards && warData.battleCards[myPlayer?.id || ''] && warData.battleCards[myPlayer?.id || ''].length > 0 ? (
                  <Card
                    card={warData.battleCards![myPlayer?.id || ''][warData.battleCards![myPlayer?.id || ''].length - 1]}
                    isDraggable={false}
                    isPlayable={false}
                  />
                ) : (
                  <div className="w-20 h-28 bg-gray-600 rounded-lg flex items-center justify-center text-white">
                    ?
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* War Pile */}
          {warData.warPile && warData.warPile.length > 0 && (
            <div className="text-center mb-6">
              <div className="text-white font-semibold mb-2">War Pile</div>
              <div className="text-teal-200 mb-2">{warData.warPile.length} cards</div>
              <div className="flex justify-center">
                <div className="w-20 h-28 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold">
                  WAR
                </div>
              </div>
            </div>
          )}

          {/* Game Actions */}
          <div className="text-center">
            {gameState.phase === 'playing' && (
              <div>
                <div className="text-white font-semibold mb-4">
                  {(() => {
                    if (!myPlayer || myPlayer.hand.length === 0) {
                      return "You're out of cards!"
                    }
                    
                    const hasRevealedCard = warData.battleCards && warData.battleCards[myPlayer.id] && warData.battleCards[myPlayer.id].length > 0
                    
                    if (hasRevealedCard) {
                      return "Card revealed! Waiting for opponent..."
                    }
                    
                    return "Click to reveal your card!"
                  })()}
                </div>
                <button
                  onClick={handleRevealCard}
                  disabled={(() => {
                    if (!myPlayer || myPlayer.hand.length === 0) return true
                    
                    const hasRevealedCard = warData.battleCards && warData.battleCards[myPlayer.id] && warData.battleCards[myPlayer.id].length > 0
                    return hasRevealedCard
                  })()}
                  className={`px-8 py-3 rounded-lg font-semibold text-lg ${
                    (() => {
                      if (!myPlayer || myPlayer.hand.length === 0) {
                        return 'bg-gray-600 text-gray-300 cursor-not-allowed'
                      }
                      
                      const hasRevealedCard = warData.battleCards && warData.battleCards[myPlayer.id] && warData.battleCards[myPlayer.id].length > 0
                      
                      if (hasRevealedCard) {
                        return 'bg-gray-600 text-gray-300 cursor-not-allowed'
                      }
                      
                      return 'bg-red-600 hover:bg-red-700 text-white'
                    })()
                  }`}
                >
                  ⚔️ Reveal Card
                </button>
              </div>
            )}

            {gameState.phase === 'war' && (
              <div>
                <div className="text-yellow-400 font-bold mb-4 text-xl">
                  🔥 WAR! 🔥
                </div>
                <div className="text-white mb-4">
                  Cards are tied! Click to reveal another card.
                </div>
                <button
                  onClick={handleRevealCard}
                  disabled={(() => {
                    if (!myPlayer || myPlayer.hand.length === 0) return true
                    
                    const hasRevealedCard = warData.battleCards && warData.battleCards[myPlayer.id] && warData.battleCards[myPlayer.id].length > 0
                    return hasRevealedCard
                  })()}
                  className={`px-8 py-3 rounded-lg font-semibold text-lg ${
                    (() => {
                      if (!myPlayer || myPlayer.hand.length === 0) {
                        return 'bg-gray-600 text-gray-300 cursor-not-allowed'
                      }
                      
                      const hasRevealedCard = warData.battleCards && warData.battleCards[myPlayer.id] && warData.battleCards[myPlayer.id].length > 0
                      
                      if (hasRevealedCard) {
                        return 'bg-gray-600 text-gray-300 cursor-not-allowed'
                      }
                      
                      return 'bg-yellow-600 hover:bg-yellow-700 text-white'
                    })()
                  }`}
                >
                  ⚔️ War Card
                </button>
              </div>
            )}

            {gameState.phase === 'battle' && showBattleResult && (
              <div>
                <div className="text-white font-semibold mb-4">
                  {battleResult?.winner === myPlayer?.id ? "🎉 You won this battle!" : "😞 You lost this battle!"}
                </div>
                <button
                  onClick={handleAcknowledgeResult}
                  className="px-8 py-3 rounded-lg font-semibold text-lg bg-green-600 hover:bg-green-700 text-white"
                >
                  ✅ Continue
                </button>
              </div>
            )}

            {gameState.phase === 'ended' && (
              <div>
                <div className="text-2xl font-bold text-white mb-4">
                  {warData.lastBattleWinner === myPlayer?.id ? "🏆 You Won!" : "😞 You Lost!"}
                </div>
                <button
                  onClick={handleLeaveRoom}
                  className="px-8 py-3 rounded-lg font-semibold text-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  🚪 Leave Room
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!roomId) {
    return <div>Invalid room</div>
  }



  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-800 to-teal-900 px-3 py-1">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-1">
          <h1 className="text-xl font-bold text-white">
            🎮 {currentRoom?.name || 'Game Room'}
          </h1>
          <p className="text-teal-200 text-xs">
            {currentRoom?.gameType || 'Unknown Game'} • Room ID: {roomId}
          </p>
        </div>

        {/* Main Layout - Sidebar + Game Area */}
        <div className="flex gap-3">
          {/* Left Sidebar - Players & Game Status */}
          <div className="w-60 space-y-2">
            {/* Connection & Leave Controls */}
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-2">
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleLeaveRoom}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-semibold"
                >
                  🚪 Leave Room
                </button>
                <div className="text-xs text-center">
                  {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
                </div>
              </div>
            </div>

            {/* Game Status */}
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-2">
              <div className="text-white text-sm font-semibold mb-1">Game Status</div>
              <div className="text-teal-200 text-xs mb-1">
                Players: {currentRoom?.players?.length || 0}/{currentRoom?.maxPlayers || 4}
        </div>
              {isGameStarted && (
                <div className="text-yellow-400 text-xs">
                  🎮 Game in Progress
      </div>
              )}
              
              {!isGameStarted && (
                <div className="space-y-2 mt-2">
                  <button
                    onClick={handleReady}
                    className={`w-full px-3 py-2 rounded text-sm font-semibold ${
                      isReady 
                        ? 'bg-green-600 text-white' 
                        : 'bg-gray-600 text-gray-300'
                    }`}
                  >
                    {isReady ? '✅ Ready' : '⏳ Not Ready'}
                  </button>
                  
                  {((isWarGame && isReady) || (isSpeedGame && isReady)) && (
                    <button
                      onClick={handleStartGame}
                      className={`w-full px-3 py-2 rounded text-sm font-semibold ${
                        isWarGame 
                          ? 'bg-green-600 hover:bg-green-700 text-white' 
                          : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                      } disabled:bg-gray-600 disabled:cursor-not-allowed`}
                      disabled={!isReady || (currentRoom?.players?.length || 0) !== 2}
                    >
                      {(currentRoom?.players?.length || 0) !== 2 
                        ? 'Need 2 Players' 
                        : isWarGame 
                          ? '🚀 Start War' 
                          : '⚡ Start Speed'
                      }
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Players List */}
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-2">
              <h3 className="text-white font-semibold mb-1 text-sm">Players</h3>
              <div className="space-y-1">
                {currentRoom?.players?.map((player) => (
                  <div 
                    key={player.id}
                    className={`p-1.5 rounded text-sm ${
                      player.isActive 
                        ? 'bg-green-500/20 border border-green-500' 
                        : 'bg-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white text-xs">
                          {player.name} {player.id === currentPlayer?.id ? '(You)' : ''}
                        </div>
                        <div className="text-xs text-teal-200">
                          Cards: {player.score || player.hand?.length || 0}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {player.isReady && (
                          <div className="text-green-400 text-xs">✅</div>
                        )}
                        {player.isActive && (
                          <div className="text-yellow-400 text-xs">🎯</div>
                )}
              </div>
            </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Game Area */}
          <div className="flex-1">

        {/* War Game Board */}
        {isWarGame && isGameStarted && renderWarGameBoard()}

        {/* Speed Game Board */}
        {isSpeedGame && isGameStarted && renderSpeedGameBoard()}

        {/* Generic Game Board (for non-War and non-Speed games) */}
        {!isWarGame && !isSpeedGame && isGameStarted && (
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-3">
            <div className="game-table rounded-xl p-8">
              <div className="text-center mb-4">
                <h3 className="text-2xl font-bold text-white mb-2">Game Board</h3>
                <div className="text-teal-200">
                  Turn: {gameState?.turn || 1} • Round: {gameState?.round || 1}
                </div>
              </div>

              {/* Discard Pile */}
              <div className="text-center mb-6">
                <div className="text-white font-semibold mb-2">Discard Pile</div>
                <div className="flex justify-center">
                  {gameState?.discardPile && gameState.discardPile.length > 0 ? (
                    <Card
                      card={gameState.discardPile[gameState.discardPile.length - 1]}
                      isDraggable={false}
                      isPlayable={false}
                    />
                  ) : (
                    <div className="w-20 h-28 bg-gray-600 rounded-lg flex items-center justify-center text-white">
                      Empty
                    </div>
                  )}
                </div>
              </div>

              {/* Game Actions */}
              {isPlayerTurn && (
                <div className="text-center mb-6">
                  <div className="text-yellow-400 font-semibold mb-4">
                    🎯 Your Turn!
                  </div>
                  <div className="flex justify-center gap-4">
                    <button
                      className="btn btn-primary"
                    >
                      🃏 Draw Card
                    </button>
                    <button
                      className="btn btn-secondary"
                    >
                      ⏭️ Pass Turn
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Player's Hand (for Speed games) */}
        {isSpeedGame && currentPlayer && currentPlayer.hand && currentPlayer.hand.length > 0 && speedData?.gamePhase === 'playing' && (
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-bold text-white">Your Hand ({currentPlayer.hand.length} cards)</h3>
              <div className="flex items-center gap-2">
                <span className="text-teal-200 text-sm">Deck:</span>
                <div className="w-12 h-16 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-sm">
                  {speedData.playerDecks[currentPlayer.id]?.length || 0}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              {currentPlayer.hand.map((card) => (
                <div key={card.id} className="relative">
                  <div
                    onClick={() => {
                      // Try to play on left pile first
                      const canPlayLeft = speedData.leftPlayPile.length > 0 && canPlayCard(card, 'left')
                      const canPlayRight = speedData.rightPlayPile.length > 0 && canPlayCard(card, 'right')
                      
                      if (canPlayLeft && canPlayRight) {
                        // Player can choose - for now, prefer left pile
                        handlePlayCard(card.id, 'left')
                      } else if (canPlayLeft) {
                        handlePlayCard(card.id, 'left')
                      } else if (canPlayRight) {
                        handlePlayCard(card.id, 'right')
                      }
                    }}
                    className="cursor-pointer transition-all duration-200 transform hover:scale-105 hover:-translate-y-2"
                  >
                    <div className="scale-75">
                      <Card
                        card={card}
                        isDraggable={false}
                        isPlayable={false}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Player's Hand (for non-War and non-Speed games) */}
        {!isWarGame && !isSpeedGame && currentPlayer && currentPlayer.hand && currentPlayer.hand.length > 0 && (
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Your Hand</h3>
            <Hand
              cards={currentPlayer.hand}
              selectedCards={selectedCards}
              isPlayerTurn={isPlayerTurn}
              layout="fan"
            />
          </div>
        )}

        {/* Demo Cards (when no game is active) */}
        {!isGameStarted && (
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">
              {isWarGame ? 'War Game Preview' : isSpeedGame ? 'Speed Game Preview' : 'Demo Cards'}
            </h3>
            <div className="flex justify-center gap-4">
              <Card
                card={{
                  id: 'demo-1',
                  suit: 'hearts',
                  rank: 'A',
                  faceUp: true
                }}
                isDraggable={false}
                isPlayable={false}
              />
              <Card
                card={{
                  id: 'demo-2',
                  suit: 'spades',
                  rank: 'K',
                  faceUp: true
                }}
                isDraggable={false}
                isPlayable={false}
              />
              <Card
                card={{
                  id: 'demo-3',
                  suit: 'diamonds',
                  rank: 'Q',
                  faceUp: true
                }}
                isDraggable={false}
                isPlayable={false}
              />
              <Card
                card={{
                  id: 'demo-4',
                  suit: 'clubs',
                  rank: 'J',
                  faceUp: true
                }}
                isDraggable={false}
                isPlayable={false}
              />
            </div>
            <div className="text-center mt-4 text-teal-200">
              {isWarGame 
                ? 'In War, you and your opponent will reveal cards from your decks. Higher card wins!'
                : isSpeedGame
                ? 'In Speed, race to play all your cards! Play cards consecutively (A-2-3, K-Q-J, etc.) on the center piles. First to empty your hand wins!'
                : 'These are demo cards. Start a game to see your actual hand!'
              }
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default GameRoom 
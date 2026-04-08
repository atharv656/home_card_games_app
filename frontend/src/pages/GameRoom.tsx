import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useSocket } from '../contexts/SocketContext'
import { useGameState } from '../contexts/GameStateContext'
import Card from '../components/Card'
import Hand from '../components/Hand'
import { saveRejoinSession, loadRejoinSession, clearRejoinSession } from '../lib/rejoinSession'
import { savePlayerName } from '../lib/playerName'

// Import game data types from shared types
import type { WarGameData, SpeedGameData, ThreeOhFourGameData, Card as CardType, Suit } from '../../../shared/types'

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
  const [bidInput, setBidInput] = useState('')
  const [partnerSuit, setPartnerSuit] = useState<'spades' | 'hearts' | 'diamonds' | 'clubs' | null>(null)
  const [partnerRank, setPartnerRank] = useState<'J' | '9' | 'A' | '10' | 'K' | 'Q' | '8' | '7' | null>(null)
  const [callPartnerThisLead, setCallPartnerThisLead] = useState(false)
  const [marriageSuitSelection, setMarriageSuitSelection] = useState<Suit[]>([])
  /** In-page celebration when server emits game:ended (War / Speed); cleared on new game */
  const [matchWinnerCelebration, setMatchWinnerCelebration] = useState<{ winnerName: string } | null>(null)
  /** 304: show panel for the most recently completed trick (empty on first trick) */
  const [showLastTrickLookback, setShowLastTrickLookback] = useState(false)
  /** Avoid duplicate room:join when both connect and setTimeout fire before rejoin token exists */
  const initialJoinSentRef = useRef(false)
  /** After rejoin/join, next game:updated must replace client state (304 round guard can reject valid server snapshots). Set from rejoin:issued before game:updated. */
  const skip304StaleGuardOnceRef = useRef(false)

  const isWarGame = currentRoom?.gameType === 'war'
  const isSpeedGame = currentRoom?.gameType === 'speed'
  const is304Game = currentRoom?.gameType === '304'
  const warData = gameState?.gameData as WarGameData | undefined
  const speedData = gameState?.gameData as SpeedGameData | undefined
  const threeOhFourData = gameState?.gameData as ThreeOhFourGameData | undefined

  useEffect(() => {
    if (!roomId) {
      navigate('/')
      return
    }

    initialJoinSentRef.current = false
    skip304StaleGuardOnceRef.current = false

    if (location.state?.roomData) {
      console.log('FRONTEND: Using room data from navigation:', location.state.roomData)
      setCurrentRoom(location.state.roomData)
    }

    if (socket) {
      const tryRejoinOrJoin = () => {
        if (!socket.connected || !roomId) return
        const stored = loadRejoinSession()
        if (stored?.roomId === roomId && stored.rejoinToken) {
          console.log('Attempting room:rejoin')
          socket.emit('room:rejoin', roomId, stored.rejoinToken)
          return
        }
        if (initialJoinSentRef.current) return
        const roomData = location.state?.roomData
        const isAlreadyInRoom = roomData?.players?.some((p: { id: string }) => p.id === socket.id)
        if (isAlreadyInRoom) {
          console.log('Already in room, skipping join attempt')
          return
        }
        initialJoinSentRef.current = true
        const playerName = location.state?.playerName || `Player_${Date.now()}`
        console.log('Attempting to join room:', playerName)
        socket.emit('room:join', roomId, playerName)
      }

      const onRejoinIssued = (payload: { roomId: string; rejoinToken: string }) => {
        if (payload.roomId !== roomId) return
        skip304StaleGuardOnceRef.current = true
        const playerName =
          (location.state as { playerName?: string } | undefined)?.playerName || 'Player'
        saveRejoinSession({
          roomId: payload.roomId,
          rejoinToken: payload.rejoinToken,
          playerName,
        })
      }

      socket.on('rejoin:issued', onRejoinIssued)

      socket.on('room:joined', (room) => {
        console.log('FRONTEND: Joined room via socket:', room)
        setCurrentRoom(room)

        const myPlayer = room.players.find((p) => p.id === socket.id)
        if (myPlayer) {
          savePlayerName(myPlayer.name)
          setCurrentPlayer(myPlayer)
          setIsReady(myPlayer.isReady)
        }
      })

      socket.on('room:updated', (room) => {
        console.log('Room updated:', room)
        setCurrentRoom(room)

        const myPlayer = room.players.find((p) => p.id === socket.id)
        if (myPlayer) {
          setCurrentPlayer(myPlayer)
          setIsReady(myPlayer.isReady)
        }
      })

      socket.on('game:started', (gameStateData) => {
        console.log('Game started:', gameStateData)
        setGameState(gameStateData)
        setIsGameStarted(true)
        setMatchWinnerCelebration(null)
      })

      socket.on('game:updated', (gameStateData) => {
        console.log('Game updated:', gameStateData)
        setGameState((prev) => {
          if (skip304StaleGuardOnceRef.current) {
            skip304StaleGuardOnceRef.current = false
            if (import.meta.env.DEV) {
              console.info('[CardGame] Applied full game:updated after join/rejoin (skipped 304 stale guard)')
            }
            return gameStateData
          }
          const gtNew = (gameStateData.gameData as { gameType?: string })?.gameType
          const gtPrev = (prev?.gameData as { gameType?: string })?.gameType
          if (gtNew === '304' && gtPrev === '304') {
            const rNew = gameStateData.round ?? 0
            const rPrev = prev?.round ?? 0
            if (rNew < rPrev) {
              console.warn('Ignoring stale game:updated (304 round went backwards)')
              return prev
            }
          }
          return gameStateData
        })

        const gt = (gameStateData.gameData as { gameType?: string })?.gameType

        if (gt === 'speed' && gameStateData.gameData?.gamePhase === 'waiting_for_ready') {
          setIsGameStarted(false)
          setMatchWinnerCelebration(null)
          console.log('Speed game restarted - resetting to waiting state')
        }

        if (gt === 'war' && gameStateData.phase === 'battle') {
          const warGameData = gameStateData.gameData as WarGameData
          if (warGameData.battleResult === 'winner' && warGameData.lastBattleWinner) {
            setBattleResult({
              winner: warGameData.lastBattleWinner,
              isWar: false,
            })
            setShowBattleResult(true)
          }
        } else if (gt === 'war' && gameStateData.phase === 'war') {
          setBattleResult({
            winner: null,
            isWar: true,
          })
          setShowBattleResult(true)
        }
      })

      socket.on('game:ended', (winner) => {
        console.log('Game ended, winner:', winner)
        setMatchWinnerCelebration({ winnerName: winner.name })
      })

      socket.on('battle:result', (result) => {
        console.log('Battle result:', result)
        setBattleResult(result)
        setShowBattleResult(true)
      })

      socket.on('error', (error) => {
        console.error('Socket error:', error)
        const msg = String(error)
        if (msg.startsWith('[rejoin]')) {
          clearRejoinSession()
          initialJoinSentRef.current = false
          const playerName = location.state?.playerName || `Player_${Date.now()}`
          socket.emit('room:join', roomId, playerName)
          return
        }
        alert(`Error: ${error}`)
      })

      const timeoutId = setTimeout(tryRejoinOrJoin, 100)
      socket.on('connect', tryRejoinOrJoin)

      return () => {
        clearTimeout(timeoutId)
        socket.off('rejoin:issued', onRejoinIssued)
        socket.off('room:joined')
        socket.off('room:updated')
        socket.off('game:started')
        socket.off('game:updated')
        socket.off('game:ended')
        socket.off('battle:result')
        socket.off('error')
        socket.off('connect', tryRejoinOrJoin)
      }
    }

    return () => {}
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
    clearRejoinSession()
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

  // 304 game action handlers
  const handleBid = (amount: number) => {
    if (socket && roomId && currentPlayer) {
      socket.emit('game:action', roomId, {
        type: 'bid',
        playerId: currentPlayer.id,
        data: { amount }
      })
    }
  }

  // Reset partner selection state when game phase changes
  useEffect(() => {
    if (threeOhFourData?.gamePhase !== 'partner_selection') {
      setPartnerSuit(null)
      setPartnerRank(null)
    }
  }, [threeOhFourData?.gamePhase])

  // Drop suits from the pending selection once they appear in marriageLog (declared)
  useEffect(() => {
    const log = threeOhFourData?.marriageLog
    if (!log?.length) return
    const declared = new Set(log.map((e) => e.suit))
    setMarriageSuitSelection((prev) => {
      const next = prev.filter((s) => !declared.has(s))
      return next.length === prev.length ? prev : next
    })
  }, [threeOhFourData?.marriageLog])

  const handlePass = () => {
    if (socket && roomId && currentPlayer) {
      socket.emit('game:action', roomId, {
        type: 'pass_bid',
        playerId: currentPlayer.id,
        data: {}
      })
    }
  }

  const handlePlayCard304 = (cardId: string) => {
    if (!socket || !roomId || !currentPlayer || !threeOhFourData) return

    const isLeading =
      gameState?.currentPlayer === currentPlayer.id &&
      threeOhFourData.currentTrick.length === 0 &&
      threeOhFourData.leadPlayer === currentPlayer.id

    const callPartner = Boolean(
      isLeading &&
      threeOhFourData.bidWinner === currentPlayer.id &&
      !threeOhFourData.partnershipResolved &&
      callPartnerThisLead
    )

    socket.emit('game:action', roomId, {
      type: 'play_card',
      playerId: currentPlayer.id,
      data: { cardId, callPartner }
    })
    setCallPartnerThisLead(false)
  }

  const handleDeclareMarriages = () => {
    if (!socket || !roomId || !currentPlayer || marriageSuitSelection.length === 0) return
    socket.emit('game:action', roomId, {
      type: 'declare_marriages',
      playerId: currentPlayer.id,
      data: { suits: marriageSuitSelection }
    })
    setMarriageSuitSelection([])
  }

  const handleFinish304Hand = () => {
    if (!socket || !roomId || !currentPlayer) return
    socket.emit('game:action', roomId, {
      type: 'finish_304_hand',
      playerId: currentPlayer.id,
      data: {}
    })
  }

  const handleSelectTrump = (trumpSuit: 'spades' | 'hearts' | 'diamonds' | 'clubs') => {
    if (socket && roomId && currentPlayer) {
      socket.emit('game:action', roomId, {
        type: 'select_trump',
        playerId: currentPlayer.id,
        data: { trumpSuit }
      })
    }
  }

  const handleSelectPartner = (suit: 'spades' | 'hearts' | 'diamonds' | 'clubs', rank: 'J' | '9' | 'A' | '10' | 'K' | 'Q' | '8' | '7') => {
    if (socket && roomId && currentPlayer) {
      socket.emit('game:action', roomId, {
        type: 'select_partner',
        playerId: currentPlayer.id,
        data: { partnerCard: { suit, rank } }
      })
    }
  }

  useEffect(() => {
    if ((threeOhFourData?.currentTrick?.length ?? 0) > 0) {
      setCallPartnerThisLead(false)
    }
  }, [threeOhFourData?.currentTrick?.length])

  // 304 card sorting function
  const sort304Cards = (cards: CardType[]): CardType[] => {
    const suitOrder = { 'spades': 0, 'hearts': 1, 'diamonds': 2, 'clubs': 3 }
    const rankOrder = { 'J': 7, '9': 6, 'A': 5, '10': 4, 'K': 3, 'Q': 2, '8': 1, '7': 0 }
    
    return [...cards].sort((a, b) => {
      // First sort by suit
      const suitComparison = suitOrder[a.suit as keyof typeof suitOrder] - suitOrder[b.suit as keyof typeof suitOrder]
      if (suitComparison !== 0) {
        return suitComparison
      }
      
      // Then sort by 304 rank value (highest to lowest)
      return rankOrder[b.rank as keyof typeof rankOrder] - rankOrder[a.rank as keyof typeof rankOrder]
    })
  }

  const canPlayCard304 = (card: CardType): boolean => {
    if (!threeOhFourData || !gameState || gameState.currentPlayer !== currentPlayer?.id) {
      return false
    }
    if (threeOhFourData.gamePhase !== 'playing' || threeOhFourData.awaitingFinalDeclarations) {
      return false
    }

    const hand = currentPlayer?.hand || []
    const trick = threeOhFourData.currentTrick
    const pc = threeOhFourData.partnerCard

    if (
      threeOhFourData.partnerCallThisTrick &&
      !threeOhFourData.partnershipResolved &&
      pc &&
      currentPlayer?.id === threeOhFourData.partnerHolderId
    ) {
      const hasPartner = hand.some((c) => c.rank === pc.rank && c.suit === pc.suit)
      if (hasPartner) {
        const led = trick[0]?.suit
        const canPlayPartner =
          trick.length === 0 ||
          pc.suit === led ||
          !hand.some((c) => c.suit === led)
        if (canPlayPartner && (card.rank !== pc.rank || card.suit !== pc.suit)) {
          return false
        }
      }
    }

    if (trick.length === 0) {
      return true
    }

    const leadingSuit = trick[0].suit
    const hasLedSuit = hand.some((c) => c.suit === leadingSuit)
    if (hasLedSuit) {
      return card.suit === leadingSuit
    }
    return true
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
              <div className="space-y-2">
                <div className="text-teal-200 text-xs text-center">
                  Ready: {speedData.readyToStartPlayerIds?.length || 0}/2 players
                </div>
                <button
                  onClick={handleSpeedReadyToStart}
                  className="w-full px-4 py-3 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white text-sm"
                >
                  ⚡ I&apos;m Ready
                </button>
              </div>
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

  const render304GameBoard = () => {
    if (!is304Game || !gameState || !threeOhFourData) {
      return null
    }

    const myPlayer = getMyPlayer()

    const lastCompletedTrick =
      threeOhFourData.trickHistory?.length
        ? threeOhFourData.trickHistory[threeOhFourData.trickHistory.length - 1]
        : null
    const lastTrickWinnerName = threeOhFourData.currentTrickWinner
      ? currentRoom?.players?.find((p) => p.id === threeOhFourData.currentTrickWinner)?.name
      : undefined

    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-3">
        <div className="game-table rounded-xl p-8">
          <div className="text-center mb-4">
            <h3 className="text-2xl font-bold text-white mb-2">304 Game</h3>
            <div className="text-teal-200">
              Phase: {threeOhFourData.gamePhase} • Round: {gameState.round}
            </div>
            {threeOhFourData.trumpSuit && (
              <div className="text-yellow-400 font-semibold">
                Trump: {threeOhFourData.trumpSuit}
              </div>
            )}
          </div>

          {/* Bidding Phase */}
          {threeOhFourData.gamePhase === 'bidding' && (
            <div className="text-center mb-6">
              <div className="text-white font-semibold mb-4">
                Bidding Phase - Current Bid: {threeOhFourData.bidAmount}
              </div>
              {threeOhFourData.currentBidder === myPlayer?.id ? (
                <div className="space-y-4">
                  <div className="text-yellow-400 font-semibold">Your turn to bid!</div>
                  <div className="flex justify-center items-center gap-4">
                    <input
                      type="number"
                      value={bidInput}
                      onChange={(e) => setBidInput(e.target.value)}
                      placeholder={`Minimum: ${threeOhFourData.bidAmount + 1}`}
                      min={threeOhFourData.bidAmount + 1}
                      max="304"
                      className="w-24 px-3 py-2 rounded bg-white/20 text-white placeholder-gray-300 border border-white/30 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                    <button
                      onClick={() => {
                        const bid = parseInt(bidInput)
                        if (!isNaN(bid) && bid > threeOhFourData.bidAmount) {
                          handleBid(bid)
                          setBidInput('')
                        }
                      }}
                      disabled={!bidInput || parseInt(bidInput) <= threeOhFourData.bidAmount}
                      className={`px-4 py-2 rounded ${
                        !bidInput || parseInt(bidInput) <= threeOhFourData.bidAmount
                          ? 'bg-gray-600 text-gray-400' 
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      Bid
                    </button>
                  </div>
                  <button
                    onClick={() => handlePass()}
                    className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                  >
                    Pass
                  </button>
                </div>
              ) : (
                <div className="text-teal-200">
                  Waiting for {currentRoom?.players?.find(p => p.id === threeOhFourData.currentBidder)?.name} to bid...
                </div>
              )}
            </div>
          )}

          {/* Trump Selection Phase */}
          {threeOhFourData.gamePhase === 'trump_selection' && (
            <div className="text-center mb-6">
              <div className="text-white font-semibold mb-4">
                Trump Selection - Winning Bid: {threeOhFourData.bidAmount}
              </div>
              {threeOhFourData.bidWinner === myPlayer?.id ? (
                <div className="space-y-4">
                  <div className="text-yellow-400 font-semibold">You won the bid! Select trump suit:</div>
                  <div className="flex justify-center gap-4">
                    {(['spades', 'hearts', 'diamonds', 'clubs'] as const).map(suit => (
                      <button
                        key={suit}
                        onClick={() => handleSelectTrump(suit)}
                        className="px-6 py-3 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2"
                      >
                        <span className="text-2xl">
                          {suit === 'spades' ? '♠️' : suit === 'hearts' ? '♥️' : suit === 'diamonds' ? '♦️' : '♣️'}
                        </span>
                        {suit.charAt(0).toUpperCase() + suit.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-teal-200">
                  Waiting for {currentRoom?.players?.find(p => p.id === threeOhFourData.bidWinner)?.name} to select trump suit...
                </div>
              )}
            </div>
          )}

          {/* Partner Selection Phase */}
          {threeOhFourData.gamePhase === 'partner_selection' && (
            <div className="text-center mb-6">
              <div className="text-white font-semibold mb-4">
                Partner Selection - Trump: {threeOhFourData.trumpSuit} | Bid: {threeOhFourData.bidAmount}
              </div>
              {threeOhFourData.bidWinner === myPlayer?.id ? (
                <div className="space-y-4">
                  <div className="text-yellow-400 font-semibold">Select your partner's card:</div>
                  
                  {/* Suit Selection */}
                  <div>
                    <div className="text-white font-semibold mb-2">Select Suit:</div>
                    <div className="flex justify-center gap-3">
                      {(['spades', 'hearts', 'diamonds', 'clubs'] as const).map(suit => (
                        <button
                          key={suit}
                          onClick={() => setPartnerSuit(suit)}
                          className={`px-4 py-2 rounded font-semibold flex items-center gap-2 ${
                            partnerSuit === suit 
                              ? 'bg-blue-600 text-white' 
                              : 'bg-gray-600 hover:bg-gray-500 text-white'
                          }`}
                        >
                          <span className="text-xl">
                            {suit === 'spades' ? '♠️' : suit === 'hearts' ? '♥️' : suit === 'diamonds' ? '♦️' : '♣️'}
                          </span>
                          {suit.charAt(0).toUpperCase() + suit.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rank Selection */}
                  <div>
                    <div className="text-white font-semibold mb-2">Select Rank:</div>
                    <div className="flex justify-center gap-2 flex-wrap">
                      {(['J', '9', 'A', '10', 'K', 'Q', '8', '7'] as const).map(rank => (
                        <button
                          key={rank}
                          onClick={() => setPartnerRank(rank)}
                          className={`px-3 py-2 rounded font-semibold ${
                            partnerRank === rank 
                              ? 'bg-blue-600 text-white' 
                              : 'bg-gray-600 hover:bg-gray-500 text-white'
                          }`}
                        >
                          {rank}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Confirm Selection */}
                  {partnerSuit && partnerRank && (
                    <div className="space-y-3">
                      <div className="text-teal-200">
                        Selected Partner Card: <span className="font-bold">{partnerRank} of {partnerSuit}</span>
                      </div>
                      <button
                        onClick={() => handleSelectPartner(partnerSuit, partnerRank)}
                        className="px-6 py-3 rounded bg-green-600 hover:bg-green-700 text-white font-semibold"
                      >
                        Confirm Partner Selection
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-teal-200">
                  Waiting for {currentRoom?.players?.find(p => p.id === threeOhFourData.bidWinner)?.name} to select their partner...
                </div>
              )}
            </div>
          )}

          {/* Playing Phase */}
          {threeOhFourData.gamePhase === 'playing' && (
            <div className="text-center mb-6">
              <div className="text-white font-semibold mb-4">
                Playing — Trump: {threeOhFourData.trumpSuit} | High bid: {threeOhFourData.bidAmount}
                {threeOhFourData.partnerCard && (
                  <span className="block text-sm text-teal-200 mt-1">
                    Partner card: {threeOhFourData.partnerCard.rank} of {threeOhFourData.partnerCard.suit}
                  </span>
                )}
              </div>
              <div className="text-white font-semibold mb-4 text-sm space-y-1">
                <div>
                  Bidder trick points: {threeOhFourData.bidderTrickPoints ?? threeOhFourData.roundScores?.team1 ?? 0}{' '}
                  — need ≥{' '}
                  {(threeOhFourData.bidAmount ?? 0) + (threeOhFourData.contractTargetDelta ?? 0)} (bid + contract
                  adjustments)
                </div>
                <div className="text-blue-200">
                  Tricks — bidder side: {threeOhFourData.tricksWon.team1}, defenders:{' '}
                  {threeOhFourData.tricksWon.team2}
                </div>
                {threeOhFourData.leadPlayer && (
                  <div className="text-orange-200">
                    Leading: {currentRoom?.players?.find((p) => p.id === threeOhFourData.leadPlayer)?.name || '—'}
                  </div>
                )}
                {threeOhFourData.partnerCallThisTrick && (
                  <div className="text-yellow-200">Partner called on this trick — holder must play the partner card if legal.</div>
                )}
                {threeOhFourData.awaitingFinalDeclarations && (
                  <div className="text-pink-200">
                    Finalizing: the team that won the last trick may declare marriages, then any member of that team
                    can end the hand.
                  </div>
                )}
                {threeOhFourData.partnershipResolved && (
                  <div className={threeOhFourData.isTwoVsTwo ? 'text-green-200' : 'text-amber-200'}>
                    {threeOhFourData.isTwoVsTwo
                      ? 'Partnership: 2v2 (bidder + partner)'
                      : 'Partnership: 1v3 (bidder alone)'}
                  </div>
                )}
              </div>
              
              {/* Current Trick */}
              {threeOhFourData.currentTrick.length > 0 && (
                <div className="mb-4">
                  <div className="text-white font-semibold mb-2">Current Trick:</div>
                  <div className="flex justify-center gap-2">
                    {threeOhFourData.currentTrick.map((card, index) => (
                      <div key={index} className="scale-75">
                        <Card
                          card={card}
                          isDraggable={false}
                          isPlayable={false}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Last completed trick (lookback) — hidden until at least one trick has finished */}
              {lastCompletedTrick && lastCompletedTrick.length > 0 && (
                <div className="mb-4 rounded-lg border border-white/20 bg-black/20 p-3">
                  <button
                    type="button"
                    onClick={() => setShowLastTrickLookback((v) => !v)}
                    className="flex w-full items-center justify-between text-left text-white font-semibold text-sm mb-2 hover:text-teal-200"
                  >
                    <span>Last trick (lookback)</span>
                    <span className="text-teal-300">{showLastTrickLookback ? '▼' : '▶'}</span>
                  </button>
                  {showLastTrickLookback && (
                    <>
                      {lastTrickWinnerName && (
                        <div className="text-center text-amber-200 text-sm mb-3">
                          Won by <span className="font-semibold">{lastTrickWinnerName}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap justify-center gap-3">
                        {lastCompletedTrick.map((card, index) => {
                          const pid = (card as CardType & { playerId?: string }).playerId
                          const pname = pid
                            ? currentRoom?.players?.find((p) => p.id === pid)?.name ?? '—'
                            : '—'
                          return (
                            <div key={`${card.id}-${index}`} className="flex flex-col items-center gap-1">
                              <div className="scale-[0.72] origin-top">
                                <Card
                                  card={{ ...card, faceUp: true }}
                                  isDraggable={false}
                                  isPlayable={false}
                                />
                              </div>
                              <span className="text-[11px] text-teal-200/90 max-w-[5rem] truncate text-center">
                                {pname}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Player Turn Indicator */}
              {threeOhFourData.pendingMarriagePlayerIds?.includes(myPlayer?.id || '') &&
                threeOhFourData.currentTrick.length === 0 &&
                threeOhFourData.gamePhase === 'playing' && (
                  <div className="mb-4 p-3 rounded-lg bg-white/10 text-left max-w-md mx-auto">
                    <div className="text-white font-semibold text-sm mb-2">Declare marriages (optional)</div>
                    <div className="text-teal-200 text-xs mb-2">
                      Only if <span className="font-semibold">your team won the last trick</span>. Trump K+Q ={' '}
                      <span className="font-semibold">40</span> contract pts; each other suit ={' '}
                      <span className="font-semibold">20</span>. Trump this hand:{' '}
                      <span className="font-semibold text-amber-200">
                        {threeOhFourData.trumpSuit
                          ? `${threeOhFourData.trumpSuit} (+40 if you declare K+Q here)`
                          : '—'}
                      </span>
                      . You must still hold both K and Q. If you <span className="font-semibold">played</span> K or Q
                      of a suit on that trick, you cannot claim that suit&apos;s marriage. After the last trick, use
                      &quot;End hand&quot; when done.
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center mb-2">
                      {(['spades', 'hearts', 'diamonds', 'clubs'] as const).map((suit) => {
                        const broken =
                          myPlayer?.id &&
                          threeOhFourData.marriageBrokenSuitsThisRound?.[myPlayer.id]?.includes(suit)
                        const alreadyDeclared = Boolean(
                          threeOhFourData.marriageLog?.some((e) => e.suit === suit)
                        )
                        const hasK = myPlayer?.hand?.some((c) => c.suit === suit && c.rank === 'K')
                        const hasQ = myPlayer?.hand?.some((c) => c.suit === suit && c.rank === 'Q')
                        const eligible = hasK && hasQ && !broken && !alreadyDeclared
                        const selected = marriageSuitSelection.includes(suit)
                        const isTrumpSuit = threeOhFourData.trumpSuit === suit
                        const marriagePts = isTrumpSuit ? 40 : 20
                        return (
                          <button
                            key={suit}
                            type="button"
                            disabled={!eligible}
                            onClick={() => {
                              setMarriageSuitSelection((prev) =>
                                selected ? prev.filter((s) => s !== suit) : [...prev, suit]
                              )
                            }}
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              !eligible
                                ? 'bg-gray-700 text-gray-500'
                                : selected
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-gray-600 text-white hover:bg-gray-500'
                            }`}
                          >
                            {suit} (+{marriagePts}){isTrumpSuit ? ' (trump)' : ''}
                            {alreadyDeclared
                              ? ' (declared)'
                              : broken
                                ? ' (played K/Q)'
                                : !hasK || !hasQ
                                  ? ' (no KQ)'
                                  : ''}
                          </button>
                        )
                      })}
                    </div>
                    {threeOhFourData.marriageLog && threeOhFourData.marriageLog.length > 0 && (
                      <div className="text-xs text-purple-200/95 mb-2 text-center">
                        Declared this hand:{' '}
                        {threeOhFourData.marriageLog.map((e, i) => (
                          <span key={`${e.playerId}-${e.suit}-${i}`}>
                            {e.suit} +{e.points}
                            {i < threeOhFourData.marriageLog!.length - 1 ? ' · ' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleDeclareMarriages}
                      disabled={marriageSuitSelection.length === 0}
                      className="w-full px-3 py-2 rounded bg-amber-700 hover:bg-amber-600 text-white text-sm disabled:bg-gray-600 mb-2"
                    >
                      Declare selected marriages
                    </button>
                    {threeOhFourData.awaitingFinalDeclarations && (
                      <button
                        type="button"
                        onClick={handleFinish304Hand}
                        className="w-full px-3 py-2 rounded bg-green-700 hover:bg-green-600 text-white text-sm font-semibold"
                      >
                        End hand (finalize scores)
                      </button>
                    )}
                  </div>
                )}

              {gameState.currentPlayer === myPlayer?.id ? (
                <div className="text-yellow-400 font-semibold mb-4">
                  Your turn to play a card!
                  {threeOhFourData.bidWinner === myPlayer?.id &&
                    !threeOhFourData.partnershipResolved &&
                    threeOhFourData.currentTrick.length === 0 &&
                    threeOhFourData.leadPlayer === myPlayer?.id && (
                      <label className="mt-3 flex items-center justify-center gap-2 text-sm text-purple-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={callPartnerThisLead}
                          onChange={(e) => setCallPartnerThisLead(e.target.checked)}
                        />
                        Call partner this trick (holder must play partner card if legal)
                      </label>
                    )}
                </div>
              ) : (
                <div className="text-teal-200 mb-4">
                  Waiting for {currentRoom?.players?.find(p => p.id === gameState.currentPlayer)?.name} to play...
                </div>
              )}
            </div>
          )}

          {/* Game End */}
          {threeOhFourData.gamePhase === 'ended' && (
            <div className="text-center">
              <div className="text-2xl font-bold text-white mb-4">
                Game Over!
              </div>
              <div className="space-y-2 mb-4">
                <div className="text-lg text-teal-200">
                  Bid: {threeOhFourData.bidAmount} — contract adjustments (marriages, last trick):{' '}
                  {threeOhFourData.contractTargetDelta ?? 0} → need ≥{' '}
                  {(threeOhFourData.bidAmount ?? 0) + (threeOhFourData.contractTargetDelta ?? 0)} trick points on
                  bidder side
                </div>
                <div className="text-lg text-blue-200">
                  Bidder trick points: {threeOhFourData.bidderTrickPoints ?? threeOhFourData.roundScores.team1} —
                  defenders: {threeOhFourData.defenseTrickPoints ?? threeOhFourData.roundScores.team2}
                </div>
                <div className="text-lg text-yellow-200">
                  Contract{' '}
                  {(threeOhFourData.bidderTrickPoints ?? 0) >=
                  (threeOhFourData.bidAmount ?? 0) + (threeOhFourData.contractTargetDelta ?? 0)
                    ? 'made ✓'
                    : 'set ✗'}
                </div>
                {currentRoom?.last304Hand && (
                  <div className="text-sm text-purple-200 border border-white/20 rounded-lg p-3 text-left max-w-md mx-auto">
                    <div className="font-semibold text-white mb-1">Session points (this hand)</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {Object.entries(currentRoom.last304Hand.awarded).map(([pid, pts]) => (
                        <li key={pid}>
                          {currentRoom?.players?.find((p) => p.id === pid)?.name ?? pid}: +{pts}
                        </li>
                      ))}
                    </ul>
                    {Object.keys(currentRoom.last304Hand.awarded).length === 0 && (
                      <div className="text-teal-300/80">No session points awarded this hand.</div>
                    )}
                  </div>
                )}
              </div>
              {(() => {
                const need =
                  (threeOhFourData.bidAmount ?? 0) + (threeOhFourData.contractTargetDelta ?? 0)
                const made = (threeOhFourData.bidderTrickPoints ?? 0) >= need
                const bidderName =
                  currentRoom?.players?.find((p) => p.id === threeOhFourData.bidWinner)?.name ??
                  'Bidder'
                return (
                  <div className="rounded-xl border border-amber-400/50 bg-gradient-to-br from-amber-900/45 via-fuchsia-900/35 to-teal-900/45 px-4 py-4 mb-4 max-w-lg mx-auto shadow-lg">
                    <div className="text-3xl leading-none mb-2 text-center select-none" aria-hidden>
                      🎊 ✨ 🎉
                    </div>
                    <p className="text-lg sm:text-xl font-bold text-white text-center">
                      {made
                        ? `${bidderName}'s side made the contract!`
                        : 'Defenders set the contract!'}
                    </p>
                    <p className="text-sm text-teal-100/90 text-center mt-1">
                      {made ? 'Hand won by the bidding team' : 'Hand won by the defense'}
                    </p>
                  </div>
                )
              })()}
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-4">
                <button
                  onClick={handleRestartGame}
                  className="px-8 py-3 rounded-lg font-semibold text-lg bg-green-600 hover:bg-green-700 text-white"
                >
                  🔁 Play again
                  {threeOhFourData.restartRequests?.length > 0 && (
                    <span className="block text-sm font-normal opacity-90">
                      {threeOhFourData.restartRequests.length}/{currentRoom?.players?.length || 4} ready
                    </span>
                  )}
                </button>
                <button
                  onClick={handleLeaveRoom}
                  className="px-8 py-3 rounded-lg font-semibold text-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  🚪 Leave Room
                </button>
              </div>
              <p className="text-teal-200/90 text-xs max-w-md mx-auto">
                Everyone must choose Play again to start the next hand. Session totals stay in the sidebar.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!roomId) {
    return <div>Invalid room</div>
  }

  const playersInRoom = currentRoom?.players?.length ?? 0
  const readyPlayerCount = currentRoom?.players?.filter((p) => p.isReady).length ?? 0
  const playersNeededToStart = is304Game ? 4 : 2

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
                Players: {playersInRoom}/{currentRoom?.maxPlayers || 4}
              </div>
              {!isGameStarted && (
                <div className="text-amber-200/95 text-xs mb-2 font-medium">
                  Ready: {readyPlayerCount}/{playersInRoom || playersNeededToStart}
                  {playersInRoom > 0 ? ' in room' : ` (need ${playersNeededToStart} to start)`}
                </div>
              )}
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
                  
                  {((isWarGame && isReady) || (isSpeedGame && isReady) || (is304Game && isReady)) && (
                    <button
                      onClick={handleStartGame}
                      className={`w-full px-3 py-2 rounded text-sm font-semibold ${
                        isWarGame 
                          ? 'bg-green-600 hover:bg-green-700 text-white' 
                          : isSpeedGame 
                            ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                      } disabled:bg-gray-600 disabled:cursor-not-allowed`}
                      disabled={
                        !isReady ||
                        playersInRoom !== playersNeededToStart ||
                        readyPlayerCount !== playersInRoom
                      }
                    >
                      {playersInRoom !== playersNeededToStart
                        ? `${is304Game ? 'Need 4 Players' : 'Need 2 Players'} (${readyPlayerCount}/${playersInRoom} ready)`
                        : readyPlayerCount !== playersInRoom
                          ? `Waiting for all ready (${readyPlayerCount}/${playersNeededToStart})`
                          : `${isWarGame ? '🚀 Start War' : isSpeedGame ? '⚡ Start Speed' : '🎯 Start 304'} — all ${playersNeededToStart} ready`
                      }
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Players List */}
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-2">
              <h3 className="text-white font-semibold mb-1 text-sm">Players</h3>
              {is304Game && (
                <div className="text-[10px] text-amber-200/90 mb-2 border-b border-white/10 pb-2">
                  <span className="font-semibold text-amber-100">304 session</span>
                  <div className="text-teal-200/90 mt-0.5">
                    Bidder +bid if made; partner +½ bid (2v2); defenders split ½ bid if set.
                  </div>
                </div>
              )}
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
                          {is304Game && (
                            <span className="block text-amber-200/95">
                              Session: {currentRoom?.sessionScores304?.[player.id] ?? 0}
                            </span>
                          )}
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
            {matchWinnerCelebration && (
              <div
                className="mb-3 rounded-xl border border-amber-400/50 bg-gradient-to-br from-amber-900/50 via-fuchsia-900/40 to-teal-900/50 px-4 py-4 text-center shadow-lg"
                role="status"
              >
                <div className="text-3xl leading-none mb-2 select-none" aria-hidden>
                  🎊 ✨ 🎉
                </div>
                <p className="text-lg sm:text-xl font-bold text-white">
                  {matchWinnerCelebration.winnerName} wins!
                </p>
                <p className="text-sm text-teal-100/90 mt-1">Game over</p>
              </div>
            )}

        {/* War Game Board */}
        {isWarGame && isGameStarted && renderWarGameBoard()}

        {/* Speed Game Board */}
        {isSpeedGame && isGameStarted && renderSpeedGameBoard()}

        {/* 304 Game Board */}
        {is304Game && isGameStarted && render304GameBoard()}

        {/* Generic Game Board (for non-War and non-Speed games) */}
        {!isWarGame && !isSpeedGame && !is304Game && isGameStarted && (
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
            {is304Game ? (
              <div className="flex flex-wrap gap-3 justify-center">
                {sort304Cards(currentPlayer.hand).map((card) => {
                  const isPlayable = canPlayCard304(card)
                  const isMyTurn = gameState?.currentPlayer === currentPlayer.id && threeOhFourData?.gamePhase === 'playing'
                  
                  return (
                    <div key={card.id} className="relative">
                      <div
                        onClick={() => {
                          if (isMyTurn && isPlayable) {
                            handlePlayCard304(card.id)
                          }
                        }}
                        className={`cursor-pointer transition-all duration-200 transform hover:scale-105 hover:-translate-y-2 ${
                          isMyTurn && isPlayable
                            ? 'opacity-100 shadow-lg' 
                            : isMyTurn 
                              ? 'opacity-50 cursor-not-allowed grayscale' 
                              : 'opacity-50'
                        }`}
                      >
                        <Card
                          card={card}
                          isDraggable={false}
                          isPlayable={isMyTurn && isPlayable}
                        />
                        {/* Visual indicator for unplayable cards */}
                        {isMyTurn && !isPlayable && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-red-600 text-white text-xs px-2 py-1 rounded opacity-80">
                              ❌
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <Hand
                cards={currentPlayer.hand}
                selectedCards={selectedCards}
                isPlayerTurn={isPlayerTurn}
                layout="fan"
              />
            )}
          </div>
        )}

        {/* Demo Cards (when no game is active) */}
        {!isGameStarted && (
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">
              {isWarGame ? 'War Game Preview' : isSpeedGame ? 'Speed Game Preview' : is304Game ? '304 Game Preview' : 'Demo Cards'}
            </h3>
            <div className="flex justify-center gap-4">
              {is304Game ? (
                <>
                  <Card
                    card={{
                      id: 'demo-1',
                      suit: 'hearts',
                      rank: 'J',
                      faceUp: true
                    }}
                    isDraggable={false}
                    isPlayable={false}
                  />
                  <Card
                    card={{
                      id: 'demo-2',
                      suit: 'spades',
                      rank: '9',
                      faceUp: true
                    }}
                    isDraggable={false}
                    isPlayable={false}
                  />
                  <Card
                    card={{
                      id: 'demo-3',
                      suit: 'diamonds',
                      rank: 'A',
                      faceUp: true
                    }}
                    isDraggable={false}
                    isPlayable={false}
                  />
                  <Card
                    card={{
                      id: 'demo-4',
                      suit: 'clubs',
                      rank: '10',
                      faceUp: true
                    }}
                    isDraggable={false}
                    isPlayable={false}
                  />
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
            <div className="text-center mt-4 text-teal-200">
              {isWarGame 
                ? 'In War, you and your opponent will reveal cards from your decks. Higher card wins!'
                : isSpeedGame
                ? 'In Speed, race to play all your cards! Play cards consecutively (A-2-3, K-Q-J, etc.) on the center piles. First to empty your hand wins!'
                : is304Game
                ? 'In 304, bid on points, select trump and partner card. Teams start as bidder vs everyone else. Partner only joins if revealed before their card is played!'
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
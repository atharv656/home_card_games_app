import { v4 as uuidv4 } from 'uuid'
import type {
  GameState,
  GameAction,
  Player,
  Card,
  Suit,
  Rank,
  GameRoom,
  WarGameData,
  SpeedGameData,
  SpeedAction,
  ThreeOhFourGameData,
  ThreeOhFourAction,
} from '../../../shared/types'
import { RoomManager } from './RoomManager'

/** Replace socket id in nested game payloads (player keys, id fields, trick card playerId, etc.). */
function replacePlayerIdDeep(obj: unknown, oldId: string, newId: string): void {
  if (obj === null || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    const arr = obj as unknown[]
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === oldId) arr[i] = newId
      else replacePlayerIdDeep(arr[i], oldId, newId)
    }
    return
  }
  const o = obj as Record<string, unknown>
  const keys = Object.keys(o)
  for (const k of keys) {
    if (k === oldId) {
      const val = o[oldId]
      delete o[oldId]
      o[newId] = val
      replacePlayerIdDeep(o[newId], oldId, newId)
    } else {
      const v = o[k]
      if (v === oldId) o[k] = newId
      else replacePlayerIdDeep(v, oldId, newId)
    }
  }
}

export class GameManager {
  private gameStates: Map<string, GameState> = new Map()
  
  constructor(private roomManager: RoomManager) {}

  removeGameState(roomId: string): void {
    this.gameStates.delete(roomId)
  }

  getGameState(roomId: string): GameState | undefined {
    return this.gameStates.get(roomId)
  }

  /** After socket reconnect with new id, keep game state and room session keys consistent. */
  replacePlayerSocketId(roomId: string, oldId: string, newId: string): void {
    const room = this.roomManager.getRoom(roomId)
    if (room) {
      if (room.sessionScores304 && oldId in room.sessionScores304) {
        room.sessionScores304[newId] = room.sessionScores304[oldId]!
        delete room.sessionScores304[oldId]
      }
      const last = room.last304Hand
      if (last?.awarded && oldId in last.awarded) {
        last.awarded[newId] = last.awarded[oldId]!
        delete last.awarded[oldId]
      }
      this.roomManager.updateRoom(roomId, room)
    }
    const gs = this.gameStates.get(roomId)
    if (!gs) return
    if (gs.currentPlayer === oldId) gs.currentPlayer = newId
    replacePlayerIdDeep(gs.gameData, oldId, newId)
    this.gameStates.set(roomId, gs)
  }

  async startGame(roomId: string, initiatorId: string): Promise<GameState> {
    const room = this.roomManager.getRoom(roomId)
    if (!room) {
      throw new Error('Room not found')
    }

    // Check if initiator is in the room
    if (!room.players.find(p => p.id === initiatorId)) {
      throw new Error('Player not in room')
    }

    // Start the room
    this.roomManager.startGame(roomId)

    // Create initial game state
    const deck = this.createDeck()
    const shuffledDeck = this.shuffleDeck(deck)
    
    let gameState: GameState

    if (room.gameType === 'war') {
      gameState = this.initializeWarGame(roomId, room.players, shuffledDeck)
    } else if (room.gameType === 'speed') {
      gameState = this.initializeSpeedGame(roomId, room.players, shuffledDeck)
    } else if (room.gameType === '304') {
      gameState = this.initializeThreeOhFourGame(roomId, room.players, shuffledDeck)
    } else {
      gameState = this.initializeGenericGame(roomId, room.players, shuffledDeck, room.gameType)
    }

    // Update the room with the modified player hands
    this.roomManager.updateRoom(roomId, room)

    this.gameStates.set(roomId, gameState)
    return gameState
  }

  private initializeWarGame(roomId: string, players: Player[], deck: Card[]): GameState {
    if (players.length !== 2) {
      throw new Error('War requires exactly 2 players')
    }

    // Split deck equally between players
    const halfDeck = Math.floor(deck.length / 2)
    players[0].hand = deck.slice(0, halfDeck)
    players[1].hand = deck.slice(halfDeck)

    console.log(`War game initialized: Player 1 has ${players[0].hand.length} cards, Player 2 has ${players[1].hand.length} cards`)

    // Set both players as active
    players.forEach(player => {
      player.isActive = true
      player.score = player.hand.length
    })

    const warGameData: WarGameData = {
      battleCards: {},
      warPile: [],
      lastBattleWinner: null,
      isInWar: false,
      battleResult: 'pending',
      warCount: 0
    }

    return {
      currentPlayer: players[0].id, // Keep for compatibility, but War doesn't use turns
      phase: 'playing',
      deck: [],
      discardPile: [],
      turn: 1,
      round: 1,
      gameData: {
        roomId,
        gameType: 'war',
        ...warGameData
      }
    }
  }

  private initializeSpeedGame(roomId: string, players: Player[], deck: Card[]): GameState {
    if (players.length !== 2) {
      throw new Error('Speed requires exactly 2 players')
    }

    // Deal 15 cards to each player
    const cardsPerPlayer = 15
    players[0].hand = deck.slice(0, 5) // First 5 cards go to hand
    players[1].hand = deck.slice(cardsPerPlayer, cardsPerPlayer + 5) // Next 5 cards go to hand
    
    // Set hand cards to face-up so players can see their own cards
    players[0].hand.forEach(card => card.faceUp = true)
    players[1].hand.forEach(card => card.faceUp = true)
    
    // Remaining 10 cards per player go to their deck
    const player1Deck = deck.slice(5, cardsPerPlayer)
    const player2Deck = deck.slice(cardsPerPlayer + 5, cardsPerPlayer * 2)
    
    // Create the 4 piles
    const remainingDeck = deck.slice(cardsPerPlayer * 2)
    const leftStockPile = remainingDeck.slice(0, 6) // 6 cards face-down
    const rightStockPile = remainingDeck.slice(6, 12) // 6 cards face-down
    
    // Set face-down for stock piles
    leftStockPile.forEach(card => card.faceUp = false)
    rightStockPile.forEach(card => card.faceUp = false)

    // Set both players as active
    players.forEach(player => {
      player.isActive = true
      player.score = player.hand.length // For display purposes
    })

    const speedGameData: SpeedGameData = {
      leftStockPile,
      rightStockPile,
      leftPlayPile: [], // Empty initially
      rightPlayPile: [], // Empty initially
      playerDecks: {
        [players[0].id]: player1Deck,
        [players[1].id]: player2Deck
      },
      gamePhase: 'waiting_for_ready',
      lastPlayedCard: null,
      lastPlayedBy: null,
      winner: null,
      flipRequests: [],
      restartRequests: [],
      readyToStartPlayerIds: []
    }

    console.log(`Speed game initialized: Each player has 5 cards in hand, 10 in deck, stock piles have 6 cards each`)

    return {
      currentPlayer: players[0].id, // Keep for compatibility
      phase: 'playing',
      deck: [],
      discardPile: [],
      turn: 1,
      round: 1,
      gameData: {
        roomId,
        gameType: 'speed',
        ...speedGameData
      }
    }
  }

  private initializeThreeOhFourGame(roomId: string, players: Player[], deck: Card[]): GameState {
    if (players.length !== 4) {
      throw new Error('304 requires exactly 4 players')
    }

    // Create 304 deck - only cards 7 and higher (32 cards total)
    const threeOhFourDeck = deck.filter(card => 
      ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'].includes(card.rank)
    )
    
    if (threeOhFourDeck.length !== 32) {
      throw new Error('304 deck should have exactly 32 cards')
    }

    // Deal 8 cards to each player
    for (let i = 0; i < players.length; i++) {
      players[i].hand = threeOhFourDeck.slice(i * 8, (i + 1) * 8)
      players[i].hand.forEach(card => card.faceUp = true) // Players can see their own cards
      players[i].isActive = false // Will be set during bidding
      players[i].score = 0
    }

    // Set up initial teams: bidder vs everyone else (1 vs 3)
    const threeOhFourGameData: ThreeOhFourGameData = {
      currentTrick: [],
      trumpSuit: null,
      bidAmount: 0,
      bidWinner: null,
      teamScores: { team1: 0, team2: 0 },
      playerTeams: {},
      gamePhase: 'bidding',
      currentBidder: players[0].id,
      bids: {},
      passedPlayers: [],
      tricksWon: { team1: 0, team2: 0 },
      currentTrickWinner: null,
      roundScores: { team1: 0, team2: 0 },
      leadPlayer: null,
      partnerCard: null,
      partnerHolderId: null,
      partnershipResolved: false,
      isTwoVsTwo: null,
      partnerCallThisTrick: false,
      contractTargetDelta: 0,
      bidderTrickPoints: 0,
      defenseTrickPoints: 0,
      tricksCompleted: 0,
      trickHistory: [],
      flipRequests: [],
      restartRequests: [],
      lastPlayedCard: null,
      lastPlayedBy: null,
      pendingMarriagePlayerIds: [],
      marriageBrokenSuitsThisRound: {},
      marriageLog: [],
      awaitingFinalDeclarations: false
    }

    // Set first player as active for bidding
    players[0].isActive = true

    console.log(`304 game initialized: 4 players, 8 cards each, bidding starts with ${players[0].name}`)

    return {
      currentPlayer: players[0].id,
      phase: 'bidding',
      deck: [], // No remaining deck after dealing
      discardPile: [],
      turn: 1,
      round: 1,
      gameData: {
        roomId,
        gameType: '304',
        ...threeOhFourGameData
      }
    }
  }

  private initializeGenericGame(roomId: string, players: Player[], deck: Card[], gameType: string): GameState {
    // Deal initial cards based on game type
    this.dealInitialCards(players, deck, gameType)

    // Set first player as active
    players[0].isActive = true
    
    return {
      currentPlayer: players[0].id,
      phase: 'playing',
      deck,
      discardPile: [],
      turn: 1,
      round: 1,
      gameData: {
        roomId,
        gameType,
      }
    }
  }

  async processAction(roomId: string, action: GameAction): Promise<GameState> {
    const gameState = this.gameStates.get(roomId)
    if (!gameState) {
      throw new Error('Game not found')
    }

    const room = this.roomManager.getRoom(roomId)
    if (!room) {
      throw new Error('Room not found')
    }

    if (room.gameType === 'war') {
      return this.processWarAction(roomId, action, gameState, room)
    } else if (room.gameType === 'speed') {
      return this.processSpeedAction(roomId, action, gameState, room)
    } else if (room.gameType === '304') {
      return this.processThreeOhFourAction(roomId, action, gameState, room)
    } else {
      return this.processGenericAction(roomId, action, gameState, room)
    }
  }

  private async processWarAction(roomId: string, action: GameAction, gameState: GameState, room: any): Promise<GameState> {
    const player = room.players.find((p: Player) => p.id === action.playerId)
    if (!player) {
      throw new Error('Player not found')
    }

    switch (action.type) {
      case 'reveal_card':
        return this.handleWarRevealCard(gameState, room, action.playerId)
      case 'acknowledge_result':
        return this.handleWarAcknowledgeResult(gameState, room, action.playerId)
      default:
        throw new Error(`Unknown war action type: ${action.type}`)
    }
  }

  private handleWarRevealCard(gameState: GameState, room: any, playerId: string): GameState {
    const player = room.players.find((p: Player) => p.id === playerId)
    if (!player || player.hand.length === 0) {
      throw new Error('Player has no cards to reveal')
    }

    const warData = gameState.gameData as WarGameData
    
    // Player reveals their top card
    const revealedCard = player.hand.shift()!
    revealedCard.faceUp = true
    
    // Store the revealed card
    if (!warData.battleCards[playerId]) {
      warData.battleCards[playerId] = []
    }
    warData.battleCards[playerId].push(revealedCard)

    // Update player's card count
    player.score = player.hand.length

    // Check if both players have revealed cards
    const playerIds = room.players.map((p: Player) => p.id)
    const revealedCount = playerIds.filter((id: string) => warData.battleCards[id] && warData.battleCards[id].length > 0).length

    if (revealedCount === 2) {
      // Both players revealed - determine battle result
      const result = this.determineBattleResult(warData.battleCards, playerIds)
      
      if (result.isWar) {
        // It's a war! Players need to place more cards
        warData.isInWar = true
        warData.battleResult = 'war'
        warData.warCount++
        gameState.phase = 'war'
        
        // Move current battle cards to war pile
        for (const pId of playerIds) {
          warData.warPile.push(...warData.battleCards[pId])
          warData.battleCards[pId] = []
        }
      } else {
        // Someone won the battle
        warData.battleResult = 'winner'
        warData.lastBattleWinner = result.winner
        gameState.phase = 'battle'
      }
    }

    // Update game state
    gameState.gameData = warData
    gameState.turn++
    
    this.gameStates.set(gameState.gameData.roomId, gameState)
    return gameState
  }

  private handleWarAcknowledgeResult(gameState: GameState, room: any, playerId: string): GameState {
    const warData = gameState.gameData as WarGameData
    
    if (warData.battleResult === 'winner' && warData.lastBattleWinner) {
      // Winner takes all cards
      const winner = room.players.find((p: Player) => p.id === warData.lastBattleWinner)
      if (winner) {
        // Collect all battle cards and war pile
        const allCards: Card[] = []
        
        // Add battle cards
        for (const cards of Object.values(warData.battleCards)) {
          allCards.push(...cards)
        }
        
        // Add war pile
        allCards.push(...warData.warPile)
        
        // Shuffle and add to bottom of winner's deck
        const shuffledCards = this.shuffleDeck(allCards)
        winner.hand.push(...shuffledCards)
        winner.score = winner.hand.length
      }
      
      // Reset war data
      warData.battleCards = {}
      warData.warPile = []
      warData.lastBattleWinner = null
      warData.isInWar = false
      warData.battleResult = 'pending'
      warData.warCount = 0
    }

    // Check for game end
    const remainingPlayers = room.players.filter((p: Player) => p.hand.length > 0)
    if (remainingPlayers.length === 1) {
      gameState.phase = 'ended'
      warData.lastBattleWinner = remainingPlayers[0].id
    } else {
      gameState.phase = 'playing'
    }

    // Switch to next player
    const currentIndex = room.players.findIndex((p: Player) => p.id === gameState.currentPlayer)
    const nextIndex = (currentIndex + 1) % room.players.length
    gameState.currentPlayer = room.players[nextIndex].id

    gameState.gameData = warData
    gameState.round++
    
    this.gameStates.set(gameState.gameData.roomId, gameState)
    return gameState
  }

  private determineBattleResult(battleCards: { [playerId: string]: Card[] }, playerIds: string[]): { winner: string | null, isWar: boolean } {
    const player1Cards = battleCards[playerIds[0]] || []
    const player2Cards = battleCards[playerIds[1]] || []
    
    if (player1Cards.length === 0 || player2Cards.length === 0) {
      return { winner: null, isWar: false }
    }

    const card1 = player1Cards[player1Cards.length - 1] // Most recent card
    const card2 = player2Cards[player2Cards.length - 1] // Most recent card
    
    const value1 = this.getCardValue(card1)
    const value2 = this.getCardValue(card2)

    if (value1 > value2) {
      return { winner: playerIds[0], isWar: false }
    } else if (value2 > value1) {
      return { winner: playerIds[1], isWar: false }
    } else {
      return { winner: null, isWar: true }
    }
  }

  private getCardValue(card: Card): number {
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

  private async processSpeedAction(roomId: string, action: GameAction, gameState: GameState, room: any): Promise<GameState> {
    const player = room.players.find((p: Player) => p.id === action.playerId)
    if (!player) {
      throw new Error('Player not found')
    }

    const speedData = gameState.gameData as SpeedGameData

    switch (action.type) {
      case 'ready_to_start':
        return this.handleSpeedReadyToStart(gameState, room, action.playerId)
      case 'play_card':
        const cardId = action.data.cardId as string
        const targetPile = action.data.targetPile as 'left' | 'right'
        return this.handleSpeedPlayCard(gameState, room, action.playerId, cardId, targetPile)
      case 'flip_new_cards':
        return this.handleSpeedFlipNewCards(gameState, room, action.playerId)
      case 'restart_game':
        return this.handleSpeedRestartGame(gameState, room, action.playerId)
      default:
        throw new Error(`Unknown speed action type: ${action.type}`)
    }
  }

  private handleSpeedReadyToStart(gameState: GameState, room: any, playerId: string): GameState {
    const speedData = gameState.gameData as SpeedGameData

    if (speedData.gamePhase !== 'waiting_for_ready') {
      gameState.gameData = speedData
      this.gameStates.set(gameState.gameData.roomId, gameState)
      return gameState
    }

    if (!speedData.readyToStartPlayerIds.includes(playerId)) {
      speedData.readyToStartPlayerIds.push(playerId)
    }

    const allReady =
      room.players.length >= 2 &&
      room.players.every((p: Player) => speedData.readyToStartPlayerIds.includes(p.id))

    if (allReady) {
      if (speedData.leftStockPile.length > 0) {
        const leftCard = speedData.leftStockPile.pop()!
        leftCard.faceUp = true
        speedData.leftPlayPile.push(leftCard)
      }

      if (speedData.rightStockPile.length > 0) {
        const rightCard = speedData.rightStockPile.pop()!
        rightCard.faceUp = true
        speedData.rightPlayPile.push(rightCard)
      }

      speedData.gamePhase = 'playing'
      speedData.readyToStartPlayerIds = []
      console.log('Speed game started! Cards flipped to play piles')
    } else {
      console.log(`Speed ready: ${speedData.readyToStartPlayerIds.length}/${room.players.length} players`)
    }

    gameState.gameData = speedData
    this.gameStates.set(gameState.gameData.roomId, gameState)
    return gameState
  }

  private replenishSpeedCenterPilesIfBothEmpty(speedData: SpeedGameData): void {
    if (speedData.leftPlayPile.length > 0 || speedData.rightPlayPile.length > 0) {
      return
    }
    if (speedData.leftStockPile.length > 0) {
      const leftCard = speedData.leftStockPile.pop()!
      leftCard.faceUp = true
      speedData.leftPlayPile.push(leftCard)
    }
    if (speedData.rightStockPile.length > 0) {
      const rightCard = speedData.rightStockPile.pop()!
      rightCard.faceUp = true
      speedData.rightPlayPile.push(rightCard)
    }
  }

  private handleSpeedPlayCard(gameState: GameState, room: any, playerId: string, cardId: string, targetPile: 'left' | 'right'): GameState {
    const player = room.players.find((p: Player) => p.id === playerId)
    if (!player) {
      throw new Error('Player not found')
    }

    const speedData = gameState.gameData as SpeedGameData
    this.replenishSpeedCenterPilesIfBothEmpty(speedData)

    // Find the card in player's hand
    const cardIndex = player.hand.findIndex((card: Card) => card.id === cardId)
    if (cardIndex === -1) {
      throw new Error('Card not found in player hand')
    }

    const playedCard = player.hand[cardIndex]
    
    // Get the target pile
    const targetPlayPile = targetPile === 'left' ? speedData.leftPlayPile : speedData.rightPlayPile
    
    if (targetPlayPile.length === 0) {
      throw new Error('No card to play on')
    }

    const topCard = targetPlayPile[targetPlayPile.length - 1]
    
    // Check if the played card is consecutive
    if (!this.isConsecutive(playedCard, topCard)) {
      throw new Error('Card is not consecutive')
    }

    // Add card to target pile
    playedCard.faceUp = true
    targetPlayPile.push(playedCard)
    
    // Draw new card from player's deck if available and replace at same position
    const playerDeck = speedData.playerDecks[playerId]
    if (playerDeck && playerDeck.length > 0) {
      const newCard = playerDeck.pop()!
      newCard.faceUp = true // Player can see their own card
      player.hand[cardIndex] = newCard // Replace card at same position
    } else {
      // If no cards left in deck, remove the card (will leave empty slot)
      player.hand.splice(cardIndex, 1)
    }

    // Update player score (total cards remaining)
    player.score = player.hand.length + (speedData.playerDecks[playerId]?.length || 0)

    // Check for win condition
    if (player.score === 0) {
      speedData.winner = playerId
      speedData.gamePhase = 'ended'
      gameState.phase = 'ended'
    }

    // Clear flip and restart requests for this player since they found a valid move
    speedData.flipRequests = speedData.flipRequests.filter(id => id !== playerId)
    speedData.restartRequests = speedData.restartRequests.filter(id => id !== playerId)

    // Update last played info
    speedData.lastPlayedCard = playedCard
    speedData.lastPlayedBy = playerId

    console.log(`Player ${playerId} played ${playedCard.rank} of ${playedCard.suit} on ${targetPile} pile`)

    gameState.gameData = speedData
    this.gameStates.set(gameState.gameData.roomId, gameState)
    
    // Update the room with the modified player hands
    this.roomManager.updateRoom(gameState.gameData.roomId, room)
    
    return gameState
  }

  private handleSpeedFlipNewCards(gameState: GameState, room: any, playerId: string): GameState {
    const speedData = gameState.gameData as SpeedGameData
    
    // Add this player's request to flip new cards (if not already requested)
    if (!speedData.flipRequests.includes(playerId)) {
      speedData.flipRequests.push(playerId)
    }
    
    // Check if both players have requested to flip new cards
    if (speedData.flipRequests.length >= 2) {
      // Flip new cards from stock piles when both players agree
      if (speedData.leftStockPile.length > 0) {
        const leftCard = speedData.leftStockPile.pop()!
        leftCard.faceUp = true
        speedData.leftPlayPile.push(leftCard)
      }
      
      if (speedData.rightStockPile.length > 0) {
        const rightCard = speedData.rightStockPile.pop()!
        rightCard.faceUp = true
        speedData.rightPlayPile.push(rightCard)
      }

      // Clear flip requests after flipping
      speedData.flipRequests = []
      
      console.log('New cards flipped from stock piles (both players agreed)')
    } else {
      console.log(`Player ${playerId} requested to flip new cards. Waiting for other player...`)
    }

    gameState.gameData = speedData
    this.gameStates.set(gameState.gameData.roomId, gameState)
    return gameState
  }

  private handleSpeedRestartGame(gameState: GameState, room: any, playerId: string): GameState {
    const speedData = gameState.gameData as SpeedGameData
    
    // Add this player's request to restart game (if not already requested)
    if (!speedData.restartRequests.includes(playerId)) {
      speedData.restartRequests.push(playerId)
    }
    
    // Check if both players have requested to restart
    if (speedData.restartRequests.length >= 2) {
      // Reset all players to not ready state for the new game
      room.players.forEach((player: any) => {
        player.isReady = false
        player.isActive = false
        player.score = 0
      })
      
      // Restart the game by reinitializing
      const deck = this.createDeck()
      const shuffledDeck = this.shuffleDeck(deck)
      const newGameState = this.initializeSpeedGame(gameState.gameData.roomId, room.players, shuffledDeck)
      ;(newGameState.gameData as SpeedGameData).readyToStartPlayerIds = []

      this.roomManager.updateRoom(gameState.gameData.roomId, room)
      this.gameStates.set(gameState.gameData.roomId, newGameState)

      console.log('Speed game restarted by both players - all states reset')
      return newGameState
    } else {
      console.log(`Player ${playerId} requested to restart game. Waiting for other player...`)
      
      gameState.gameData = speedData
      this.gameStates.set(gameState.gameData.roomId, gameState)
      return gameState
    }
  }

  private async processThreeOhFourAction(roomId: string, action: GameAction, gameState: GameState, room: any): Promise<GameState> {
    const player = room.players.find((p: Player) => p.id === action.playerId)
    if (!player) {
      throw new Error('Player not found')
    }

    const threeOhFourData = gameState.gameData as ThreeOhFourGameData

    switch (action.type) {
      case 'bid':
        return this.handleThreeOhFourBid(gameState, room, action.playerId, action.data.amount as number)
      case 'pass_bid':
        return this.handleThreeOhFourPassBid(gameState, room, action.playerId)
      case 'select_trump':
        return this.handleThreeOhFourSelectTrump(gameState, room, action.playerId, action.data.trumpSuit as string)
      case 'select_partner':
        return this.handleThreeOhFourSelectPartner(gameState, room, action.playerId, action.data.partnerCard)
      case 'play_card': {
        const cardId = action.data.cardId as string
        const callPartner = Boolean(action.data.callPartner)
        return this.handleThreeOhFourPlayCard(gameState, room, action.playerId, cardId, callPartner)
      }
      case 'pass_turn':
        if (threeOhFourData.gamePhase !== 'bidding') {
          throw new Error('pass_turn is only valid during bidding (use pass_bid)')
        }
        return this.handleThreeOhFourPassBid(gameState, room, action.playerId)
      case 'declare_marriages':
        return this.handleThreeOhFourDeclareMarriages(
          gameState,
          room,
          action.playerId,
          (action.data.suits || action.data.marriageSuits) as Suit[]
        )
      case 'finish_304_hand':
        return this.handleThreeOhFourFinishHand(gameState, room, action.playerId)
      case 'restart_game':
        return this.handleThreeOhFourRestartGame(gameState, room, action.playerId)
      default:
        throw new Error(`Unknown 304 action type: ${action.type}`)
    }
  }

  private handleThreeOhFourBid(gameState: GameState, room: any, playerId: string, amount: number): GameState {
    const threeOhFourData = gameState.gameData as ThreeOhFourGameData
    
    // Only current bidder can bid
    if (threeOhFourData.currentBidder !== playerId) {
      throw new Error('Not your turn to bid')
    }

    if (amount < 0 || amount > 304) {
      throw new Error('Invalid bid amount (max 304)')
    }

    // Bid must be higher than current highest bid
    if (amount <= threeOhFourData.bidAmount) {
      throw new Error('Bid must be higher than current bid')
    }

    // Update bid amount and bid winner
    threeOhFourData.bidAmount = amount
    threeOhFourData.bids[playerId] = amount

    // Move to next player for bidding (counter-clockwise), skipping passed players
    let nextPlayerIndex = (room.players.findIndex((p: Player) => p.id === playerId) + 1) % room.players.length
    let nextPlayer = room.players[nextPlayerIndex]
    
    // Skip players who have already passed
    while (threeOhFourData.passedPlayers.includes(nextPlayer.id)) {
      nextPlayerIndex = (nextPlayerIndex + 1) % room.players.length
      nextPlayer = room.players[nextPlayerIndex]
    }
    
    threeOhFourData.currentBidder = nextPlayer.id

    console.log(`${playerId} bids ${amount}, next bidder: ${nextPlayer.name}`)

    gameState.gameData = threeOhFourData
    this.gameStates.set(gameState.gameData.roomId, gameState)
    return gameState
  }

  private handleThreeOhFourSelectTrump(gameState: GameState, room: any, playerId: string, trumpSuit: string): GameState {
    const threeOhFourData = gameState.gameData as ThreeOhFourGameData
    
    // Only the bid winner can select trump
    if (threeOhFourData.bidWinner !== playerId) {
      throw new Error('Only the bid winner can select trump')
    }

    const normalized = this.normalize304Suit(trumpSuit)
    if (!normalized) {
      throw new Error('Invalid trump suit')
    }

    threeOhFourData.trumpSuit = normalized
    threeOhFourData.gamePhase = 'partner_selection'
    
    console.log(`${playerId} selected ${trumpSuit} as trump`)

    gameState.gameData = threeOhFourData
    this.gameStates.set(gameState.gameData.roomId, gameState)
    return gameState
  }

  private handleThreeOhFourSelectPartner(gameState: GameState, room: any, playerId: string, partnerCardData: any): GameState {
    const threeOhFourData = gameState.gameData as ThreeOhFourGameData
    
    // Only the bid winner can select partner
    if (threeOhFourData.bidWinner !== playerId) {
      throw new Error('Only the bid winner can select partner')
    }

    // Validate partner card data
    if (!partnerCardData || !partnerCardData.suit || !partnerCardData.rank) {
      throw new Error('Invalid partner card data')
    }

    // Create the partner card specification
    const partnerCard: Card = {
      id: `partner-${partnerCardData.suit}-${partnerCardData.rank}`,
      suit: partnerCardData.suit,
      rank: partnerCardData.rank,
      faceUp: true
    }

    threeOhFourData.partnerCard = partnerCard
    threeOhFourData.partnerHolderId = null
    for (const p of room.players) {
      if (p.hand.some((c: Card) => c.rank === partnerCard.rank && c.suit === partnerCard.suit)) {
        threeOhFourData.partnerHolderId = p.id
        break
      }
    }

    threeOhFourData.partnershipResolved = false
    threeOhFourData.isTwoVsTwo = null
    threeOhFourData.partnerCallThisTrick = false
    threeOhFourData.contractTargetDelta = 0
    threeOhFourData.bidderTrickPoints = 0
    threeOhFourData.defenseTrickPoints = 0
    threeOhFourData.tricksCompleted = 0
    threeOhFourData.pendingMarriagePlayerIds = []
    threeOhFourData.marriageBrokenSuitsThisRound = {}
    threeOhFourData.marriageLog = []
    threeOhFourData.awaitingFinalDeclarations = false
    threeOhFourData.currentTrick = []
    threeOhFourData.trickHistory = []

    threeOhFourData.gamePhase = 'playing'
    threeOhFourData.leadPlayer = threeOhFourData.bidWinner
    gameState.currentPlayer = threeOhFourData.bidWinner
    gameState.phase = 'playing'

    console.log(
      `${playerId} selected partner card: ${partnerCard.rank} of ${partnerCard.suit}. Holder: ${threeOhFourData.partnerHolderId}. ${playerId} leads first trick.`
    )

    gameState.gameData = threeOhFourData
    this.gameStates.set(gameState.gameData.roomId, gameState)
    return gameState
  }

  private isPlayerOnBidderSide(playerId: string, d: ThreeOhFourGameData): boolean {
    if (!d.bidWinner) return false
    if (!d.partnershipResolved) {
      return playerId === d.bidWinner
    }
    if (d.isTwoVsTwo && d.partnerHolderId) {
      return playerId === d.bidWinner || playerId === d.partnerHolderId
    }
    return playerId === d.bidWinner
  }

  /**
   * Session scoring (same room, multiple hands):
   * - Contract made: bid winner +bid; partner (2v2 only) +floor(bid/2).
   * - Contract set: defending side shares floor(bid/2) evenly among all defenders.
   */
  private apply304SessionScores(room: GameRoom, d: ThreeOhFourGameData, made: boolean): { [playerId: string]: number } {
    if (!room.sessionScores304) room.sessionScores304 = {}
    const sc = room.sessionScores304
    const bid = d.bidAmount
    const awarded: { [playerId: string]: number } = {}
    const bidderId = d.bidWinner
    if (!bidderId || bid < 1) {
      room.last304Hand = { made, bidAmount: bid, awarded: {} }
      this.roomManager.updateRoom(room.id, room)
      return {}
    }

    if (made) {
      sc[bidderId] = (sc[bidderId] ?? 0) + bid
      awarded[bidderId] = bid
      if (d.isTwoVsTwo && d.partnerHolderId && d.partnerHolderId !== bidderId) {
        const half = Math.floor(bid / 2)
        if (half > 0) {
          const pid = d.partnerHolderId
          sc[pid] = (sc[pid] ?? 0) + half
          awarded[pid] = half
        }
      }
    } else {
      const defenders = room.players.filter((p) => !this.isPlayerOnBidderSide(p.id, d))
      const pool = Math.floor(bid / 2)
      if (defenders.length > 0 && pool > 0) {
        const base = Math.floor(pool / defenders.length)
        let rem = pool - base * defenders.length
        defenders.forEach((p, i) => {
          const add = base + (i < rem ? 1 : 0)
          if (add <= 0) return
          sc[p.id] = (sc[p.id] ?? 0) + add
          awarded[p.id] = add
        })
      }
    }

    room.last304Hand = { made, bidAmount: bid, awarded }
    this.roomManager.updateRoom(room.id, room)
    return awarded
  }

  private resolve304PartnershipFromCallTrick(
    d: ThreeOhFourGameData,
    room: any,
    trickWinnerId: string
  ): void {
    const bidder = d.bidWinner!
    const partner = d.partnerHolderId
    const partnerWon = partner && trickWinnerId === partner
    const bidderWon = trickWinnerId === bidder
    if (bidderWon || partnerWon) {
      d.isTwoVsTwo = true
      const others = room.players.filter((p: Player) => p.id !== bidder && p.id !== partner)
      d.playerTeams = {
        [bidder]: 'team1',
        [partner!]: 'team1',
        [others[0].id]: 'team2',
        [others[1].id]: 'team2'
      }
      console.log(`304: 2v2 — bidder and partner (${partner})`)
    } else {
      d.isTwoVsTwo = false
      d.playerTeams = { [bidder]: 'team1' }
      for (const p of room.players) {
        if (p.id !== bidder) d.playerTeams[p.id] = 'team2'
      }
      console.log(`304: 1v3 — bidder alone`)
    }
    d.partnershipResolved = true
  }

  private handleThreeOhFourPlayCard(
    gameState: GameState,
    room: any,
    playerId: string,
    cardId: string,
    callPartner: boolean
  ): GameState {
    const d = gameState.gameData as ThreeOhFourGameData

    if (d.awaitingFinalDeclarations) {
      throw new Error('Play is over — declare marriages if you wish, then end the hand')
    }

    if (gameState.currentPlayer !== playerId) {
      throw new Error('Not your turn to play')
    }

    const player = room.players.find((p: Player) => p.id === playerId)
    if (!player) {
      throw new Error('Player not found')
    }

    const cardIndex = player.hand.findIndex((card: Card) => card.id === cardId)
    if (cardIndex === -1) {
      throw new Error('Card not found in player hand')
    }

    const playedCard = player.hand[cardIndex]

    if (d.currentTrick.length === 0 && playerId === d.bidWinner && !d.partnershipResolved && callPartner) {
      d.partnerCallThisTrick = true
    }

    if (!this.isLegalCardPlay304(playedCard, d.currentTrick, player.hand)) {
      throw new Error('Illegal card play — follow the led suit when you can')
    }

    const pc = d.partnerCard
    if (
      d.partnerCallThisTrick &&
      !d.partnershipResolved &&
      pc &&
      playerId === d.partnerHolderId
    ) {
      const hasPartner = player.hand.some((c: Card) => c.rank === pc.rank && c.suit === pc.suit)
      if (hasPartner && this.canPlayPartnerCard(pc, d.currentTrick, player.hand)) {
        const matchesPartner = playedCard.rank === pc.rank && playedCard.suit === pc.suit
        if (!matchesPartner) {
          throw new Error(`Partner was called — you must play the ${pc.rank} of ${pc.suit} when legal.`)
        }
      }
    }

    if (d.currentTrick.length === 0 && !d.awaitingFinalDeclarations) {
      d.pendingMarriagePlayerIds = []
      d.marriageBrokenSuitsThisRound = {}
    }

    const cardWithPlayer = { ...playedCard, playerId }
    d.currentTrick.push(cardWithPlayer as Card)
    player.hand.splice(cardIndex, 1)
    player.score = player.hand.length

    if (d.currentTrick.length < 4) {
      const currentIndex = room.players.findIndex((p: Player) => p.id === playerId)
      const nextIndex = (currentIndex + 1) % room.players.length
      gameState.currentPlayer = room.players[nextIndex].id
    } else {
      const trump = d.trumpSuit
      const trickWinnerId = this.determine304TrickWinner(d.currentTrick, trump)
      d.currentTrickWinner = trickWinnerId

      const callActive = d.partnerCallThisTrick
      if (callActive && !d.partnershipResolved) {
        this.resolve304PartnershipFromCallTrick(d, room, trickWinnerId)
      }
      d.partnerCallThisTrick = false

      const trickPoints = d.currentTrick.reduce(
        (total, card) => total + this.get304CardValue(card.rank),
        0
      )

      if (this.isPlayerOnBidderSide(trickWinnerId, d)) {
        d.bidderTrickPoints += trickPoints
        d.tricksWon.team1++
      } else {
        d.defenseTrickPoints += trickPoints
        d.tricksWon.team2++
      }
      d.roundScores.team1 = d.bidderTrickPoints
      d.roundScores.team2 = d.defenseTrickPoints

      const completedTrick = [...d.currentTrick]
      d.marriageBrokenSuitsThisRound = {}
      for (const c of completedTrick) {
        const pid = (c as Card & { playerId?: string }).playerId
        if (!pid || (c.rank !== 'K' && c.rank !== 'Q')) continue
        if (!d.marriageBrokenSuitsThisRound[pid]) d.marriageBrokenSuitsThisRound[pid] = []
        const suits = d.marriageBrokenSuitsThisRound[pid]
        if (!suits.includes(c.suit)) suits.push(c.suit)
      }

      const winnerOnBidderSide = this.isPlayerOnBidderSide(trickWinnerId, d)
      d.pendingMarriagePlayerIds = room.players
        .filter((p: Player) => this.isPlayerOnBidderSide(p.id, d) === winnerOnBidderSide)
        .map((p: Player) => p.id)

      d.trickHistory.push(completedTrick)
      d.currentTrick = []
      d.tricksCompleted++

      d.leadPlayer = trickWinnerId
      gameState.currentPlayer = trickWinnerId

      console.log(`Trick ${d.tricksCompleted} won by ${trickWinnerId} (${trickPoints} pts)`)

      if (d.tricksCompleted >= 8) {
        const bidderWonLast = this.isPlayerOnBidderSide(trickWinnerId, d)
        if (bidderWonLast) {
          d.contractTargetDelta -= 10
        } else {
          d.contractTargetDelta += 10
        }
        d.awaitingFinalDeclarations = true
        const required = d.bidAmount + d.contractTargetDelta
        console.log(
          `304: 8 tricks done — last-trick bonus applied. Awaiting final declarations. Provisional need>=${required}`
        )
      }
    }

    d.lastPlayedCard = playedCard
    d.lastPlayedBy = playerId

    gameState.gameData = d
    this.gameStates.set(gameState.gameData.roomId, gameState)
    this.roomManager.updateRoom(gameState.gameData.roomId, room)
    return gameState
  }

  private handleThreeOhFourDeclareMarriages(
    gameState: GameState,
    room: any,
    playerId: string,
    suits: Suit[]
  ): GameState {
    const d = gameState.gameData as ThreeOhFourGameData
    if (d.gamePhase !== 'playing') {
      throw new Error('Marriages only during play')
    }
    if (!d.pendingMarriagePlayerIds.includes(playerId)) {
      throw new Error('Only a player on the team that won the last trick may declare marriages')
    }
    if (d.currentTrick.length > 0) {
      throw new Error('Cannot declare marriages during a trick')
    }
    if (!suits?.length) {
      throw new Error('No suits provided')
    }

    const player = room.players.find((p: Player) => p.id === playerId)
    if (!player) throw new Error('Player not found')

    const trumpNorm = this.normalize304Suit(d.trumpSuit)
    let totalValue = 0
    const seen = new Set<Suit>()

    for (const suitRaw of suits) {
      const suit = this.normalize304Suit(suitRaw)
      if (!suit) {
        throw new Error(`Invalid suit in marriage declaration: ${String(suitRaw)}`)
      }
      if (seen.has(suit)) {
        throw new Error(`Duplicate suit in declaration: ${suit}`)
      }
      seen.add(suit)

      if (d.marriageLog.some((e) => e.suit === suit)) {
        throw new Error(`Marriage for ${suit} was already declared this hand`)
      }

      const broken = d.marriageBrokenSuitsThisRound[playerId] || []
      if (broken.includes(suit)) {
        throw new Error(
          `You played K or Q of ${suit} on that trick — the marriage for that suit is broken`
        )
      }

      const hasK = player.hand.some((c: Card) => c.suit === suit && c.rank === 'K')
      const hasQ = player.hand.some((c: Card) => c.suit === suit && c.rank === 'Q')
      if (!hasK || !hasQ) {
        throw new Error(`You need K and Q of ${suit} in hand to declare that marriage`)
      }
      const pts = trumpNorm !== null && suit === trumpNorm ? 40 : 20
      totalValue += pts
      d.marriageLog.push({ playerId, suit, points: pts })
    }

    const onBidderSide = this.isPlayerOnBidderSide(playerId, d)
    if (onBidderSide) {
      d.contractTargetDelta -= totalValue
    } else {
      d.contractTargetDelta += totalValue
    }

    gameState.gameData = d
    this.gameStates.set(gameState.gameData.roomId, gameState)
    return gameState
  }

  private handleThreeOhFourFinishHand(gameState: GameState, room: GameRoom, playerId: string): GameState {
    const d = gameState.gameData as ThreeOhFourGameData
    if (!d.awaitingFinalDeclarations) {
      throw new Error('Hand is not waiting for final declarations')
    }
    if (!d.pendingMarriagePlayerIds.includes(playerId)) {
      throw new Error('Only a player on the team that won the last trick may end the hand')
    }
    d.awaitingFinalDeclarations = false
    d.pendingMarriagePlayerIds = []
    d.marriageBrokenSuitsThisRound = {}
    d.gamePhase = 'ended'
    gameState.phase = 'ended'
    const required = d.bidAmount + d.contractTargetDelta
    const made = d.bidderTrickPoints >= required
    this.apply304SessionScores(room, d, made)
    console.log(`304 ended: bidder trick pts=${d.bidderTrickPoints}, need>=${required}, contract made=${made}`)
    gameState.gameData = d
    this.gameStates.set(gameState.gameData.roomId, gameState)
    return gameState
  }

  private handleThreeOhFourPassBid(gameState: GameState, room: any, playerId: string): GameState {
    const threeOhFourData = gameState.gameData as ThreeOhFourGameData
    
    // Only current bidder can pass
    if (threeOhFourData.currentBidder !== playerId) {
      throw new Error('Not your turn to pass')
    }

    // Add player to passedPlayers if not already there
    if (!threeOhFourData.passedPlayers.includes(playerId)) {
      threeOhFourData.passedPlayers.push(playerId)
    }

    // Check if 3 players have passed (leaving 1 winner)
    if (threeOhFourData.passedPlayers.length >= 3) {
      // Find the player who hasn't passed (the bid winner)
      const bidWinner = room.players.find((p: Player) => !threeOhFourData.passedPlayers.includes(p.id))
      if (bidWinner) {
        threeOhFourData.bidWinner = bidWinner.id
        threeOhFourData.currentBidder = null
        threeOhFourData.gamePhase = 'trump_selection'
        
        // Set up teams: bidder (team1) vs everyone else (team2)
        threeOhFourData.playerTeams = {}
        for (const player of room.players) {
          if (player.id === bidWinner.id) {
            threeOhFourData.playerTeams[player.id] = 'team1' // Bidder
          } else {
            threeOhFourData.playerTeams[player.id] = 'team2' // Everyone else
          }
        }
        
        console.log(`${bidWinner.name} wins the bid with ${threeOhFourData.bidAmount}. Teams: ${bidWinner.name} vs everyone else`)
      }
    } else {
      // Move to next player who hasn't passed
      let nextPlayerIndex = (room.players.findIndex((p: Player) => p.id === playerId) + 1) % room.players.length
      let nextPlayer = room.players[nextPlayerIndex]
      
      // Skip players who have already passed
      while (threeOhFourData.passedPlayers.includes(nextPlayer.id)) {
        nextPlayerIndex = (nextPlayerIndex + 1) % room.players.length
        nextPlayer = room.players[nextPlayerIndex]
      }
      
      threeOhFourData.currentBidder = nextPlayer.id
      console.log(`${playerId} passes, next bidder: ${nextPlayer.name}`)
    }

    gameState.gameData = threeOhFourData
    this.gameStates.set(gameState.gameData.roomId, gameState)
    return gameState
  }

  private handleThreeOhFourRestartGame(gameState: GameState, room: any, playerId: string): GameState {
    const threeOhFourData = gameState.gameData as ThreeOhFourGameData
    
    // Add this player's request to restart game (if not already requested)
    if (!threeOhFourData.restartRequests.includes(playerId)) {
      threeOhFourData.restartRequests.push(playerId)
    }
    
    const need = Math.max(4, room.players.length)
    if (threeOhFourData.restartRequests.length >= need) {
      room.last304Hand = undefined
      room.players.forEach((player: any) => {
        player.isReady = false
        player.isActive = false
        player.score = 0
      })

      const deck = this.createDeck()
      const shuffledDeck = this.shuffleDeck(deck)
      const newGameState = this.initializeThreeOhFourGame(gameState.gameData.roomId, room.players, shuffledDeck)
      newGameState.round = (gameState.round ?? 0) + 1

      this.roomManager.updateRoom(gameState.gameData.roomId, room)
      this.gameStates.set(gameState.gameData.roomId, newGameState)

      console.log('304 game restarted — all players agreed')
      return newGameState
    } else {
      console.log(`Player ${playerId} requested to restart game. Waiting for other player...`)
      
      gameState.gameData = threeOhFourData
      this.gameStates.set(gameState.gameData.roomId, gameState)
      return gameState
    }
  }

  private isConsecutive(playedCard: Card, topCard: Card): boolean {
    const playedValue = this.getCardValue(playedCard)
    const topValue = this.getCardValue(topCard)
    
    // Check if cards are consecutive (up or down)
    const diff = Math.abs(playedValue - topValue)
    
    // Handle Ace being both high and low
    if (diff === 1) {
      return true
    }
    
    // Special case: Ace and King are consecutive
    if ((playedValue === 14 && topValue === 13) || (playedValue === 13 && topValue === 14)) {
      return true
    }
    
    // Special case: Ace and 2 are consecutive
    if ((playedValue === 14 && topValue === 2) || (playedValue === 2 && topValue === 14)) {
      return true
    }
    
    return false
  }

  private async processGenericAction(roomId: string, action: GameAction, gameState: GameState, room: any): Promise<GameState> {
    // Validate it's the player's turn
    if (gameState.currentPlayer !== action.playerId) {
      throw new Error('Not your turn')
    }

    // Process the action based on type
    switch (action.type) {
      case 'play_card':
        this.handlePlayCard(gameState, action, room)
        break
      case 'draw_card':
        this.handleDrawCard(gameState, action, room)
        break
      case 'pass_turn':
        this.handlePassTurn(gameState, action)
        break
      case 'fold':
        this.handleFold(gameState, action, room)
        break
      default:
        throw new Error(`Unknown action type: ${action.type}`)
    }

    // Update turn and check for next player
    this.advanceToNextPlayer(gameState, roomId)
    
    this.gameStates.set(roomId, gameState)
    return gameState
  }

  checkGameEnd(roomId: string): Player | null {
    const gameState = this.gameStates.get(roomId)
    const room = this.roomManager.getRoom(roomId)
    
    if (!gameState || !room) {
      return null
    }

    if (room.gameType === 'war') {
      const playersWithCards = room.players.filter((player: Player) => player.hand.length > 0)
      if (playersWithCards.length === 1) {
        return playersWithCards[0]
      }
      return null
    }

    if (room.gameType === '304') {
      // Hands end with finish_304_hand; session continues — no global game:ended winner per hand
      return null
    }

    for (const player of room.players) {
      if (player.hand.length === 0) {
        return player
      }
    }

    return null
  }

  private createDeck(): Card[] {
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
    const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const deck: Card[] = []

    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({
          id: uuidv4(),
          suit,
          rank,
          faceUp: false,
        })
      }
    }

    return deck
  }

  private shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  private dealInitialCards(players: Player[], deck: Card[], gameType: string): void {
    const cardsPerPlayer = this.getInitialCardCount(gameType)
    
    for (let i = 0; i < cardsPerPlayer; i++) {
      for (const player of players) {
        if (deck.length > 0) {
          const card = deck.pop()!
          card.faceUp = true // Players can see their own cards
          player.hand.push(card)
        }
      }
    }
  }

  private getInitialCardCount(gameType: string): number {
    switch (gameType) {
      case 'poker':
        return 5
      case 'blackjack':
        return 2
      case 'hearts':
        return 13
      case 'go-fish':
        return 7
      case 'war':
        return 0 // War deals all cards at start
      default:
        return 7
    }
  }

  private handlePlayCard(gameState: GameState, action: GameAction, room: any): void {
    const player = room.players.find((p: Player) => p.id === action.playerId)
    if (!player) return

    const cardId = action.data.cardId
    const cardIndex = player.hand.findIndex((c: Card) => c.id === cardId)
    
    if (cardIndex === -1) {
      throw new Error('Card not found in hand')
    }

    // Move card from hand to discard pile
    const playedCard = player.hand.splice(cardIndex, 1)[0]
    playedCard.faceUp = true
    gameState.discardPile.push(playedCard)
  }

  private handleDrawCard(gameState: GameState, action: GameAction, room: any): void {
    const player = room.players.find((p: Player) => p.id === action.playerId)
    if (!player) return

    if (gameState.deck.length === 0) {
      throw new Error('No cards left in deck')
    }

    const drawnCard = gameState.deck.pop()!
    drawnCard.faceUp = true
    player.hand.push(drawnCard)
  }

  private handlePassTurn(gameState: GameState, action: GameAction): void {
    // Just advance to next player (handled in advanceToNextPlayer)
  }

  private handleFold(gameState: GameState, action: GameAction, room: any): void {
    const player = room.players.find((p: Player) => p.id === action.playerId)
    if (player) {
      player.isActive = false
    }
  }

  private advanceToNextPlayer(gameState: GameState, roomId: string): void {
    const room = this.roomManager.getRoom(roomId)
    if (!room) return

    const activePlayers = room.players.filter((p: Player) => p.isActive)
    if (activePlayers.length <= 1) {
      gameState.phase = 'ended'
      return
    }

    const currentIndex = activePlayers.findIndex((p: Player) => p.id === gameState.currentPlayer)
    const nextIndex = (currentIndex + 1) % activePlayers.length
    gameState.currentPlayer = activePlayers[nextIndex].id
    gameState.turn++
  }

  /** Trick-taking strength: J > 9 > A > 10 > K > Q > 8 > 7 (higher number = stronger) */
  private get304TrickStrength(rank: Rank): number {
    const order: Partial<Record<Rank, number>> = {
      J: 8,
      '9': 7,
      A: 6,
      '10': 5,
      K: 4,
      Q: 3,
      '8': 2,
      '7': 1
    }
    return order[rank] ?? 0
  }

  private compare304TrickCards(a: Card, b: Card): number {
    const ta = this.get304TrickStrength(a.rank)
    const tb = this.get304TrickStrength(b.rank)
    if (ta !== tb) return ta - tb
    return this.getSuitValue(a.suit) - this.getSuitValue(b.suit)
  }

  /** Canonicalize suit strings so marriage/trump checks are stable over the wire. */
  private normalize304Suit(raw: unknown): Suit | null {
    if (raw == null || typeof raw !== 'string') return null
    const s = raw.trim().toLowerCase()
    if (s === 'hearts' || s === 'diamonds' || s === 'clubs' || s === 'spades') {
      return s
    }
    return null
  }

  private determine304TrickWinner(trick: Card[], trumpSuit: Suit | null): string {
    if (trick.length === 0) {
      return ''
    }
    const leadingSuit = trick[0].suit
    const trumpCards = trumpSuit ? trick.filter((card) => card.suit === trumpSuit) : []
    const pool = trumpCards.length > 0 ? trumpCards : trick.filter((card) => card.suit === leadingSuit)

    let best = pool[0]
    for (let i = 1; i < pool.length; i++) {
      if (this.compare304TrickCards(pool[i], best) > 0) {
        best = pool[i]
      }
    }
    return (best as Card & { playerId: string }).playerId
  }

  private get304CardValue(rank: string): number {
    // 304 card values: J=30, 9=20, A=11, 10=10, K=3, Q=2, 8=0, 7=0
    switch (rank) {
      case 'J': return 30;
      case '9': return 20;
      case 'A': return 11;
      case '10': return 10;
      case 'K': return 3;
      case 'Q': return 2;
      case '8': return 0;
      case '7': return 0;
      default: return 0;
    }
  }

  private getSuitValue(suit: string): number {
    switch (suit) {
      case 'spades': return 4;
      case 'hearts': return 3;
      case 'diamonds': return 2;
      case 'clubs': return 1;
      default: return 0;
    }
  }

  private canPlayPartnerCard(partnerCard: Card, currentTrick: Card[], playerHand: Card[]): boolean {
    // If no trick started yet, partner card can always be played
    if (currentTrick.length === 0) {
      return true;
    }

    const leadingSuit = currentTrick[0].suit;
    
    // If partner card is the same suit as leading suit, can always play it
    if (partnerCard.suit === leadingSuit) {
      return true;
    }
    
    // If partner card is different suit, can only play if player has no cards of leading suit
    const hasLeadingSuitCards = playerHand.some(card => card.suit === leadingSuit);
    return !hasLeadingSuitCards;
  }

  /** Must follow led suit when possible; if void, any card is legal. */
  private isLegalCardPlay304(playedCard: Card, currentTrick: Card[], playerHand: Card[]): boolean {
    if (currentTrick.length === 0) {
      return true
    }
    const leadingSuit = currentTrick[0].suit
    const hasLedSuit = playerHand.some((card) => card.suit === leadingSuit)
    if (hasLedSuit) {
      return playedCard.suit === leadingSuit
    }
    return true
  }
} 
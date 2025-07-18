import { v4 as uuidv4 } from 'uuid'
import type { GameState, GameAction, Player, Card, Suit, Rank, WarGameData, SpeedGameData, SpeedAction } from '../../../shared/types'
import { RoomManager } from './RoomManager'

export class GameManager {
  private gameStates: Map<string, GameState> = new Map()
  
  constructor(private roomManager: RoomManager) {}

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
      restartRequests: []
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
    
    // Check if both players are ready (simple implementation - could be improved)
    if (speedData.gamePhase === 'waiting_for_ready') {
      // Flip cards from stock piles to play piles
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
      console.log('Speed game started! Cards flipped to play piles')
    }

    gameState.gameData = speedData
    this.gameStates.set(gameState.gameData.roomId, gameState)
    return gameState
  }

  private handleSpeedPlayCard(gameState: GameState, room: any, playerId: string, cardId: string, targetPile: 'left' | 'right'): GameState {
    const player = room.players.find((p: Player) => p.id === playerId)
    if (!player) {
      throw new Error('Player not found')
    }

    const speedData = gameState.gameData as SpeedGameData
    
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
      
      // Update the room with the reset player states
      this.roomManager.updateRoom(gameState.gameData.roomId, room)
      
      console.log('Speed game restarted by both players - all states reset')
      return newGameState
    } else {
      console.log(`Player ${playerId} requested to restart game. Waiting for other player...`)
      
      gameState.gameData = speedData
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
      // In war, winner is the player with all cards
      const playersWithCards = room.players.filter((player: Player) => player.hand.length > 0)
      if (playersWithCards.length === 1) {
        return playersWithCards[0]
      }
    } else {
      // Check for win conditions (simplified)
      for (const player of room.players) {
        if (player.hand.length === 0) {
          return player
        }
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
} 
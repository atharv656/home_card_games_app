import React, { createContext, useContext } from 'react'
import { create } from 'zustand'
import type { GameRoom, GameState, Player, Card } from '@shared/types'

interface GameStore {
  // Current room state
  currentRoom: GameRoom | null
  gameState: GameState | null
  currentPlayer: Player | null
  
  // UI state
  selectedCards: Card[]
  isPlayerTurn: boolean
  isGameStarted: boolean
  
  // Actions
  setCurrentRoom: (room: GameRoom | null) => void
  setGameState: (state: GameState | null) => void
  setCurrentPlayer: (player: Player | null) => void
  setSelectedCards: (cards: Card[]) => void
  toggleCardSelection: (card: Card) => void
  clearSelectedCards: () => void
  setIsPlayerTurn: (isPlayerTurn: boolean) => void
  setIsGameStarted: (isGameStarted: boolean) => void
}

const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  currentRoom: null,
  gameState: null,
  currentPlayer: null,
  selectedCards: [],
  isPlayerTurn: false,
  isGameStarted: false,
  
  // Actions
  setCurrentRoom: (room) => set({ currentRoom: room }),
  setGameState: (state) => set({ gameState: state }),
  setCurrentPlayer: (player) => set({ currentPlayer: player }),
  setSelectedCards: (cards) => set({ selectedCards: cards }),
  toggleCardSelection: (card) => {
    const { selectedCards } = get()
    const isSelected = selectedCards.some(c => c.id === card.id)
    
    if (isSelected) {
      set({ selectedCards: selectedCards.filter(c => c.id !== card.id) })
    } else {
      set({ selectedCards: [...selectedCards, card] })
    }
  },
  clearSelectedCards: () => set({ selectedCards: [] }),
  setIsPlayerTurn: (isPlayerTurn) => set({ isPlayerTurn }),
  setIsGameStarted: (isGameStarted) => set({ isGameStarted }),
}))

// Create context for providing the store
const GameStateContext = createContext<GameStore | undefined>(undefined)

export const useGameState = () => {
  const context = useContext(GameStateContext)
  if (context === undefined) {
    // Return the store directly if context is not available
    return useGameStore()
  }
  return context
}

interface GameStateProviderProps {
  children: React.ReactNode
}

export const GameStateProvider: React.FC<GameStateProviderProps> = ({ children }) => {
  const store = useGameStore()

  return (
    <GameStateContext.Provider value={store}>
      {children}
    </GameStateContext.Provider>
  )
} 
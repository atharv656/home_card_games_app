// Shared types for the card game app

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  score: number;
  isReady: boolean;
  isActive: boolean;
}

export interface GameRoom {
  id: string;
  name: string;
  gameType: GameType;
  players: Player[];
  maxPlayers: number;
  isStarted: boolean;
  isPrivate: boolean;
  createdAt: Date;
  settings: GameSettings;
}

export type GameType = 'poker' | 'blackjack' | 'hearts' | 'spades' | 'go-fish' | 'war' | 'speed' | 'solitaire';

export interface GameSettings {
  maxPlayers: number;
  turnTimeLimit?: number;
  allowSpectators: boolean;
  [key: string]: any; // Game-specific settings
}

export interface GameState {
  currentPlayer: string;
  phase: GamePhase;
  deck: Card[];
  discardPile: Card[];
  turn: number;
  round: number;
  gameData: any; // Game-specific data
}

export type GamePhase = 'waiting' | 'dealing' | 'playing' | 'battle' | 'war' | 'ended';

// War-specific types
export interface WarGameData {
  battleCards: { [playerId: string]: Card[] }; // Cards currently in battle
  warPile: Card[]; // Cards accumulated during war
  lastBattleWinner: string | null;
  isInWar: boolean;
  battleResult: 'pending' | 'winner' | 'war';
  warCount: number; // Number of consecutive wars
}

export interface WarAction extends GameAction {
  type: 'play_card' | 'reveal_card' | 'acknowledge_result';
}

// Speed-specific types
export interface SpeedGameData {
  leftStockPile: Card[]; // Left outer pile (face-down)
  rightStockPile: Card[]; // Right outer pile (face-down)  
  leftPlayPile: Card[]; // Left center pile (face-up)
  rightPlayPile: Card[]; // Right center pile (face-up)
  playerDecks: { [playerId: string]: Card[] }; // Each player's remaining cards
  gamePhase: 'setup' | 'waiting_for_ready' | 'playing' | 'ended';
  lastPlayedCard: Card | null; // For race condition handling
  lastPlayedBy: string | null; // Who played the last card
  winner: string | null;
  flipRequests: string[]; // Track which players want to flip new cards
  restartRequests: string[]; // Track which players want to restart the game
}

export interface SpeedAction extends GameAction {
  type: 'play_card' | 'ready_to_start' | 'flip_new_cards' | 'restart_game';
  cardId?: string; // ID of card being played
  targetPile?: 'left' | 'right'; // Which center pile to play on
}

// Socket events
export interface ServerToClientEvents {
  'room:joined': (room: GameRoom) => void;
  'room:left': (playerId: string) => void;
  'room:updated': (room: GameRoom) => void;
  'game:started': (gameState: GameState) => void;
  'game:updated': (gameState: GameState) => void;
  'game:ended': (winner: Player) => void;
  'player:joined': (player: Player) => void;
  'player:left': (playerId: string) => void;
  'battle:result': (result: { winner: string | null, cards: Card[], isWar: boolean }) => void;
  'error': (message: string) => void;
}

export interface ClientToServerEvents {
  'room:join': (roomId: string, playerName: string) => void;
  'room:leave': (roomId: string) => void;
  'room:create': (roomConfig: Partial<GameRoom> & { playerName?: string }) => void;
  'game:start': (roomId: string) => void;
  'game:action': (roomId: string, action: GameAction) => void;
  'player:ready': (roomId: string, isReady: boolean) => void;
}

export interface GameAction {
  type: string;
  playerId: string;
  data: any;
}

export interface RoomListItem {
  id: string;
  name: string;
  gameType: GameType;
  playerCount: number;
  maxPlayers: number;
  isStarted: boolean;
  isPrivate: boolean;
} 
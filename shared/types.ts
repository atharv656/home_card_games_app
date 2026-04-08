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

export interface Game304LastHandSummary {
  made: boolean;
  bidAmount: number;
  /** Session points awarded this hand (playerId → delta) */
  awarded: { [playerId: string]: number };
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
  /** Running 304 session totals (persists across Play again in the same room) */
  sessionScores304?: { [playerId: string]: number };
  /** Last completed 304 hand (for end-of-hand UI) */
  last304Hand?: Game304LastHandSummary;
}

export type GameType = 'poker' | 'blackjack' | 'hearts' | 'spades' | 'go-fish' | 'war' | 'speed' | 'solitaire' | '304';

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

export type GamePhase = 'waiting' | 'dealing' | 'playing' | 'battle' | 'war' | 'bidding' | 'trump_selection' | 'partner_selection' | 'ended';

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
  /** Both players must appear here before stock flips to center (game starts). */
  readyToStartPlayerIds: string[];
}

export interface SpeedAction extends GameAction {
  type: 'play_card' | 'ready_to_start' | 'flip_new_cards' | 'restart_game';
  cardId?: string; // ID of card being played
  targetPile?: 'left' | 'right'; // Which center pile to play on
}

// 304-specific types (see README "304" section)
export interface ThreeOhFourMarriageLogEntry {
  playerId: string;
  suit: Suit;
  points: number;
}

export interface ThreeOhFourGameData {
  currentTrick: Card[];
  trumpSuit: Suit | null;
  bidAmount: number;
  bidWinner: string | null;
  teamScores: { team1: number; team2: number };
  playerTeams: { [playerId: string]: 'team1' | 'team2' };
  gamePhase: 'bidding' | 'trump_selection' | 'partner_selection' | 'playing' | 'ended';
  currentBidder: string | null;
  bids: { [playerId: string]: number };
  passedPlayers: string[];
  tricksWon: { team1: number; team2: number };
  currentTrickWinner: string | null;
  /** team1 = bid winner's side card points, team2 = defenders' card points from tricks */
  roundScores: { team1: number; team2: number };
  leadPlayer: string | null;
  partnerCard: Card | null;
  /** Player who holds the nominated partner card (by rank+suit) after deal */
  partnerHolderId: string | null;
  /** Set after the "call partner" trick resolves (or stays false if never called) */
  partnershipResolved: boolean;
  /** After resolution: true = 2v2 bidder+partner, false = 1v3 */
  isTwoVsTwo: boolean | null;
  /** Bid winner called partner on the current trick (cleared after trick completes) */
  partnerCallThisTrick: boolean;
  /**
   * Added to bid amount to get required trick points: required = bidAmount + contractTargetDelta.
   * Bidder-side marriages / bidder won last trick → more negative (easier).
   * Defender marriages / defenders won last trick → more positive (harder).
   */
  contractTargetDelta: number;
  bidderTrickPoints: number;
  defenseTrickPoints: number;
  tricksCompleted: number;
  trickHistory: Card[][];
  flipRequests: string[];
  restartRequests: string[];
  lastPlayedCard: Card | null;
  lastPlayedBy: string | null;
  /** Players on the team that won the last trick may declare before the next trick starts */
  pendingMarriagePlayerIds: string[];
  /**
   * After each trick: suits for which this player played K or Q on that trick (marriage broken for them).
   * Cleared when the next trick begins.
   */
  marriageBrokenSuitsThisRound: { [playerId: string]: Suit[] };
  marriageLog: ThreeOhFourMarriageLogEntry[];
  /** After the 8th trick: winner may declare marriages, then must finish the hand */
  awaitingFinalDeclarations: boolean;
}

export interface ThreeOhFourAction extends GameAction {
  type: 'bid' | 'pass_bid' | 'select_trump' | 'select_partner' | 'play_card' | 'pass_turn' | 'declare_marriages' | 'finish_304_hand' | 'restart_game';
  bidAmount?: number;
  trumpSuit?: Suit;
  partnerCard?: Card;
  cardId?: string;
  /** When the bid winner leads, optional: call partner for this trick */
  callPartner?: boolean;
  /** Suits for which the player shows K+Q from hand (each suit one marriage) */
  marriageSuits?: Suit[];
}

// Socket events
export interface ServerToClientEvents {
  'room:joined': (room: GameRoom) => void;
  'room:left': (playerId: string) => void;
  'room:updated': (room: GameRoom) => void;
  /** Issued when you join a room — store client-side to call room:rejoin after refresh/reconnect. */
  'rejoin:issued': (payload: { roomId: string; rejoinToken: string }) => void;
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
  /** Restore seat after disconnect (same as refresh with saved token). */
  'room:rejoin': (roomId: string, rejoinToken: string) => void;
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
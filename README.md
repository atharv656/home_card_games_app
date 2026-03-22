# Card Game App

A comprehensive web application for playing classic card games with multiplayer support. Built with modern web technologies and designed for extensibility.

## 🎮 Features

- **Multiplayer Support**: Real-time multiplayer games using Socket.IO
- **Beautiful Card UI**: Custom-designed cards with animations and drag-and-drop
- **Multiple Game Types**: Support for poker, blackjack, hearts, spades, go-fish, and more
- **Real-time Communication**: WebSocket-based real-time game state synchronization
- **Responsive Design**: Works on desktop and mobile devices
- **Room Management**: Create and join game rooms with customizable settings
- **State Management**: Robust game state handling with Zustand

## 🏗️ Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and building
- **Styling**: Tailwind CSS with custom card game themes
- **State Management**: Zustand for global state management
- **Drag & Drop**: React DnD for interactive card manipulation
- **Animations**: Framer Motion for smooth card animations
- **WebSocket**: Socket.IO client for real-time communication

### Backend (Node.js + TypeScript)
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST API
- **WebSocket**: Socket.IO for real-time multiplayer
- **Game Logic**: Custom game managers for different card games
- **Room Management**: In-memory room and player management

### Shared Types
- **Type Safety**: Shared TypeScript interfaces between frontend and backend
- **Consistency**: Ensures type safety across the entire application

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd card-game-app
   ```

2. **Install dependencies for all packages**
   ```bash
   npm run install:all
   ```

3. **Start the development servers**
   ```bash
   npm run dev
   ```

This will start:
- Frontend development server on `http://localhost:3000`
- Backend server on `http://localhost:5000`

### Alternative: Manual Setup

If you prefer to set up each part manually:

1. **Backend Setup**
   ```bash
   cd backend
   npm install
   npm run dev
   ```

2. **Frontend Setup** (in another terminal)
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## 📁 Project Structure

```
card-game-app/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   │   ├── Card.tsx     # Individual card component
│   │   │   └── Hand.tsx     # Player hand component
│   │   ├── contexts/        # React contexts
│   │   │   ├── SocketContext.tsx    # WebSocket connection
│   │   │   └── GameStateContext.tsx # Game state management
│   │   ├── pages/           # Page components
│   │   └── App.tsx          # Main app component
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── backend/                  # Node.js backend server
│   ├── src/
│   │   ├── game/            # Game logic
│   │   │   ├── GameManager.ts    # Game state management
│   │   │   └── RoomManager.ts    # Room management
│   │   └── index.ts         # Server entry point
│   ├── package.json
│   └── tsconfig.json
├── shared/                   # Shared TypeScript types
│   └── types.ts             # Common interfaces
└── package.json             # Root package.json
```

## 🎨 Card UI Components

### Card Component
The `Card` component provides:
- **Visual Design**: Beautiful card styling with suit colors
- **Animations**: Smooth hover and selection effects
- **Drag & Drop**: Interactive card manipulation
- **State Management**: Selected, playable, and face-up/down states

### Hand Component
The `Hand` component offers:
- **Layout Options**: Fan, linear, or grid layouts
- **Card Management**: Handles multiple cards with proper spacing
- **Interactions**: Click and double-click handlers
- **Responsive Design**: Adapts to different screen sizes

## 🔧 Game Logic

### Game Manager
- **Turn Management**: Handles player turns and game flow
- **Card Operations**: Deal, shuffle, play, and draw cards
- **Game Rules**: Extensible system for different card games
- **Win Conditions**: Configurable win condition checking

### Room Manager
- **Room Creation**: Create and configure game rooms
- **Player Management**: Handle player joining/leaving
- **Game State**: Track ready states and game progression
- **Cleanup**: Automatic room cleanup when empty

## 🌐 WebSocket Events

### Client to Server
- `room:join` - Join a game room
- `room:create` - Create a new room
- `game:start` - Start a game
- `game:action` - Send game actions
- `player:ready` - Set player ready status

### Server to Client
- `room:joined` - Successfully joined room
- `room:updated` - Room state changed
- `game:started` - Game has started
- `game:updated` - Game state updated
- `game:ended` - Game finished

## 🎯 Best Card GUI Libraries & Resources

Based on research, here are the top recommendations for card game UI development:

### 1. **React-Based Solutions**
- **React DnD** (Used in this project) - Excellent for drag-and-drop card interactions
- **Framer Motion** (Used in this project) - Perfect for smooth card animations
- **React Spring** - Alternative animation library with physics-based animations

### 2. **Specialized Card Libraries**
- **Cartomancy.js** - Lightweight JavaScript library specifically for card games
  - Zero dependencies, single file
  - Supports custom card designs beyond standard 52-card deck
  - Built-in deck management and virtual decks
  
- **React Pop Cards** - Card popping animations with spring physics
  - Easy to integrate with React
  - Customizable tension and friction settings

### 3. **Game Engines (For More Complex Games)**
- **PixiJS** - High-performance 2D WebGL renderer
  - Excellent for complex card animations
  - Great performance for games with many cards
  
- **Phaser** - Comprehensive 2D game framework
  - Used by Vampire Survivors initially
  - Full physics engine and animation system
  
- **Excalibur.js** - TypeScript-first 2D game engine
  - Great for TypeScript projects
  - Cross-platform support

### 4. **Card Assets**
- **MrEliptik's Playing Cards** - Free CC0 stylized card pack
  - Available as PNG and SVG
  - Black and white versions included
  
- **TheDevCards** - Programming-themed playing cards
  - Great for developer-focused games
  - Customizable with usernames

### 5. **UI Component Libraries**
- **Material-UI (MUI)** - Comprehensive React component library
  - Good for general UI elements around the game
  - Professional-looking components
  
- **React Native Swipeable Cards** - For mobile card interactions
  - Tinder-like swipe mechanics
  - Configurable animations

## 🎮 Supported Games

The architecture supports multiple card games:
- **Poker** - 5-card hands
- **Blackjack** - 21 card game
- **Hearts** - Trick-taking game
- **Spades** - Partnership card game
- **Go Fish** - Matching card game
- **War** - Simple comparison game
- **Speed** - Two-player shedder
- **304** - Four-player bidding and tricks (see section above)
- **Speed** - Two-player real-time shedder (see `GameManager` / `GameRoom`)
- **304** - Four-player Sri Lankan-style 304 (rules below)

### 304 (four players, 32-card deck: 7–A)

These are the rules implemented in this repo (adjust in `GameManager.ts` if your house rules differ).

**Deck and deal**  
Only ranks 7, 8, 9, 10, J, Q, K, A (32 cards). Each player receives 8 cards.

**Bidding**  
Players bid a number in turn. Each bid must be **higher than the previous bid**, or the player may **pass**. The maximum bid is **304**. After three players have passed, the remaining player wins the bid and becomes the **bid winner** (declarer).

**Trump and partner**  
The bid winner chooses **trump suit** and nominates a **partner card** (rank + suit). Whoever holds that card is the hidden partner until partnerships are decided (see below).

**Legal play**  
You **must follow the suit that was led** if you have any card in that suit. If you are **void** in the led suit, you may play **any** card.

**Winning a trick**  
If any trump was played, the highest **trump** wins (by strength order below). Otherwise the highest card of the **led suit** wins.

**Card strength (high → low)** — same order used for trick comparison and for point values on cards:

| Rank | Trick strength | Points |
|------|----------------|--------|
| J | Highest | 30 |
| 9 | | 20 |
| A | | 11 |
| 10 | | 10 |
| K | | 3 |
| Q | | 2 |
| 8 | | 0 |
| 7 | Lowest | 0 |

If two cards tie on the values above, **suit order** breaks ties: **spades → hearts → diamonds → clubs** (higher wins).

**Calling partner**  
When the **bid winner leads** a trick, they may **call partner** for that trick (declared when they play their lead card). The player who holds the **partner card** must play it on that trick **if legally able** (follow-suit rules still apply).

**Partnership outcome (2v2 vs 1v3)**  
On a trick where partner was called, after the trick is resolved:

- If **either** the bid winner **or** the partner-card holder **wins** the trick → they become **partners** (**2v2** vs the other two).
- Otherwise it stays **1v3** (bid winner alone vs the other three).

If the bid winner never calls partner during the hand, **partnership stays unresolved** and scoring treats the bid winner as a solo side for the whole hand.

**Making the contract**  
The bid winner’s side tries to take enough **card points** in tricks to reach their **bid**. A running **contract adjustment** modifies how many points they need:

- **Marriages**: Only players on the team that **won the trick** may declare (any member of that team, before the next trick’s lead is played). You must still hold **both** K and Q of the suit in hand. If **you** played the K or Q of that suit **on that same trick**, you have **broken** that marriage for scoring—you cannot declare it. **Trump** K+Q = **40** points adjustment; **non-trump** K+Q = **20** each. If the **bid winner’s side** declares marriages, the points they need **decrease** by that amount. If the **defending side** declares, the points the bidder needs **increase** by that amount. Multiple marriages can be declared together.
- **Last trick**: The side that wins the **eighth (last) trick** applies a **10** point adjustment in the same direction (easier for the bid winner’s side if they take it, harder if the defenders take it).

At the end of the hand, the bid winner’s side **makes** the contract if their **total trick card points** ≥ **bid amount + contract adjustment** (where a negative adjustment means they need fewer trick points, and a positive adjustment means they need more).

After the **eighth trick**, the app applies the last-trick bonus to the contract adjustment, then the **last trick winner** may declare any marriages still allowed, and must press **End hand** in the UI to finalize scoring (so marriages after the last trick are still counted).

**Session scoring (same room, multiple hands)**  
When a hand ends, **session points** update on the room (shown in the sidebar):

- If the **contract is made**: the **bid winner** gains session points equal to their **bid**; in **2v2**, the **partner** gains **half the bid** (integer half, rounded down).
- If the **contract is set**: the **defending** players **split half the bid** evenly among them (remainder distributed one point at a time in table order).

Use **Play again** so all players agree to start the next hand; session totals persist until you leave the room (or the room is cleared).

## 🛠️ Development

### Adding New Games
1. Add game type to `shared/types.ts`
2. Implement game logic in `GameManager.ts`
3. Create game-specific UI components
4. Add game rules and win conditions

### Customizing Cards
- Modify the `Card` component styling
- Update CSS variables in `index.css`
- Add new card designs to the assets folder

## 🚀 Deployment

### Frontend
```bash
cd frontend
npm run build
```

### Backend
```bash
cd backend
npm run build
npm start
```

The built frontend can be served statically, while the backend needs a Node.js environment.

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For questions or issues:
- Create an issue on GitHub
- Check the documentation
- Join our community discussions

---

**Happy Gaming! 🎲🃏** 
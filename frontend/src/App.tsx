// import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { SocketProvider } from './contexts/SocketContext'
import { GameStateProvider } from './contexts/GameStateContext'
import Home from './pages/Home'
import GameRoom from './pages/GameRoom'
import RoomList from './pages/RoomList'
import './App.css'

function App() {
  return (
    <SocketProvider>
      <GameStateProvider>
        <div className="App">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/rooms" element={<RoomList />} />
            <Route path="/room/:roomId" element={<GameRoom />} />
          </Routes>
        </div>
      </GameStateProvider>
    </SocketProvider>
  )
}

export default App 
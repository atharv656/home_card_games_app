import React from 'react'
import { useDrag } from 'react-dnd'
import { motion } from 'framer-motion'
import type { Card as CardType } from '@shared/types'

interface CardProps {
  card: CardType
  onClick?: (card: CardType) => void
  onDoubleClick?: (card: CardType) => void
  isSelected?: boolean
  isDraggable?: boolean
  isPlayable?: boolean
  showRank?: boolean
  showSuit?: boolean
  className?: string
}

const Card: React.FC<CardProps> = ({
  card,
  onClick,
  onDoubleClick,
  isSelected = false,
  isDraggable = true,
  isPlayable = true,
  showRank = true,
  showSuit = true,
  className = '',
}) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'card',
    item: { card },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: isDraggable && isPlayable,
  }))

  const getSuitSymbol = (suit: string) => {
    switch (suit) {
      case 'hearts': return '♥'
      case 'diamonds': return '♦'
      case 'clubs': return '♣'
      case 'spades': return '♠'
      default: return ''
    }
  }

  const getSuitColor = (suit: string) => {
    return suit === 'hearts' || suit === 'diamonds' ? 'text-red-600' : 'text-gray-800'
  }

  const handleClick = () => {
    if (onClick && isPlayable) {
      onClick(card)
    }
  }

  const handleDoubleClick = () => {
    if (onDoubleClick && isPlayable) {
      onDoubleClick(card)
    }
  }

  return (
    <motion.div
      ref={isDraggable ? drag : undefined}
      className={`
        card
        ${card.faceUp ? 'face-up' : 'face-down'}
        ${card.suit}
        ${isSelected ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}
        ${isDragging ? 'dragging' : ''}
        ${!isPlayable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{
        opacity: isDragging ? 0.5 : 1,
      }}
      whileHover={isPlayable ? { scale: 1.05, y: -2 } : {}}
      whileTap={isPlayable ? { scale: 0.95 } : {}}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {card.faceUp ? (
        <div className="w-full h-full flex flex-col justify-between p-3">
          {/* Top left corner */}
          <div className={`text-2xl font-bold ${getSuitColor(card.suit)}`}>
            {showRank && card.rank}
            {showSuit && (
              <div className="text-3xl leading-none">
                {getSuitSymbol(card.suit)}
              </div>
            )}
          </div>
          
          {/* Center symbol */}
          <div className={`text-5xl font-bold text-center ${getSuitColor(card.suit)}`}>
            {showSuit && getSuitSymbol(card.suit)}
          </div>
          
          {/* Bottom right corner (upside down) */}
          <div className={`text-2xl font-bold ${getSuitColor(card.suit)} transform rotate-180 self-end`}>
            {showRank && card.rank}
            {showSuit && (
              <div className="text-3xl leading-none">
                {getSuitSymbol(card.suit)}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-white text-4xl font-bold opacity-30">
            🂠
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default Card 
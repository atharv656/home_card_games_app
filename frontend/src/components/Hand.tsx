import React from 'react'
import { motion } from 'framer-motion'
import Card from './Card'
import type { Card as CardType } from '@shared/types'

interface HandProps {
  cards: CardType[]
  onCardClick?: (card: CardType) => void
  onCardDoubleClick?: (card: CardType) => void
  selectedCards?: CardType[]
  isPlayerTurn?: boolean
  maxCards?: number
  layout?: 'fan' | 'linear' | 'grid'
  showCardCount?: boolean
  className?: string
}

const Hand: React.FC<HandProps> = ({
  cards,
  onCardClick,
  onCardDoubleClick,
  selectedCards = [],
  isPlayerTurn = false,
  maxCards = 13,
  layout = 'fan',
  showCardCount = true,
  className = '',
}) => {
  const getCardStyle = (index: number, total: number) => {
    if (layout === 'fan') {
      const angle = total > 1 ? (index / (total - 1) - 0.5) * 30 : 0
      const translateX = total > 1 ? (index / (total - 1) - 0.5) * 30 : 0
      return {
        transform: `rotate(${angle}deg) translateX(${translateX}px)`,
        zIndex: index,
      }
    } else if (layout === 'linear') {
      return {
        transform: `translateX(${index * -25}px)`,
        zIndex: index,
      }
    } else {
      return {
        zIndex: index,
      }
    }
  }

  const getContainerClasses = () => {
    switch (layout) {
      case 'fan':
        return 'flex items-end justify-center'
      case 'linear':
        return 'flex items-center'
      case 'grid':
        return 'grid grid-cols-6 gap-2'
      default:
        return 'flex items-center justify-center'
    }
  }

  const isCardSelected = (card: CardType) => {
    return selectedCards.some(c => c.id === card.id)
  }

  return (
    <div className={`hand-container ${className}`}>
      {showCardCount && (
        <div className="mb-2 text-sm text-gray-300 text-center">
          Cards: {cards.length}
          {maxCards && ` / ${maxCards}`}
        </div>
      )}
      
      <motion.div
        className={`relative ${getContainerClasses()}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {cards.map((card, index) => (
          <motion.div
            key={card.id}
            className={`relative ${layout === 'fan' ? 'absolute' : ''}`}
            style={getCardStyle(index, cards.length)}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ 
              delay: index * 0.05,
              type: 'spring',
              stiffness: 300,
              damping: 30 
            }}
            whileHover={isPlayerTurn ? { y: -10 } : {}}
          >
            <Card
              card={card}
              onClick={onCardClick}
              onDoubleClick={onCardDoubleClick}
              isSelected={isCardSelected(card)}
              isPlayable={isPlayerTurn}
              className={`
                transition-all duration-200
                ${isCardSelected(card) ? 'transform -translate-y-2' : ''}
              `}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

export default Hand 
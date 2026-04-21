import { useState, useRef, useEffect } from 'react'
import type { GameState } from '../gameTypes'
import { useGameState } from '../GameStateContext'
import { useAuth } from '../AuthContext'

export function Chat({ state }: { state: GameState }) {
  const { sendChatMessage } = useGameState()
  const { user } = useAuth()
  const messages = state.chatMessages
  const players = state.players
  const currentPlayerId = user?.id ?? ''
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sanitize = (text: string) => {
    const bad = [
      'fuck','shit','bitch','asshole','bastard','dick','cunt','slut',
      'scheisse','arsch','hure','wichser','fick','fotze'
    ]
    let t = text
    for (const w of bad) {
      const re = new RegExp(`\\b${w}\\b`, 'gi')
      t = t.replace(re, '***')
    }
    return t
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      sendChatMessage(sanitize(inputValue.trim()))
      setInputValue('')
    }
  }

  return (
    <div className="chat-container card">
      <div className="chat-header">
        <h3>Spiel-Chat</h3>
      </div>
      <div className="chat-messages">
        {messages.length === 0 ? (
          <p className="no-messages">Noch keine Nachrichten...</p>
        ) : (
          messages.map((msg) => {
            const sender = players.find(p => p.id === msg.playerId)
            return (
              <div 
                key={msg.id} 
                className={`chat-message ${msg.playerId === currentPlayerId ? 'own-message' : ''}`}
              >
                <div className="message-header-row">
                  {sender?.avatarUrl && (
                    <img src={sender.avatarUrl} alt="" className="chat-avatar" />
                  )}
                  <div className="message-info">
                    <span className="message-author">{msg.playerName}</span>
                    <span className="message-time">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <div className="message-text">{msg.text}</div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Nachricht schreiben..."
          maxLength={200}
        />
        <button type="submit" disabled={!inputValue.trim()}>
          Senden
        </button>
      </form>
    </div>
  )
}

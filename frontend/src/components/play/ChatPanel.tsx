import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { sendChatMessage, type ChatMessage } from '@/api/play'
import type { UserPlayer } from '@/api/auditorPanel'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageCircle, Send } from 'lucide-react'

const QUICK_EMOJIS = ['👍', '😂', '🔥', '😮', '💰']

// Text name colors, indexed the same way Board.tsx's colorForPlayer indexes
// its token bg-colors (by position in the `players` array) — keeps chat names
// visually consistent with board tokens without duplicating that palette.
const NAME_COLORS = ['text-red-500', 'text-blue-500', 'text-yellow-500', 'text-green-500', 'text-pink-500', 'text-cyan-500']

type Props = {
  gameId: string
  token: string
  messages: ChatMessage[]
  players: UserPlayer[]
  // embedded: rendered inside the board's own bordered center cell (see
  // Board.tsx) rather than as its own standalone card — drops the outer
  // card chrome/header and stretches to fill whatever height the flex
  // parent gives it instead of a fixed height.
  embedded?: boolean
  className?: string
}

export function ChatPanel({ gameId, token, messages, players, embedded, className }: Props) {
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const sendMut = useMutation({
    mutationFn: (payload: { text?: string; emoji?: string }) => sendChatMessage(token, gameId, payload),
  })

  function colorForPlayer(playerId: string) {
    const idx = players.findIndex((p) => p.id === playerId)
    return NAME_COLORS[idx % NAME_COLORS.length] ?? 'text-muted-foreground'
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    sendMut.mutate({ text: t })
    setText('')
  }

  return (
    <div
      className={cn(
        embedded ? 'flex min-h-0 flex-col gap-2' : 'space-y-2 rounded-xl border border-border bg-card p-3',
        className,
      )}
    >
      {!embedded && (
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="h-4 w-4" />
          Chat
        </div>
      )}

      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No messages yet.</p>
      ) : (
        <div
          ref={scrollRef}
          className={cn('space-y-2 overflow-y-auto pr-2', embedded ? 'min-h-0 flex-1' : 'h-48')}
        >
          {messages.map((m) =>
            m.emoji ? (
              <div key={m.id} className="w-fit rounded-full border border-border bg-muted/30 px-2 py-1 text-lg">
                {m.emoji}
              </div>
            ) : (
              <div key={m.id} className="text-sm">
                <span className={`font-semibold ${colorForPlayer(m.playerId)}`}>{m.name}</span>{' '}
                <span className="text-muted-foreground">{m.text}</span>
              </div>
            ),
          )}
        </div>
      )}

      <div className="flex shrink-0 gap-1.5">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => sendMut.mutate({ emoji: e })}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/50 text-base transition-transform hover:scale-110"
          >
            {e}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex shrink-0 gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder="Write a message…"
          className="h-9"
        />
        <Button type="submit" size="icon" className="shrink-0" disabled={!text.trim() || sendMut.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}

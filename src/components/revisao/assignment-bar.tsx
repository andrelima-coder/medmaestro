'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { renewClaim } from '@/app/(dashboard)/revisao/[id]/actions'

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function AssignmentBar({
  questionId,
  reviewerName,
  expiresAt,
}: {
  questionId: string
  reviewerName: string
  expiresAt: string
}) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  )
  const [currentExpiresAt, setCurrentExpiresAt] = useState(expiresAt)
  const [renewing, setRenewing] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsLeft(
        Math.max(0, Math.floor((new Date(currentExpiresAt).getTime() - Date.now()) / 1000))
      )
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [currentExpiresAt])

  async function handleRenew() {
    setRenewing(true)
    const result = await renewClaim(questionId)
    if (result.ok && result.expiresAt) {
      setCurrentExpiresAt(result.expiresAt)
      setSecondsLeft(10 * 60)
    }
    setRenewing(false)
  }

  const isExpired = secondsLeft === 0
  const isUrgent = secondsLeft <= 60
  const isWarning = secondsLeft <= 120

  const barColor = isExpired || isUrgent
    ? 'border-destructive/30 bg-destructive/10 text-destructive'
    : isWarning
    ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
    : 'border-white/7 bg-[var(--mm-surface)]/60 text-muted-foreground'

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-2 text-sm ${barColor}`}>
      <span className="font-medium text-foreground">{reviewerName}</span>
      <span className="text-white/30">·</span>

      {isExpired ? (
        <span className="text-destructive">Sessão expirada — outra pessoa pode assumir</span>
      ) : (
        <span>
          Expira em{' '}
          <span className={`font-mono font-semibold ${isUrgent ? 'text-destructive' : isWarning ? 'text-yellow-400' : 'text-foreground'}`}>
            {formatCountdown(secondsLeft)}
          </span>
        </span>
      )}

      {(isWarning || isExpired) && (
        <Button size="xs" variant={isExpired ? 'default' : 'outline'} onClick={handleRenew} disabled={renewing}>
          {renewing ? 'Renovando...' : 'Renovar'}
        </Button>
      )}
    </div>
  )
}

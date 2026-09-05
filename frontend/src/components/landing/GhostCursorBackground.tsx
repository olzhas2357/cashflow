import { Suspense, lazy, useEffect, useState } from 'react'

const GhostCursor = lazy(() => import('@/components/effects/GhostCursor'))

function canRunEffect() {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    window.matchMedia('(pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export default function GhostCursorBackground() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const pointerQuery = window.matchMedia('(pointer: fine)')
    const motionQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )

    const update = () => {
      setEnabled(
        pointerQuery.matches && !motionQuery.matches
      )
    }

    update()

    pointerQuery.addEventListener('change', update)
    motionQuery.addEventListener('change', update)

    return () => {
      pointerQuery.removeEventListener('change', update)
      motionQuery.removeEventListener('change', update)
    }
  }, [])

  if (!enabled) {
    return null
  }

  return (
    <Suspense fallback={null}>
      <GhostCursor
        color="#16a34a"
        brightness={1.4}
        trailLength={8}
        inertia={0.05}
      />
    </Suspense>
  )
}
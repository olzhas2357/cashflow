import { Suspense, lazy, useEffect, useState } from 'react'

const GhostCursor = lazy(() => import('@/components/effects/GhostCursor'))

function canRunEffect() {
  return (
    window.matchMedia('(pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export default function GhostCursorBackground() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(canRunEffect())

    const pointerQuery = window.matchMedia('(pointer: fine)')
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setEnabled(canRunEffect())

    pointerQuery.addEventListener('change', update)
    motionQuery.addEventListener('change', update)
    return () => {
      pointerQuery.removeEventListener('change', update)
      motionQuery.removeEventListener('change', update)
    }
  }, [])

  if (!enabled) return null

  return (
    <Suspense fallback={null}>
      <GhostCursor color="#16a34a" brightness={1.6} trailLength={40} inertia={0.5} />
    </Suspense>
  )
}

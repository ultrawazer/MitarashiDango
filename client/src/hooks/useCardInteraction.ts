import { useCallback, useRef } from 'react'

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 20

export function useCardInteraction(onOpenPopup: (rect: DOMRect, viaHold?: boolean) => void) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)
  const longPressStartRef = useRef({ x: 0, y: 0 })
  const activePointerTypeRef = useRef<string | null>(null)

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      activePointerTypeRef.current = e.pointerType
      if (e.pointerType === 'mouse') return
      longPressFiredRef.current = false
      longPressStartRef.current = { x: e.clientX, y: e.clientY }
      cancelLongPress()
      const target = e.currentTarget
      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true
        onOpenPopup(target.getBoundingClientRect(), true)
      }, LONG_PRESS_MS)
    },
    [cancelLongPress, onOpenPopup]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' || !longPressTimerRef.current) return
      const dx = Math.abs(e.clientX - longPressStartRef.current.x)
      const dy = Math.abs(e.clientY - longPressStartRef.current.y)
      if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
        cancelLongPress()
      }
    },
    [cancelLongPress]
  )

  const handlePointerUp = useCallback(() => {
    cancelLongPress()
  }, [cancelLongPress])

  const handlePointerCancel = useCallback(() => {
    cancelLongPress()
  }, [cancelLongPress])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>, onClickDefault?: () => void) => {
      if (longPressFiredRef.current) {
        e.preventDefault()
        e.stopPropagation()
        longPressFiredRef.current = false
        return
      }
      onClickDefault?.()
    },
    []
  )

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleClick,
    cancelLongPress,
    timeoutRef,
  }
}

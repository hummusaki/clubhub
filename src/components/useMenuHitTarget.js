import { useRef } from 'react'

const interactive = 'button, input, a[href], [role="option"]'

export function useMenuHitTarget() {
  const rejectedTarget = useRef(null)

  return {
    onPointerDownCapture(event) {
      rejectedTarget.current = null
      if (event.pointerType !== 'touch') return

      const control = event.target.closest?.(interactive)
      const hit = document.elementFromPoint(event.clientX, event.clientY)
      // Touch browsers can move a tap in the gutter onto a nearby control.
      if (control && !control.contains(hit)) {
        rejectedTarget.current = control
        event.preventDefault()
      }
    },
    onClickCapture(event) {
      const control = rejectedTarget.current
      rejectedTarget.current = null
      const fromPointer = event.nativeEvent.pointerType === 'touch' ||
        event.nativeEvent.sourceCapabilities?.firesTouchEvents || event.detail > 0
      if (fromPointer && control?.contains(event.target)) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
  }
}

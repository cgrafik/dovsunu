import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/** Kullanıcı "hareketi azalt" tercihini açtıysa true (sarsıntı, titreme ve parçacıklar azalır) */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => { const mq = window.matchMedia(QUERY); mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb) },
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}

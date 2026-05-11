import { useEffect, useRef, useState } from 'react'
import { subscribeToNotifications } from '../notifications'

const DEFAULT_DURATION = 3600

const toneStyles = {
  success: {
    accent: '#0F6E56',
    background: '#ECFDF5',
    border: '#A7F3D0',
    text: '#065F46',
  },
  error: {
    accent: '#C0392B',
    background: '#FEF2F2',
    border: '#FECACA',
    text: '#991B1B',
  },
  warning: {
    accent: '#B45309',
    background: '#FFFBEB',
    border: '#FDE68A',
    text: '#92400E',
  },
  info: {
    accent: '#1D4ED8',
    background: '#EFF6FF',
    border: '#BFDBFE',
    text: '#1E3A8A',
  },
}

export default function ToastViewport() {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef(new Map())

  useEffect(() => {
    const unsubscribe = subscribeToNotifications((toast) => {
      setToasts(current => [...current, toast])

      const timeoutMs = toast.duration ?? DEFAULT_DURATION
      if (timeoutMs <= 0) return

      const timerId = window.setTimeout(() => {
        setToasts(current => current.filter(entry => entry.id !== toast.id))
        timersRef.current.delete(toast.id)
      }, timeoutMs)

      timersRef.current.set(toast.id, timerId)
    })

    return () => {
      unsubscribe()
      timersRef.current.forEach(timerId => window.clearTimeout(timerId))
      timersRef.current.clear()
    }
  }, [])

  function dismissToast(toastId) {
    const timerId = timersRef.current.get(toastId)
    if (timerId) {
      window.clearTimeout(timerId)
      timersRef.current.delete(toastId)
    }

    setToasts(current => current.filter(entry => entry.id !== toastId))
  }

  if (toasts.length === 0) return null

  return (
    <div style={styles.viewport}>
      {toasts.map((toast) => {
        const tone = toneStyles[toast.type] || toneStyles.info

        return (
          <div
            key={toast.id}
            style={{
              ...styles.toast,
              background: tone.background,
              borderColor: tone.border,
              color: tone.text,
              boxShadow: `0 18px 40px ${tone.accent}22`,
            }}
          >
            <div style={{ ...styles.accent, background: tone.accent }} />
            <div style={styles.content}>
              {toast.title && <div style={styles.title}>{toast.title}</div>}
              <div style={styles.message}>{toast.message}</div>
            </div>
            <button type="button" style={styles.dismiss} onClick={() => dismissToast(toast.id)}>
              Close
            </button>
          </div>
        )
      })}
    </div>
  )
}

const styles = {
  viewport: {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    zIndex: 2200,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: 'min(360px, calc(100vw - 24px))',
  },
  toast: {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    border: '1px solid',
    borderRadius: '12px',
    padding: '14px 14px 14px 16px',
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '4px',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: '12px',
    fontWeight: '700',
    marginBottom: '4px',
  },
  message: {
    fontSize: '12px',
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  dismiss: {
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    fontSize: '11px',
    cursor: 'pointer',
    padding: 0,
    alignSelf: 'center',
    opacity: 0.8,
  },
}

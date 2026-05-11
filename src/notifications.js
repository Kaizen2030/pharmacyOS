const listeners = new Set()
let nextToastId = 1

function normalizeToast(input, options = {}) {
  if (typeof input === 'string') {
    return {
      id: nextToastId++,
      message: input,
      type: options.type || 'info',
      title: options.title || '',
      duration: options.duration,
    }
  }

  return {
    id: nextToastId++,
    message: input?.message || '',
    type: input?.type || options.type || 'info',
    title: input?.title || options.title || '',
    duration: input?.duration ?? options.duration,
  }
}

export function subscribeToNotifications(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notify(input, options = {}) {
  const toast = normalizeToast(input, options)
  listeners.forEach(listener => listener(toast))
  return toast.id
}

export function notifySuccess(message, options = {}) {
  return notify(message, { ...options, type: 'success' })
}

export function notifyError(message, options = {}) {
  return notify(message, { ...options, type: 'error' })
}

export function notifyWarning(message, options = {}) {
  return notify(message, { ...options, type: 'warning' })
}

export function notifyInfo(message, options = {}) {
  return notify(message, { ...options, type: 'info' })
}

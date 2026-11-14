export interface BrowserRuntimeLike {
  navigator?: {
    mediaDevices?: {
      getUserMedia?: unknown
      getDisplayMedia?: unknown
    }
    serviceWorker?: unknown
  }
  SpeechRecognition?: unknown
  webkitSpeechRecognition?: unknown
  speechSynthesis?: unknown
  SpeechSynthesisUtterance?: unknown
  Notification?: unknown
  indexedDB?: unknown
}

export interface BrowserCapabilities {
  speechRecognition: boolean
  textToSpeech: boolean
  microphone: boolean
  camera: boolean
  screenCapture: boolean
  notificationsApi: boolean
  serviceWorker: boolean
  indexedDb: boolean
}

/**
 * Reports API availability only. It does not request permissions, start
 * capture, or imply that the user has granted an OS/browser permission.
 */
export function detectBrowserCapabilities(runtime: BrowserRuntimeLike): BrowserCapabilities {
  const media = runtime.navigator?.mediaDevices
  return {
    speechRecognition: typeof runtime.SpeechRecognition === 'function' || typeof runtime.webkitSpeechRecognition === 'function',
    textToSpeech: Boolean(runtime.speechSynthesis && runtime.SpeechSynthesisUtterance),
    microphone: typeof media?.getUserMedia === 'function',
    camera: typeof media?.getUserMedia === 'function',
    screenCapture: typeof media?.getDisplayMedia === 'function',
    notificationsApi: typeof runtime.Notification === 'function',
    serviceWorker: Boolean(runtime.navigator?.serviceWorker),
    indexedDb: Boolean(runtime.indexedDB)
  }
}

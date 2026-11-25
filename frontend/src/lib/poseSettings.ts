import { useCallback, useState } from 'react'

/** What the patient decides about the voice agent: the only setting they have. */
export interface PoseSettings {
  voice: boolean
}

export const POSE_SETTINGS_KEY = 'rehab-ai.pose-assistant'

export const DEFAULT_POSE_SETTINGS: PoseSettings = { voice: true }

/** A broken or foreign stored value falls back to the default. */
export function readPoseSettings(): PoseSettings {
  try {
    const raw = window.localStorage.getItem(POSE_SETTINGS_KEY)
    if (raw === null) return DEFAULT_POSE_SETTINGS
    const stored: unknown = JSON.parse(raw)
    const voice = (stored as Record<string, unknown> | null)?.voice
    return { voice: typeof voice === 'boolean' ? voice : DEFAULT_POSE_SETTINGS.voice }
  } catch {
    // Storage can be blocked (private mode) or hold broken JSON; the default is fine then.
    return DEFAULT_POSE_SETTINGS
  }
}

export function savePoseSettings(settings: PoseSettings) {
  try {
    window.localStorage.setItem(POSE_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Not remembered, but still used for this recording.
  }
}

export function usePoseSettings(): [PoseSettings, (patch: Partial<PoseSettings>) => void] {
  const [settings, setSettings] = useState<PoseSettings>(readPoseSettings)
  const update = useCallback((patch: Partial<PoseSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      savePoseSettings(next)
      return next
    })
  }, [])
  return [settings, update]
}

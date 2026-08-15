import { registerPlugin } from '@capacitor/core'
import { aiAvailable } from './ai'
import { TONES } from '../store/tone'

/**
 * The one question worth asking the on-device model about a description: how does this
 * feel?
 *
 * It is asked with a closed list, so nothing it has not been offered can come back. That
 * is not politeness — asked in prose for tags it writes sentences, and asked anything it
 * has to recall rather than read it invents. Reading a description it was handed and
 * naming the mood is transformation, which is what it is good at, and the measurements
 * bear that out: the leading tag was stable across runs on every description tried.
 */

interface AIBridgeStructured {
  generateStructured(options: {
    prompt: string
    instructions?: string
    schema: { name: string; properties: { name: string; anyOf?: string[]; array?: boolean; max?: number }[] }
  }): Promise<{ json: string; ms: number }>
}

const AIBridge = registerPlugin<AIBridgeStructured>('AIBridge')

/** null when the model is unavailable or failed; [] when it genuinely found nothing. */
export async function pickTone(description: string): Promise<string[] | null> {
  if (!(await aiAvailable())) return null
  try {
    const res = await AIBridge.generateStructured({
      prompt: description,
      instructions: 'Read the description and pick the words that describe its tone.',
      schema: {
        name: 'Tones',
        properties: [{ name: 'tones', anyOf: [...TONES], array: true, max: 3 }],
      },
    })
    const parsed = JSON.parse(res.json) as { tones?: unknown }
    const tones = Array.isArray(parsed.tones) ? parsed.tones : []
    // The schema should make this impossible; it costs nothing to be sure, and a tag the
    // app does not know would silently never match anything.
    return tones.filter((t): t is string => typeof t === 'string' && TONES.includes(t as never))
  } catch {
    return null
  }
}

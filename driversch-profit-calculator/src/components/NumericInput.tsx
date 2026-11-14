import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { formatNumericValue, parseNumericDraft, sanitizeNumericDraft } from '../lib/numericInput.ts'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  /** Stored number, or null when there is no value yet. */
  value: number | null | undefined
  /**
   * Called with every complete value. Never called with NaN.
   * While the user types an incomplete value ("-" or "."), nothing is reported.
   */
  onValueChange: (value: number | null) => void
  /** Accept a leading minus sign. Off by default. */
  allowNegative?: boolean
  /** Clearing the field reports null. Otherwise it reports 0, so calculations never receive NaN. */
  allowEmpty?: boolean
}

/**
 * Numeric field that accepts English, Arabic-Indic and Persian digits.
 * Built on type="text" because browsers drop non-ASCII digits typed into type="number".
 * Always LTR so number order and the caret behave predictably in RTL pages.
 */
export default function NumericInput({ value, onValueChange, allowNegative = false, allowEmpty = false, className, ...rest }: Props) {
  const [draft, setDraft] = useState(() => formatNumericValue(value))
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCaret = useRef<number | null>(null)

  // Follow changes made outside the field (a template or a restored backup), but never
  // overwrite what the user is typing. Incomplete drafts are left alone.
  useEffect(() => {
    const parsed = parseNumericDraft(draft)
    let reported: number | null
    if (parsed.kind === 'value') reported = parsed.value
    else if (parsed.kind === 'empty') reported = allowEmpty ? null : 0
    else return
    const stored = value ?? null
    if (reported !== stored) setDraft(formatNumericValue(stored))
    // draft is intentionally not a dependency: this effect only reacts to outside changes.
  }, [value, allowEmpty])

  // Restore the caret after the text was cleaned, so typing in the middle keeps its place.
  useLayoutEffect(() => {
    const input = inputRef.current
    if (input && pendingCaret.current !== null && document.activeElement === input) {
      input.setSelectionRange(pendingCaret.current, pendingCaret.current)
    }
    pendingCaret.current = null
  }, [draft])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    const cleaned = sanitizeNumericDraft(raw, event.target.selectionStart ?? raw.length, { allowNegative })
    pendingCaret.current = cleaned.caret
    setDraft(cleaned.text)
    const parsed = parseNumericDraft(cleaned.text)
    if (parsed.kind === 'value') onValueChange(parsed.value)
    else if (parsed.kind === 'empty') onValueChange(allowEmpty ? null : 0)
  }

  const state = parseNumericDraft(draft)
  const notReady = state.kind === 'incomplete' || state.kind === 'invalid'
  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      dir="ltr"
      autoComplete="off"
      spellCheck={false}
      className={[className, 'numeric-input', notReady ? 'is-invalid' : ''].filter(Boolean).join(' ')}
      aria-invalid={notReady || undefined}
      data-error={state.kind === 'invalid' ? state.reason : undefined}
      value={draft}
      onChange={handleChange}
    />
  )
}

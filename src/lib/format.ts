export function yearOf(date: string | null | undefined): string {
  return date ? date.slice(0, 4) : ''
}

/** A bare "2022" means only the year is known — say so instead of inventing a day. */
export function isYearOnly(date: string | null | undefined): boolean {
  return /^\d{4}$/.test(date ?? '')
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return ''
  if (isYearOnly(date)) return date
  // Parse YYYY-MM-DD as a local date; `new Date('2022-02-24')` is UTC midnight and
  // renders as the previous day for anyone west of UTC.
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const d = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatHours(hours: number | null | undefined): string {
  if (!hours) return ''
  if (hours < 1) return `${Math.round(hours * 60)}m`
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
}

/** Platform names from RAWG are long; the shelf only has room for the family. */
export function shortPlatform(name: string): string {
  return name
    .replace('PlayStation', 'PS')
    .replace('Xbox One', 'Xbox')
    .replace('Nintendo Switch', 'Switch')
    .replace('macOS', 'Mac')
}

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null
  const target = new Date(date)
  if (Number.isNaN(target.getTime())) return null
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x }
  return Math.round((startOfDay(target).getTime() - startOfDay(new Date()).getTime()) / 86400000)
}

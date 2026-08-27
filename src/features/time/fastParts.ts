/**
 * The clock digits, computed by arithmetic instead of Intl.
 *
 * The DOM clock formats through `Intl.DateTimeFormat`, which is correct but far
 * too expensive to call inside a sixty-times-a-second render loop. Since
 * `localNow()` is already shifted into the displayed zone, the scene can derive
 * its digits with pure integer maths and no allocation at all.
 *
 * That is a duplicated code path, which is a real risk — so `fastParts.test.ts`
 * asserts it agrees with the Intl path across a spread of zones, hours, DST
 * transitions and both formats.
 */

export interface FastParts {
  /** Four digit characters: two hour, two minute. Space for a padded 12h hour. */
  h0: string
  h1: string
  m0: string
  m1: string
  /** 0..59 */
  seconds: number
  /** Continuous position through the current minute, 0..1. */
  minuteFraction: number
  /** Continuous position through the current second, 0..1. */
  secondFraction: number
  isPm: boolean
  hour24: number
}

const D = '0123456789'

export function fastParts(localMs: number, hour12: boolean, out?: FastParts): FastParts {
  const o = out ?? ({} as FastParts)

  // Math.floor rather than trunc: localMs is negative for zones west of UTC at
  // instants before 1970, and truncation would round the wrong way.
  const totalSeconds = Math.floor(localMs / 1000)
  const sec = ((totalSeconds % 60) + 60) % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const min = ((totalMinutes % 60) + 60) % 60
  const hour24 = ((Math.floor(totalMinutes / 60) % 24) + 24) % 24

  const displayHour = hour12 ? ((hour24 + 11) % 12) + 1 : hour24
  const tens = Math.floor(displayHour / 10)

  o.h0 = hour12 && tens === 0 ? ' ' : D[tens]
  o.h1 = D[displayHour % 10]
  o.m0 = D[Math.floor(min / 10)]
  o.m1 = D[min % 10]
  o.seconds = sec
  o.isPm = hour24 >= 12
  o.hour24 = hour24

  const msIntoMinute = ((localMs % 60000) + 60000) % 60000
  o.minuteFraction = msIntoMinute / 60000
  o.secondFraction = (msIntoMinute % 1000) / 1000

  return o
}

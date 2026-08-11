/**
 * I2C utility helpers shared by MasterTab and AdvancedPanel.
 */

/**
 * Parse an I2C speed string (e.g. "400 kHz", "1 MHz", "750 kHz") into kilohertz.
 * Returns `undefined` if the value cannot be parsed.
 *
 * Why not plain parseInt(): `parseInt("1 MHz", 10)` returns 1 (it stops at the
 * space), which the CH347 backend would map to its lowest speed bin (≤20 kHz) —
 * so selecting "1 MHz" would silently select ~20 kHz. MHz values must be converted
 * to kHz explicitly here for the selected speed to actually take effect.
 */
export function parseSpeedKhz(speed: string): number | undefined {
  const m = speed.trim().toLowerCase().match(/^([\d.]+)\s*(khz|mhz)?/);
  if (!m) return undefined;
  const v = parseFloat(m[1]);
  if (isNaN(v)) return undefined;
  return m[2] === 'mhz' ? Math.round(v * 1000) : Math.round(v);
}

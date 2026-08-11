/**
 * Creates a promise that resolves after a delay.
 *
 * Used for implementing wait/polling patterns in async code,
 * such as waiting for device reconnection or retry delays.
 *
 * @param ms - Delay time in milliseconds
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
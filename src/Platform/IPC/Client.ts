import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { InvokeArgs } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type {
  CommandArgs,
  CommandResult,
  EventPayload,
  IpcCommandMap,
  IpcEventMap,
} from './Commands';
import type { IpcError, InvokeOptions } from './Types';

/**
 * Checks if a value is a plain object.
 *
 * Used for type narrowing when normalizing errors and
 * transforming response data.
 *
 * @param value - Value to check
 * @returns True if value is a non-null, non-array object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Converts a snake_case string to camelCase.
 *
 * IPC responses from Rust backend use snake_case keys,
 * while TypeScript frontend prefers camelCase.
 *
 * @param input - Snake_case string to convert
 * @returns camelCase converted string
 */
function toCamelCase(input: string): string {
  return input.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

/**
 * Recursively converts all object keys to camelCase.
 *
 * Transforms nested objects and arrays, ensuring all keys
 * throughout the data structure use camelCase format.
 *
 * @typeparam T - Type of the value being transformed
 * @param value - Value with snake_case keys
 * @returns Value with all keys converted to camelCase
 */
function camelizeKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => camelizeKeys(item)) as T;
  }
  if (isObject(value)) {
    const entries = Object.entries(value).map(([key, rawValue]) => [
      toCamelCase(key),
      camelizeKeys(rawValue),
    ]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

/**
 * Normalizes an error to IpcError format.
 *
 * Converts various error types (Tauri errors, JavaScript errors,
 * unknown values) into a consistent IpcError structure with
 * code, name, and message fields.
 *
 * @param error - Error to normalize
 * @returns Normalized IpcError object
 */
export function normalizeIpcError(error: unknown): IpcError {
  if (isObject(error)) {
    const maybeCode = error.code;
    const maybeName = error.name;
    const maybeMessage = error.message;
    if (
      typeof maybeCode === 'number' &&
      typeof maybeName === 'string' &&
      typeof maybeMessage === 'string'
    ) {
      return {
        code: maybeCode,
        name: maybeName,
        message: maybeMessage,
        cause: error,
      };
    }
  }

  if (error instanceof Error) {
    return {
      code: -1,
      name: error.name || 'Error',
      message: error.message,
      cause: error,
    };
  }

  return {
    code: -1,
    name: 'UnknownError',
    message: String(error),
    cause: error,
  };
}

/**
 * Wraps a promise with a timeout.
 *
 * Returns a new promise that rejects with a Timeout error
 * if the original promise does not resolve within the
 * specified timeout duration.
 *
 * @typeparam T - Promise result type
 * @param promise - Promise to wrap
 * @param timeoutMs - Timeout in milliseconds (0 or undefined for no timeout)
 * @returns Promise that resolves/rejects with timeout enforcement
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject({
        code: -110,
        name: 'Timeout',
        message: `IPC timeout after ${timeoutMs}ms`,
      } as IpcError);
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

/**
 * Wraps a promise with abort signal support.
 *
 * Returns a new promise that rejects with an Aborted error
 * if the AbortSignal is triggered before the original
 * promise resolves.
 *
 * @typeparam T - Promise result type
 * @param promise - Promise to wrap
 * @param signal - AbortSignal for cancellation
 * @returns Promise that resolves/rejects with abort support
 */
function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject({
      code: -1000,
      name: 'Aborted',
      message: 'IPC request aborted',
    } satisfies IpcError);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject({
        code: -1000,
        name: 'Aborted',
        message: 'IPC request aborted',
      } satisfies IpcError);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise
      .then((value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      })
      .catch((error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      });
  });
}

/**
 * Invokes a Tauri IPC command with type safety.
 *
 * Calls a Rust backend command through Tauri's invoke API,
 * with optional timeout and abort signal support. All
 * commands are typed through IpcCommandMap.
 *
 * @typeparam K - Command name key from IpcCommandMap
 * @param command - Command name to invoke
 * @param args - Command arguments (optional)
 * @param options - Invocation options (timeout, abort signal)
 * @returns Promise resolving to command result
 * @throws IpcError if command fails, times out, or is aborted
 */
export async function invokeCommand<K extends keyof IpcCommandMap>(
  command: K,
  args?: CommandArgs<K>,
  options?: InvokeOptions
): Promise<CommandResult<K>> {
  try {
    const basePromise =
      args === undefined
        ? tauriInvoke<CommandResult<K>>(command)
        : tauriInvoke<CommandResult<K>>(command, args as InvokeArgs);
    const timeoutWrapped = withTimeout(basePromise, options?.timeoutMs);
    return await withAbort(timeoutWrapped, options?.signal);
  } catch (error) {
    throw normalizeIpcError(error);
  }
}

/**
 * Subscribes to a Tauri IPC event with type safety.
 *
 * Registers a callback handler for events emitted from the
 * Rust backend through Tauri's event system. Event payloads
 * are automatically camelCase-transformed.
 *
 * @typeparam K - Event name key from IpcEventMap
 * @param eventName - Event name to subscribe to
 * @param handler - Callback function for event payloads
 * @returns Promise resolving to unsubscribe function
 * @throws IpcError if subscription fails
 */
export async function subscribeEvent<K extends keyof IpcEventMap>(
  eventName: K,
  handler: (payload: EventPayload<K>) => void
): Promise<UnlistenFn> {
  try {
    return await listen(eventName, (event) => {
      handler(camelizeKeys(event.payload) as EventPayload<K>);
    });
  } catch (error) {
    throw normalizeIpcError(error);
  }
}
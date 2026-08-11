/**
 * Normalized IPC error structure.
 *
 * Provides a consistent error format for all IPC operations,
 * whether the error originates from Tauri, the Rust backend,
 * or JavaScript/TypeScript code.
 */
export interface IpcError {
  /** Error code (negative for client-side errors, positive for backend errors) */
  code: number;
  /** Error type name (e.g., 'Timeout', 'Aborted', 'EfexError') */
  name: string;
  /** Human-readable error message */
  message: string;
  /** Original error object for debugging */
  cause?: unknown;
}

/**
 * Specification for an IPC command.
 *
 * Defines the argument type and result type for a Tauri command,
 * enabling type-safe command invocation through invokeCommand.
 *
 * @typeparam TArgs - Argument type (undefined for no arguments)
 * @typeparam TResult - Result type (void for commands with no return)
 */
export interface IpcCommandSpec<TArgs = undefined, TResult = void> {
  /** Command arguments type */
  args: TArgs;
  /** Command result type */
  result: TResult;
}

/**
 * Specification for an IPC event.
 *
 * Defines the payload type for a Tauri event,
 * enabling type-safe event subscription through subscribeEvent.
 *
 * @typeparam TPayload - Event payload type
 */
export interface IpcEventSpec<TPayload = unknown> {
  /** Event payload type */
  payload: TPayload;
}

/**
 * Options for IPC command invocation.
 *
 * Provides timeout and abort signal support for controlling
 * command execution behavior.
 */
export interface InvokeOptions {
  /** Timeout in milliseconds (command will throw IpcError if exceeded) */
  timeoutMs?: number;
  /** AbortSignal for cancelling the command */
  signal?: AbortSignal;
}
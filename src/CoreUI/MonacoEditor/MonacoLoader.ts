import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

/**
 * Monaco environment interface for worker configuration.
 *
 * Defines the method for getting language-specific workers
 * for syntax highlighting and IntelliSense features.
 */
interface MonacoEnvironment {
  /** Returns worker instance for given language label */
  getWorker(_: unknown, label: string): Worker;
}

/** Window type with MonacoEnvironment extension */
declare const self: Window & {
  MonacoEnvironment: MonacoEnvironment;
};

/**
 * Configures Monaco editor web workers.
 *
 * Monaco uses web workers for language features like
 * syntax highlighting, IntelliSense, and validation.
 * This configuration maps language types to their
 * respective worker implementations.
 *
 * Worker mapping:
 * - json → JSON language worker
 * - css/scss/less → CSS language worker
 * - html/handlebars/razor → HTML language worker
 * - typescript/javascript → TypeScript worker
 * - Other → Default editor worker
 */
self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') {
      return new jsonWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

/** Configure Monaco loader with bundled monaco-editor */
loader.config({ monaco });

/**
 * Initializes Monaco editor library.
 *
 * Must be called before using MonacoEditor component to ensure
 * the editor and workers are properly loaded and configured.
 *
 * @returns Promise resolving when Monaco is ready
 */
export const initMonaco = () => loader.init();
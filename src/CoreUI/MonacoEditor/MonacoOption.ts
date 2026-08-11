import type * as Monaco from 'monaco-editor';

/** Editor options type alias */
type EditorOptions = Monaco.editor.IStandaloneEditorConstructionOptions;

/**
 * Default Monaco editor configuration options.
 *
 * These options are applied to all Monaco editor instances,
 * providing a consistent editing experience across the application.
 *
 * Configuration includes:
 * - Minimap enabled for code navigation (without character rendering)
 * - Always-visible slider for minimap scrolling
 * - Extra space above find widget
 * - Fixed overflow widgets for proper positioning
 */
export const MONACO_OPTIONS: EditorOptions = {
  minimap: {
    enabled: true,
    renderCharacters: false,
    showSlider: 'always',
  },
  find: {
    addExtraSpaceOnTop: true,
  },
  fixedOverflowWidgets: true,
};
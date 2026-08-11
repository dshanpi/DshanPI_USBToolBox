import React, { useCallback, useMemo, useEffect, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { MONACO_OPTIONS } from './MonacoOption';
import {
  CATPPUCCIN_MOCHA_DARK,
  CATPPUCCIN_LATTE_LIGHT,
  getMonacoThemeNameForId,
  registerMonacoTheme,
} from '../../Themes';
import { useTheme } from '../../Themes';
import './MonacoEditor.css';

/**
 * MonacoEditor component props.
 *
 * Configuration for the code editor including content,
 * language, and editing options.
 */
export interface MonacoEditorProps {
  /** Editor content text */
  value: string;
  /** Callback when content changes */
  onChange?: (value: string) => void;
  /** Language identifier for syntax highlighting */
  language?: string;
  /** Whether editor is read-only */
  readOnly?: boolean;
  /** Editor height (string or number) */
  height?: string | number;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Set of file extensions considered editable text files.
 *
 * Files with these extensions will be opened in Monaco editor
 * rather than shown as binary/uneditable.
 */
const EDITABLE_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'jsonc',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'conf',
  'config',
  'log',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'bat',
  'cmd',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'py',
  'pyw',
  'rb',
  'java',
  'c',
  'cpp',
  'cc',
  'cxx',
  'h',
  'hpp',
  'cs',
  'go',
  'rs',
  'php',
  'swift',
  'kt',
  'kts',
  'scala',
  'lua',
  'r',
  'html',
  'htm',
  'xhtml',
  'css',
  'scss',
  'sass',
  'less',
  'sql',
  'vue',
  'svelte',
  'gradle',
  'properties',
  'gitignore',
  'env',
  'dockerfile',
  'makefile',
  'cmake',
  'service',
  'desktop',
  'cfg',
  'dts',
]);

/**
 * Set of filenames (case-insensitive) considered editable.
 *
 * Files matching these exact names will be opened in editor,
 * regardless of extension.
 */
const EDITABLE_FILENAMES = new Set([
  'readme',
  'license',
  'changelog',
  'dockerfile',
  'makefile',
  'gemfile',
  'rakefile',
  'vagrantfile',
  '.gitignore',
  '.gitattributes',
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.editorconfig',
  '.eslintrc',
  '.prettierrc',
  '.babelrc',
]);

/**
 * Determines if a file should be opened in Monaco editor.
 *
 * Checks against known editable extensions and special filenames
 * to determine if the file is a text-based format suitable
 * for editing.
 *
 * @param fileName - File name to check
 * @returns True if file should be opened in editor
 */
export function isTextFile(fileName: string): boolean {
  const lowerFileName = fileName.toLowerCase();

  if (EDITABLE_FILENAMES.has(lowerFileName)) {
    return true;
  }

  const ext = lowerFileName.split('.').pop();
  if (ext && ext !== lowerFileName && EDITABLE_EXTENSIONS.has(ext)) {
    return true;
  }

  return false;
}

/**
 * Gets Monaco language ID from file name.
 *
 * Maps file extensions and special filenames to Monaco's
 * language identifiers for proper syntax highlighting
 * and IntelliSense support.
 *
 * @param fileName - File name to determine language for
 * @returns Monaco language identifier string
 */
export function getLanguageId(fileName: string): string {
  const lowerFileName = fileName.toLowerCase();
  const ext = lowerFileName.split('.').pop() || '';

  /** Extension to language ID mapping */
  const languageMap: Record<string, string> = {
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    jsonc: 'json',
    html: 'html',
    htm: 'html',
    xhtml: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    md: 'markdown',
    markdown: 'markdown',
    py: 'python',
    pyw: 'python',
    rb: 'ruby',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    kts: 'kotlin',
    scala: 'scala',
    lua: 'lua',
    r: 'r',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    ps1: 'powershell',
    bat: 'bat',
    cmd: 'bat',
    sql: 'sql',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'ini',
    ini: 'ini',
    conf: 'ini',
    config: 'ini',
    vue: 'vue',
    svelte: 'svelte',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    dts: 'dts',
  };

  if (lowerFileName === 'dockerfile' || lowerFileName.includes('docker')) {
    return 'dockerfile';
  }
  if (lowerFileName === 'makefile') {
    return 'makefile';
  }
  if (lowerFileName.startsWith('.env')) {
    return 'plaintext';
  }

  return languageMap[ext] || 'plaintext';
}

/**
 * Monaco code editor component.
 *
 * MonacoEditor wraps the Monaco editor from @monaco-editor/react,
 * providing a styled code editing interface with theme integration,
 * syntax highlighting, and configurable editing options.
 *
 * The component:
 * - Registers Catppuccin themes on mount
 * - Syncs editor theme with application theme
 * - Supports read-only mode for file viewing
 * - Provides language auto-detection from file names
 *
 * Example usage:
 * ```tsx
 * <MonacoEditor
 *   value={fileContent}
 *   onChange={handleContentChange}
 *   language={getLanguageId(fileName)}
 *   readOnly={isReadOnly}
 *   height="400px"
 * />
 * ```
 */
export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  onChange,
  language = 'plaintext',
  readOnly = false,
  height = '100%',
  className,
}) => {
  const { currentThemeId } = useTheme();
  const monacoThemeName = getMonacoThemeNameForId(currentThemeId);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  /**
   * Handles editor setup before mount.
   *
   * Registers custom themes (Catppuccin Mocha/Latte) with Monaco
   * and initializes the theme system.
   *
   * @param monaco - Monaco namespace
   */
  const handleEditorWillMount = useCallback(
    (monaco: Monaco) => {
      monacoRef.current = monaco;
      monaco.editor.defineTheme('catppuccin-mocha', CATPPUCCIN_MOCHA_DARK);
      monaco.editor.defineTheme('catppuccin-latte', CATPPUCCIN_LATTE_LIGHT);
      registerMonacoTheme(monaco, currentThemeId);
    },
    [currentThemeId]
  );

  /**
   * Handles editor mount completion.
   *
   * Stores editor instance reference for later use.
   *
   * @param editor - Standalone code editor instance
   * @param _monaco - Monaco namespace (unused)
   */
  const handleEditorDidMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, _monaco: Monaco) => {
      editorRef.current = editor;
    },
    []
  );

  // Update editor theme when application theme changes
  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      registerMonacoTheme(monacoRef.current, currentThemeId);
      monacoRef.current.editor.setTheme(monacoThemeName);
    }
  }, [currentThemeId, monacoThemeName]);

  /** Computed editor options with read-only override */
  const options = useMemo<editor.IStandaloneEditorConstructionOptions>(
    () => ({
      ...MONACO_OPTIONS,
      readOnly,
    }),
    [readOnly]
  );

  return (
    <div className={`coreui-monaco-editor ${className || ''}`}>
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={(v) => onChange?.(v || '')}
        theme={monacoThemeName}
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        options={options}
      />
    </div>
  );
};
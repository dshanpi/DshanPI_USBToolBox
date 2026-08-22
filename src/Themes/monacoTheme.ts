import type { editor } from 'monaco-editor';
import type { ThemeColors } from './types';
import { getThemeById, getDefaultDarkTheme, getDefaultLightTheme } from './configs';

interface MonacoSyntaxRule {
  token: string;
  foreground: string;
  fontStyle?: string;
}

const DARK_SYNTAX_RULES: MonacoSyntaxRule[] = [
  { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
  { token: 'keyword', foreground: 'cba6f7' },
  { token: 'keyword.control', foreground: 'cba6f7' },
  { token: 'keyword.operator', foreground: '89dceb' },
  { token: 'string', foreground: 'a6e3a1' },
  { token: 'string.escape', foreground: 'f9e2af' },
  { token: 'number', foreground: 'fab387' },
  { token: 'constant', foreground: 'fab387' },
  { token: 'constant.language', foreground: 'f38ba8' },
  { token: 'constant.numeric', foreground: 'fab387' },
  { token: 'type', foreground: '89b4fa' },
  { token: 'class', foreground: '89b4fa' },
  { token: 'interface', foreground: '89b4fa' },
  { token: 'struct', foreground: '89b4fa' },
  { token: 'enum', foreground: '94e2d5' },
  { token: 'function', foreground: '89b4fa' },
  { token: 'function.call', foreground: '89b4fa' },
  { token: 'method', foreground: '89b4fa' },
  { token: 'variable', foreground: 'f5e0dc' },
  { token: 'variable.parameter', foreground: 'f5c2e7' },
  { token: 'variable.property', foreground: 'f5e0dc' },
  { token: 'property', foreground: 'f5e0dc' },
  { token: 'operator', foreground: '89dceb' },
  { token: 'punctuation', foreground: '9399b2' },
  { token: 'delimiter', foreground: '9399b2' },
  { token: 'delimiter.bracket', foreground: '9399b2' },
  { token: 'tag', foreground: 'f38ba8' },
  { token: 'tag.id', foreground: 'fab387' },
  { token: 'tag.class', foreground: 'f9e2af' },
  { token: 'attribute.name', foreground: 'f9e2af' },
  { token: 'attribute.value', foreground: 'a6e3a1' },
  { token: 'metatag', foreground: 'cba6f7' },
  { token: 'regexp', foreground: 'f5c2e7' },
];

const LIGHT_SYNTAX_RULES: MonacoSyntaxRule[] = [
  { token: 'comment', foreground: '9ca0b0', fontStyle: 'italic' },
  { token: 'keyword', foreground: '8839ef' },
  { token: 'keyword.control', foreground: '8839ef' },
  { token: 'keyword.operator', foreground: '179299' },
  { token: 'string', foreground: '40a02b' },
  { token: 'string.escape', foreground: 'df8e1d' },
  { token: 'number', foreground: 'fe640b' },
  { token: 'constant', foreground: 'fe640b' },
  { token: 'constant.language', foreground: 'd20f39' },
  { token: 'constant.numeric', foreground: 'fe640b' },
  { token: 'type', foreground: '1e66f5' },
  { token: 'class', foreground: '1e66f5' },
  { token: 'interface', foreground: '1e66f5' },
  { token: 'struct', foreground: '1e66f5' },
  { token: 'enum', foreground: '179299' },
  { token: 'function', foreground: '1e66f5' },
  { token: 'function.call', foreground: '1e66f5' },
  { token: 'method', foreground: '1e66f5' },
  { token: 'variable', foreground: 'dc8a78' },
  { token: 'variable.parameter', foreground: 'ea76cb' },
  { token: 'variable.property', foreground: 'dc8a78' },
  { token: 'property', foreground: 'dc8a78' },
  { token: 'operator', foreground: '179299' },
  { token: 'punctuation', foreground: '7c7f93' },
  { token: 'delimiter', foreground: '7c7f93' },
  { token: 'delimiter.bracket', foreground: '7c7f93' },
  { token: 'tag', foreground: 'd20f39' },
  { token: 'tag.id', foreground: 'fe640b' },
  { token: 'tag.class', foreground: 'df8e1d' },
  { token: 'attribute.name', foreground: 'df8e1d' },
  { token: 'attribute.value', foreground: '40a02b' },
  { token: 'metatag', foreground: '8839ef' },
  { token: 'regexp', foreground: 'ea76cb' },
];

function createMonacoTheme(colors: ThemeColors, isDark: boolean): editor.IStandaloneThemeData {
  const syntaxRules = isDark ? DARK_SYNTAX_RULES : LIGHT_SYNTAX_RULES;

  return {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: syntaxRules,
    colors: {
      'editor.background': colors.base,
      'editor.foreground': colors.text,
      'editor.lineHighlightBackground': colors.surface0,
      'editor.selectionBackground': `${colors.surface2}80`,
      'editor.inactiveSelectionBackground': `${colors.surface1}50`,
      'editorLineNumber.foreground': colors.overlay0,
      'editorLineNumber.activeForeground': colors.text,
      'editorCursor.foreground': isDark ? '#f5e0dc' : '#dc8a78',
      'editorWhitespace.foreground': colors.surface1,
      'editorIndentGuide.background': colors.surface1,
      'editorIndentGuide.activeBackground': colors.overlay0,
      'editor.findMatchBackground': `${colors.surface2}80`,
      'editor.findMatchHighlightBackground': `${colors.surface1}50`,
      'editorBracketMatch.background': `${colors.surface2}50`,
      'editorBracketMatch.border': colors.accent,
      'editorOverviewRuler.border': colors.surface1,
      'editorGutter.background': colors.base,
      'scrollbarSlider.background': `${colors.overlay0}40`,
      'scrollbarSlider.hoverBackground': `${colors.overlay0}60`,
      'scrollbarSlider.activeBackground': `${colors.overlay0}80`,
      'menu.background': colors.surface0,
      'menu.foreground': colors.text,
      'menu.selectionBackground': colors.surface1,
      'menu.selectionForeground': colors.text,
      'menu.selectionBorder': colors.surface1,
      'menu.separatorBackground': colors.surface1,
      'menu.border': colors.surface1,
      'contextMenu.background': colors.surface0,
      'contextMenu.foreground': colors.text,
      'contextMenu.selectionBackground': colors.surface1,
      'contextMenu.selectionForeground': colors.text,
      'contextMenu.selectionBorder': colors.surface1,
      'widget.shadow': isDark ? '#00000080' : '#00000030',
      'widget.border': colors.surface1,
      'input.background': colors.base,
      'input.foreground': colors.text,
      'input.border': colors.surface1,
      'input.placeholderForeground': colors.overlay0,
      'inputOption.activeBackground': colors.surface1,
      'inputOption.activeForeground': colors.text,
      'inputOption.activeBorder': colors.accent,
      'searchEditor.textInputBorder': colors.surface1,
      'searchEditor.textInputBackground': colors.base,
      'editorWidget.background': colors.surface0,
      'editorWidget.foreground': colors.text,
      'editorWidget.border': colors.surface1,
      'editorSuggestWidget.background': colors.surface0,
      'editorSuggestWidget.foreground': colors.text,
      'editorSuggestWidget.selectedBackground': colors.surface1,
      'editorSuggestWidget.selectedForeground': colors.text,
      'editorSuggestWidget.highlightForeground': colors.accent,
      'editorSuggestWidget.border': colors.surface1,
      'list.hoverBackground': colors.surface1,
      'list.activeSelectionBackground': colors.surface2,
      'list.activeSelectionForeground': colors.text,
      'list.inactiveSelectionBackground': colors.surface1,
      'list.inactiveSelectionForeground': colors.text,
      'list.highlightForeground': colors.accent,
      'dropdown.background': colors.surface0,
      'dropdown.foreground': colors.text,
      'dropdown.border': colors.surface1,
      focusBorder: colors.accent,
      foreground: colors.text,
      descriptionForeground: colors.overlay0,
      errorForeground: colors.error,
      'icon.foreground': colors.overlay0,
    },
  };
}

export function getMonacoTheme(themeId?: string): editor.IStandaloneThemeData {
  const theme = themeId ? getThemeById(themeId) : null;
  if (theme) {
    return createMonacoTheme(theme.colors, theme.variant === 'dark');
  }
  return createMonacoTheme(getDefaultDarkTheme().colors, true);
}

export function getMonacoThemeForVariant(isDark: boolean): editor.IStandaloneThemeData {
  const theme = isDark ? getDefaultDarkTheme() : getDefaultLightTheme();
  return createMonacoTheme(theme.colors, isDark);
}

export function getMonacoThemeName(isDark: boolean): string {
  return isDark ? 'dshanpi-dark' : 'dshanpi-light';
}

export function getMonacoThemeNameForId(themeId: string): string {
  return `dshanpi-${themeId}`;
}

export function registerMonacoTheme(monaco: typeof import('monaco-editor'), themeId: string): void {
  const theme = getThemeById(themeId);
  if (theme) {
    const themeName = getMonacoThemeNameForId(themeId);
    monaco.editor.defineTheme(themeName, createMonacoTheme(theme.colors, theme.variant === 'dark'));
  }
}

export const CATPPUCCIN_MOCHA_DARK = createMonacoTheme(getDefaultDarkTheme().colors, true);
export const CATPPUCCIN_LATTE_LIGHT = createMonacoTheme(getDefaultLightTheme().colors, false);
export const CATPPUCCIN_THEME = CATPPUCCIN_MOCHA_DARK;

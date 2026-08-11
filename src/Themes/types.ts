/**
 * Theme mode type.
 *
 * Defines the application's visual theme preference:
 * - light: Always use light theme
 * - dark: Always use dark theme
 * - system: Follow system preference
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Core theme color palette.
 *
 * Defines the base color values used throughout the application,
 * following the Catppuccin color scheme naming conventions.
 */
export interface ThemeColors {
  /** Base background color */
  base: string;
  /** Mantle (darker background variant) */
  mantle: string;
  /** Crust (darkest background variant) */
  crust: string;
  /** Surface level 0 (card backgrounds) */
  surface0: string;
  /** Surface level 1 (elevated surfaces) */
  surface1: string;
  /** Surface level 2 (highest surfaces) */
  surface2: string;
  /** Overlay level 0 (subtle highlights) */
  overlay0: string;
  /** Overlay level 1 (medium highlights) */
  overlay1: string;
  /** Overlay level 2 (strong highlights) */
  overlay2: string;
  /** Primary text color */
  text: string;
  /** Subtext level 0 (secondary text) */
  subtext0: string;
  /** Subtext level 1 (muted text) */
  subtext1: string;
  /** Accent/highlight color */
  accent: string;
  /** Accent hover state */
  accentHover: string;
  /** Text on accent backgrounds */
  accentText: string;
  /** Success/positive indicator color */
  success: string;
  /** Warning/caution indicator color */
  warning: string;
  /** Error/failure indicator color */
  error: string;
  /** Border color */
  border: string;
  /** Interactive element color */
  interactive: string;
  /** Interactive element hover state */
  interactiveHover: string;
  /** Interactive element active state */
  interactiveActive: string;
}

/**
 * Derived/computed theme colors.
 *
 * Colors computed from base palette for specific use cases
 * like shadows, borders, and subtle variations.
 */
export interface DerivedColors {
  /** Dimmed accent variant */
  accentDim: string;
  /** Muted accent variant */
  accentMuted: string;
  /** Subtle accent variant */
  accentSubtle: string;
  /** Accent shadow color */
  accentShadow: string;
  /** Accent border color */
  accentBorder: string;
  /** Dimmed success variant */
  successDim: string;
  /** Muted success variant */
  successMuted: string;
  /** Subtle success variant */
  successSubtle: string;
  /** Success shadow color */
  successShadow: string;
  /** Success border color */
  successBorder: string;
  /** Dimmed warning variant */
  warningDim: string;
  /** Muted warning variant */
  warningMuted: string;
  /** Subtle warning variant */
  warningSubtle: string;
  /** Warning shadow color */
  warningShadow: string;
  /** Warning border color */
  warningBorder: string;
  /** Dimmed error variant */
  errorDim: string;
  /** Muted error variant */
  errorMuted: string;
  /** Subtle error variant */
  errorSubtle: string;
  /** Error shadow color */
  errorShadow: string;
  /** Error border color */
  errorBorder: string;
  /** Muted overlay variant */
  overlayMuted: string;
  /** Subtle overlay variant */
  overlaySubtle: string;
  /** Subtle text variant */
  textSubtle: string;
  /** Modal overlay color */
  modalOverlay: string;
  /** Dark modal overlay variant */
  modalOverlayDark: string;
  /** Editor overlay color */
  editorOverlay: string;
  /** Large shadow */
  shadowLg: string;
  /** Medium shadow */
  shadowMd: string;
  /** Small shadow */
  shadowSm: string;
  /** Indeterminate progress color */
  progressIndeterminate: string;
}

/**
 * Complete theme definition.
 *
 * Combines theme metadata with color definitions for
 * a complete visual theme configuration.
 */
export interface Theme {
  /** Unique theme identifier */
  id: string;
  /** Display name */
  name: string;
  /** Theme variant (dark or light) */
  variant: 'dark' | 'light';
  /** Variant display name */
  variantName: string;
  /** Core color palette */
  colors: ThemeColors;
  /** Derived/computed colors */
  derived: DerivedColors;
}

/** Re-export theme configuration functions */
export { getAllThemes, getThemeById, getDefaultDarkTheme, getDefaultLightTheme } from './configs';
/** Re-export ThemeDefinition type */
export type { ThemeDefinition } from './configs';
import catppuccinConfig from './src/Themes/configs/catppuccin.json';
import draculaConfig from './src/Themes/configs/dracula.json';
import githubConfig from './src/Themes/configs/github.json';
import atomOneConfig from './src/Themes/configs/atom-one.json';
import arduinoConfig from './src/Themes/configs/arduino.json';
import yuzukiConfig from './src/Themes/configs/yuzuki.json';

interface ThemeColors {
  base: string;
  mantle: string;
  crust: string;
  surface0: string;
  surface1: string;
  surface2: string;
  overlay0: string;
  overlay1: string;
  overlay2: string;
  text: string;
  subtext0: string;
  subtext1: string;
  accent: string;
  accentHover: string;
  accentText: string;
  success: string;
  warning: string;
  error: string;
  border: string;
  interactive: string;
  interactiveHover: string;
  interactiveActive: string;
}

interface ThemeVariantConfig {
  type: 'Dark' | 'Light';
  config: ThemeColors;
}

interface ThemeConfigFile {
  id: string;
  name: string;
  variants: Record<string, ThemeVariantConfig>;
}

const themeConfigs: ThemeConfigFile[] = [
  catppuccinConfig as ThemeConfigFile,
  draculaConfig as ThemeConfigFile,
  githubConfig as ThemeConfigFile,
  atomOneConfig as ThemeConfigFile,
  arduinoConfig as ThemeConfigFile,
  yuzukiConfig as ThemeConfigFile,
];

function toKebabCase(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-');
}

const themeColorsMap: Record<string, ThemeColors> = {};

for (const config of themeConfigs) {
  for (const [variantName, variantConfig] of Object.entries(config.variants)) {
    const id = `${config.id}-${toKebabCase(variantName)}`;
    themeColorsMap[id] = variantConfig.config;
  }
}

function generateThemeInitScript(): string {
  const themesJson = JSON.stringify(themeColorsMap);
  
  return `
(function(){
var themes=${themesJson};
var t=localStorage.getItem('app-theme')||'dark';
var idDark=localStorage.getItem('app-theme-id-dark')||'catppuccin-mocha';
var idLight=localStorage.getItem('app-theme-id-light')||'catppuccin-latte';
var s=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;
var id=s==='dark'?idDark:idLight;
var c=themes[id];
if(!c){c=themes['catppuccin-mocha'];}
var r=document.documentElement;
Object.keys(c).forEach(function(k){r.style.setProperty('--color-'+k.replace(/([A-Z])/g,'-$1').toLowerCase(),c[k])});
r.setAttribute('data-theme',s);
})();`.trim();
}

export const THEME_INIT_SCRIPT = generateThemeInitScript();

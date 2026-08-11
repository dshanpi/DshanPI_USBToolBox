const folderIcons: Record<string, string> = {
  default: '📁',
  src: '📂',
  source: '📂',
};

const fileIcons: Record<string, string> = {
  default: '📄',
  folder: '📁',

  js: '📜',
  mjs: '📜',
  cjs: '📜',
  jsx: '⚛️',
  ts: '🔷',
  tsx: '⚛️',
  py: '🐍',
  pyw: '🐍',
  pyc: '🐍',
  rb: '💎',
  java: '☕',
  jar: '☕',
  c: '🔵',
  cpp: '🔵',
  cc: '🔵',
  cxx: '🔵',
  h: '📄',
  hpp: '📄',
  cs: '💜',
  go: '🐹',
  rs: '🦀',
  php: '🐘',
  swift: '🍎',
  kt: '🟣',
  kts: '🟣',
  scala: '🔴',
  lua: '🌙',
  r: '📊',
  sh: '💻',
  bash: '💻',
  zsh: '💻',
  ps1: '💻',
  bat: '💻',
  cmd: '💻',

  html: '🌐',
  htm: '🌐',
  xhtml: '🌐',
  css: '🎨',
  scss: '🎨',
  sass: '🎨',
  less: '🎨',

  json: '📋',
  jsonc: '📋',
  xml: '📋',
  yaml: '📄',
  yml: '📄',
  toml: '📄',
  ini: '⚙️',
  conf: '⚙️',
  config: '⚙️',

  md: '📝',
  markdown: '📝',
  txt: '📄',
  log: '📋',
  rtf: '📄',

  pdf: '📕',
  doc: '📘',
  docx: '📘',
  xls: '📗',
  xlsx: '📗',
  ppt: '📙',
  pptx: '📙',

  png: '🖼️',
  jpg: '🖼️',
  jpeg: '🖼️',
  gif: '🖼️',
  svg: '🖼️',
  webp: '🖼️',
  ico: '🖼️',
  bmp: '🖼️',

  mp3: '🎵',
  wav: '🎵',
  ogg: '🎵',
  flac: '🎵',
  m4a: '🎵',
  aac: '🎵',
  wma: '🎵',

  mp4: '🎬',
  mkv: '🎬',
  avi: '🎬',
  mov: '🎬',
  wmv: '🎬',
  flv: '🎬',
  webm: '🎬',
  m4v: '🎬',

  zip: '📦',
  tar: '📦',
  gz: '📦',
  rar: '📦',
  '7z': '📦',
  bz2: '📦',
  xz: '📦',

  apk: '🤖',
  ipa: '🍎',
  exe: '⚙️',
  msi: '⚙️',
  dmg: '💿',
  deb: '📦',
  rpm: '📦',
  iso: '💿',
  img: '💿',

  sql: '🗄️',
  db: '🗄️',
  sqlite: '🗄️',
  sqlite3: '🗄️',

  git: '🔧',
  gitignore: '🚫',
  dockerfile: '🐳',
  docker: '🐳',
  makefile: '🔨',
  cmake: '🔨',
  gradle: '🐘',
  lock: '🔒',
  key: '🔑',
  pem: '🔐',
  crt: '🔐',
  cer: '🔐',
  pub: '🔑',
};

const fileNameIcons: Record<string, string> = {
  readme: '📖',
  'readme.md': '📖',
  'readme.txt': '📖',
  license: '📜',
  'license.md': '📜',
  'license.txt': '📜',
  changelog: '📋',
  'changelog.md': '📋',
  'changelog.txt': '📋',
  dockerfile: '🐳',
  'docker-compose.yml': '🐳',
  'docker-compose.yaml': '🐳',
  makefile: '🔨',
  gemfile: '💎',
  rakefile: '💎',
  vagrantfile: '📦',
  '.gitignore': '🚫',
  '.gitattributes': '🔧',
  '.env': '🔐',
  '.env.local': '🔐',
  '.env.development': '🔐',
  '.env.production': '🔐',
  '.editorconfig': '⚙️',
  '.eslintrc': '🔍',
  '.eslintrc.js': '🔍',
  '.eslintrc.json': '🔍',
  '.prettierrc': '🎨',
  '.prettierrc.js': '🎨',
  '.prettierrc.json': '🎨',
  'package.json': '📦',
  'package-lock.json': '📦',
  'yarn.lock': '📦',
  'pnpm-lock.yaml': '📦',
  'tsconfig.json': '🔷',
  'jsconfig.json': '📜',
  'vite.config.js': '⚡',
  'vite.config.ts': '⚡',
  'webpack.config.js': '📦',
  'rollup.config.js': '📦',
  'babel.config.js': '📜',
  '.babelrc': '📜',
  'tailwind.config.js': '🎨',
  'tailwind.config.ts': '🎨',
  'postcss.config.js': '🎨',
  'jest.config.js': '🧪',
  'jest.config.ts': '🧪',
  'vitest.config.ts': '🧪',
  'cypress.config.js': '🧪',
  'cypress.config.ts': '🧪',
  'playwright.config.ts': '🧪',
  'next.config.js': '▲',
  'next.config.mjs': '▲',
  'nuxt.config.ts': '💚',
  'svelte.config.js': '🔥',
  'vue.config.js': '💚',
  'angular.json': '🅰️',
  'cargo.toml': '🦀',
  'cargo.lock': '🦀',
  'go.mod': '🐹',
  'go.sum': '🐹',
  'composer.json': '🐘',
  'composer.lock': '🐘',
  'pom.xml': '☕',
  'build.gradle': '☕',
  'build.gradle.kts': '☕',
  'settings.gradle': '☕',
  'settings.gradle.kts': '☕',
  'cmakelists.txt': '🔨',
  'requirements.txt': '🐍',
  'setup.py': '🐍',
  'pyproject.toml': '🐍',
  pipfile: '🐍',
  'poetry.lock': '🐍',
};

export function getFileIconEmoji(fileName: string, isDirectory: boolean): string {
  const lowerFileName = fileName.toLowerCase();

  if (isDirectory) {
    const baseName = lowerFileName.split('.')[0];
    return folderIcons[lowerFileName] || folderIcons[baseName] || folderIcons.default;
  }

  if (fileNameIcons[lowerFileName]) {
    return fileNameIcons[lowerFileName];
  }

  if (lowerFileName.startsWith('.')) {
    if (fileNameIcons[lowerFileName]) {
      return fileNameIcons[lowerFileName];
    }
  }

  const ext = lowerFileName.split('.').pop();
  if (ext && ext !== lowerFileName && fileIcons[ext]) {
    return fileIcons[ext];
  }

  return fileIcons.default;
}

export function getFileIconDataUrl(fileName: string, isDirectory: boolean): string {
  return getFileIconEmoji(fileName, isDirectory);
}

export function getIconUrl(iconName: string): string {
  return iconName;
}

export function getFileIconName(fileName: string, isDirectory: boolean): string {
  return getFileIconEmoji(fileName, isDirectory);
}

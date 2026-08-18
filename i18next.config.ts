import { defineConfig } from 'i18next-cli';

// These labels are protocol names, electrical levels, units, data examples,
// or symbolic UI glyphs. They intentionally stay language-neutral instead of
// being translated into misleading alternatives.
const preservedTechnicalText = [
  /^(?:GPIO|LOW|HIGH|FUNCTION|TTF|TXT|HEX|CSV|EEPROM|OLED|Modbus TCP)$/,
  /^(?:CRC32|CRC16 \(Modbus\)|CRC16 \(CCITT\)|Sum8|Sum16|ADD8|0-ADD8|XOR8|ADDR16)$/,
  /^(?:8N1|8E1|8O1)$/,
  /^(?:ms|us|µs|px|fps|MB|GB)$/,
  /^\d+(?:\.\d+)?\s*(?:kHz|MHz|MB|GB|K|B|ms|us|µs|px|fps|°|×)$/,
  /^(?:0x|@\s*0x)$/,
  /^(?:[0-9A-F]{2}\s+){1,}[0-9A-F]{2}$/,
  /^24C\d+(?:\s*\/\s*24C\d+)*(?:\s*\(\d+B\))?$/,
  /^25xx EEPROM$/,
  /^(?:init_flag:|update_flag:|ret_addr:\s*0x|ret:\s*0x|run:\s*0x)$/,
  /^(?:64K|4K)\s*\($/,
  /^:\s*v$/,
  /^(?:⚠️|✏️|💾|📋|📱|📂|⬇️|📁|✂️|📥|🗑️|ℹ️|🔄|📤|🎛)$/,
];

function isPreservedTechnicalText(text: string): boolean {
  const value = text.trim();
  // Punctuation and icon-only labels do not contain translatable words.
  if (!/[\p{L}\p{N}]/u.test(value)) return true;
  return preservedTechnicalText.some((pattern) => pattern.test(value));
}

export default defineConfig({
  locales: ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'],
  extract: {
    input: ['src/**/*.{js,jsx,ts,tsx}'],
    output: 'src/i18n/locales/{{language}}.json',
    defaultNS: false,
    nsSeparator: false,
    keySeparator: '.',
    extractFromComments: false,
    defaultValue: (locale, key) => {
      if (locale === 'zh-CN') {
        return key;
      }
      return '';
    },
  },
  plugins: [
    {
      name: 'preserve-protocol-terms',
      lintOnResult: (_filePath, issues) =>
        issues.filter(
          (issue) => issue.type !== 'hardcoded' || !isPreservedTechnicalText(issue.text)
        ),
    },
  ],
});

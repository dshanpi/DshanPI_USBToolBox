/**
 * ANSI escape code to HTML converter.
 * Converts terminal escape sequences to styled <span> elements for colored output.
 */

// ANSI code → CSS class mapping (colors defined in SerialTool.css via theme vars)
const FG_CLASSES: Record<number, string> = {
  30: 'af0', 31: 'af1', 32: 'af2', 33: 'af3',
  34: 'af4', 35: 'af5', 36: 'af6', 37: 'af7',
  90: 'af8', 91: 'af9', 92: 'af10', 93: 'af11',
  94: 'af12', 95: 'af13', 96: 'af14', 97: 'af15',
};

const BG_CLASSES: Record<number, string> = {
  40: 'ab0', 41: 'ab1', 42: 'ab2', 43: 'ab3',
  44: 'ab4', 45: 'ab5', 46: 'ab6', 47: 'ab7',
  100: 'ab8', 101: 'ab9', 102: 'ab10', 103: 'ab11',
  104: 'ab12', 105: 'ab13', 106: 'ab14', 107: 'ab15',
};

interface AnsiState {
  classes: string[];
  bold: boolean;
  underline: boolean;
}

function buildClasses(state: AnsiState): string {
  const cls = [...state.classes];
  if (state.bold) cls.push('ab');
  if (state.underline) cls.push('au');
  return cls.join(' ');
}

function resetState(): AnsiState {
  return { classes: [], bold: false, underline: false };
}

function applyCode(state: AnsiState, code: number): AnsiState {
  if (code === 0) return resetState();
  if (code === 1) return { ...state, bold: true };
  if (code === 4) return { ...state, underline: true };
  if (code === 22) return { ...state, bold: false };
  if (code === 24) return { ...state, underline: false };
  if (FG_CLASSES[code]) return { ...state, classes: [...state.classes.filter((c) => !c.startsWith('af')), FG_CLASSES[code]] };
  if (BG_CLASSES[code]) return { ...state, classes: [...state.classes.filter((c) => !c.startsWith('ab')), BG_CLASSES[code]] };
  return state;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Stateful ANSI-to-HTML converter.
 * Buffers incomplete escape sequences that may be split across packets.
 * Returns HTML with styled <span> elements.
 */
export function createAnsiConverter() {
  let buf = '';
  let state: AnsiState = resetState();
  let openSpan = false;

  function closeSpan(): string {
    if (openSpan) {
      openSpan = false;
      return '</span>';
    }
    return '';
  }

  function openSpanTag(s: AnsiState): string {
    const cls = buildClasses(s);
    if (cls) {
      openSpan = true;
      return `<span class="${cls}">`;
    }
    return '';
  }

  return function process(chunk: string): string {
    buf += chunk;
    let out = '';
    let i = 0;

    while (i < buf.length) {
      if (buf[i] === '\x1b' && i + 1 < buf.length && buf[i + 1] === '[') {
        let end = i + 2;
        while (end < buf.length && !/[a-zA-Z]/.test(buf[end])) {
          end++;
        }
        if (end < buf.length && /[a-zA-Z]/.test(buf[end])) {
          const letter = buf[end];
          // Parse the sequence body (e.g., "1;34" from ESC[1;34m)
          const body = buf.substring(i + 2, end);
          if (letter === 'm') {
            // SGR sequence: apply color codes
            out += closeSpan();
            const codes = body.split(';').map(Number).filter((n) => !isNaN(n));
            if (codes.length === 0) codes.push(0); // ESC[m = reset
            for (const code of codes) {
              state = applyCode(state, code);
            }
            out += openSpanTag(state);
          }
          // Skip other CSI sequences (cursor movement etc.) silently
          i = end + 1;
        } else {
          break; // incomplete sequence
        }
      } else {
        out += escapeHtml(buf[i]);
        i++;
      }
    }

    buf = buf.slice(i);
    return out;
  };
}

// ─── Keyword-based highlighting (fallback for non-ANSI output) ───

interface KeywordRule {
  pattern: RegExp;
  cls: string;
}

const KEYWORD_RULES: KeywordRule[] = [
  { pattern: /\b(error|fail(?:ed|ure)?|fatal|critical|panic|err(?:or)?|invalid|unsupported|denied|refused|timeout|crash|abort)\b/gi, cls: 'kw-red' },
  { pattern: /\b(warn(?:ing)?|caution|attention|notice|deprecated|obsolete)\b/gi, cls: 'kw-yellow' },
  { pattern: /\b(success(?:ful(?:ly)?)?|ok|done|pass(?:ed)?|ready|complete(?:d)?|connected|enabled|active|found|open|up(?:load)?)\b/gi, cls: 'kw-green' },
  { pattern: /\b(info(?:rmation)?|initializ(?:e|ing|ed|ation)|start(?:ing|ed)?|load(?:ing|ed)?|config(?:ure|ured)?|detect(?:ed|ing)?)\b/gi, cls: 'kw-cyan' },
  { pattern: /\b(debug|trace|verbose|path|route)\b/gi, cls: 'kw-blue' },
  { pattern: /\b([0-9]+(?:\.[0-9]+)?(?:ms|s|KB|MB|GB|%|bps)?)\b/gi, cls: 'kw-magenta' },
];

/**
 * Apply keyword-based syntax highlighting to plain text (no existing HTML spans).
 * Only wraps text that is not already inside an HTML tag.
 */
export function highlightKeywords(html: string): string {
  // Only highlight if no existing spans (pure text or only keyword-highlighted)
  // Split by existing spans, highlight the text parts
  const parts = html.split(/(<span[^>]*>.*?<\/span>)/g);
  return parts.map((part) => {
    if (part.startsWith('<span')) return part; // already styled
    let result = part;
    for (const rule of KEYWORD_RULES) {
      result = result.replace(rule.pattern, (match) => `<span class="${rule.cls}">${match}</span>`);
    }
    return result;
  }).join('');
}


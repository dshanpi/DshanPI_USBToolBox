# SerialTool Skill Document

## Overview

SerialTool is a full-featured serial port debugging tool integrated into OpenixSuit. It provides terminal-style direct input, timestamp tagging, HEX display, multi-text batch sending, and customizable presets — comparable to professional tools like MobaXterm and COMTool.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      SerialTool.tsx                          │
│  (State orchestrator: connection, display, event handling)   │
├──────────────┬────────────────────────┬─────────────────────┤
│ SerialSettings│    SerialMonitor       │   MultiSendPanel    │
│ (Left: 235px)│   (Center: flex:1)     │  (Right: 225px)    │
│              │                        │                     │
│ • Port/Baud  │ • Direct keyboard input│ • 10+ text inputs   │
│ • Data/Stop  │ • Terminal-style type  │ • Cycle send        │
│ • Parity/Flow│ • Right-click menu     │ • HEX mode          │
│ • Open/Close │ • Copy/Paste           │ • Save/Load/Reset   │
│ • TimeStamp  │ • ANSI code stripping  │ • Collapsible       │
│ • HEX display│ • Selection highlight  │                     │
├──────────────┴────────────────────────┤                     │
│            SendPanel (left sidebar)    │                     │
│  • Custom text input + send           │                     │
│  • Preset buttons (editable)          │                     │
│  • HEX / +\\n / Repeat options        │                     │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
src/Components/SerialTool/
├── index.ts                  # Public exports
├── SerialToolPage.tsx        # Page wrapper with PageContainer
├── SerialTool.tsx            # Main orchestrator (connection, state, data processing)
├── SerialTool.css            # Full styling (~800 lines)
└── Components/
    ├── SerialMonitor.tsx      # Terminal display + direct keyboard input
    ├── SerialSettings.tsx     # Port config (baud, data, stop, parity, flow)
    ├── SendPanel.tsx          # Custom text send + presets
    └── MultiSendPanel.tsx     # Multi-text batch send (right panel)

src-tauri/src/serial/
├── mod.rs                    # SerialState, read thread, event types
└── commands.rs               # Tauri commands: list_ports, open, close, write
```

## Rust Backend (Tauri Commands)

| Command             | Args                                                    | Description                                        |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| `serial_list_ports` | none                                                    | Enumerate available serial ports with VID/PID info |
| `serial_open`       | port, baudRate, dataBits, stopBits, parity, flowControl | Open port + spawn read thread                      |
| `serial_close`      | port                                                    | Stop read thread + close port                      |
| `serial_write`      | port, data (number[])                                   | Write bytes to port                                |
| `serial_is_open`    | port                                                    | Check if port is open                              |

### Read Thread Behavior

- Spawned per open port, runs in background
- Reads with 20ms timeout; frontend merges adjacent read chunks with a short idle gap
- Emits `serial-data-received` event: `{ port: string, data: number[] }`
- Handle thread stops on error or when stop flag is set
- Shared `Arc<Mutex<Box<dyn SerialPort>>>` for both read & write access

### Error Classification

Rust backend classifies open errors into three categories:

- `PORT_BUSY:` — Access denied / port in use
- `PORT_GONE:` — Port not found / disconnected
- `PORT_ERROR:` — Other errors (with detail)

Frontend maps these to user-friendly i18n messages.

## Key Features

### 1. Terminal-Style Direct Input

- Click the display area to focus, type to send characters directly
- No separate input box — same as MobaXterm/PuTTY
- Enter → `\n` (configurable via `+\n` toggle)
- Backspace → DEL (0x7F), ESC → `\x1b`, Tab → `\t`
- Ctrl+C → copy selected text, Ctrl+V → paste clipboard as input

### 2. Timestamp + Direction Tag

- Toggle via "TimeStamp" button in settings panel
- `[HH:MM:SS.mmm]发→◇` prefix for sent data
- `[HH:MM:SS.mmm]收←◆` prefix for received data
- Sent data displayed immediately (no line buffering)
- Received OS read chunks are merged into idle-delimited records before display
- Text without `\n` is displayed after the idle gap instead of being buffered indefinitely
- Separate tx/rx line buffers prevent data mixing

### 3. HEX Display Mode

- Toggle via "HEX显示" button in settings panel
- Converts ALL display content to space-separated hex bytes
- HEX versus text display is always an explicit user choice; binary-looking data never changes the selected mode
- Stores raw byte chunks — toggle rebuilds entire display
- Timestamp prefixes still work in HEX mode

### 4. ANSI Escape Code Stripping

- Stateful stripper with internal buffer
- Handles sequences split across data packets
- Strips color codes (`\x1b[1;34m`), cursor movements, etc.

### 5. Right-Click Context Menu

- **Copy**: copies selected text to clipboard
- **Paste**: reads clipboard and sends to serial port

### 6. Multi Send Panel (Right)

- 10 default text input rows, expandable via `+ Add`
- Each row: index, text input, ▶ send button, ✕ remove button
- **Send All**: sends all non-empty entries sequentially with delay
- **Cycle**: loops through entries continuously (highlight current)
- **HEX mode**: parse inputs as hex bytes (`73 08 1B`)
- **Save/Load**: JSON file persistence via Tauri dialog
- **Reset**: restore default 10 empty rows
- Auto-saves to localStorage
- Collapsible via chevron button (matches sidebar toggle style)

### 7. Custom Send Panel (Left Sidebar)

- Text input + Send button (Enter to send)
- **Presets**: Hello, OK, AT, AT+GMR (customizable)
- `+` button: add new preset (name + text)
- `⚙` button: manage mode — delete presets, reset to defaults
- Presets saved to localStorage
- **HEX mode**: parse input as hex bytes
- **Repeat**: send at fixed interval (100ms-60s)

### 8. Display Options (Left Sidebar, below Open/Close)

- **TimeStamp**: toggle button with active state styling
- **HEX显示**: toggle button with active state styling
- Both use i18n for multilingual support

## Data Flow

```
Serial Device ←→ Rust serialport (read thread)
                      │
              Tauri events (serial-data-received)
              Tauri commands (serial_open/close/write)
                      │
              Frontend SerialTool state
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
  SerialMonitor   SendPanel    MultiSendPanel
  (keyboard in)   (custom)     (batch)
        │             │             │
        └─────────────┴─────────────┘
                      │
              handleSend(data, isSent)
                      │
              processReceived()
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
  rawChunksRef.push()        setReceivedText()
  (for HEX rebuild)          (display update)
```

### Display Processing Pipeline

1. Raw bytes arrive → `processReceived(data, isSent)`
2. Store chunk in `rawChunksRef` for HEX rebuild
3. If HEX mode: convert to hex string, apply timestamp prefix
4. Merge adjacent receive chunks separated by less than 15ms into one display record
5. If text mode: preserve bytes one-to-one (`00` is shown as `\0`) and display them even without a trailing newline
6. If HEX mode: display every byte as a two-digit hexadecimal value
7. Sent data: immediate display
8. Append formatted text to `receivedText` state

### HEX Rebuild

When HEX toggle changes:

1. Clear `receivedText`
2. Iterate all `rawChunksRef` chunks
3. Re-format each with current HEX + timestamp settings
4. Set as new `receivedText`

## i18n Structure

Keys under `serialTool.*` namespace in locale files:

```
serialTool
├── status (connected, disconnected, connecting)
├── monitor (autoScroll, locked, clear, waitingForData, openToBegin, input, send)
├── settings (port, baudRate, dataBits, stopBits, parity, flowControl, ...)
├── sendPanel (title, send, hex, appendNewline, repeat, stop, ms, ...)
├── multiSend (title, sendItem, remove, add, delay, ms, sendAll, cycle, stop, save, load, reset, collapse, expand, hex)
└── error (unknown, portBusy, portGone, portError, portGeneric)
```

Supported languages: zh-CN, zh-TW, en-US, ja-JP, ko-KR

## Layout Configuration

The three-panel layout uses flexbox with `flex-direction: row`:

| Panel                        | Width                     | Position                 |
| ---------------------------- | ------------------------- | ------------------------ |
| SerialSettings (+ SendPanel) | 235px                     | Left                     |
| SerialMonitor                | flex: 1                   | Center (fills remaining) |
| MultiSendPanel               | 225px (or 36px collapsed) | Right                    |

Margins: 8px outer edges, 4-6px between panels

## State Management

Key state in `SerialTool.tsx`:

- `connected`, `connecting` — connection status
- `receivedText` — display content (derived from rawChunks + options)
- `showTimestamp`, `hexDisplay` — display mode toggles
- `config` — port configuration

Key refs:

- `rawChunksRef` — all raw byte chunks for HEX rebuild
- `pendingReceiveRef` / `receiveFlushTimerRef` — idle-gap receive aggregation
- `txLineActiveRef` — tracks whether a timestamped sent line is in progress
- `txLineActiveRef` — track in-progress sent line for timestamp prefix
- `ansiStripperRef` — stateful ANSI code remover

## Key Design Decisions

1. **Idle-gap receive aggregation**: Prevents one serial frame split across OS reads from appearing as several timestamped records.

2. **handleSend always echoes in timestamp mode**: All send paths (keyboard, custom, multi) use `processReceived(data, true)` when timestamp is ON, ensuring consistent `发→◇` tags.

3. **HEX rebuild from raw chunks**: Rather than converting text back to bytes, raw byte arrays are stored and re-formatted when display mode changes.

4. **Always-visible receive data**: Text mode preserves control/high bytes (`00` becomes visible `\0`) and flushes after the receive idle gap even without `\n`; only the user-controlled toggle enables HEX.

5. **ANSI stripper with buffer**: Handles escape sequences split across USB packets by buffering incomplete sequences.

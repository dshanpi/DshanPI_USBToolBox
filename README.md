<div align="center"><img width="80" src="src-tauri/icons/128x128%402x.png" alt="DshanPI USBToolBox logo"></div>
<h1 align="center"><b>DshanPI USBToolBox</b></h1>
<p align="center">
  A Windows-first desktop toolbox for serial, Modbus, CH347 bus debugging, display bring-up, and Python production tests.
</p>

> DshanPI USBToolBox retains FEL/FES flashing, firmware parsing, ADB, and related legacy modules in the source tree, while the default UI focuses on the seven hardware-debugging tools listed below.

## Current Features

The application starts on the serial tool and exposes seven tools from `src/main.tsx`:

| Tool             | Current capability                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Serial Tool      | OS serial-port discovery, terminal-style input, text/HEX display, timestamps, presets, repeated and multi-row sends, and checksum helpers |
| Modbus Tool      | Modbus RTU/TCP master operations and a serial RTU slave simulator                                                                         |
| I2C Tool         | CH347 master transfers, address scanning, 8/16-bit register access, paged writes, and multi-step operations                               |
| SPI Tool         | CH347 master read/write/full-duplex transfers, SPI configuration, manual GPIO steps, and reusable workflows                               |
| GPIO Tool        | Read and control CH347 GPIO1-GPIO7, batch level changes, and timed output sequences                                                       |
| SPI Display Tool | Bring up monochrome-page and RGB565 displays; includes SSD1306 and ST7789V 1.14-inch blue-board 135×240 presets with media output         |
| Python Test Tool | Start a loopback REST API, edit/run Python scripts, stream output, and use the bundled zero-dependency `usbtoolbox` test library          |

Additional application-level features include:

- Shared CH347 connection state across I2C, SPI, GPIO, display, and Python workflows
- Event-driven CH347 hot-plug detection on Windows
- A board-specific GPIO0 voltage toggle labelled 1.8 V / 3.3 V
- Light/dark themes and Simplified Chinese, Traditional Chinese, English, Japanese, and Korean UI resources
- A global OpenAI-compatible USBToolBox assistant available from every tool, plus 100ask.net OAuth login support

The I2C and SPI slave-emulator implementations are retained in source, but their tabs are currently disabled with `SHOW_SLAVE_TAB = false`.

### USBToolBox AI Assistant

Every tool has a circular assistant button in the lower-right corner. Configure an OpenAI-compatible API URL, API key, and model in Settings, then use the assistant to inspect the current tool state, discuss a fault, or attach up to five local reference files. Supported attachments include UTF-8/UTF-16/GBK text, source and configuration files, plus PDFs with a text layer; scanned PDFs must be OCRed first. A selected file is read into memory and is not copied into the project or persisted by the assistant.

Conversation history is maintained separately for every tool and restored after an application restart. The first question becomes the automatic conversation title; the history panel can search message content, switch, rename, delete, or clear conversations. Storage is bounded to the most recent conversations/messages so it cannot grow without limit. Conversation text and unfinished drafts are stored in browser-local application storage, while attachment names, paths, and extracted contents are deliberately excluded. Clearing a tool's history replaces it with one empty conversation.

The assistant can produce reviewable UI actions for:

- SPI bus parameters and multi-step SPI workflows
- SPI display bus/canvas parameters and complete initialization sequences
- I2C address/frequency/register parameters and multi-step I2C/GPIO workflows
- Serial port parameters while using recent TX/RX data to diagnose framing or garbled text
- Modbus RTU/TCP transport, station, function-code, address, polling, and write parameters while using recent logs and responses for diagnosis

Generated actions appear as a preview card and are applied only after the user clicks **Apply to current tool**. Applying an action only fills the relevant controls or workflow table: it never connects a device, changes a live serial/Modbus transport, sends bytes, runs display initialization, or starts polling. Local attachments, enabled tool context, and recent logs are sent to the API service configured by the user only when a question is submitted; disable **Include current configuration and recent logs** when that context should not leave the machine.

## Platform and Hardware Status

The complete current feature set should be treated as **Windows-first**. `src-tauri/src/ch347/` calls the WCH Windows DLL and Win32 device notifications directly. Standard serial support and much of the legacy libusb code are portable, but the current CH347-backed application is not yet fully platform-neutral.

For CH347 functions:

- Install the appropriate WCH CH347 device driver.
- Windows x64 packaging is configured to include the signed WCH `CH347DLLA64.dll` runtime. The application loads this bundled copy by absolute path, so users do not need to copy a DLL beside the executable or modify `PATH`. Installers built before this resource mapping was added must be rebuilt.
- The runtime loader checks packaged/executable resource locations and the checked-in `src-tauri/resources/ch347` development resource before using the normal Windows loader search path as a compatibility fallback.
- If the bundled runtime is missing or damaged, the application still starts, logs every attempted DLL path, and marks CH347 I2C/SPI/GPIO/display operations unavailable. Reinstall DshanPI USBToolBox or the official WCH driver package to repair it.
- The bundled runtime version, architecture, source, and SHA-256 checksum are recorded in `src-tauri/resources/ch347/THIRD_PARTY_NOTICES.txt`.

Standard OS serial ports are handled through Rust's `serialport` crate and do not require a CH347 device.

The CH347 SPI display wiring used by the built-in presets is `DC -> GPIO4`, `RES/RST -> GPIO5`, and `BLK -> GPIO6`. Connect the display clock `SCL` to `SCK` and its serial data input `SDA` to the CH347 `MOSI` output (not `MISO`). The verified daily-use preset is named `ST7789V 蓝板 1.14" 135×240`; it targets the supplied eight-pin blue-board module in its reference portrait mode: 135×240, SPI Mode 3/MSB-first, with GRAM offsets X+52/Y+40 applied automatically. Mode 3 follows the supplied bit-banged example's actual waveform, which holds SCK high before reset and between bytes; a separate Mode 0 red-screen preset remains available for comparison. Loading the verified preset also selects the conservative 937.5 KHz bring-up speed. The daily-use preset performs initialization only, while the adjacent red-screen self-test appends an RGB565 fill for hardware verification. RGB transfers are automatically split into independent address windows of no more than 480 bytes to stay below the CH347 SPI OUT packet payload limit; seeing only a red strip at the left edge indicates an older backend is still running, so fully stop and restart `npm run tauri dev` rather than relying on frontend hot reload.

The display workspace keeps its original three-pane flow: configure the SPI bus and initialization sequence on the left, author and push content from the text/image/video/drawing tabs in the middle, and review the latest canvas and transfer log on the right. Running initialization automatically applies the current SPI settings, so the separate bus-apply button is only needed for immediate low-level testing. The three columns retain their original 34/33/33 proportions, with gap-aware sizing to prevent the outer panels from being clipped.

## Install a Release

Published DshanPI USBToolBox builds are available from the [Releases](https://github.com/dshanpi/DshanPI_USBToolBox/releases) page.

## Build from Source

### Requirements

- Windows 10/11
- Node.js `^20.19.0` or `>=22.12.0` (required by the checked-in Vite 8 toolchain)
- Current stable Rust toolchain with the MSVC target
- Microsoft Visual Studio C++ Build Tools and Windows SDK
- Microsoft Edge WebView2 Runtime
- Git with submodule support

Clone the repository with its native dependencies, install JavaScript packages, and start Tauri:

```powershell
git clone --recursive https://github.com/dshanpi/DshanPI_USBToolBox.git
cd DshanPI_USBToolBox
npm ci
npm run tauri dev
```

Build installers and the release executable with:

```powershell
npm run tauri build
```

If the repository was cloned without `--recursive`, initialize the remaining submodules before building. The `libefex` source is vendored directly under `src-tauri/libs/libefex`.

```powershell
git submodule update --init --recursive
```

### Python Runtime

The packaged Python test library under `python/` uses only the Python standard library. The in-app runner resolves Python in this order:

1. `USBTOOLBOX_PYTHON`
2. Bundled `src-tauri/resources/pyembed/python.exe`
3. `python` from the system `PATH`

To populate a missing Windows embedded runtime on a development or packaging machine:

```powershell
./scripts/fetch-python-runtime.ps1
```

The bundled `python/` directory is included as a Tauri resource. `USBTOOLBOX_PYTHON_DIR` can override its location during development.

## Development Commands

| Command                                             | Purpose                                                         |
| --------------------------------------------------- | --------------------------------------------------------------- |
| `npm run tauri dev`                                 | Run the React frontend and Rust backend with development reload |
| `npm run tauri build`                               | Build the production desktop bundle                             |
| `npm run build`                                     | Sync the package version and build the frontend only            |
| `npm run typecheck`                                 | Run TypeScript checking without emitting files                  |
| `npm run lint`                                      | Run ESLint on `src/`                                            |
| `npm run format:check`                              | Check frontend formatting with Prettier                         |
| `npm run i18n:extract`                              | Extract translation keys                                        |
| `npm run i18n:status`                               | Report translation completeness                                 |
| `cargo check --manifest-path src-tauri/Cargo.toml`  | Check the Rust backend                                          |
| `cargo clippy --manifest-path src-tauri/Cargo.toml` | Lint the Rust backend                                           |

Run the hardware-independent Python unit tests with:

```powershell
Set-Location python
python -m unittest discover -s tests -v
```

## Architecture

```text
React 19 + TypeScript 6 UI
        │
        │ typed Tauri commands/events
        ▼
Rust/Tauri 2 backend
  ├─ serial + TCP transports
  ├─ CH347 I2C/SPI/GPIO DLL bridge
  ├─ local Axum REST server + Python runner
  ├─ AI streaming proxy, document extraction, auth/system services
  └─ legacy EFEX/firmware/flash/ADB modules
        │
        ├─ OS serial/TCP
        ├─ CH347 hardware
        └─ libefex/libusb and ADB legacy paths
```

The frontend normally calls the backend through the typed `src/Platform/IPC/` wrapper. Command handlers and managed state are registered in `src-tauri/src/lib.rs`.

CH347 devices are reference-counted in the Rust backend so the GUI and local REST service can share one physical device. Serial ports use one shared map keyed by port name; unlike CH347, a second open of an already-open serial port is rejected.

The Python REST server listens only on `127.0.0.1`, uses port `8765` by default, and is started manually from the Python Test Tool.

## Project Layout

```text
src/
  Components/             Active tools plus legacy/hidden screens
    AIAssistant/          Global assistant UI, prompt/action protocol, and tool bridge
  CoreUI/                 Layout, sidebar, page containers, dialogs
  Platform/IPC/           Typed Tauri command and event contracts
  Services/               Auth, EFEX, hot-plug, and service wrappers
  Themes/                 Theme definitions and provider
  i18n/locales/           Five locale files
  Library/, Devices/,
  FlashManager/, ...      Shared and legacy Allwinner logic

src-tauri/
  src/ch347/              Windows CH347 DLL bridge and hot-plug notifier
  src/serial/, src/tcp/   Serial and TCP transports
  src/httpd/              Loopback REST service and Python runner
  src/ai/, src/auth/      AI proxy, local document extraction, and OAuth support
  src/efex/, firmware/,
  flash/, adb/, ...       Legacy Allwinner/ADB backend
  libs/                   vendored libefex and the adb_client submodule

python/
  usbtoolbox/tester/      Standard-library production-test client and helpers
  tests/                  Mock-based unit tests that do not require hardware

docs/                     Detailed Python API and historical project notes
scripts/                  Version, release, and embedded-Python helpers
```

## Documentation

- [Python quick start](python/README.md)
- [Python production-test API](docs/PYTHON_API.md)
- [100ask OAuth example](docs/100ask-oauth-rust-example.md)

`docs/ARCHITECTURE.md` and parts of `docs/功能说明.md` describe legacy snapshots and may not reflect the current seven-tool sidebar. Use `src/main.tsx`, `src-tauri/src/lib.rs`, this README, and `CLAUDE.md` as the current high-level sources of truth.

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).

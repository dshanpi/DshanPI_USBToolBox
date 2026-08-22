# CLAUDE.md

This file is the working guide for AI-assisted changes in this repository. Prefer code and manifests over historical documentation when they disagree.

## Project Identity and Sources of Truth

The current product is **USBToolBox** (`productName` in `src-tauri/tauri.conf.json`; npm/Rust package `usbtoolbox-app`, version `1.0.0`). It is a Tauri 2 desktop application for serial, Modbus, CH347 bus debugging, SPI display bring-up, and Python production testing.

The repository retains legacy Allwinner/Sunxi firmware-flasher modules alongside **DshanPI USBToolBox**. Keep release asset names, updater configuration, crate/library names, identifiers, and migration compatibility aligned when changing public branding.

Use these files as the current high-level sources of truth:

1. `package.json` and `src-tauri/Cargo.toml` for dependencies and scripts
2. `src/main.tsx` for tools exposed in the default UI
3. `src-tauri/src/lib.rs` for managed backend state and registered Tauri commands
4. `src/Platform/IPC/Commands.ts` for the frontend IPC contract
5. `README.md` and this file for current project-level documentation

`docs/ARCHITECTURE.md`, `docs/功能说明.md`, release scripts, and some component comments describe older snapshots. Verify their claims against the files above before relying on them.

## Active User Interface

`src/main.tsx` exposes seven sidebar tools and mounts every tool panel for the lifetime of the application. Switching tools changes visibility and pointer events rather than unmounting components, so inactive tools can retain connections, timers, and editor state. Respect each page's `isActive` contract and always clean up subscriptions and timers.

| Tool ID            | Frontend                     | Transport/backend    | Current scope                                                                      |
| ------------------ | ---------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `serial-tool`      | `Components/SerialTool/`     | `serial/`            | Serial terminal, text/HEX send and receive, presets, batch/repeat sends, checksums |
| `modbus-tool`      | `Components/ModbusTool/`     | `serial/` and `tcp/` | Modbus RTU/TCP master plus serial RTU slave simulator                              |
| `i2c-tool`         | `Components/I2CTool/`        | `ch347/`             | I2C master transfers, scanning, register and paged operations                      |
| `spi-tool`         | `Components/SPITool/`        | `ch347/`             | SPI master transfers and multi-step workflows                                      |
| `gpio-tool`        | `Components/GPIOTool/`       | `ch347/`             | GPIO1-GPIO7 read/output control and timed sequences                                |
| `spi-display-tool` | `Components/SPIDisplayTool/` | `ch347/`             | Monochrome-page/RGB565 display initialization and content transfer                 |
| `python-test-tool` | `Components/PythonTestTool/` | `httpd/`, `ai/`      | Loopback REST service, Python editor/runner, examples, optional AI assistant       |

The I2C and SPI slave-emulator code exists, but both `I2CTool.tsx` and `SPITool.tsx` set `SHOW_SLAVE_TAB = false`. Do not document those tabs as active or unintentionally expose them while making unrelated changes.

The SPI Tool keeps its established operation order: bus configuration at the top, multi-step workflow on the left, and direct transfer plus logs on the right. Its desktop layout uses two fluid columns and stacks them only on narrow windows. SPI-specific controls are scoped under `spi-master-layout`; do not rely on another tool's stylesheet import order when refining this page, and do not move or hide hardware actions as a cosmetic change.

The global sidebar controls are also part of the current UI:

- `DeviceConnectButton` owns the shared CH347 connect/disconnect control.
- `VoltageToggleButton` maps the board's displayed 1.8 V/3.3 V selection to CH347 GPIO0.
- Settings, theme/language selection, OAuth login, and the user profile dialog are mounted from `src/main.tsx`.
- `AIAssistant` is mounted once from `src/main.tsx`; its lower-right floating button and per-tool conversations follow the active tool without changing any tool layout.

## Legacy and Hidden Code

The frontend still contains `FirmwareDownloader`, `FirmwareLoader`, `FirmwarePacker`, `GenericFlash`, `SectorFlash`, `MassProduction`, `EFELGui`, `GPIOViewer`, `ADBExplorer`, `DRAMTunning`, and their domain/library support. The Rust backend still registers EFEX, firmware parsing, flash, mass-production, packer, DTB, disk partition, disassembly, ADB, hot-plug, and file commands.

These modules are real code, not dead-code deletion candidates, but they are not reachable from the default sidebar. Keep changes to active USBToolBox tools separate from legacy Allwinner behavior unless the task explicitly spans both.

## Platform Reality

The current complete application is **Windows-first**:

- `src-tauri/src/ch347/commands.rs` directly uses Win32 DLL APIs.
- `src-tauri/src/ch347/device_notifier.rs` uses `WM_DEVICECHANGE` on Windows and is a no-op elsewhere.
- Windows x64 packaging maps the signed WCH runtime from `src-tauri/resources/ch347/CH347DLLA64.dll` to packaged `ch347/CH347DLLA64.dll`. Runtime resolution checks packaged/executable and development resource paths before the Windows loader-path fallback. Rebuild installers after changing this mapping or binary.
- The embedded-Python fetch script downloads the Windows AMD64 embeddable runtime.

Some serial, TCP, libusb, Tauri, and legacy layers are portable, and old CI/release files still contain Linux/macOS jobs. Do not claim full cross-platform support or introduce an unconditional Windows dependency into otherwise portable modules. A real cross-platform CH347 change needs explicit `cfg` boundaries and non-Windows implementations/stubs.

## Development Commands

Use Node `^20.19.0` or `>=22.12.0` for the checked-in Vite 8 dependency and a current stable Rust toolchain.

```powershell
# Install exact npm dependencies
npm ci

# Desktop development and production build
npm run tauri dev
npm run tauri build

# Frontend-only checks
npm run typecheck
npm run lint
npm run format:check
npm run build

# Translation checks
npm run i18n:extract
npm run i18n:status
npm run i18n:lint

# Rust checks
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features

# Hardware-independent Python tests
Set-Location python
python -m unittest discover -s tests -v
```

`npm run build` runs `scripts/sync-version.js` before Vite. `package.json` is the canonical version; the script rewrites the version fields in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. Do not hand-edit only one of the three version fields.

The native libraries under `src-tauri/libs/libefex` and `src-tauri/libs/adb_client` are Git submodules. Use a recursive clone or `git submodule update --init --recursive` in a fresh checkout.

## Architecture

### Frontend

- `src/main.tsx`: application entry, active tool list, persistent tool panels, global controls, settings, and auth UI
- `src/Components/`: active tools and legacy screens, organized by feature
- `src/CoreUI/`: layout, sidebar, page containers, Monaco wrapper, popups, and profile UI
- `src/Platform/IPC/`: typed command/event maps and the preferred Tauri client wrapper
- `src/Services/`: higher-level auth, EFEX, discovery, and hot-plug services
- `src/Settings/`: settings model and persistence
- `src/Themes/`: theme provider and theme definitions
- `src/i18n/`: i18next bootstrap and five locale JSON files
- `src/Library/`, `src/Devices/`, `src/FlashManager/`, `src/Domain/`: shared and mostly legacy Allwinner logic

Most feature directories follow `XxxPage.tsx` (page wrapper), `Xxx.tsx` (feature orchestrator), `Components/`, optional `hooks/` or `lib/`, and `index.ts` exports. Follow the local feature's existing layout rather than forcing a repository-wide abstraction.

### Backend

`src-tauri/src/lib.rs` builds the Tauri application, installs plugins, manages shared state, starts the CH347 device notifier, and registers every command. Important current modules are:

- `ch347/`: Windows DLL FFI, shared open counts, I2C/SPI/GPIO commands, and device notifications
- `serial/`: serial-port map, per-port read thread, frontend events, and REST read buffer
- `tcp/`: TCP connections and receive/disconnect events for Modbus TCP
- `httpd/`: Axum loopback API plus Python process/runtime management
- `ai/`: OpenAI-compatible streaming proxy and cancellation
- `auth/`: 100ask.net OAuth callback server and session state
- `task_bar.rs`, `proxy.rs`, `file.rs`: shell/system helpers
- `efex/`, `firmware/`, `flash/`, `packer/`, `dtb/`, `diskpart/`, `disasm/`, `adb/`, `hotplug/`, `usb/`: legacy paths

Backend modules commonly use `commands.rs` for Tauri handlers, `mod.rs` for state/exports, and `state.rs`, `types.rs`, or `dto.rs` where useful. This is a convention, not a requirement to create empty files.

### Global AI Assistant

`src/Components/AIAssistant/` contains the global panel, hardware-oriented system prompt, and a small contributor registry that separates the assistant UI from individual tool state:

- `AIAssistant.tsx` owns the history UI, per-tool active conversation/attachments, context capture, and streamed replies. Streams carry both tool and conversation IDs so a response cannot land in another conversation after navigation.
- `assistantHistory.ts` validates, bounds, loads, and saves per-tool conversation history in local storage. It persists message text/drafts but never attachment names, paths, or extracted contents; preserve that privacy boundary.
- `assistantBridge.ts` collects bounded context sections and routes user-approved actions to the active tool.
- `assistantPrompt.ts` defines the only accepted `usbtoolbox-action` JSON schemas. Do not add free-form code execution or generic setter actions.
- SPI, SPI Display, I2C, Serial, and Modbus register local contributors from their existing stateful components. GPIO and Python currently provide conversational guidance only through the global assistant; Python also retains its existing feature-specific script assistant.

The action boundary is intentional: model output is parsed and validated twice (generic envelope, then tool-specific fields), shown to the user, and applied only after an explicit click. Contributors may update React form/table state and write a diagnostic log entry, but they must not connect/disconnect hardware, call transfer commands, start polling, or execute a generated workflow. Serial and Modbus contributors reject transport changes while connected.

`src-tauri/src/ai/document.rs` reads only a path explicitly returned by the native file picker. It accepts bounded text/source/config files and text-layer PDFs, returns at most 120,000 characters per file, and does not persist a copy. The frontend caps each conversation at five attachments and also caps the total text included in one request. Selected attachments and enabled tool context are sent to the user's configured OpenAI-compatible endpoint only when the user submits a message.

AI streaming events include `requestId`. `AiState` keeps cancellation flags per request so the global assistant and the Python script assistant cannot consume or stop each other's streams. New AI consumers must generate a unique request ID, filter every delta/done/error event by it, and pass it to `ai_chat_stop`.

Conversation-history mutations are disabled while a global-assistant request is active. If this changes, every in-flight request must still target its original `conversationId`, including partial content saved on errors. Keep the persisted history versioned, validate untrusted local-storage data on load, bound its total size, and require confirmation before irreversible delete/clear operations.

## IPC Contract

Use `invokeCommand()` and `subscribeEvent()` from `src/Platform/IPC/` for normal frontend/backend communication. They provide typed command arguments/results, normalized errors, timeouts/abort support, and event payload camel-casing.

When adding or changing a command:

1. Implement the Rust function with `#[tauri::command]`.
2. Register it in `tauri::generate_handler![]` in `src-tauri/src/lib.rs`.
3. Add or update the command signature in `src/Platform/IPC/Commands.ts`.
4. Update all callers and validate both TypeScript and Rust.

For events, update `IpcEventMap` in `Commands.ts` and unsubscribe on cleanup. Event payloads are recursively camel-cased by `subscribeEvent`; command results are returned as received, so backend response structs should normally use `#[serde(rename_all = "camelCase")]` when the TypeScript contract expects camelCase.

Direct imports of Tauri `invoke` or `listen` should be exceptional. `sharedDevice.ts` directly listens for `ch347-device-changed`; preserve that behavior unless deliberately migrating it into the typed event map.

## Hardware and Concurrency Invariants

### CH347 ownership

`Ch347State` stores `index -> open count`. Reopening an already-held index increments the count without calling `CH347OpenDevice` again; closing decrements it, and only the final close calls the DLL. This lets the GUI and Python REST client share a physical device.

Do not bypass `open_core`/`close_core`, replace the count with a boolean, or add a scan path that blindly opens and closes an active device. A failed open must roll the count back. Device enumeration scans indices 0-15 and treats active devices specially so probing does not destroy their sessions.

The WCH DLL is treated as non-thread-safe. Long SPI/display operations call `sharedDevice.pausePolling()` and `resumePolling()` so hot-plug scans do not race bus transfers. Preserve serialization/queueing in `SPIMasterTab` and `SPIDisplayTool/hooks/useSpiEngine.ts`.

### CH347 device discovery

Current discovery is event-driven, not interval polling:

1. The first `sharedDevice` subscriber performs an initial scan.
2. The Windows notifier emits `ch347-device-changed` after USB arrival/removal.
3. The frontend debounces the event, rescans, disconnects a missing current device, or auto-connects a newly appeared device.
4. A user-requested disconnect is distinguished from a physical removal and must not immediately auto-reconnect.

### Shared GPIO pins

- GPIO0: board voltage selection control
- GPIO4: display/sequence DC
- GPIO5: display/sequence reset
- GPIO6: display backlight in the RGB display path
- GPIO1-GPIO7: exposed by the GPIO tool

These features can conflict because they address the same physical device and pins. Do not add background GPIO writes or reset all pins as part of unrelated cleanup.

The verified daily-use preset `ST7789V 蓝板 1.14" 135×240` targets the supplied 1.14-inch eight-pin blue-board module in reference portrait mode: 135×240, SPI Mode 3/MSB-first at a conservative 937.5 KHz, MADCTL `0x00`, RGB565 high-byte first, and GRAM offsets X+52/Y+40. Mode 3 follows the supplied bit-banged reference implementation's actual waveform, which holds SCK high before reset and between bytes despite its Mode-0-style comment; a Mode 0 red-screen diagnostic remains available for comparison. Its `SCL` is driven by CH347 `SCK`; its write-only `SDA` must be connected to CH347 `MOSI`, not `MISO`. The normal initialization table mirrors the panel-specific `1.14 寸初始化HSD+ST7789V-2018-12-06.txt` sequence for `N114-2413THBIG01-H13` and performs initialization only; the separate red-screen self-test preset reuses that exact table and appends CASET/RASET/RAMWR plus a full-screen RGB565 red fill. Display transactions set `AutoDeactiveCS=0`, select CS once at sequence start, pass SPI writes with bit7 clear so the DLL cannot toggle CS at command/data boundaries, and release CS only at sequence end. CH347 SPI OUT packets have less than 512 bytes available for payload, so RGB fill and arbitrary RGB-region uploads are tiled into independent windows of at most 480 bytes; each tile reissues CASET/RASET/RAMWR and is sent with `iWriteStep <= 480`. This avoids the CH347F/DLL large-buffer failure mode that leaves only the first red edge on screen. Some CH347F firmware/DLL combinations report LSB in `CH347SPI_GetCfg` after an MSB initialization request; this is logged as a warning only. Keep outgoing command and pixel bytes unchanged—do not infer the physical wire order from that readback and do not software-bit-reverse the buffer.

The SPI Display Tool keeps its original three-pane structure and operation order: bus/display configuration and initialization on the left, content authoring and transfer in the middle, and preview/diagnostics on the right. Preserve the 34/33/33 proportions; express them as gap-aware fractional tracks (`minmax(0, 34fr) minmax(0, 33fr) minmax(0, 33fr)`) so the grid gap does not push the outer panels beyond the container. UI refinements should remain cosmetic—theme surfaces, borders, focus states, restrained radii and shadows—and must not add workspace headers, step badges, reorder panels, or replace the three-pane layout. Running the initialization table already auto-applies the current SPI configuration; the separate “应用总线” action is an optional immediate hardware write, not a required extra step.

### Serial ownership

`SerialState` is a single map keyed by port name. Each open port has one read thread and one OS handle shared by command and REST operations. It is **not reference-counted**: opening an already-open port returns an error, and closing it removes the shared handle.

Received bytes are emitted as `serial-data-received` and also copied to a 64 KiB ring buffer drained by `GET /serial/read`. An empty receive event signals a port error/disconnect. Preserve the bounded buffer and avoid holding the outer port-map lock during long work.

### Modbus transports

Modbus RTU uses the serial commands/events; TCP uses `tcp_connect`, `tcp_start_read`, `tcp_send`, and `tcp_close`. TCP is a byte stream, so retain MBAP-length framing and partial-frame buffering. RTU receive logic uses an idle gap to assemble fragmented frames.

## Python Production-Test Path

The Axum server in `src-tauri/src/httpd/`:

- is started/stopped manually from the Python Test Tool;
- listens only on `127.0.0.1`, default port `8765`;
- exposes CH347 and serial operations through `/health`, `/devices`, `/ch347/*`, and `/serial/*` routes;
- reuses the same `Arc<Ch347State>` and `Arc<SerialState>` as Tauri commands.

The `python/usbtoolbox/tester/` package is standard-library-only. The runner resolves an interpreter in this order: `USBTOOLBOX_PYTHON`, bundled `pyembed`, then system Python. It resolves the package directory from `USBTOOLBOX_PYTHON_DIR`, packaged resources, or development-tree search.

User modules are stored under the Tauri app-data `pytest_user` directory and injected into `sys.path`. User-file APIs intentionally accept only simple `.py` filenames and reject separators/`..`; preserve this path-traversal boundary.

For REST contract changes, update all of:

- Rust route/DTO/handler code in `src-tauri/src/httpd/`
- Python client wrappers in `python/usbtoolbox/tester/`
- mock server and unit tests in `python/tests/`
- `python/README.md` and `docs/PYTHON_API.md`

## Settings, Themes, and Localization

Application settings are persisted to `~/.usbtoolbox/settings.json`; UI initialization also mirrors theme/language values to local storage. Saves are debounced and serialized. Feature presets and editor state often use their own local-storage keys, so check for migrations before renaming keys.

i18next locale files are:

- `src/i18n/locales/zh-CN.json` (fallback and required baseline)
- `zh-TW.json`
- `en-US.json`
- `ja-JP.json`
- `ko-KR.json`

New user-facing strings should use `t()` and ship translations in all five locale files. Run `npm run i18n:extract` and `npm run i18n:status` when keys change. Protocol tools mostly share the `serialTool.*` namespace; feature-specific sections include `serialTool.i2c.*`, `serialTool.spi.*`, and separate top-level sections such as `gpioTool.*`.

Do not assume the whole existing UI is already localized: parts of Modbus and SPI Display still contain hardcoded strings. Avoid increasing that debt during unrelated changes.

## Change Discipline

- Preserve meaningful hardware/protocol comments; update incorrect comments when behavior changes.
- Keep Rust core functions reusable between Tauri handlers and HTTP handlers where the current design does so.
- Do not edit generated/vendor output such as `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/`, embedded Python binaries, or `ReferenceCode/` unless the task explicitly targets them.
- Do not treat command registration as proof that a feature is visible; check `src/main.tsx`.
- Test without hardware first, then state clearly which CH347/serial/display behavior still requires a real-device check.
- For hardware-sensitive changes, prefer focused edits and validate disconnect, cancellation, repeated open/close, and inactive-tool behavior.

## Validation by Change Type

| Change                               | Minimum useful validation                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| Documentation only                   | Check links, paths, scripts, versions, active tool count, and Markdown formatting |
| Frontend TypeScript/UI               | `npm run typecheck`, `npm run lint`, targeted manual UI check                     |
| Formatting-sensitive frontend change | `npm run format:check`                                                            |
| Translation keys                     | Typecheck plus `npm run i18n:extract` and `npm run i18n:status`                   |
| Rust backend/IPC                     | `cargo fmt --check`, `cargo check`, frontend typecheck                            |
| Python API/library                   | `python -m unittest discover -s tests -v` from `python/`                          |
| Packaging/version                    | `npm run build`, then an appropriate `npm run tauri build` smoke test             |
| CH347/serial/display behavior        | Static checks plus explicit real-hardware verification                            |

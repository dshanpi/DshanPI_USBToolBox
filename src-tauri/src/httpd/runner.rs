//! 在软件内直接运行 Python 产测脚本。
//!
//! 解析一个 Python 解释器（优先内置可嵌入运行时，回退系统 Python），把内置的
//! `usbtoolbox` 包目录注入 `sys.path`，运行用户脚本，并把 stdout/stderr 按行流式
//! 发到前端事件 `pytest-script-output`，退出时发 `pytest-script-exit`。
//!
//! 解释器与包目录解析顺序见 [`resolve_runtime`]。用户脚本与引导脚本写入系统临时目录。

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// 运行中的脚本进程句柄（Tauri 托管单例）。
pub struct PytestRunnerState {
    child: Arc<Mutex<Option<std::process::Child>>>,
}

impl PytestRunnerState {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for PytestRunnerState {
    fn default() -> Self {
        Self::new()
    }
}

/// 解释器 + 包目录解析结果。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    /// 解释器可执行路径（或命令名）。
    pub interpreter: String,
    /// 内置 `usbtoolbox` 包所在目录（即仓库 `python/`）。
    pub python_dir: String,
    /// 解释器来源：bundled / system / env / none。
    pub source: String,
    /// 是否解析到可用解释器。
    pub available: bool,
}

/// 输出事件载荷。
#[derive(Serialize, Clone)]
struct OutputEvent {
    stream: String, // "stdout" | "stderr"
    line: String,
}

/// 退出事件载荷。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExitEvent {
    code: i32,
    success: bool,
}

/// 判断某路径是否为可执行文件。
fn is_file(p: &PathBuf) -> bool {
    p.is_file()
}

/// 用户工作区目录：产测工程师放自己的驱动模块与脚本的地方。
///
/// 位于 app-data 目录下（安装后持久化、可写），运行时会被注入 Python `sys.path`，
/// 因此用户在此目录写的 `my_driver.py` 可被脚本 `from my_driver import MyScreen` 导入。
/// 首次调用会创建该目录。用户不可改包源码，但可在此无限扩展自己的驱动/模块。
fn resolve_user_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法解析 app-data 目录: {e}"))?;
    let dir = base.join("pytest_user");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建用户目录失败: {e}"))?;
    Ok(dir)
}

/// 校验用户文件名：仅允许 `[A-Za-z0-9_\-\.]+\.py`，禁止路径分隔符/`..`，防穿越。
fn safe_user_file(name: &str) -> Result<PathBuf, String> {
    if !name.ends_with(".py") {
        return Err("文件名必须以 .py 结尾".into());
    }
    if name.is_empty() || name.len() > 128 {
        return Err("文件名无效".into());
    }
    let ok = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.');
    if !ok || name.contains("..") {
        return Err("文件名含非法字符".into());
    }
    Ok(PathBuf::from(name))
}

/// 用户目录下的某个文件完整路径（先校验再拼接）。
fn user_file_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = resolve_user_dir(app)?;
    let rel = safe_user_file(name)?;
    Ok(dir.join(rel))
}

/// 查询用户工作区目录（不存在则创建）。
#[tauri::command]
pub fn pytest_user_dir(app: AppHandle) -> Result<String, String> {
    Ok(resolve_user_dir(&app)?.to_string_lossy().into_owned())
}

/// Open only the application-owned Python workspace. Keeping this operation in
/// Rust avoids granting the webview permission to open arbitrary filesystem paths.
#[tauri::command]
pub fn pytest_open_user_dir(app: AppHandle) -> Result<(), String> {
    let dir = resolve_user_dir(&app)?;
    open::that(&dir).map_err(|e| format!("无法打开用户目录 {}: {e}", dir.display()))
}

/// 列出用户目录下的 .py 文件。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserFile {
    pub name: String,
    pub size: u64,
}
#[tauri::command]
pub fn pytest_list_user_files(app: AppHandle) -> Result<Vec<UserFile>, String> {
    let dir = resolve_user_dir(&app)?;
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) == Some("py") {
                let name = p
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                out.push(UserFile { name, size });
            }
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// 读取用户目录下的某个 .py 文件内容。
#[tauri::command]
pub fn pytest_read_user_file(app: AppHandle, name: String) -> Result<String, String> {
    let path = user_file_path(&app, &name)?;
    std::fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))
}

/// 把内容写入用户目录下的某个 .py 文件（覆盖）。
#[tauri::command]
pub fn pytest_write_user_file(app: AppHandle, name: String, content: String) -> Result<(), String> {
    let path = user_file_path(&app, &name)?;
    std::fs::write(&path, content).map_err(|e| format!("写入失败: {e}"))
}

/// 解析 Python 解释器与包目录。
///
/// 解释器优先级：环境变量 `USBTOOLBOX_PYTHON` → 内置可嵌入运行时（resource/pyembed）
/// → 系统 `python`（找不到也返回，留给运行时报错）。
/// 包目录优先级：环境变量 `USBTOOLBOX_PYTHON_DIR` → resource/python → 可执行文件/CWD 上溯找 `python/`。
fn resolve_runtime(app: &AppHandle) -> RuntimeInfo {
    let resource_dir = app.path().resource_dir().ok();

    // ── 包目录 ──
    let mut python_dir: Option<PathBuf> =
        std::env::var_os("USBTOOLBOX_PYTHON_DIR").map(PathBuf::from);
    if python_dir.is_none() {
        if let Some(rd) = &resource_dir {
            let cand = rd.join("python");
            if cand.join("usbtoolbox").is_dir() {
                python_dir = Some(cand);
            }
        }
    }
    if python_dir.is_none() {
        // 开发态：从可执行文件与当前目录向上找包含 usbtoolbox 的 python/ 目录
        let mut roots: Vec<PathBuf> = Vec::new();
        if let Ok(exe) = std::env::current_exe() {
            roots.extend(exe.ancestors().map(|p| p.to_path_buf()));
        }
        if let Ok(cwd) = std::env::current_dir() {
            roots.extend(cwd.ancestors().map(|p| p.to_path_buf()));
        }
        for r in roots {
            let cand = r.join("python");
            if cand.join("usbtoolbox").is_dir() {
                python_dir = Some(cand);
                break;
            }
        }
    }
    let python_dir = python_dir.unwrap_or_else(|| PathBuf::from("python"));

    // ── 解释器 ──
    if let Some(p) = std::env::var_os("USBTOOLBOX_PYTHON") {
        return RuntimeInfo {
            interpreter: PathBuf::from(p).to_string_lossy().into_owned(),
            python_dir: python_dir.to_string_lossy().into_owned(),
            source: "env".into(),
            available: true,
        };
    }
    if let Some(rd) = &resource_dir {
        // Windows 可嵌入版：pyembed/python.exe；其它平台：pyembed/bin/python3
        #[cfg(windows)]
        let bundled = rd.join("pyembed").join("python.exe");
        #[cfg(not(windows))]
        let bundled = rd.join("pyembed").join("bin").join("python3");
        if is_file(&bundled) {
            return RuntimeInfo {
                interpreter: bundled.to_string_lossy().into_owned(),
                python_dir: python_dir.to_string_lossy().into_owned(),
                source: "bundled".into(),
                available: true,
            };
        }
    }
    // 开发态：resource_dir 未填充（tauri dev）时，从可执行文件/当前目录上溯查找内置可嵌入运行时。
    // 兼容多种布局：<root>/pyembed、<root>/resources/pyembed、<root>/src-tauri/resources/pyembed。
    #[cfg(windows)]
    let embed_rel = ["python.exe"];
    #[cfg(not(windows))]
    let embed_rel = ["bin/python3"];
    let mut dev_roots: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        dev_roots.extend(exe.ancestors().map(|p| p.to_path_buf()));
    }
    if let Ok(cwd) = std::env::current_dir() {
        dev_roots.extend(cwd.ancestors().map(|p| p.to_path_buf()));
    }
    let embed_suffix: PathBuf = embed_rel.iter().collect();
    for r in &dev_roots {
        for mid in [
            "pyembed",
            "resources/pyembed",
            "src-tauri/resources/pyembed",
        ] {
            let cand = r.join(mid).join(&embed_suffix);
            if is_file(&cand) {
                return RuntimeInfo {
                    interpreter: cand.to_string_lossy().into_owned(),
                    python_dir: python_dir.to_string_lossy().into_owned(),
                    source: "bundled".into(),
                    available: true,
                };
            }
        }
    }
    // 系统回退
    #[cfg(windows)]
    let sys_py = "python";
    #[cfg(not(windows))]
    let sys_py = "python3";
    RuntimeInfo {
        interpreter: sys_py.into(),
        python_dir: python_dir.to_string_lossy().into_owned(),
        source: "system".into(),
        available: true,
    }
}

/// 查询当前解析到的运行时信息（供 UI 展示）。
#[tauri::command]
pub fn pytest_runtime_info(app: AppHandle) -> RuntimeInfo {
    resolve_runtime(&app)
}

/// 运行一段 Python 脚本（``code`` 或 ``path`` 二选一），输出流式发到前端事件。
///
/// 已有脚本在运行时返回错误（需先停止）。
#[tauri::command]
pub fn pytest_run_script(
    app: AppHandle,
    state: State<'_, PytestRunnerState>,
    code: Option<String>,
    path: Option<String>,
) -> Result<(), String> {
    {
        let guard = state.child.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("已有脚本在运行，请先停止".into());
        }
    }

    let rt = resolve_runtime(&app);
    let tmp = std::env::temp_dir();

    // 确定用户脚本路径：path 直接用；code 写入临时文件
    let script_path: PathBuf = if let Some(p) = path {
        PathBuf::from(p)
    } else if let Some(src) = code {
        let f = tmp.join("usbtoolbox_inapp_script.py");
        std::fs::File::create(&f)
            .and_then(|mut fh| fh.write_all(src.as_bytes()))
            .map_err(|e| format!("写临时脚本失败: {e}"))?;
        f
    } else {
        return Err("缺少 code 或 path".into());
    };

    // 引导脚本：把内置包目录 + 用户工作区目录注入 sys.path 后运行用户脚本。
    // 内置包目录 → import usbtoolbox；用户目录 → 用户自己的驱动/模块可被 import（扩展点）。
    let bootstrap = tmp.join("usbtoolbox_bootstrap.py");
    let bootstrap_src = r#"import os, sys, runpy
for env in ("USBTOOLBOX_USER_DIR", "USBTOOLBOX_PYTHON_DIR"):
    d = os.environ.get(env)
    if d and os.path.isdir(d) and d not in sys.path:
        sys.path.insert(0, d)
script = sys.argv[1]
# 让用户脚本看到正确的 sys.argv（argv[0]=脚本本身，后续为透传参数）
sys.argv = [script] + sys.argv[2:]
runpy.run_path(script, run_name="__main__")
"#;
    std::fs::File::create(&bootstrap)
        .and_then(|mut fh| fh.write_all(bootstrap_src.as_bytes()))
        .map_err(|e| format!("写引导脚本失败: {e}"))?;

    // 用户工作区目录（app-data/pytest_user）：可写、持久化、被注入 sys.path
    let user_dir = resolve_user_dir(&app).unwrap_or_else(|_| PathBuf::new());

    let mut cmd = Command::new(&rt.interpreter);
    cmd.arg(&bootstrap)
        .arg(&script_path)
        .env("USBTOOLBOX_PYTHON_DIR", &rt.python_dir)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUNBUFFERED", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if !user_dir.as_os_str().is_empty() {
        cmd.env("USBTOOLBOX_USER_DIR", &user_dir);
    }
    if PathBuf::from(&rt.python_dir).is_dir() {
        cmd.current_dir(&rt.python_dir);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动 Python 失败（解释器={}）：{e}", rt.interpreter))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // stdout / stderr 各起一个读取线程，按行 emit
    if let Some(out) = stdout {
        let app2 = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                let _ = app2.emit(
                    "pytest-script-output",
                    OutputEvent {
                        stream: "stdout".into(),
                        line,
                    },
                );
            }
        });
    }
    if let Some(err) = stderr {
        let app2 = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                let _ = app2.emit(
                    "pytest-script-output",
                    OutputEvent {
                        stream: "stderr".into(),
                        line,
                    },
                );
            }
        });
    }

    // 存入 state，并起 waiter 线程轮询退出
    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }
    let child_arc = state.child.clone();
    let app3 = app.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(120));
            let mut guard = match child_arc.lock() {
                Ok(g) => g,
                Err(_) => break,
            };
            let status = match guard.as_mut() {
                Some(c) => c.try_wait(),
                None => break, // 被 stop 清空
            };
            match status {
                Ok(Some(st)) => {
                    *guard = None;
                    drop(guard);
                    let code = st.code().unwrap_or(-1);
                    let _ = app3.emit(
                        "pytest-script-exit",
                        ExitEvent {
                            code,
                            success: code == 0,
                        },
                    );
                    break;
                }
                Ok(None) => { /* 仍在运行 */ }
                Err(_) => {
                    *guard = None;
                    drop(guard);
                    let _ = app3.emit(
                        "pytest-script-exit",
                        ExitEvent {
                            code: -1,
                            success: false,
                        },
                    );
                    break;
                }
            }
        }
    });

    Ok(())
}

/// 停止正在运行的脚本（kill 进程）。
#[tauri::command]
pub fn pytest_stop_script(state: State<'_, PytestRunnerState>) -> Result<(), String> {
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        let _ = child.kill();
        let _ = child.wait();
    }
    *guard = None;
    Ok(())
}

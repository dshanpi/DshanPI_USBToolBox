/// USB device address abstraction.
///
/// Encapsulates the difference between libusb (bus+port) and WinUSB (device path)
/// addressing schemes so callers don't need to check for `"libusb:"` prefixes.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum DeviceAddress {
    /// libusb backend: address device by bus number and port number.
    BusPort { bus: u8, port: u8 },
    /// WinUSB backend: address device by OS device path.
    DevicePath(String),
}

impl DeviceAddress {
    /// Parse a raw path string into a `DeviceAddress`.
    ///
    /// - `"libusb:<bus>:<port>"` → `BusPort { bus, port }`
    /// - anything else → `DevicePath(path)`
    pub fn parse(path: &str) -> Self {
        if let Some(bus_port) = path.strip_prefix("libusb:") {
            let parts: Vec<&str> = bus_port.split(':').collect();
            let bus = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
            let port = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            Self::BusPort { bus, port }
        } else {
            Self::DevicePath(path.to_owned())
        }
    }

    /// Construct from explicit bus and port numbers.
    pub fn from_bus_port(bus: u8, port: u8) -> Self {
        Self::BusPort { bus, port }
    }

    /// Serialize back to the string form used for storage and comparison.
    ///
    /// - `BusPort { bus: 2, port: 7 }` → `"libusb:2:7"`
    /// - `DevicePath(p)` → the original path string
    pub fn to_path_string(&self) -> String {
        match self {
            Self::BusPort { bus, port } => format!("libusb:{bus}:{port}"),
            Self::DevicePath(path) => path.clone(),
        }
    }

    /// Return `(bus, port)` for slot affinity and device registration.
    ///
    /// `DevicePath` returns `(0, 0)` since WinUSB paths don't carry bus/port info.
    pub fn bus_port(&self) -> (u8, u8) {
        match self {
            Self::BusPort { bus, port } => (*bus, *port),
            Self::DevicePath(_) => (0, 0),
        }
    }
}

/// Create a `libefex::Context` configured for the given device address.
///
/// - `BusPort` → calls `scan_usb_device_at(bus, port)` (libusb: init context + open handle)
/// - `DevicePath` → calls `set_device_path(path)` (WinUSB: set path for later open)
///
/// Only opens the handle; does **not** call `usb_init()` or `efex_init()`.
/// Callers decide when to initialize.
pub fn open_context(addr: &DeviceAddress) -> Result<libefex::Context, libefex::EfexError> {
    let mut ctx = libefex::Context::new();
    match addr {
        DeviceAddress::BusPort { bus, port } => {
            ctx.scan_usb_device_at(*bus, *port)?;
        }
        DeviceAddress::DevicePath(path) => {
            ctx.set_device_path(path)?;
        }
    }
    Ok(ctx)
}

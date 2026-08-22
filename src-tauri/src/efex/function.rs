use crate::efex::device;
use crate::efex::error::EfexError;
use crate::efex::types::FesDataType;

pub struct EfexFunction {
    device_id: u32,
}

impl EfexFunction {
    pub fn new(device_id: u32) -> Self {
        EfexFunction { device_id }
    }

    pub fn fes_down_typed_with_progress<F>(
        &self,
        buf: &[u8],
        addr: u32,
        data_type: FesDataType,
        progress_callback: F,
    ) -> Result<u64, EfexError>
    where
        F: FnMut(u64, u64),
    {
        let mut ctx = device::get_context(self.device_id)?;
        ctx.usb_init()?;
        ctx.efex_init()?;

        ctx.fes_down_with_progress(buf, addr, data_type.into(), progress_callback)
            .map_err(EfexError::from)
    }

    pub fn fes_verify_value(
        &self,
        addr: u32,
        size: u64,
    ) -> Result<libefex::FesVerifyResp, EfexError> {
        let mut ctx = device::get_context(self.device_id)?;
        ctx.usb_init()?;
        ctx.efex_init()?;

        ctx.fes_verify_value(addr, size).map_err(EfexError::from)
    }

    pub fn fes_flash_set_onoff(
        device_id: u32,
        storage_type: u32,
        on_off: bool,
    ) -> Result<(), EfexError> {
        let mut ctx = device::get_context(device_id)?;
        ctx.usb_init()?;
        ctx.efex_init()?;

        ctx.fes_flash_set_onoff(storage_type, on_off)
            .map_err(EfexError::from)
    }
}

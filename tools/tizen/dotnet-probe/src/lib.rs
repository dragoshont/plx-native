#![no_std]

use core::ffi::{c_char, c_int};
use core::panic::PanicInfo;

#[cfg(feature = "gles")]
mod gles;

#[cfg(all(feature = "panic-test", not(target_os = "macos")))]
compile_error!("The panic-test export is host-only and must not be packaged for TV.");

#[cfg(all(feature = "panic-test", target_os = "macos"))]
#[no_mangle]
pub extern "C" fn plx_probe_test_panic() -> ! {
    panic!("panic termination regression")
}

#[panic_handler]
fn panic(_: &PanicInfo<'_>) -> ! {
    unsafe { os::terminate() }
}

#[cfg(all(target_os = "linux", target_arch = "arm"))]
mod os {
    use core::arch::asm;

    unsafe fn call(number: usize, a: usize, b: usize, c: usize) -> isize {
        let result: isize;
        asm!(
            "svc #0",
            in("r7") number,
            inlateout("r0") a => result,
            in("r1") b,
            in("r2") c,
            options(nostack)
        );
        result
    }

    pub unsafe fn open(path: *const super::c_char) -> isize {
        call(5, path as usize, 0, 0)
    }
    pub unsafe fn read(fd: isize, bytes: &mut [u8]) -> isize {
        call(3, fd as usize, bytes.as_mut_ptr() as usize, bytes.len())
    }
    pub unsafe fn close(fd: isize) -> isize {
        call(6, fd as usize, 0, 0)
    }
    pub unsafe fn socket() -> isize {
        call(281, 2, 2 | 0x800 | 0x80000, 0)
    }
    pub unsafe fn connect(fd: isize, address: &[u8; 16]) -> isize {
        call(283, fd as usize, address.as_ptr() as usize, address.len())
    }
    pub unsafe fn write(fd: isize, bytes: &[u8]) -> isize {
        call(4, fd as usize, bytes.as_ptr() as usize, bytes.len())
    }
    pub unsafe fn terminate() -> ! {
        call(248, 134, 0, 0); // ARM Linux exit_group: terminate every managed/native thread.
        asm!("udf #0", options(noreturn, nostack));
    }
}

#[cfg(target_os = "macos")]
mod os {
    use super::{c_char, c_int};
    use core::ffi::c_void;

    #[link(name = "System")]
    extern "C" {
        #[link_name = "open"]
        fn c_open(path: *const c_char, flags: c_int, ...) -> c_int;
        #[link_name = "read"]
        fn c_read(fd: c_int, bytes: *mut c_void, size: usize) -> isize;
        #[link_name = "close"]
        fn c_close(fd: c_int) -> c_int;
        #[link_name = "socket"]
        fn c_socket(domain: c_int, kind: c_int, protocol: c_int) -> c_int;
        #[link_name = "connect"]
        fn c_connect(fd: c_int, address: *const u8, len: u32) -> c_int;
        #[link_name = "write"]
        fn c_write(fd: c_int, bytes: *const u8, size: usize) -> isize;
        #[link_name = "_exit"]
        fn c_exit(status: c_int) -> !;
    }

    pub unsafe fn open(path: *const c_char) -> isize {
        c_open(path, 0) as isize
    }
    pub unsafe fn read(fd: isize, bytes: &mut [u8]) -> isize {
        c_read(fd as c_int, bytes.as_mut_ptr().cast(), bytes.len())
    }
    pub unsafe fn close(fd: isize) -> isize {
        c_close(fd as c_int) as isize
    }
    pub unsafe fn socket() -> isize {
        c_socket(2, 2, 0) as isize
    }
    pub unsafe fn connect(fd: isize, address: &[u8; 16]) -> isize {
        c_connect(fd as c_int, address.as_ptr(), address.len() as u32) as isize
    }
    pub unsafe fn write(fd: isize, bytes: &[u8]) -> isize {
        c_write(fd as c_int, bytes.as_ptr(), bytes.len())
    }
    pub unsafe fn terminate() -> ! {
        c_exit(134)
    }
}

#[cfg(not(any(target_os = "macos", all(target_os = "linux", target_arch = "arm"))))]
compile_error!("This probe requires macOS or a verified ARM32 Linux target.");

/// Read the private 38-byte IPv4/port/nonce configuration and send one UDP receipt.
///
/// # Safety
/// `path` must point to a live NUL-terminated UTF-8 filesystem path.
#[no_mangle]
pub unsafe extern "C" fn plx_probe_entry(path: *const c_char) -> c_int {
    receipt(path, None)
}

#[cfg(feature = "gles")]
#[no_mangle]
/// Send a nonce-bound graphics-stage code; this is not a graphics success receipt.
///
/// # Safety
/// `path` must point to a live NUL-terminated UTF-8 filesystem path.
pub unsafe extern "C" fn plx_probe_stage(path: *const c_char, stage: u32) -> c_int {
    receipt(path, Some(stage))
}

unsafe fn receipt(path: *const c_char, stage: Option<u32>) -> c_int {
    if path.is_null() {
        return 10;
    }
    let fd = os::open(path);
    if fd < 0 {
        return 11;
    }
    let mut config = [0u8; 39];
    let mut used = 0;
    while used < config.len() {
        let count = os::read(fd, &mut config[used..]);
        if count < 0 {
            os::close(fd);
            return 12;
        }
        if count == 0 {
            break;
        }
        used += count as usize;
    }
    let closed = os::close(fd);
    if used != 38 || config[4..6] == [0, 0] || closed < 0 {
        return 13;
    }
    let mut address = [0u8; 16];
    #[cfg(target_os = "macos")]
    {
        address[0] = 16;
        address[1] = 2;
    }
    #[cfg(target_os = "linux")]
    {
        address[0] = 2;
    }
    address[2..4].copy_from_slice(&config[4..6]);
    address[4..8].copy_from_slice(&config[..4]);
    let socket = os::socket();
    if socket < 0 {
        return 20;
    }
    if os::connect(socket, &address) < 0 {
        os::close(socket);
        return 21;
    }
    let mut receipt = [0u8; 49];
    receipt[..13].copy_from_slice(b"PLX-RUST-V1:\n");
    receipt[13..45].copy_from_slice(&config[6..38]);
    let size = if let Some(stage) = stage {
        receipt[45..].copy_from_slice(&stage.to_be_bytes());
        49
    } else {
        45
    };
    let written = os::write(socket, &receipt[..size]);
    let closed = os::close(socket);
    if written != size as isize {
        return 22;
    }
    if closed < 0 {
        return 23;
    }
    0
}

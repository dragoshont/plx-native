#![no_std]
#![no_main]

use core::arch::asm;
use core::panic::PanicInfo;

const SYS_EXIT: usize = 1;
const SYS_WRITE: usize = 4;
const FD_STDOUT: usize = 1;

#[inline(always)]
unsafe fn sys_exit(code: usize) -> ! {
    asm!(
        "mov r7, {sys}",
        "mov r0, {code}",
        "svc #0",
        sys = in(reg) SYS_EXIT,
        code = in(reg) code,
        options(noreturn)
    );
}

#[inline(always)]
unsafe fn sys_write(fd: usize, buf: *const u8, len: usize) -> isize {
    let ret: isize;
    asm!(
        "mov r7, {sys}",
        "mov r0, {fd}",
        "mov r1, {buf}",
        "mov r2, {len}",
        "svc #0",
        sys = in(reg) SYS_WRITE,
        fd = in(reg) fd,
        buf = in(reg) buf,
        len = in(reg) len,
        lateout("r0") ret,
        lateout("r7") _,
        options(nostack)
    );
    ret
}

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    // Terminate with nonzero exit code 2 on panic
    unsafe { sys_exit(2) }
}

const GREETING: &[u8] = b"PlxNative ARMv7 Rust Probe: Linux syscall entry ok\n";

#[no_mangle]
pub unsafe extern "C" fn _start() -> ! {
    let mut written: usize = 0;
    let total = GREETING.len();
    let ptr = GREETING.as_ptr();

    while written < total {
        let res = sys_write(FD_STDOUT, ptr.add(written), total - written);
        if res <= 0 {
            // Write failed or returned 0: terminate with nonzero exit code 1
            sys_exit(1);
        }
        written += res as usize;
    }

    // Success: exit code 0
    sys_exit(0);
}

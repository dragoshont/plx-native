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
        "svc #0",
        in("r7") SYS_EXIT,
        in("r0") code,
        options(noreturn)
    );
}

#[inline(always)]
unsafe fn sys_write(fd: usize, buf: *const u8, len: usize) -> isize {
    let ret: isize;
    asm!(
        "svc #0",
        in("r7") SYS_WRITE,
        inlateout("r0") fd => ret,
        in("r1") buf,
        in("r2") len,
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

#![no_std]

use core::panic::PanicInfo;

#[panic_handler]
fn panic(_: &PanicInfo<'_>) -> ! {
    core::arch::wasm32::unreachable()
}

#[no_mangle]
pub extern "C" fn probe_abi() -> u32 {
    1
}

#[no_mangle]
pub extern "C" fn probe_response(first: u32, second: u32) -> u32 {
    (first.rotate_left(7) ^ second ^ 0x5255_5354).wrapping_mul(0x9e37_79b1)
}

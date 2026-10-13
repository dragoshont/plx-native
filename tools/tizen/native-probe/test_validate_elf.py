#!/usr/bin/env python3
"""
Regression test suite for validate_elf.py.
Mutates a valid ELF binary to create broken variants and proves that validate_elf()
rejects every malformed variant with an explicit ElfValidationError:
1. Header entry mutation (e_entry maps into ELF header [0, 52)).
2. Truncated header (< 52 bytes).
3. Corrupted ELF magic.
4. Program header table out of bounds.
5. Section header table out of bounds.
6. Segment filesz > memsz.
7. Segment file range exceeding file bounds.
8. Misaligned segment vaddr / offset.
9. Dynamic linking: injected PT_INTERP segment.
10. Dynamic linking: injected PT_DYNAMIC segment.
11. Bad ARM EABI version (e_flags top byte != 5).
12. Unexpected hard-float ABI flag (EF_ARM_ABI_FLOAT_HARD set).
13. Entry point pointing outside executable PT_LOAD segment.
14. Entry point misaligned for ARM mode.
15. Entry inside PT_LOAD but outside any SHF_EXECINSTR section (.rodata).
16. Symbol _start mismatching e_entry.
"""

import sys
import os
import struct

from validate_elf import validate_elf, ElfValidationError, PT_LOAD, PT_INTERP, PT_DYNAMIC

def run_tests():
    valid_bin_path = os.path.join(
        os.path.dirname(__file__), "target", "armv7-unknown-linux-gnueabi", "release", "rust-armv7-probe"
    )
    if not os.path.exists(valid_bin_path):
        print(f"Error: valid binary not found at {valid_bin_path}")
        sys.exit(1)

    with open(valid_bin_path, "rb") as f:
        valid_data = bytearray(f.read())

    # Baseline check: valid binary must pass
    try:
        validate_elf(bytes(valid_data), verbose=False)
        print("[PASS] Baseline: valid binary passes validation")
    except Exception as e:
        print(f"[FAIL] Baseline valid binary failed validation: {e}")
        sys.exit(1)

    mutations = []

    # 1. Header entry in an executable PT_LOAD segment:
    # We mutate PH 1 (which covers offset 0) to be executable (PF_X = 1) and set entry to 0x10000 (offset 0)
    data = bytearray(valid_data)
    e_phoff = struct.unpack_from("<I", data, 28)[0]
    # PH 1 is at e_phoff + 32. Flags is at offset 24 within PH 1.
    flags1 = struct.unpack_from("<I", data, e_phoff + 32 + 24)[0]
    struct.pack_into("<I", data, e_phoff + 32 + 24, flags1 | 1) # add PF_X to PH 1
    struct.pack_into("<I", data, 24, 0x10000) # e_entry = 0x10000 (file offset 0)
    mutations.append(("Header Entry Point (0x10000 offset 0 in PF_X PT_LOAD)", data, "maps to file offset 0x0 inside ELF header"))

    # 2. Truncated header (< 52 bytes)
    mutations.append(("Truncated ELF Header (40 bytes)", valid_data[:40], "File too small for 32-bit ELF header"))

    # 3. Corrupted ELF magic
    data = bytearray(valid_data)
    data[:4] = b"\x7fXYZ"
    mutations.append(("Corrupted ELF Magic", data, "Invalid ELF magic"))

    # 4. Program header table out of bounds
    data = bytearray(valid_data)
    struct.pack_into("<I", data, 28, len(valid_data) + 100) # e_phoff
    mutations.append(("Program Header Table Out of Bounds", data, "Program header table out of bounds"))

    # 5. Section header table out of bounds
    data = bytearray(valid_data)
    struct.pack_into("<I", data, 32, len(valid_data) + 100) # e_shoff
    mutations.append(("Section Header Table Out of Bounds", data, "Section header table out of bounds"))

    # 6. Segment filesz > memsz
    data = bytearray(valid_data)
    e_phoff = struct.unpack_from("<I", data, 28)[0]
    struct.pack_into("<II", data, e_phoff + 16, 0x2000, 0x1000) # filesz > memsz
    mutations.append(("Segment filesz > memsz", data, "filesz (8192) > memsz (4096)"))

    # 7. Segment file offset exceeding file bounds
    data = bytearray(valid_data)
    struct.pack_into("<I", data, e_phoff + 4, len(valid_data) + 50) # p_offset
    mutations.append(("Segment Offset Exceeds File Bounds", data, "exceeds file size"))

    # 8. Misaligned segment vaddr / offset
    data = bytearray(valid_data)
    # Set p_align = 0x10000, p_offset = 0x100, p_vaddr = 0x20000
    struct.pack_into("<II", data, e_phoff + 4, 0x100, 0x20000)
    struct.pack_into("<I", data, e_phoff + 28, 0x10000) # p_align
    mutations.append(("Segment Alignment Mismatch", data, "Alignment error"))

    # 9. Dynamic linking: inject PT_INTERP
    data = bytearray(valid_data)
    struct.pack_into("<I", data, e_phoff, PT_INTERP)
    mutations.append(("Injected PT_INTERP Segment", data, "Found PT_INTERP segment; binary is dynamically linked"))

    # 10. Dynamic linking: inject PT_DYNAMIC
    data = bytearray(valid_data)
    struct.pack_into("<I", data, e_phoff, PT_DYNAMIC)
    mutations.append(("Injected PT_DYNAMIC Segment", data, "Found PT_DYNAMIC segment; binary contains dynamic section"))

    # 11. Bad ARM EABI version (top byte of e_flags != 5)
    data = bytearray(valid_data)
    struct.pack_into("<I", data, 36, 0x04000200) # e_flags top byte = 4
    mutations.append(("Bad ARM EABI Version (4)", data, "Expected ARM EABI version 5"))

    # 12. Unexpected hard-float ABI flag (EF_ARM_ABI_FLOAT_HARD = 0x400)
    data = bytearray(valid_data)
    flags = struct.unpack_from("<I", data, 36)[0]
    struct.pack_into("<I", data, 36, flags | 0x400)
    mutations.append(("Hard-Float ABI Flag Set", data, "Unexpected hard-float flag EF_ARM_ABI_FLOAT_HARD"))

    # 13. Entry point pointing outside executable PT_LOAD segment
    data = bytearray(valid_data)
    struct.pack_into("<I", data, 24, 0x50000) # e_entry not in any segment
    mutations.append(("Entry Outside Executable PT_LOAD", data, "does not resolve inside any executable, file-backed PT_LOAD segment"))

    # 14. Entry point misaligned for ARM mode (not 4-byte aligned, but bit 0 not set)
    data = bytearray(valid_data)
    entry = struct.unpack_from("<I", data, 24)[0]
    struct.pack_into("<I", data, 24, entry + 2) # e_entry + 2
    mutations.append(("ARM Entry Misaligned (not 4-byte aligned)", data, "ARM entry address not 4-byte aligned"))

    # 15. Entry inside PT_LOAD but outside any SHF_EXECINSTR section
    # .rodata is at 0x100e4 (offset 0xe4, size 0x33). If we make PH 1 executable (PF_X) and point entry to 0x100e4,
    # entry is in an executable PT_LOAD, but .rodata has flags SHF_ALLOC only (no SHF_EXECINSTR).
    data = bytearray(valid_data)
    e_phoff = struct.unpack_from("<I", data, 28)[0]
    flags1 = struct.unpack_from("<I", data, e_phoff + 32 + 24)[0]
    struct.pack_into("<I", data, e_phoff + 32 + 24, flags1 | 1) # add PF_X to PH 1
    struct.pack_into("<I", data, 24, 0x100e4) # e_entry = 0x100e4 (.rodata)
    mutations.append(("Entry in Non-Executable Section (.rodata)", data, "does not reside inside any allocated executable section"))

    # 16. Symbol _start mismatching e_entry
    # We mutate e_entry to 0x20120 (4 bytes past _start, still within .text)
    data = bytearray(valid_data)
    struct.pack_into("<I", data, 24, entry + 4)
    mutations.append(("Symbol _start Mismatch", data, "Symbol _start value (0x20118) does not match e_entry"))

    data = bytearray(valid_data)
    struct.pack_into("<I", data, 20, 0)
    mutations.append(("Invalid Header Version", data, "Expected header EV_CURRENT"))

    data = bytearray(valid_data)
    struct.pack_into("<I", data, e_phoff + 28, 3)
    mutations.append(("Non-Power-of-Two Alignment", data, "Alignment is not a power of two"))

    data = bytearray(valid_data)
    struct.pack_into("<H", data, 48, 0)
    mutations.append(("Absent Code Section Table", data, "Probe requires section headers"))

    shoff = struct.unpack_from("<I", valid_data, 32)[0]
    shentsize, shnum = struct.unpack_from("<HH", valid_data, 46)
    for index in range(shnum):
        section_offset = shoff + index * shentsize
        section_type, flags = struct.unpack_from("<II", valid_data, section_offset + 4)
        if flags & 6 == 6:
            data = bytearray(valid_data)
            offset = struct.unpack_from("<I", data, section_offset + 16)[0]
            struct.pack_into("<I", data, section_offset + 16, offset + 4)
            mutations.append(("Conflicting Section Entry Mapping", data, "entry file mappings disagree"))
        if section_type == 2:
            data = bytearray(valid_data)
            struct.pack_into("<I", data, section_offset + 36, 1)
            mutations.append(("Short Symbol Table Entries", data, "Invalid symbol table entry size"))

    # Run mutations
    passed = 0
    total = len(mutations)
    for name, mdata, expected_err in mutations:
        try:
            validate_elf(bytes(mdata), verbose=False)
            print(f"[FAIL] {name}: Expected rejection with '{expected_err}', but validation PASSED!")
        except ElfValidationError as e:
            if expected_err in str(e):
                print(f"[PASS] {name}: correctly rejected ({e})")
                passed += 1
            else:
                print(f"[FAIL] {name}: rejected with unexpected error: '{e}', expected '{expected_err}'")

    print(f"\nRegression Suite Result: {passed}/{total} mutations correctly rejected.")
    if passed != total:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()

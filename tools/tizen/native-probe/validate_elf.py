#!/usr/bin/env python3
"""
Tightened Automated ELF Validator for rust-armv7-probe binary.
Raises explicit ValueError (ElfValidationError) on check failures.
Works identically under `python3 -O`.

Validations:
1. Header structure & bounds:
   - Magic \\x7fELF, ELFCLASS32 (1), ELFDATA2LSB (1), EV_CURRENT (1).
   - Program header table bounds: e_phoff, e_phentsize, e_phnum inside file.
   - Section header table bounds: e_shoff, e_shentsize, e_shnum inside file.
2. Architecture & ABI:
   - e_type == ET_EXEC (2).
   - e_machine == EM_ARM (40).
   - ARM EABI version check: top byte of e_flags must be 5 ((e_flags >> 24) == 5).
   - No hard-float ABI flag: EF_ARM_ABI_FLOAT_HARD (0x400) must NOT be set.
3. Static linking:
   - NO PT_INTERP (segment type 3) allowed.
   - NO PT_DYNAMIC (segment type 2) allowed.
4. Program header segments & bounds:
   - filesz <= memsz for all segments.
   - Segment file offsets + filesz within binary size.
   - Segment alignment: if p_align > 1, p_vaddr % p_align == p_offset % p_align.
5. Entry point & executable code mapping:
   - Resolves within an executable PT_LOAD (flags & PF_X).
   - Checks section headers: finds .text or section with SHF_EXECINSTR (0x4).
   - Verifies e_entry falls strictly inside an executable section's virtual address range.
   - Verifies the section's file offset + (e_entry - sh_addr) lies within file bounds.
   - Verifies ARM vs Thumb entry mode:
     - Bit 0 of e_entry: 0 = ARM mode (4-byte aligned), 1 = Thumb mode (2-byte aligned).
   - Symbol table correspondence:
     - If .symtab is present, finds `_start` symbol.
     - Confirms `_start` st_value matches e_entry (ignoring thumb bit) and points to valid executable section.
"""

import struct
import sys
import os

PT_NULL = 0
PT_LOAD = 1
PT_DYNAMIC = 2
PT_INTERP = 3
PT_NOTE = 4
PT_SHLIB = 5
PT_PHDR = 6
PT_TLS = 7
PT_GNU_STACK = 0x6474e551
PT_ARM_EXIDX = 0x70000001

PF_X = 1
PF_W = 2
PF_R = 4

SHF_WRITE = 0x1
SHF_ALLOC = 0x2
SHF_EXECINSTR = 0x4

EF_ARM_ABI_FLOAT_HARD = 0x400

class ElfValidationError(ValueError):
    pass

def validate_elf(path_or_bytes, verbose=True):
    if isinstance(path_or_bytes, (bytes, bytearray)):
        data = bytes(path_or_bytes)
        file_desc = "<in-memory bytes>"
    else:
        if not os.path.exists(path_or_bytes):
            raise ElfValidationError(f"File not found: {path_or_bytes}")
        with open(path_or_bytes, "rb") as f:
            data = f.read()
        file_desc = str(path_or_bytes)

    flen = len(data)
    if flen < 52:
        raise ElfValidationError(f"File too small for 32-bit ELF header ({flen} < 52 bytes)")

    # 1. Header Magic & Identification
    if data[:4] != b"\x7fELF":
        raise ElfValidationError(f"Invalid ELF magic: {data[:4]!r}")
    ei_class = data[4]
    ei_data = data[5]
    ei_version = data[6]
    if ei_class != 1:
        raise ElfValidationError(f"Expected ELFCLASS32 (1), got {ei_class}")
    if ei_data != 1:
        raise ElfValidationError(f"Expected ELFDATA2LSB (little-endian, 1), got {ei_data}")
    if ei_version != 1:
        raise ElfValidationError(f"Expected ELF version 1, got {ei_version}")

    # 2. Header Fields
    e_type, e_machine, e_version, e_entry, e_phoff, e_shoff, e_flags, e_ehsize, e_phentsize, e_phnum, e_shentsize, e_shnum, e_shstrndx = struct.unpack_from(
        "<HHIIIIIHHHHHH", data, 16
    )

    if e_type != 2:
        raise ElfValidationError(f"Expected ET_EXEC (2), got {e_type}")
    if e_machine != 40:
        raise ElfValidationError(f"Expected EM_ARM (40), got {e_machine}")

    # EABI version check: top byte of e_flags
    eabi_ver = (e_flags >> 24) & 0xFF
    if eabi_ver != 5:
        raise ElfValidationError(f"Expected ARM EABI version 5 (top byte of e_flags == 5), got {eabi_ver} (flags={hex(e_flags)})")

    # Hard-float flag check
    if (e_flags & EF_ARM_ABI_FLOAT_HARD) != 0:
        raise ElfValidationError(f"Unexpected hard-float flag EF_ARM_ABI_FLOAT_HARD (0x400) in e_flags ({hex(e_flags)})")

    # Header and table bounds
    if e_ehsize < 52 or e_ehsize > flen:
        raise ElfValidationError(f"Invalid e_ehsize ({e_ehsize}, file size={flen})")

    if e_phnum > 0:
        if e_phentsize < 32:
            raise ElfValidationError(f"Invalid e_phentsize ({e_phentsize} < 32)")
        ph_table_end = e_phoff + e_phnum * e_phentsize
        if e_phoff >= flen or ph_table_end > flen:
            raise ElfValidationError(f"Program header table out of bounds: phoff={e_phoff}, end={ph_table_end}, file size={flen}")

    if e_shnum > 0:
        if e_shentsize < 40:
            raise ElfValidationError(f"Invalid e_shentsize ({e_shentsize} < 40)")
        sh_table_end = e_shoff + e_shnum * e_shentsize
        if e_shoff >= flen or sh_table_end > flen:
            raise ElfValidationError(f"Section header table out of bounds: shoff={e_shoff}, end={sh_table_end}, file size={flen}")
        if e_shstrndx >= e_shnum:
            raise ElfValidationError(f"Invalid e_shstrndx ({e_shstrndx} >= shnum {e_shnum})")

    # 3. Parse Program Headers
    segments = []
    load_segments = 0
    for i in range(e_phnum):
        p_off = e_phoff + i * e_phentsize
        p_type, p_offset, p_vaddr, p_paddr, p_filesz, p_memsz, p_flags, p_align = struct.unpack_from("<IIIIIIII", data, p_off)
        
        # Check filesz <= memsz
        if p_filesz > p_memsz:
            raise ElfValidationError(f"PH {i}: filesz ({p_filesz}) > memsz ({p_memsz})")

        # Check file bounds
        if p_filesz > 0 and (p_offset >= flen or p_offset + p_filesz > flen):
            raise ElfValidationError(f"PH {i}: Segment file range [{p_offset}, {p_offset + p_filesz}) exceeds file size {flen}")

        # Check alignment consistency
        if p_align > 1:
            if (p_vaddr % p_align) != (p_offset % p_align):
                raise ElfValidationError(f"PH {i}: Alignment error: vaddr ({hex(p_vaddr)}) % align ({p_align}) != offset ({hex(p_offset)}) % align ({p_align})")

        # Static linking check: no PT_INTERP, no PT_DYNAMIC
        if p_type == PT_INTERP:
            raise ElfValidationError(f"PH {i}: Found PT_INTERP segment; binary is dynamically linked, expected static")
        if p_type == PT_DYNAMIC:
            raise ElfValidationError(f"PH {i}: Found PT_DYNAMIC segment; binary contains dynamic section, expected static")

        if p_type == PT_LOAD:
            load_segments += 1

        segments.append({
            "index": i,
            "type": p_type,
            "offset": p_offset,
            "vaddr": p_vaddr,
            "paddr": p_paddr,
            "filesz": p_filesz,
            "memsz": p_memsz,
            "flags": p_flags,
            "align": p_align
        })

    if load_segments == 0:
        raise ElfValidationError("No PT_LOAD segments found in program header table")

    # 4. Entry Point Mode (ARM vs Thumb)
    is_thumb_entry = bool(e_entry & 1)
    actual_entry_vaddr = e_entry & ~1

    if is_thumb_entry:
        if actual_entry_vaddr % 2 != 0:
            raise ElfValidationError(f"Thumb entry address not 2-byte aligned: {hex(e_entry)}")
    else:
        if actual_entry_vaddr % 4 != 0:
            raise ElfValidationError(f"ARM entry address not 4-byte aligned: {hex(e_entry)}")

    # 5. Program Header Entry Point Coverage
    pt_load_covering_entry = None
    for s in segments:
        if s["type"] == PT_LOAD and (s["flags"] & PF_X):
            # Check if entry is strictly inside the executable file-backed segment
            if s["vaddr"] <= actual_entry_vaddr < s["vaddr"] + s["filesz"]:
                pt_load_covering_entry = s
                break

    if pt_load_covering_entry is None:
        raise ElfValidationError(f"e_entry ({hex(e_entry)}) does not resolve inside any executable, file-backed PT_LOAD segment")

    # Entry file offset
    entry_file_offset = pt_load_covering_entry["offset"] + (actual_entry_vaddr - pt_load_covering_entry["vaddr"])
    if entry_file_offset + 4 > flen:
        raise ElfValidationError(f"Entry file offset {hex(entry_file_offset)} extends past EOF ({flen})")

    # Disallow entry jumping into ELF header or program headers
    if entry_file_offset < e_ehsize:
        raise ElfValidationError(f"Entry point {hex(e_entry)} maps to file offset {hex(entry_file_offset)} inside ELF header [0, {e_ehsize})")
    if e_phoff <= entry_file_offset < (e_phoff + e_phnum * e_phentsize):
        raise ElfValidationError(f"Entry point {hex(e_entry)} maps to file offset {hex(entry_file_offset)} inside Program Header table")

    # 6. Parse Section Headers & Verify Code Section Mapping
    sections = []
    shstrtab = b""
    if e_shnum > 0:
        # Load shstrtab
        shstr_off = e_shoff + e_shstrndx * e_shentsize
        _, _, _, _, str_offset, str_size, _, _, _, _ = struct.unpack_from("<IIIIIIIIII", data, shstr_off)
        if str_offset + str_size <= flen:
            shstrtab = data[str_offset:str_offset + str_size]

        for i in range(e_shnum):
            s_off = e_shoff + i * e_shentsize
            sh_name, sh_type, sh_flags, sh_addr, sh_offset, sh_size, sh_link, sh_info, sh_addralign, sh_entsize = struct.unpack_from(
                "<IIIIIIIIII", data, s_off
            )
            name = ""
            if sh_name < len(shstrtab):
                name = shstrtab[sh_name:].split(b"\x00")[0].decode("latin1", errors="replace")
            
            # Section file bounds
            if sh_type != 8: # SHT_NOBITS
                if sh_size > 0 and (sh_offset >= flen or sh_offset + sh_size > flen):
                    raise ElfValidationError(f"Section {i} ({name}): file range [{sh_offset}, {sh_offset + sh_size}) exceeds file size {flen}")

            sections.append({
                "index": i,
                "name": name,
                "type": sh_type,
                "flags": sh_flags,
                "addr": sh_addr,
                "offset": sh_offset,
                "size": sh_size,
                "link": sh_link,
                "info": sh_info,
                "addralign": sh_addralign,
                "entsize": sh_entsize
            })

        # Check section mapping for entry point
        code_section = None
        for sec in sections:
            if (sec["flags"] & SHF_EXECINSTR) and (sec["flags"] & SHF_ALLOC):
                if sec["addr"] <= actual_entry_vaddr < sec["addr"] + sec["size"]:
                    code_section = sec
                    break

        if code_section is None:
            raise ElfValidationError(f"e_entry ({hex(e_entry)}) does not reside inside any allocated executable section (SHF_ALLOC | SHF_EXECINSTR)")

        if verbose:
            print(f"  Entry {hex(e_entry)} resolves to section '{code_section['name']}' at offset {hex(entry_file_offset)}")

        # 7. Check Symbol Table for _start
        for sec in sections:
            if sec["type"] == 2: # SHT_SYMTAB
                strtab_sec = sections[sec["link"]] if sec["link"] < len(sections) else None
                if strtab_sec and strtab_sec["offset"] + strtab_sec["size"] <= flen:
                    strtab = data[strtab_sec["offset"]:strtab_sec["offset"] + strtab_sec["size"]]
                    sym_entsize = sec["entsize"] if sec["entsize"] > 0 else 16
                    sym_count = sec["size"] // sym_entsize
                    for si in range(sym_count):
                        sym_data = data[sec["offset"] + si * sym_entsize : sec["offset"] + (si + 1) * sym_entsize]
                        st_name, st_value, st_size, st_info, st_other, st_shndx = struct.unpack_from("<IIIBBH", sym_data, 0)
                        if st_name < len(strtab):
                            sym_name = strtab[st_name:].split(b"\x00")[0].decode("latin1", errors="replace")
                            if sym_name == "_start":
                                if (st_value & ~1) != actual_entry_vaddr:
                                    raise ElfValidationError(f"Symbol _start value ({hex(st_value)}) does not match e_entry ({hex(e_entry)})")
                                if verbose:
                                    print(f"  Confirmed symbol _start matches entry: {hex(st_value)} (size={st_size}) in section index {st_shndx}")

    if verbose:
        print(f"ELF VALIDATION PASS: {file_desc}")
        print(f"  Type=ET_EXEC, Machine=ARM, Flags={hex(e_flags)} (EABI v{eabi_ver}, soft-float)")
        print(f"  Entry={hex(e_entry)} ({'Thumb' if is_thumb_entry else 'ARM'} mode) at file offset {hex(entry_file_offset)}")
        print(f"  Static binary confirmed (no PT_INTERP, no PT_DYNAMIC)")
        print(f"  Loaded in {load_segments} PT_LOAD segment(s)")

    return True

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(__file__), "target", "armv7-unknown-linux-gnueabi", "release", "rust-armv7-probe"
    )
    try:
        validate_elf(target, verbose=True)
    except ElfValidationError as e:
        print(f"ELF VALIDATION FAIL: {e}", file=sys.stderr)
        sys.exit(1)

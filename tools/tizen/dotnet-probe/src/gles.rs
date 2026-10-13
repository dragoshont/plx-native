use core::ffi::{c_char, c_void};

type Resolver = unsafe extern "C" fn(*const c_char) -> *const c_void;
const VERTEX: &str = include_str!("../../../../rust-modules/gfx/src/shaders/vs_src.vert");
const FRAGMENT: &str = include_str!("../../../../rust-modules/gfx/src/shaders/fs_flat.frag");

macro_rules! function {
    ($resolve:ident, $name:ident, $signature:ty) => {{
        let address = $resolve(concat!(stringify!($name), "\0").as_ptr().cast());
        if address.is_null() {
            return 30;
        }
        core::mem::transmute::<*const c_void, $signature>(address)
    }};
}

/// Compile the upstream flat-fill shaders, draw, read one pixel, and delete GL objects.
///
/// # Safety
/// The resolver must return GLES2 entry points for the calling thread's current context.
#[no_mangle]
pub unsafe extern "C" fn plx_probe_gles(resolve: Resolver) -> i32 {
    let create_shader = function!(resolve, glCreateShader, unsafe extern "C" fn(u32) -> u32);
    let shader_source = function!(
        resolve,
        glShaderSource,
        unsafe extern "C" fn(u32, i32, *const *const u8, *const i32)
    );
    let compile_shader = function!(resolve, glCompileShader, unsafe extern "C" fn(u32));
    let get_shader = function!(
        resolve,
        glGetShaderiv,
        unsafe extern "C" fn(u32, u32, *mut i32)
    );
    let delete_shader = function!(resolve, glDeleteShader, unsafe extern "C" fn(u32));
    let create_program = function!(resolve, glCreateProgram, unsafe extern "C" fn() -> u32);
    let attach = function!(resolve, glAttachShader, unsafe extern "C" fn(u32, u32));
    let link = function!(resolve, glLinkProgram, unsafe extern "C" fn(u32));
    let get_program = function!(
        resolve,
        glGetProgramiv,
        unsafe extern "C" fn(u32, u32, *mut i32)
    );
    let delete_program = function!(resolve, glDeleteProgram, unsafe extern "C" fn(u32));
    let use_program = function!(resolve, glUseProgram, unsafe extern "C" fn(u32));
    let attribute = function!(
        resolve,
        glGetAttribLocation,
        unsafe extern "C" fn(u32, *const u8) -> i32
    );
    let uniform = function!(
        resolve,
        glGetUniformLocation,
        unsafe extern "C" fn(u32, *const u8) -> i32
    );
    let uniform2 = function!(resolve, glUniform2f, unsafe extern "C" fn(i32, f32, f32));
    let uniform4 = function!(
        resolve,
        glUniform4f,
        unsafe extern "C" fn(i32, f32, f32, f32, f32)
    );
    let viewport = function!(
        resolve,
        glViewport,
        unsafe extern "C" fn(i32, i32, i32, i32)
    );
    let enable = function!(
        resolve,
        glEnableVertexAttribArray,
        unsafe extern "C" fn(u32)
    );
    let disable = function!(
        resolve,
        glDisableVertexAttribArray,
        unsafe extern "C" fn(u32)
    );
    let pointer = function!(
        resolve,
        glVertexAttribPointer,
        unsafe extern "C" fn(u32, i32, u32, u8, i32, *const f32)
    );
    let draw = function!(resolve, glDrawArrays, unsafe extern "C" fn(u32, i32, i32));
    let read = function!(
        resolve,
        glReadPixels,
        unsafe extern "C" fn(i32, i32, i32, i32, u32, u32, *mut u8)
    );
    let error = function!(resolve, glGetError, unsafe extern "C" fn() -> u32);

    if error() != 0 {
        return 31;
    }
    let vertex = create_shader(0x8b31);
    let fragment = create_shader(0x8b30);
    let program = create_program();
    let mut result = 0;
    for (shader, source) in [(vertex, VERTEX), (fragment, FRAGMENT)] {
        let bytes = source.as_ptr();
        let length = source.len() as i32;
        shader_source(shader, 1, &bytes, &length);
        compile_shader(shader);
        let mut compiled = 0;
        get_shader(shader, 0x8b81, &mut compiled);
        if compiled == 0 {
            result = 32;
        }
    }
    if result == 0 {
        attach(program, vertex);
        attach(program, fragment);
        link(program);
        let mut linked = 0;
        get_program(program, 0x8b82, &mut linked);
        if linked == 0 {
            result = 33;
        } else {
            let position = attribute(program, b"a_pos\0".as_ptr());
            let screen = uniform(program, b"u_screen\0".as_ptr());
            let rect = uniform(program, b"u_rect\0".as_ptr());
            let color = uniform(program, b"u_col\0".as_ptr());
            if position < 0 || screen < 0 || rect < 0 || color < 0 {
                result = 34;
            } else {
                use_program(program);
                viewport(0, 0, 1920, 1080);
                uniform2(screen, 1920.0, 1080.0);
                uniform4(rect, 0.0, 0.0, 1920.0, 1080.0);
                uniform4(color, 1.0, 0.0, 0.0, 1.0);
                let vertices = [0.0f32, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
                enable(position as u32);
                pointer(position as u32, 2, 0x1406, 0, 0, vertices.as_ptr());
                draw(0x0005, 0, 4);
                let mut pixel = [0u8; 4];
                read(960, 540, 1, 1, 0x1908, 0x1401, pixel.as_mut_ptr());
                disable(position as u32);
                use_program(0);
                if pixel != [255, 0, 0, 255] {
                    result = 35;
                }
            }
        }
    }
    delete_program(program);
    delete_shader(vertex);
    delete_shader(fragment);
    if error() != 0 {
        return 36;
    }
    result
}

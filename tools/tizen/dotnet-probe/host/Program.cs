using System;
using System.Runtime.InteropServices;
using Tizen.Applications;
using ElmSharp;

#if GRAPHICS_PROBE
sealed class Probe : OpenTK.Platform.Tizen.TizenGameApplication
{
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    delegate IntPtr Resolve(string name);

    [DllImport("libEGL.so.1", CallingConvention = CallingConvention.Cdecl)]
    static extern IntPtr eglGetProcAddress(string name);

    [DllImport("libplx_rust_receipt.so", CallingConvention = CallingConvention.Cdecl)]
    static extern int plx_probe_gles(Resolve resolver);

    [DllImport("libplx_rust_receipt.so", CallingConvention = CallingConvention.Cdecl)]
    static extern int plx_probe_entry(string path);

    [DllImport("libplx_rust_receipt.so", CallingConvention = CallingConvention.Cdecl)]
    static extern int plx_probe_stage(string path, uint stage);

    readonly Resolve resolver = eglGetProcAddress;

    protected override void OnCreate()
    {
        base.OnCreate();
        plx_probe_stage(DirectoryInfo.Resource + "receipt.bin", 100);
        Window.RenderFrame += (sender, args) =>
        {
            try
            {
                plx_probe_stage(DirectoryInfo.Resource + "receipt.bin", 101);
                int result = plx_probe_gles(resolver);
                plx_probe_stage(DirectoryInfo.Resource + "receipt.bin", (uint)result);
                Console.WriteLine("PLX Rust GLES result: " + result);
                if (result == 0)
                {
                    Window.SwapBuffers();
                    Console.WriteLine("PLX Rust post-swap receipt result: " +
                        plx_probe_entry(DirectoryInfo.Resource + "receipt.bin"));
                }
            }
            catch (Exception error)
            {
                plx_probe_stage(DirectoryInfo.Resource + "receipt.bin", 102);
                Console.Error.WriteLine("PLX Rust GLES failed: " + error);
            }
            Exit();
        };
    }

    internal static void RunGraphics(string[] args)
    {
        using (var app = new Probe { GLMajor = 2, GLMinor = 0 })
            app.Run(args);
    }
}

static class Launcher
{
    [DllImport("libplx_rust_receipt.so", CallingConvention = CallingConvention.Cdecl)]
    static extern int plx_probe_stage(string path, uint stage);

    static void Main(string[] args)
    {
        string path = System.IO.Path.GetFullPath(System.IO.Path.Combine(
            System.IO.Path.GetDirectoryName(typeof(Launcher).Assembly.Location), "..", "res", "receipt.bin"));
        plx_probe_stage(path, 99);
        try
        {
            Start(args);
        }
        catch (Exception error)
        {
            uint stage = error is System.IO.FileNotFoundException ? 201u :
                error is TypeLoadException ? 202u : error is BadImageFormatException ? 203u :
                error is MissingMethodException ? 204u : 205u;
            plx_probe_stage(path, stage);
            Console.Error.WriteLine("PLX graphics startup failed: " + error);
        }
    }

    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
    static void Start(string[] args)
    {
        Probe.RunGraphics(args);
    }
}
#else
sealed class Probe : CoreUIApplication
{
    [DllImport("libplx_rust_receipt.so", CallingConvention = CallingConvention.Cdecl)]
    static extern int plx_probe_entry(string path);

    protected override void OnCreate()
    {
        base.OnCreate();
        try
        {
#if MANAGED_CONTROL
            byte[] config = System.IO.File.ReadAllBytes(DirectoryInfo.Resource + "receipt.bin");
            byte[] message = new byte[43];
            byte[] prefix = System.Text.Encoding.ASCII.GetBytes("PLX-CS-V1:\n");
            Array.Copy(prefix, message, prefix.Length);
            Array.Copy(config, 6, message, prefix.Length, 32);
            using (var client = new System.Net.Sockets.UdpClient())
            {
                client.Send(message, message.Length, new System.Net.IPEndPoint(
                    new System.Net.IPAddress(new byte[] { config[0], config[1], config[2], config[3] }),
                    (config[4] << 8) | config[5]));
            }
            Console.WriteLine("PLX managed-only control sent");
#else
            int result = plx_probe_entry(DirectoryInfo.Resource + "receipt.bin");
            Console.WriteLine("PLX Rust entry result: " + result);
#endif
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("PLX Rust entry failed: " + error);
        }
        Exit();
    }

    static void Main(string[] args)
    {
        Elementary.Initialize();
        Elementary.ThemeOverlay();
        new Probe().Run(args);
    }
}
#endif

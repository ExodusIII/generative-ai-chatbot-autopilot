using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace AutopilotApp.Core;

internal static class Native
{
    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    const int DarkMode = 20, BorderColor = 34, CaptionColor = 35, TextColor = 36;

    /// Başlık çubuğunu arayüzün arka planıyla aynı renge boyar (Windows 11; eski sürümlerde sessizce yok sayılır).
    public static void SetTitleBar(Window window, bool dark)
    {
        var hwnd = new WindowInteropHelper(window).Handle;
        if (hwnd == IntPtr.Zero) return;
        var on = dark ? 1 : 0;
        var caption = dark ? Rgb(0x0B, 0x0D, 0x12) : Rgb(0xF6, 0xF7, 0xFA);
        var text = dark ? Rgb(0xE9, 0xEB, 0xF1) : Rgb(0x1B, 0x1F, 0x29);
        DwmSetWindowAttribute(hwnd, DarkMode, ref on, sizeof(int));
        DwmSetWindowAttribute(hwnd, CaptionColor, ref caption, sizeof(int));
        DwmSetWindowAttribute(hwnd, BorderColor, ref caption, sizeof(int));
        DwmSetWindowAttribute(hwnd, TextColor, ref text, sizeof(int));
    }

    static int Rgb(int r, int g, int b) => r | (g << 8) | (b << 16);   // COLORREF: 0x00BBGGRR
}

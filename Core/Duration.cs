using System.Globalization;
using System.Text.RegularExpressions;

namespace AutopilotApp.Core;

/// Süre metinleri: "90dk", "3s", "48 saat", "2g", "1,5 saat". sira.ps1 ve ap ile aynı birimler.
public static class Duration
{
    static readonly Regex Re = new(@"^\s*(\d+(?:[.,]\d+)?)\s*(dk|dak|dakika|m|min|s|sa|saat|h|g|gün|gun|d|hafta|w)?\s*$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static int? ToMinutes(string? text)
    {
        if (text is null) return null;
        var m = Re.Match(text);
        if (!m.Success) return null;
        var n = double.Parse(m.Groups[1].Value.Replace(',', '.'), CultureInfo.InvariantCulture);
        var mins = Unit(m.Groups[2].Value) switch { "dakika" => n, "gün" => n * 1440, "hafta" => n * 10080, _ => n * 60 };
        return mins >= 1 ? (int)Math.Round(mins) : null;
    }

    /// TASKS.md'ye yazılan biçim: "48 saat", "90 dakika", "2 gün".
    public static string? Normalize(string? text)
    {
        if (ToMinutes(text) is null) return null;
        var m = Re.Match(text!);
        return $"{m.Groups[1].Value} {Unit(m.Groups[2].Value)}";
    }

    static string Unit(string u) => u.ToLowerInvariant() switch
    {
        "dk" or "dak" or "dakika" or "m" or "min" => "dakika",
        "g" or "gün" or "gun" or "d" => "gün",
        "hafta" or "w" => "hafta",
        _ => "saat",
    };
}

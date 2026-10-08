using System.Diagnostics;
using System.Windows;

namespace AutopilotApp.Core;

/// Dosya, klasör ve bağlantı açma. Sadece proje içindeki güvenli dosya türleri ve http(s) bağlantıları açılır.
public static class Shell
{
    static readonly HashSet<string> SafeExt = new(StringComparer.OrdinalIgnoreCase)
    {
        ".md", ".html", ".htm", ".txt", ".json", ".csv", ".log", ".pdf", ".png", ".jpg", ".jpeg", ".svg",
    };

    public static void Open(string project, string rel)
    {
        var full = Paths.Resolve(project, rel);
        if (Directory.Exists(full)) { Process.Start(new ProcessStartInfo("explorer.exe", $"\"{full}\"") { UseShellExecute = true }); return; }
        if (!File.Exists(full)) throw new FileNotFoundException("Bulunamadı: " + rel);
        if (!SafeExt.Contains(Path.GetExtension(full)))
            throw new UnauthorizedAccessException("Bu dosya türü güvenlik nedeniyle uygulamadan açılmıyor.");
        Process.Start(new ProcessStartInfo(full) { UseShellExecute = true });
    }

    public static void Reveal(string project, string rel)
    {
        var full = Paths.Resolve(project, rel);
        if (!File.Exists(full) && !Directory.Exists(full)) throw new FileNotFoundException("Bulunamadı: " + rel);
        Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{full}\"") { UseShellExecute = true });
    }

    public static void OpenUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps))
            throw new InvalidOperationException("Sadece http/https bağlantıları açılabilir.");
        Process.Start(new ProcessStartInfo(u.AbsoluteUri) { UseShellExecute = true });
    }

    /// Rapor içindeki bir bağlantı: web → tarayıcı, .md → uygulama içinde aç (yolunu döndürür), diğer → varsayılan uygulama.
    public static string? OpenLink(string project, string baseRel, string href)
    {
        if (href.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || href.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            OpenUrl(href);
            return null;
        }
        if (href.StartsWith('#') || href.Contains(':') && !Path.IsPathRooted(href)) return null;   // mailto:, javascript: vb. yok sayılır
        var clean = Uri.UnescapeDataString(href.Split('#')[0]);
        var baseDir = Path.GetDirectoryName(baseRel.Replace('/', '\\')) ?? "";
        var full = Paths.Resolve(project, Path.Combine(baseDir, clean));
        var rel = Paths.Relative(project, full);
        if (full.EndsWith(".md", StringComparison.OrdinalIgnoreCase) && File.Exists(full)) return rel;
        Open(project, rel);
        return null;
    }

    public static string? PickFolder(Window owner, string? title)
    {
        var dialog = new Microsoft.Win32.OpenFolderDialog { Title = title ?? "Klasör seç" };
        return dialog.ShowDialog(owner) == true ? dialog.FolderName : null;
    }

    /// `claude setup-token` için görünür bir terminal açar; giriş kullanıcı tarafından yapılır.
    public static void OpenLoginTerminal()
    {
        var shell = Engine.PwshPath() ?? "powershell.exe";
        var wt = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "WindowsApps", "wt.exe");
        var psi = File.Exists(wt) ? new ProcessStartInfo(wt) : new ProcessStartInfo(shell);
        if (File.Exists(wt)) psi.ArgumentList.Add(shell);
        foreach (var a in new[] { "-NoExit", "-Command", "claude setup-token" }) psi.ArgumentList.Add(a);
        psi.UseShellExecute = false;
        using var _ = Process.Start(psi);
    }

    public static string CreateShortcut(string where)
    {
        var dir = where == "desktop"
            ? Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory)
            : Environment.GetFolderPath(Environment.SpecialFolder.Programs);
        var lnk = Path.Combine(dir, "Claude Autopilot.lnk");
        var shellType = Type.GetTypeFromProgID("WScript.Shell") ?? throw new InvalidOperationException("Kısayol oluşturulamadı.");
        dynamic shell = Activator.CreateInstance(shellType)!;
        dynamic sc = shell.CreateShortcut(lnk);
        sc.TargetPath = Environment.ProcessPath;
        sc.WorkingDirectory = AppContext.BaseDirectory;
        sc.IconLocation = Environment.ProcessPath + ",0";
        sc.Description = "Claude Autopilot kontrol merkezi";
        sc.Save();
        return lnk;
    }
}

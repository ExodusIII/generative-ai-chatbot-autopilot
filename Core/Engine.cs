using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace AutopilotApp.Core;

public sealed class CurrentAction
{
    public string? Time { get; init; }
    public string? Action { get; init; }       // NORMAL | DÖNGÜ | BİTİR | YOK
    public string? Task { get; init; }
    public string? Type { get; init; }
    public int? Round { get; init; }
    public bool First { get; init; }
    public string? End { get; init; }
    public string? Journal { get; init; }
}

public sealed class EngineStatus
{
    public bool Running { get; init; }
    public int? Pid { get; init; }
    public string State { get; init; } = "idle";   // running | starting | limit | waiting | login | error | finished | stopped | idle
    public string? Detail { get; init; }
    public string? Since { get; init; }
    public string? ResumeAt { get; init; }
    public CurrentAction? Current { get; init; }
    public bool SchedulerActive { get; init; }       // Claude uygulamasındaki zamanlanmış görev şu an bu listede çalışıyor
    public bool SchedulerInstalled { get; init; }    // zamanlanmış görev bu listeye bağlı
    public bool ScriptsOk { get; init; }
}

/// Terminal motoru (autopilot.ps1) ile konuşur: durum dosyalarını okur, başlatır, durdurur.
public static class Engine
{
    const string TokenVar = "CLAUDE_CODE_OAUTH_TOKEN";
    static readonly Dictionary<string, (DateTime At, bool Value)> SchedulerCache = new(StringComparer.OrdinalIgnoreCase);

    public static bool ScriptsFound(string? dir) =>
        !string.IsNullOrWhiteSpace(dir)
        && File.Exists(Path.Combine(dir, "autopilot.ps1"))
        && File.Exists(Path.Combine(dir, "sira.ps1"));

    public static string? FindScriptsDir()
    {
        var candidates = new List<string>
        {
            Path.Combine(AppContext.BaseDirectory, "..", "autopilot"),          // kurulum: ...\ClaudeAutopilot\app + \autopilot
            Path.Combine(AppContext.BaseDirectory, "..", "engine"),             // kaynak kod: dist\ + engine\
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "engine"),         // bin\Debug\net10.0-windows\
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "engine"),   // bin\Release\net10.0-windows\win-x64\
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "ClaudeAutopilot", "autopilot"),
        };
        candidates.AddRange((Environment.GetEnvironmentVariable("PATH", EnvironmentVariableTarget.User) ?? "")
            .Split(';', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => Environment.ExpandEnvironmentVariables(p.Trim())));
        foreach (var c in candidates)
        {
            try { var full = Path.GetFullPath(c); if (ScriptsFound(full)) return full; } catch { }
        }
        return null;
    }

    public static Process? GetProcess(string project)
    {
        try
        {
            var pidFile = Path.Combine(Paths.StateDir(project), "pid");
            if (!File.Exists(pidFile) || !int.TryParse(File.ReadAllText(pidFile).Trim(), out var pid)) return null;
            var p = Process.GetProcessById(pid);
            if (!p.HasExited && p.ProcessName.ToLowerInvariant() is "pwsh" or "powershell") return p;
            p.Dispose();
        }
        catch { }
        return null;
    }

    public static EngineStatus Status(string project, AppSettings settings)
    {
        var dir = Paths.StateDir(project);
        using var proc = GetProcess(project);
        var running = proc != null;
        var (since, state, detail) = ReadDurum(Path.Combine(dir, "durum.txt"));

        string? resume = null;
        if (state == "limit")
        {
            var m = Regex.Match(detail ?? "", @"(\d{1,2}:\d{2})");
            if (m.Success) resume = m.Groups[1].Value;
        }

        if (running && state is not ("running" or "limit" or "waiting")) { state = "starting"; detail = "Motor başlatılıyor…"; }
        else if (!running && state is "running" or "limit" or "waiting") { state = "stopped"; detail = "Motor kapanmış. Yeniden başlatabilirsin."; }

        var lockFile = Path.Combine(dir, "zamanli.lock");
        var schedulerActive = File.Exists(lockFile) && (DateTime.Now - File.GetLastWriteTime(lockFile)).TotalMinutes < 90;

        return new EngineStatus
        {
            Running = running,
            Pid = proc?.Id,
            State = state,
            Detail = detail,
            Since = since,
            ResumeAt = resume,
            Current = ReadCurrent(Path.Combine(dir, "simdi.txt")),
            SchedulerActive = schedulerActive,
            SchedulerInstalled = SchedulerInstalled(project),
            ScriptsOk = ScriptsFound(settings.ScriptsDir),
        };
    }

    static (string? Since, string State, string? Detail) ReadDurum(string path)
    {
        try
        {
            if (!File.Exists(path)) return (null, "idle", null);
            var text = Paths.ReadShared(path).Trim();
            var m = Regex.Match(text, @"^(\d{2}\.\d{2} \d{2}:\d{2})\s+(.+?)(?:\s+-\s+(.*))?$", RegexOptions.Singleline);
            if (!m.Success) return (null, "idle", text);
            string? since = null;
            if (DateTime.TryParseExact(m.Groups[1].Value, "dd.MM HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var t))
            {
                if (t > DateTime.Now.AddDays(1)) t = t.AddYears(-1);   // yıl dönümü
                since = Json.Iso(t);
            }
            var key = m.Groups[2].Value.Trim().ToUpperInvariant();
            var state =
                key.StartsWith("ÇALIŞIYOR") ? "running" :
                key.StartsWith("LİMİT") || key.StartsWith("LIMIT") ? "limit" :
                key.StartsWith("BEKLİYOR") || key.StartsWith("BEKLIYOR") ? "waiting" :
                key.StartsWith("BİTTİ") || key.StartsWith("BITTI") ? "finished" :
                key.StartsWith("GİRİŞ") || key.StartsWith("GIRIS") ? "login" :
                key.StartsWith("HATA") ? "error" :
                key.StartsWith("DURDURULDU") ? "stopped" : "idle";
            var detail = m.Groups[3].Success ? m.Groups[3].Value.Trim() : null;
            return (since, state, detail);
        }
        catch { return (null, "idle", null); }
    }

    static CurrentAction? ReadCurrent(string path)
    {
        try
        {
            if (!File.Exists(path)) return null;
            var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var line in Paths.ReadShared(path).Split('\n'))
            {
                var i = line.IndexOf(':');
                if (i > 0) d.TryAdd(line[..i].Trim(), line[(i + 1)..].Trim());
            }
            string? Get(string k) => d.TryGetValue(k, out var v) ? v : null;
            DateTime? Time(string? s) => s != null && DateTime.TryParseExact(s, "yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var t) ? t : null;
            var task = Get("GÖREV");
            return new CurrentAction
            {
                Time = Json.Iso(Time(Get("ZAMAN"))),
                Action = Get("EYLEM"),
                Task = task is null ? null : TaskFile.CleanText(task),
                Type = Get("TÜR"),
                Round = int.TryParse(Get("TUR"), out var r) ? r : null,
                First = string.Equals(Get("İLK TUR"), "evet", StringComparison.OrdinalIgnoreCase),
                End = Json.Iso(Time(Get("BİTİŞ"))),
                Journal = Get("GÜNLÜK"),
            };
        }
        catch { return null; }
    }

    /// Claude uygulamasındaki zamanlanmış görevlerden biri bu listeyi mi işliyor?
    static bool SchedulerInstalled(string project)
    {
        lock (SchedulerCache)
        {
            if (SchedulerCache.TryGetValue(project, out var c) && (DateTime.Now - c.At).TotalSeconds < 60) return c.Value;
        }
        var value = false;
        try
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", "scheduled-tasks");
            if (Directory.Exists(dir))
            {
                var needle = Paths.TasksFile(project);
                value = Directory.EnumerateFiles(dir, "SKILL.md", SearchOption.AllDirectories)
                    .Any(f => File.ReadAllText(f).Contains(needle, StringComparison.OrdinalIgnoreCase));
            }
        }
        catch { }
        lock (SchedulerCache) SchedulerCache[project] = (DateTime.Now, value);
        return value;
    }

    public static void Start(string project, AppSettings settings)
    {
        var script = Path.Combine(settings.ScriptsDir, "autopilot.ps1");
        if (!ScriptsFound(settings.ScriptsDir))
            throw new InvalidOperationException("Motor betikleri bulunamadı. Ayarlar > Motor bölümünden autopilot klasörünü seç.");
        using (var existing = GetProcess(project)) if (existing != null) return;

        TaskFile.EnsureFile(project);
        var psi = new ProcessStartInfo(PwshPath() ?? throw new InvalidOperationException("PowerShell 7 (pwsh) bulunamadı. https://aka.ms/powershell adresinden kurabilirsin."))
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = project,
        };
        foreach (var a in new[] { "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-ProjectDir", project })
            psi.ArgumentList.Add(a);
        if (settings.FullAccess) psi.ArgumentList.Add("-Tam");

        // Uygulama açıldıktan sonra değişmiş olabilecek PATH ve giriş token'ı güncel haliyle verilsin.
        psi.Environment["PATH"] = FreshPath();
        var token = Environment.GetEnvironmentVariable(TokenVar, EnvironmentVariableTarget.User);
        if (!string.IsNullOrEmpty(token)) psi.Environment[TokenVar] = token;

        using var _ = Process.Start(psi);
    }

    public static void Stop(string project)
    {
        using (var p = GetProcess(project))
        {
            if (p != null)
            {
                p.Kill(entireProcessTree: true);
                p.WaitForExit(4000);
            }
        }
        var dir = Paths.StateDir(project);
        try { File.Delete(Path.Combine(dir, "pid")); } catch { }
        try
        {
            Directory.CreateDirectory(dir);
            File.WriteAllText(Path.Combine(dir, "durum.txt"), $"{DateTime.Now:dd.MM HH:mm}  DURDURULDU - uygulamadan durduruldu", new UTF8Encoding(false));
        }
        catch { }
    }

    public static string? PwshPath()
    {
        foreach (var dir in FreshPath().Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            try { var p = Path.Combine(dir.Trim(), "pwsh.exe"); if (File.Exists(p)) return p; } catch { }
        }
        var pf = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "PowerShell", "7", "pwsh.exe");
        return File.Exists(pf) ? pf : null;
    }

    static string FreshPath() => Environment.ExpandEnvironmentVariables(
        (Environment.GetEnvironmentVariable("PATH", EnvironmentVariableTarget.Machine) ?? "") + ";" +
        (Environment.GetEnvironmentVariable("PATH", EnvironmentVariableTarget.User) ?? ""));

    public static bool TokenSet() => !string.IsNullOrEmpty(Environment.GetEnvironmentVariable(TokenVar, EnvironmentVariableTarget.User));

    /// Kullanıcının yapıştırdığı token'ı kullanıcı ortam değişkenine yazar (değer hiçbir yere loglanmaz).
    public static void SetToken(string? token)
    {
        token = token?.Trim();
        if (token is { Length: > 0 } && token.Any(char.IsWhiteSpace))
            throw new InvalidOperationException("Token boşluk içeremez. `claude setup-token` çıktısını olduğu gibi yapıştır.");
        Environment.SetEnvironmentVariable(TokenVar, string.IsNullOrEmpty(token) ? null : token, EnvironmentVariableTarget.User);
    }
}

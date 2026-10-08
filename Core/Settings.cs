using System.Text.Json;
using Microsoft.Win32;

namespace AutopilotApp.Core;

public sealed class NotifySettings
{
    public bool Done { get; set; } = true;
    public bool TimedDone { get; set; } = true;
    public bool Blocked { get; set; } = true;
    public bool Limit { get; set; } = true;
    public bool Login { get; set; } = true;
    public bool Finished { get; set; } = true;
}

public sealed class WindowBounds
{
    public double Left { get; set; }
    public double Top { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }
    public bool Maximized { get; set; }
}

public sealed class AppSettings
{
    public List<string> Projects { get; set; } = new();
    public string? Current { get; set; }
    public string ScriptsDir { get; set; } = "";
    public bool FullAccess { get; set; }
    public bool AutoStartEngine { get; set; } = true;
    public bool MinimizeToTray { get; set; } = true;
    public bool StartWithWindows { get; set; }
    public string Theme { get; set; } = "dark";          // dark | light | system
    public NotifySettings Notify { get; set; } = new();
    public WindowBounds? Window { get; set; }
    public bool TrayHintShown { get; set; }
}

public sealed class SettingsStore
{
    public static readonly string Dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeAutopilot");
    static readonly string FilePath = Path.Combine(Dir, "settings.json");
    readonly object _lock = new();

    public AppSettings Value { get; private set; } = new();

    public SettingsStore()
    {
        try
        {
            if (File.Exists(FilePath))
                Value = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(FilePath), Json.Web) ?? new();
        }
        catch { Value = new(); }
        ApplyDefaults();
    }

    void ApplyDefaults()
    {
        Value.Projects = Value.Projects
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(Paths.Normalize)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // İlk açılış: ana klasörde TASKS.md varsa onu ekle.
        if (Value.Projects.Count == 0)
        {
            var home = Paths.Normalize(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile));
            if (File.Exists(Paths.TasksFile(home))) Value.Projects.Add(home);
        }
        if (Value.Current is null || !Value.Projects.Contains(Value.Current, StringComparer.OrdinalIgnoreCase))
            Value.Current = Value.Projects.FirstOrDefault();
        if (!Engine.ScriptsFound(Value.ScriptsDir))
            Value.ScriptsDir = Engine.FindScriptsDir() ?? Value.ScriptsDir;
        Value.Notify ??= new();
    }

    public void Save()
    {
        lock (_lock)
        {
            Directory.CreateDirectory(Dir);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(Value, Json.Pretty));
        }
    }

    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

    /// Windows açılınca tepside başlat (sadece kullanıcı ayarlardan açarsa).
    public static void ApplyStartup(bool enable)
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: true);
        if (key is null) return;
        if (enable) key.SetValue("ClaudeAutopilot", $"\"{Environment.ProcessPath}\" --tray");
        else key.DeleteValue("ClaudeAutopilot", throwOnMissingValue: false);
    }

    public static bool SystemUsesDarkTheme()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            return key?.GetValue("AppsUseLightTheme") is not int v || v == 0;
        }
        catch { return true; }
    }
}

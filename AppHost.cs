using System.Diagnostics;
using System.Text.Json;
using System.Windows.Threading;
using AutopilotApp.Core;
using WinForms = System.Windows.Forms;
using Drawing = System.Drawing;

namespace AutopilotApp;

/// Uygulamanın merkezi: ayarlar, arayüz köprüsü, tepsi simgesi, klasör izleyiciler ve bildirimler.
public sealed class AppHost : IDisposable
{
    public SettingsStore Settings { get; } = new();
    public Bridge Bridge { get; }
    public Notifier Notifier { get; }
    public MainWindow Window { get; }
    public bool IsDark { get; private set; }

    readonly Dispatcher _ui;
    readonly WinForms.NotifyIcon _tray;
    readonly Dictionary<string, ProjectWatcher> _watchers = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string, string> _engineSig = new(StringComparer.OrdinalIgnoreCase);
    readonly Timer _poll;

    public AppHost(MainWindow window)
    {
        Window = window;
        _ui = window.Dispatcher;
        IsDark = Settings.Value.Theme switch { "light" => false, "system" => SettingsStore.SystemUsesDarkTheme(), _ => true };
        Bridge = new Bridge(_ui, new Api(this).Handle);
        Notifier = new Notifier(() => Settings.Value, ShowBalloon);
        _tray = CreateTray();
        foreach (var p in Settings.Value.Projects) Watch(p);
        // Motor süreci kapanması, kilit süresinin dolması gibi dosyaya yansımayan değişiklikler için.
        _poll = new Timer(_ => { foreach (var p in Settings.Value.Projects.ToList()) CheckEngine(p); }, null, 1500, 5000);
    }

    // ---------------- Projeler ----------------

    void Watch(string project)
    {
        if (_watchers.ContainsKey(project) || !Directory.Exists(project)) return;
        _watchers[project] = new ProjectWatcher(project, kind => OnProjectChanged(project, kind));
        TryCheckTasks(project);   // ilk görüntü; bildirimler bundan sonraki değişiklikler için
    }

    void OnProjectChanged(string project, string kind)
    {
        if (kind == "tasks") TryCheckTasks(project);
        if (kind == "engine") CheckEngine(project);
        if (IsCurrent(project)) Bridge.Emit(kind);
    }

    void TryCheckTasks(string project)
    {
        try { Notifier.CheckTasks(project, TaskFile.Parse(TaskDoc.Load(Paths.TasksFile(project)).Lines)); } catch { }
    }

    void CheckEngine(string project)
    {
        try
        {
            var st = Engine.Status(project, Settings.Value);
            var sig = $"{st.State}|{st.Running}|{st.SchedulerActive}|{st.Detail}|{st.Current?.Time}";
            lock (_engineSig)
            {
                if (_engineSig.TryGetValue(project, out var old) && old == sig) return;
                _engineSig[project] = sig;
            }
            Notifier.CheckEngine(project, st);
            if (IsCurrent(project)) Bridge.Emit("engine");
        }
        catch { }
    }

    bool IsCurrent(string project) => string.Equals(project, Settings.Value.Current, StringComparison.OrdinalIgnoreCase);

    public object InitInfo() => new
    {
        version = typeof(AppHost).Assembly.GetName().Version?.ToString(3),
        settings = Settings.Value,
        projects = Settings.Value.Projects.Select(p => new
        {
            path = p,
            name = Paths.ProjectName(p),
            exists = Directory.Exists(p),
            hasTasks = File.Exists(Paths.TasksFile(p)),
        }),
        scriptsOk = Engine.ScriptsFound(Settings.Value.ScriptsDir),
        pwsh = Engine.PwshPath(),
        tokenSet = Engine.TokenSet(),
        settingsDir = SettingsStore.Dir,
        dark = IsDark,
    };

    public object AddProject(string? path)
    {
        path ??= Shell.PickFolder(Window, "Proje klasörünü seç (TASKS.md'nin olduğu ya da olacağı klasör)");
        if (path is null) return InitInfo();
        if (!Directory.Exists(path)) throw new DirectoryNotFoundException("Klasör bulunamadı: " + path);
        path = Paths.Normalize(path);
        if (!Settings.Value.Projects.Contains(path, StringComparer.OrdinalIgnoreCase)) Settings.Value.Projects.Add(path);
        Settings.Value.Current = path;
        Settings.Save();
        Watch(path);
        return InitInfo();
    }

    public object RemoveProject(string path)
    {
        Settings.Value.Projects.RemoveAll(p => string.Equals(p, path, StringComparison.OrdinalIgnoreCase));
        if (_watchers.Remove(path, out var w)) w.Dispose();
        if (IsCurrent(path) || Settings.Value.Current is null) Settings.Value.Current = Settings.Value.Projects.FirstOrDefault();
        Settings.Save();
        return InitInfo();
    }

    public object SelectProject(string path)
    {
        var match = Settings.Value.Projects.FirstOrDefault(p => string.Equals(p, path, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException("Bu klasör proje listesinde yok.");
        Settings.Value.Current = match;
        Settings.Save();
        return InitInfo();
    }

    public object PickScriptsDir()
    {
        var dir = Shell.PickFolder(Window, "autopilot.ps1 ve sira.ps1'in bulunduğu klasörü seç");
        if (dir is null) return InitInfo();
        if (!Engine.ScriptsFound(dir)) throw new InvalidOperationException("Bu klasörde autopilot.ps1 ve sira.ps1 bulunamadı.");
        Settings.Value.ScriptsDir = dir;
        Settings.Save();
        return InitInfo();
    }

    public void OpenScriptsFile(string file)
    {
        if (file is not ("kurallar.md" or "TASKS.example.md")) throw new InvalidOperationException("Bu dosya açılamaz.");
        var path = Path.Combine(Settings.Value.ScriptsDir, file);
        if (!File.Exists(path)) throw new FileNotFoundException("Bulunamadı: " + path);
        Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
    }

    public object SaveSettings(JsonElement p)
    {
        var s = Settings.Value;
        if (p.Bool("fullAccess") is { } fa) s.FullAccess = fa;
        if (p.Bool("autoStartEngine") is { } ase) s.AutoStartEngine = ase;
        if (p.Bool("minimizeToTray") is { } mt) s.MinimizeToTray = mt;
        if (p.Str("theme") is { } theme && theme is "dark" or "light" or "system") s.Theme = theme;
        if (p.Bool("startWithWindows") is { } sw && sw != s.StartWithWindows)
        {
            SettingsStore.ApplyStartup(sw);
            s.StartWithWindows = sw;
        }
        var n = p.Obj("notify");
        if (n.ValueKind == JsonValueKind.Object)
        {
            if (n.Bool("done") is { } a) s.Notify.Done = a;
            if (n.Bool("timedDone") is { } b) s.Notify.TimedDone = b;
            if (n.Bool("blocked") is { } c) s.Notify.Blocked = c;
            if (n.Bool("limit") is { } d) s.Notify.Limit = d;
            if (n.Bool("login") is { } e) s.Notify.Login = e;
            if (n.Bool("finished") is { } f) s.Notify.Finished = f;
        }
        Settings.Save();
        return InitInfo();
    }

    public void ApplyTheme(string? theme)
    {
        IsDark = theme != "light";
        Native.SetTitleBar(Window, IsDark);
        Window.Background = new System.Windows.Media.SolidColorBrush(IsDark
            ? System.Windows.Media.Color.FromRgb(0x0B, 0x0D, 0x12)
            : System.Windows.Media.Color.FromRgb(0xF6, 0xF7, 0xFA));
    }

    // ---------------- Tepsi ----------------

    WinForms.NotifyIcon CreateTray()
    {
        var icon = Drawing.Icon.ExtractAssociatedIcon(Environment.ProcessPath!) ?? Drawing.SystemIcons.Application;
        var menu = new WinForms.ContextMenuStrip
        {
            Renderer = new WinForms.ToolStripProfessionalRenderer(new DarkMenuColors()),
            ShowImageMargin = false,
            Font = new Drawing.Font("Segoe UI", 9.5f),
        };
        var open = new WinForms.ToolStripMenuItem("Autopilot'u aç", null, (_, _) => _ui.InvokeAsync(Window.ShowFromTray));
        var engine = new WinForms.ToolStripMenuItem("Motoru başlat");
        engine.Click += (_, _) => ToggleEngine();
        var exit = new WinForms.ToolStripMenuItem("Çıkış", null, (_, _) => _ui.InvokeAsync(Window.ExitApp));
        menu.Items.AddRange(new WinForms.ToolStripItem[] { open, engine, new WinForms.ToolStripSeparator(), exit });
        foreach (WinForms.ToolStripItem item in menu.Items)
        {
            item.ForeColor = Drawing.Color.FromArgb(233, 235, 241);
            item.Padding = new WinForms.Padding(6, 5, 6, 5);
        }
        menu.Opening += (_, _) =>
        {
            var current = Settings.Value.Current;
            using var proc = current is null ? null : Engine.GetProcess(current);
            engine.Enabled = current != null;
            engine.Text = proc != null ? "Motoru durdur" : "Motoru başlat";
        };

        var tray = new WinForms.NotifyIcon { Icon = icon, Text = "Claude Autopilot", Visible = true, ContextMenuStrip = menu };
        tray.MouseClick += (_, e) => { if (e.Button == WinForms.MouseButtons.Left) _ui.InvokeAsync(Window.ShowFromTray); };
        tray.BalloonTipClicked += (_, _) => _ui.InvokeAsync(Window.ShowFromTray);
        return tray;
    }

    void ToggleEngine()
    {
        var current = Settings.Value.Current;
        if (current is null) return;
        Task.Run(() =>
        {
            try
            {
                using var proc = Engine.GetProcess(current);
                if (proc != null) Engine.Stop(current); else Engine.Start(current, Settings.Value);
                CheckEngine(current);
            }
            catch (Exception ex) { ShowBalloon("Motor", ex.Message); }
        });
    }

    void ShowBalloon(string title, string text)
    {
        if (text.Length > 240) text = text[..240] + "…";
        _ui.InvokeAsync(() => _tray.ShowBalloonTip(6000, title, text, WinForms.ToolTipIcon.None));
    }

    public void ShowTrayHintOnce()
    {
        if (Settings.Value.TrayHintShown) return;
        Settings.Value.TrayHintShown = true;
        Settings.Save();
        ShowBalloon("Autopilot tepside çalışıyor", "Görevler bitince buradan haber veririm. Tamamen kapatmak için simgeye sağ tıklayıp Çıkış'ı seç.");
    }

    public void Dispose()
    {
        _poll.Dispose();
        foreach (var w in _watchers.Values) w.Dispose();
        _watchers.Clear();
        _tray.Visible = false;
        _tray.Dispose();
    }

    sealed class DarkMenuColors : WinForms.ProfessionalColorTable
    {
        static readonly Drawing.Color Bg = Drawing.Color.FromArgb(23, 27, 36);
        static readonly Drawing.Color Hover = Drawing.Color.FromArgb(40, 46, 60);
        static readonly Drawing.Color Line = Drawing.Color.FromArgb(48, 55, 70);
        public override Drawing.Color ToolStripDropDownBackground => Bg;
        public override Drawing.Color ImageMarginGradientBegin => Bg;
        public override Drawing.Color ImageMarginGradientMiddle => Bg;
        public override Drawing.Color ImageMarginGradientEnd => Bg;
        public override Drawing.Color MenuBorder => Line;
        public override Drawing.Color MenuItemBorder => Hover;
        public override Drawing.Color MenuItemSelected => Hover;
        public override Drawing.Color MenuItemSelectedGradientBegin => Hover;
        public override Drawing.Color MenuItemSelectedGradientEnd => Hover;
        public override Drawing.Color SeparatorDark => Line;
        public override Drawing.Color SeparatorLight => Bg;
    }
}

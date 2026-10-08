namespace AutopilotApp.Core;

/// Bir projedeki TASKS.md, .autopilot/ ve sonuclar/ değişikliklerini izler; olayları türüne göre kısa bir gecikmeyle bildirir.
public sealed class ProjectWatcher : IDisposable
{
    readonly string _project;
    readonly Action<string> _onChange;                 // "tasks" | "engine" | "logs" | "results"
    readonly List<FileSystemWatcher> _watchers = new();
    readonly HashSet<string> _armed = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string, Timer> _debounce = new();
    readonly Timer _rearm;
    bool _disposed;

    public ProjectWatcher(string project, Action<string> onChange)
    {
        _project = project;
        _onChange = onChange;
        Arm();
        // .autopilot ve sonuclar klasörleri sonradan oluşabilir.
        _rearm = new Timer(_ => Arm(), null, 5000, 5000);
    }

    void Arm()
    {
        lock (_watchers)
        {
            if (_disposed) return;
            TryWatch(_project, "TASKS.md", false, _ => "tasks");
            TryWatch(Paths.StateDir(_project), "*", true,
                e => e.FullPath.Contains(@"\logs\", StringComparison.OrdinalIgnoreCase) ? "logs" : "engine");
            TryWatch(Paths.ResultsDir(_project), "*", false, _ => "results");
        }
    }

    void TryWatch(string dir, string filter, bool subdirs, Func<FileSystemEventArgs, string> kind)
    {
        var key = dir + "|" + filter;
        if (_armed.Contains(key) || !Directory.Exists(dir)) return;
        try
        {
            var w = new FileSystemWatcher(dir, filter)
            {
                IncludeSubdirectories = subdirs,
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size | NotifyFilters.DirectoryName,
            };
            FileSystemEventHandler handler = (_, e) => Fire(kind(e));
            w.Changed += handler;
            w.Created += handler;
            w.Deleted += handler;
            w.Renamed += (_, e) => Fire(kind(e));
            w.Error += (_, _) => { foreach (var k in new[] { "tasks", "engine", "logs", "results" }) Fire(k); };
            w.EnableRaisingEvents = true;
            _watchers.Add(w);
            _armed.Add(key);
        }
        catch { }
    }

    void Fire(string kind)
    {
        lock (_debounce)
        {
            if (_disposed) return;
            if (_debounce.TryGetValue(kind, out var t)) { t.Change(250, Timeout.Infinite); return; }
            _debounce[kind] = new Timer(_ => { try { _onChange(kind); } catch { } }, null, 250, Timeout.Infinite);
        }
    }

    public void Dispose()
    {
        lock (_watchers)
        {
            _disposed = true;
            _rearm.Dispose();
            foreach (var w in _watchers) w.Dispose();
            _watchers.Clear();
        }
        lock (_debounce)
        {
            foreach (var t in _debounce.Values) t.Dispose();
            _debounce.Clear();
        }
    }
}

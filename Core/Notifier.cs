namespace AutopilotApp.Core;

/// Görev ve motor durumundaki geçişleri yakalar (bitti, takıldı, limit, giriş) ve bildirim gösterir.
public sealed class Notifier
{
    readonly Func<AppSettings> _settings;
    readonly Action<string, string> _show;
    readonly Dictionary<string, Dictionary<string, TaskState>> _tasks = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string, string> _engine = new(StringComparer.OrdinalIgnoreCase);

    public Notifier(Func<AppSettings> settings, Action<string, string> show)
    {
        _settings = settings;
        _show = show;
    }

    static string Key(TaskItem t) => t.Id ?? $"{t.Type}|{t.Text}";

    public void CheckTasks(string project, List<TaskItem> items)
    {
        var now = new Dictionary<string, TaskItem>();
        foreach (var t in items) now.TryAdd(Key(t), t);
        Dictionary<string, TaskState>? before;
        lock (_tasks)
        {
            _tasks.TryGetValue(project, out before);
            _tasks[project] = now.ToDictionary(kv => kv.Key, kv => kv.Value.State);
        }
        if (before is null) return;   // ilk görüntü: bildirim yok

        var n = _settings().Notify;
        foreach (var (key, t) in now)
        {
            if (!before.TryGetValue(key, out var was) || was == t.State) continue;
            if (t.State == TaskState.Done && was == TaskState.Running && n.TimedDone)
                _show($"Süreli görev tamamlandı · {t.Round} tur", t.Text);
            else if (t.State == TaskState.Done && was != TaskState.Running && n.Done)
                _show("Görev tamamlandı", t.Text);
            else if (t.State == TaskState.Blocked && n.Blocked)
                _show("Görev takıldı", string.IsNullOrEmpty(t.Reason) ? t.Text : $"{t.Text}\n{t.Reason}");
        }
    }

    public void CheckEngine(string project, EngineStatus st)
    {
        string? was;
        lock (_engine)
        {
            _engine.TryGetValue(project, out was);
            _engine[project] = st.State;
        }
        if (was is null || was == st.State) return;

        var n = _settings().Notify;
        var name = Paths.ProjectName(project);
        switch (st.State)
        {
            case "limit" when n.Limit:
                _show("Kullanım limiti doldu", st.ResumeAt is { } at ? $"{at}'de kendiliğinden devam edecek · {name}" : $"Limit sıfırlanınca devam edecek · {name}");
                break;
            case "login" when n.Login:
                _show("Claude girişi gerekli", $"Motor durdu · {name}. Ayarlar > Claude girişi bölümünden düzeltebilirsin.");
                break;
            case "finished" when n.Finished && was is "running" or "starting":
                _show("Tüm görevler bitti", $"Yapılacak iş kalmadı · {name}");
                break;
            case "error" when n.Blocked:
                _show("Motor hata verdi", st.Detail ?? name);
                break;
        }
    }
}

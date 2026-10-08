using System.Text.Json;
using AutopilotApp.Core;

namespace AutopilotApp;

/// Arayüzün çağırabildiği komutlar. Dosya işleri arka planda, pencere gerektirenler UI iş parçacığında çalışır.
public sealed class Api
{
    readonly AppHost _h;

    public Api(AppHost host) => _h = host;

    public Task<object?> Handle(string method, JsonElement p) => method switch
    {
        "app.init" => Run(() => _h.InitInfo()),
        "app.theme" => Ui(() => { _h.ApplyTheme(p.Str("theme")); return null; }),
        "app.shortcut" => Run(() => new { path = Shell.CreateShortcut(p.Str("where") ?? "startmenu") }),

        "state.get" => Run(() => State(Project(p))),

        "task.add" => Run(() =>
        {
            var project = Project(p);
            TaskFile.Add(project, p.Str("type") ?? "", p.Str("duration"), p.Str("text") ?? "");
            string? startError = null;
            if (p.Bool("start") == true)
            {
                try { Engine.Start(project, _h.Settings.Value); }
                catch (Exception ex) { startError = ex.Message; }
            }
            return State(project, startError);
        }),
        "task.op" => Run(() =>
        {
            var project = Project(p);
            var arg = p.ValueKind == JsonValueKind.Object && p.TryGetProperty("arg", out var a) ? a : default;
            TaskFile.Apply(project, p.Int("line") ?? -1, p.Str("raw") ?? "", p.Str("op") ?? "", arg);
            return State(project);
        }),

        "engine.start" => Run(() => { var project = Project(p); Engine.Start(project, _h.Settings.Value); return State(project); }),
        "engine.stop" => Run(() => { var project = Project(p); Engine.Stop(project); return State(project); }),

        "results.list" => Run(() => Results.List(Project(p))),
        "results.read" => Run(() => Results.Read(Project(p), p.Str("path") ?? "")),
        "logs.list" => Run(() => Logs.List(Project(p), p.Int("max") ?? 200)),
        "logs.read" => Run(() => Logs.Read(Project(p), p.Str("name") ?? "", p.Long("offset") ?? 0)),

        "shell.open" => Run(() => { Shell.Open(Project(p), p.Str("path") ?? ""); return null; }),
        "shell.reveal" => Run(() => { Shell.Reveal(Project(p), p.Str("path") ?? ""); return null; }),
        "shell.url" => Run(() => { Shell.OpenUrl(p.Str("url") ?? ""); return null; }),
        "shell.scripts" => Run(() => { _h.OpenScriptsFile(p.Str("file") ?? ""); return null; }),
        "link.open" => Run(() => new { open = Shell.OpenLink(Project(p), p.Str("base") ?? "", p.Str("href") ?? "") }),

        "project.add" => Ui(() => _h.AddProject(p.Str("path"))),
        "project.remove" => Ui(() => _h.RemoveProject(p.Str("path") ?? "")),
        "project.select" => Ui(() => _h.SelectProject(p.Str("path") ?? "")),
        "scripts.pick" => Ui(() => _h.PickScriptsDir()),

        "settings.save" => Run(() => _h.SaveSettings(p)),
        "token.set" => Run(() => { Engine.SetToken(p.Str("token")); return new { tokenSet = Engine.TokenSet() }; }),
        "login.terminal" => Run(() => { Shell.OpenLoginTerminal(); return null; }),

        _ => throw new InvalidOperationException("Bilinmeyen komut: " + method),
    };

    static Task<object?> Run(Func<object?> f) => Task.Run(f);

    static Task<object?> Ui(Func<object?> f) => Task.FromResult(f());   // mesajlar zaten UI iş parçacığında gelir

    /// Sadece listeye eklenmiş proje klasörleri üzerinde işlem yapılır.
    string Project(JsonElement p)
    {
        var path = p.Str("project") ?? _h.Settings.Value.Current
            ?? throw new InvalidOperationException("Önce bir proje klasörü ekle.");
        var match = _h.Settings.Value.Projects.FirstOrDefault(x => string.Equals(x, path, StringComparison.OrdinalIgnoreCase));
        return match ?? throw new UnauthorizedAccessException("Bu klasör proje listesinde yok.");
    }

    object State(string project, string? startError = null)
    {
        var tasks = TaskFile.Parse(TaskDoc.Load(Paths.TasksFile(project)).Lines);
        _h.Notifier.CheckTasks(project, tasks);
        return new
        {
            project = new
            {
                path = project,
                name = Paths.ProjectName(project),
                exists = Directory.Exists(project),
                hasTasks = File.Exists(Paths.TasksFile(project)),
            },
            tasks,
            counts = new
            {
                open = tasks.Count(t => t.State == TaskState.Open),
                running = tasks.Count(t => t.State == TaskState.Running),
                done = tasks.Count(t => t.State == TaskState.Done),
                blocked = tasks.Count(t => t.State == TaskState.Blocked),
            },
            engine = Engine.Status(project, _h.Settings.Value),
            startError,
            now = Json.Iso(DateTime.Now),
        };
    }
}

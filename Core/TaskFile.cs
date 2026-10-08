using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace AutopilotApp.Core;

public enum TaskState { Open, Running, Done, Blocked }

public sealed class TaskItem
{
    public int Line { get; init; }
    public string Raw { get; init; } = "";
    public TaskState State { get; init; }
    public string Type { get; init; } = "";          // kod | arastir | kontrol | "" (Claude seçer)
    public string Text { get; init; } = "";
    public string? Duration { get; init; }           // başlamamış süreli görevin süresi
    public string? Start { get; init; }
    public string? End { get; init; }
    public int Round { get; init; }
    public string? Id { get; init; }
    public List<string> Outputs { get; init; } = new();
    public string? Note { get; init; }
    public string? Reason { get; init; }
    public bool Next { get; set; }                   // sıradaki açık görev
}

/// TASKS.md satırları; satır sonu biçimi korunur.
public sealed class TaskDoc
{
    public required string FilePath { get; init; }
    public required List<string> Lines { get; init; }
    public string NewLine { get; init; } = "\r\n";

    public static TaskDoc Load(string path)
    {
        var text = File.Exists(path) ? Paths.ReadShared(path) : "";
        var nl = text.Contains("\r\n") ? "\r\n" : text.Contains('\n') ? "\n" : "\r\n";
        var lines = text.Replace("\r\n", "\n").Split('\n').ToList();
        if (lines.Count > 0 && lines[^1] == "") lines.RemoveAt(lines.Count - 1);
        return new TaskDoc { FilePath = path, Lines = lines, NewLine = nl };
    }

    public void Save()
    {
        var bytes = new UTF8Encoding(false).GetBytes(string.Join(NewLine, Lines) + NewLine);
        for (var attempt = 0; ; attempt++)
        {
            try { File.WriteAllBytes(FilePath, bytes); return; }
            catch (IOException) when (attempt < 6) { Thread.Sleep(80); }   // motor o an yazıyor olabilir
        }
    }
}

public static class TaskFile
{
    const string Fmt = "yyyy-MM-dd HH:mm";
    static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
    const RegexOptions O = RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled;

    static readonly Regex ReTask = new(@"^(\s*)- \[([ ~xX!])\]\s?(.*)$", RegexOptions.Compiled);
    static readonly Regex ReBox = new(@"^(\s*)- \[[ ~xX!]\]", RegexOptions.Compiled);
    static readonly Regex ReType = new(@"^\[(kod|ara[sş]t[iı]r|kontrol)\]\s*", O);
    static readonly Regex ReSure = new(@"\[s[uü]re:\s*([^\]]+)\]\s*", O);
    static readonly Regex ReStart = new(@"\[ba[sş]lad[iı]:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]\s*", O);
    static readonly Regex ReEnd = new(@"\[biti[sş]:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]\s*", O);
    static readonly Regex ReEndTag = new(@"\[biti[sş]:\s*\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]", O);
    static readonly Regex ReTur = new(@"\[tur:\s*(\d+)\]\s*", O);
    static readonly Regex ReId = new(@"\[#([a-z0-9]+)\]\s*", O);
    static readonly Regex ReBlocked = new(@"\s*[—–-]+\s*TAKILDI:\s*(.*)$", O);
    static readonly Regex ReFile = new(@"(?:[A-Za-z]:[\\/])?[\w\-.\\/]+\.(?:md|html?|txt|json|csv|pdf|png|jpe?g|svg)\b", O);
    static readonly Regex ReSibling = new(@"^\s*\(\+\s*\.(md|html?)\b", O);
    static readonly Regex ReFolder = new(@"^([\w\-.]+[\\/])(?=\s|$)", O);

    public static List<TaskItem> Parse(IReadOnlyList<string> lines)
    {
        var items = new List<TaskItem>();
        for (var i = 0; i < lines.Count; i++)
        {
            var m = ReTask.Match(lines[i]);
            if (!m.Success) continue;
            var state = m.Groups[2].Value switch
            {
                " " => TaskState.Open,
                "~" => TaskState.Running,
                "!" => TaskState.Blocked,
                _ => TaskState.Done,
            };
            var rest = m.Groups[3].Value;

            // "metin → çıktılar — not" ve "metin — TAKILDI: sebep"
            string? outputs = null, note = null, reason = null;
            var arrow = rest.IndexOf('→');
            if (arrow >= 0) { outputs = rest[(arrow + 1)..].Trim(); rest = rest[..arrow].TrimEnd(); }
            var bm = ReBlocked.Match(rest);
            if (bm.Success) { reason = bm.Groups[1].Value.Trim(); rest = rest[..bm.Index]; }
            if (outputs != null)
            {
                var ob = ReBlocked.Match(outputs);
                if (ob.Success) { reason ??= ob.Groups[1].Value.Trim(); outputs = outputs[..ob.Index]; }
                var dash = outputs.IndexOf(" — ", StringComparison.Ordinal);
                if (dash >= 0) { note = outputs[(dash + 3)..].Trim(); outputs = outputs[..dash].Trim(); }
            }

            var type = "";
            var tm = ReType.Match(rest);
            if (tm.Success) { type = NormalizeType(tm.Groups[1].Value); rest = rest[tm.Length..]; }

            var duration = Take(ref rest, ReSure);
            var start = ParseTime(Take(ref rest, ReStart));
            var end = ParseTime(Take(ref rest, ReEnd));
            var round = int.TryParse(Take(ref rest, ReTur), out var r) ? r : 0;
            var id = Take(ref rest, ReId);

            items.Add(new TaskItem
            {
                Line = i,
                Raw = lines[i],
                State = state,
                Type = type,
                Text = rest.Trim(),
                Duration = duration?.Trim(),
                Start = Json.Iso(start),
                End = Json.Iso(end),
                Round = round,
                Id = id,
                Outputs = ParseOutputs(outputs),
                Note = note,
                Reason = reason,
            });
        }
        var next = items.FirstOrDefault(t => t.State == TaskState.Open);
        if (next != null) next.Next = true;
        return items;
    }

    /// Etiketleri temizlenmiş görev metni (ör. simdi.txt'deki GÖREV satırı için).
    public static string CleanText(string raw) => Parse(new[] { "- [ ] " + raw }).FirstOrDefault()?.Text ?? raw;

    public static void EnsureFile(string project)
    {
        var path = Paths.TasksFile(project);
        if (File.Exists(path)) return;
        File.WriteAllText(path,
            "# Görevler\r\n\r\nTürler: [kod] [araştır] [kontrol]. Süreli görev: [süre: 48 saat]. Sonuçlar sonuclar/ klasörüne yazılır.\r\n\r\n",
            new UTF8Encoding(false));
    }

    public static void Add(string project, string type, string? duration, string text)
    {
        var line = "- [ ] " + Compose(type, duration, text);
        EnsureFile(project);
        var doc = TaskDoc.Load(Paths.TasksFile(project));
        doc.Lines.Add(line);
        doc.Save();
    }

    /// Tek satır üzerinde işlem. Satır okunduğundan beri değiştiyse hiçbir şey yazılmaz.
    public static void Apply(string project, int line, string expectedRaw, string op, JsonElement arg)
    {
        var doc = TaskDoc.Load(Paths.TasksFile(project));
        if (line < 0 || line >= doc.Lines.Count || doc.Lines[line] != expectedRaw)
            throw new InvalidOperationException("TASKS.md bu arada değişti. Liste yenilendi, tekrar dene.");
        var items = Parse(doc.Lines);
        var item = items.First(t => t.Line == line);
        var raw = doc.Lines[line];

        switch (op)
        {
            case "retry":
                Require(item, TaskState.Blocked);
                doc.Lines[line] = ReBox.Replace(raw, "$1- [ ]", 1);
                break;
            case "delete":
                doc.Lines.RemoveAt(line);
                break;
            case "up":
            case "down":
                // Öncelik aynı durumdaki görevler arasında değişir (açık görevin önüne biten görev girmez).
                var peers = items.Where(t => t.State == item.State).ToList();
                var idx = peers.IndexOf(item);
                var other = op == "up" ? (idx > 0 ? peers[idx - 1] : null) : (idx < peers.Count - 1 ? peers[idx + 1] : null);
                if (other is null) return;
                (doc.Lines[line], doc.Lines[other.Line]) = (doc.Lines[other.Line], doc.Lines[line]);
                break;
            case "extend":
                Require(item, TaskState.Running);
                var minutes = arg.Int("minutes") ?? throw new InvalidOperationException("Uzatma süresi eksik.");
                var end = ParseTime(ReEnd.Match(raw).Groups[1].Value) ?? throw new InvalidOperationException("Bu görevin bitiş zamanı yok.");
                var from = end < DateTime.Now ? DateTime.Now : end;
                doc.Lines[line] = ReEndTag.Replace(raw, EndTag(from.AddMinutes(minutes)), 1);
                break;
            case "finish":
                Require(item, TaskState.Running);
                doc.Lines[line] = ReEndTag.Replace(raw, EndTag(DateTime.Now), 1);
                break;
            case "edit":
                Require(item, TaskState.Open);
                var indent = ReTask.Match(raw).Groups[1].Value;
                doc.Lines[line] = indent + "- [ ] " + Compose(arg.Str("type") ?? "", arg.Str("duration"), arg.Str("text") ?? "");
                break;
            default:
                throw new InvalidOperationException("Bilinmeyen işlem: " + op);
        }
        doc.Save();
    }

    static string Compose(string type, string? duration, string text)
    {
        text = text.Replace("\r", " ").Replace("\n", " ").Trim();
        if (text.Length == 0) throw new InvalidOperationException("Görev metni boş olamaz.");
        var parts = new List<string>();
        var tag = type switch { "kod" => "[kod]", "arastir" => "[araştır]", "kontrol" => "[kontrol]", _ => null };
        if (tag != null) parts.Add(tag);
        if (!string.IsNullOrWhiteSpace(duration))
            parts.Add($"[süre: {Duration.Normalize(duration) ?? throw new InvalidOperationException("Süre anlaşılamadı. Örnek: 90dk, 3s, 2g")}]");
        parts.Add(text);
        return string.Join(' ', parts);
    }

    static void Require(TaskItem item, TaskState state)
    {
        if (item.State != state) throw new InvalidOperationException("Bu işlem görevin şu anki durumunda yapılamaz.");
    }

    static string EndTag(DateTime t) => $"[bitiş: {t.ToString(Fmt, Inv)}]";

    static string NormalizeType(string t)
    {
        var l = t.ToLowerInvariant();
        return l.StartsWith("kod") ? "kod" : l.StartsWith("kon") ? "kontrol" : "arastir";
    }

    static string? Take(ref string s, Regex re)
    {
        var m = re.Match(s);
        if (!m.Success) return null;
        s = s.Remove(m.Index, m.Length);
        return m.Groups[1].Value;
    }

    static DateTime? ParseTime(string? s) =>
        s != null && DateTime.TryParseExact(s, Fmt, Inv, DateTimeStyles.None, out var d) ? d : null;

    /// "sonuclar/x.md (+ .html görsel pano)" ya da "portfolio/ (index.html, README.md)" gibi ifadelerden yollar.
    static List<string> ParseOutputs(string? part)
    {
        var list = new List<string>();
        if (string.IsNullOrWhiteSpace(part)) return list;
        void AddUnique(string p) { if (!list.Contains(p, StringComparer.OrdinalIgnoreCase)) list.Add(p); }

        string? folder = null;
        var fm = ReFolder.Match(part);
        if (fm.Success) { folder = fm.Groups[1].Value.Replace('\\', '/'); AddUnique(folder); }
        foreach (Match m in ReFile.Matches(part))
        {
            var p = m.Value.Replace('\\', '/');
            if (folder != null && !p.Contains('/')) p = folder + p;
            AddUnique(p);
            var sm = ReSibling.Match(part[(m.Index + m.Length)..]);
            if (sm.Success) AddUnique(Path.ChangeExtension(p, sm.Groups[1].Value).Replace('\\', '/'));
        }
        return list;
    }
}

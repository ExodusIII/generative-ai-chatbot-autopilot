using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AutopilotApp.Core;

public sealed class LogInfo
{
    public string Name { get; init; } = "";
    public string Started { get; init; } = "";
    public string Modified { get; init; } = "";
    public long Size { get; init; }
    public string Status { get; set; } = "unknown";   // success | error | limit | running | interrupted | text | unknown
    public double? Minutes { get; set; }
    public int? Turns { get; set; }
    public double? Cost { get; set; }
    public string? Summary { get; set; }
}

public sealed class LogEvent
{
    public string T { get; init; } = "";               // init | text | tool | toolResult | result | raw
    public string? Id { get; init; }
    public string? Name { get; init; }
    public string? Detail { get; init; }
    public string? Text { get; init; }
    public bool? Ok { get; init; }
    public int? Turns { get; init; }
    public double? Minutes { get; init; }
    public double? Cost { get; init; }
}

public sealed class LogChunk
{
    public List<LogEvent> Events { get; } = new();
    public long Offset { get; set; }
    public long Size { get; set; }
    public string Format { get; set; } = "json";
}

/// .autopilot/logs/tur-*.log dosyaları: motorun stream-json çıktısı (eski turlarda düz metin).
public static class Logs
{
    [System.Runtime.InteropServices.DllImport("kernel32.dll")]
    static extern uint GetOEMCP();

    /// Eski motor sürümü claude çıktısını konsol kod sayfasıyla okuduğu için bazı kayıtlarda "dosyas─▒" gibi bozulmalar var.
    static readonly Lazy<Encoding?> Oem = new(() =>
    {
        try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); return Encoding.GetEncoding((int)GetOEMCP()); }
        catch { return null; }
    });
    static readonly Regex ReMojibake = new(@"─▒|─░|├[¼ÂçÇ£╝ñ║]|┼[şŞƒ]", RegexOptions.Compiled);

    static string? Repair(string? s)
    {
        if (s is null || Oem.Value is null || !ReMojibake.IsMatch(s)) return s;
        var fixedText = Encoding.UTF8.GetString(Oem.Value.GetBytes(s));
        return fixedText.Count(c => c == '�') <= s.Count(c => c == '�') ? fixedText : s;
    }

    static readonly Regex ReName = new(@"^tur-(\d{8})-(\d{6})\.log$", RegexOptions.IgnoreCase);
    static readonly Regex ReLimit = new(@"usage limit|limit reached|hit your limit|rate limit", RegexOptions.IgnoreCase);
    const int MaxInitialBytes = 8 * 1024 * 1024;

    public static List<LogInfo> List(string project, int max)
    {
        var dir = Paths.LogsDir(project);
        if (!Directory.Exists(dir)) return new();
        var files = new DirectoryInfo(dir).EnumerateFiles("tur-*.log")
            .Where(f => ReName.IsMatch(f.Name))
            .OrderByDescending(f => f.Name, StringComparer.Ordinal)
            .Take(Math.Clamp(max, 1, 500))
            .ToList();
        return files.Select((f, i) => Describe(f, newest: i == 0)).ToList();
    }

    static LogInfo Describe(FileInfo f, bool newest)
    {
        var info = new LogInfo
        {
            Name = f.Name,
            Started = ParseStart(f.Name) ?? Json.Iso(f.CreationTime),
            Modified = Json.Iso(f.LastWriteTime),
            Size = f.Length,
        };
        try
        {
            var lines = ReadTail(f.FullName, 128 * 1024).Split('\n');
            if (!lines.Any(l => l.TrimStart().StartsWith("{\"")))
            {
                info.Status = "text";
                info.Summary = Clip(Repair(lines.Select(l => l.Trim()).LastOrDefault(l => l.Length > 0)), 160);
                return info;
            }
            for (var i = lines.Length - 1; i >= 0; i--)
            {
                var l = lines[i].Trim();
                if (!l.StartsWith("{\"type\":\"result\"")) continue;
                using var doc = JsonDocument.Parse(l);
                var r = doc.RootElement;
                var text = r.Str("result");
                info.Status = r.Bool("is_error") == true ? (ReLimit.IsMatch(text ?? "") ? "limit" : "error") : "success";
                if (r.Num("duration_ms") is { } ms) info.Minutes = Math.Round(ms / 60000, 1);
                info.Turns = r.Int("num_turns");
                info.Cost = r.Num("total_cost_usd");
                info.Summary = Clip(text, 180);
                return info;
            }
            info.Status = newest && (DateTime.Now - f.LastWriteTime).TotalMinutes < 30 ? "running" : "interrupted";
        }
        catch { }
        return info;
    }

    /// offset'ten sonraki tamamlanmış satırları olaylara çevirir; canlı izleme bir sonraki çağrıda yeni offset'i verir.
    public static LogChunk Read(string project, string name, long offset)
    {
        if (!ReName.IsMatch(name)) throw new ArgumentException("Geçersiz kayıt adı.");
        var path = Path.Combine(Paths.LogsDir(project), name);
        var chunk = new LogChunk();
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        chunk.Size = fs.Length;
        if (offset < 0 || offset > fs.Length) offset = 0;

        var truncated = false;
        if (offset == 0 && fs.Length > MaxInitialBytes) { offset = fs.Length - MaxInitialBytes; truncated = true; }
        fs.Seek(offset, SeekOrigin.Begin);
        var buf = new byte[fs.Length - offset];
        var read = 0;
        while (read < buf.Length)
        {
            var n = fs.Read(buf, read, buf.Length - read);
            if (n == 0) break;
            read += n;
        }
        chunk.Offset = offset;
        if (read == 0) return chunk;
        var lastNl = Array.LastIndexOf(buf, (byte)'\n', read - 1);
        if (lastNl < 0) return chunk;                       // satır henüz tamamlanmadı
        var startAt = 0;
        if (truncated)
        {
            startAt = Array.IndexOf(buf, (byte)'\n') + 1;    // yarım ilk satırı at
            chunk.Events.Add(new LogEvent { T = "raw", Text = "(Kayıt çok büyük; sadece son kısmı gösteriliyor.)" });
        }
        var text = Encoding.UTF8.GetString(buf, startAt, lastNl + 1 - startAt);
        chunk.Offset = offset + lastNl + 1;

        var anyJson = false;
        var raw = new StringBuilder();
        void FlushRaw()
        {
            if (raw.Length == 0) return;
            chunk.Events.Add(new LogEvent { T = "raw", Text = Clip(Repair(raw.ToString().TrimEnd()), 200_000) });
            raw.Clear();
        }
        foreach (var line in text.Split('\n'))
        {
            var l = line.TrimEnd('\r');
            if (l.Length == 0) continue;
            if (l.StartsWith('{'))
            {
                FlushRaw();   // araya giren düz metin satırları sırasını korusun
                if (TryParseEvent(l, chunk.Events)) { anyJson = true; continue; }
            }
            raw.AppendLine(l);
        }
        FlushRaw();
        chunk.Format = anyJson ? "json" : "text";
        if (!anyJson)
        {
            // Eski (düz metin) kayıtlar Claude'un son mesajıdır; arayüz bunları okunur metin olarak gösterir.
            for (var i = 0; i < chunk.Events.Count; i++)
                if (chunk.Events[i].T == "raw" && !truncated) chunk.Events[i] = new LogEvent { T = "plain", Text = chunk.Events[i].Text };
        }
        return chunk;
    }

    static bool TryParseEvent(string line, List<LogEvent> events)
    {
        try
        {
            using var doc = JsonDocument.Parse(line);
            var r = doc.RootElement;
            switch (r.Str("type"))
            {
                case "system":
                    if (r.Str("subtype") == "init")
                        events.Add(new LogEvent { T = "init", Name = r.Str("model"), Detail = r.Str("cwd") });
                    return true;
                case "assistant":
                    foreach (var c in Content(r))
                    {
                        var ct = c.Str("type");
                        if (ct == "text" && c.Str("text") is { } t && !string.IsNullOrWhiteSpace(t))
                            events.Add(new LogEvent { T = "text", Text = Clip(t.Trim(), 6000) });
                        else if (ct == "tool_use")
                            events.Add(new LogEvent { T = "tool", Id = c.Str("id"), Name = c.Str("name"), Detail = ToolDetail(c) });
                    }
                    return true;
                case "user":
                    foreach (var c in Content(r))
                    {
                        if (c.Str("type") != "tool_result") continue;
                        events.Add(new LogEvent
                        {
                            T = "toolResult",
                            Id = c.Str("tool_use_id"),
                            Ok = c.Bool("is_error") != true,
                            Text = Clip(ResultText(c), 400),
                        });
                    }
                    return true;
                case "result":
                    events.Add(new LogEvent
                    {
                        T = "result",
                        Ok = r.Bool("is_error") != true,
                        Detail = r.Str("subtype"),
                        Text = Clip(r.Str("result"), 8000),
                        Turns = r.Int("num_turns"),
                        Minutes = r.Num("duration_ms") is { } ms ? Math.Round(ms / 60000, 1) : null,
                        Cost = r.Num("total_cost_usd"),
                    });
                    return true;
                default:
                    return true;   // bilinmeyen olay türleri sessizce atlanır
            }
        }
        catch (JsonException) { return false; }
    }

    static IEnumerable<JsonElement> Content(JsonElement r)
    {
        var msg = r.Obj("message");
        if (msg.ValueKind == JsonValueKind.Object && msg.TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.Array)
            foreach (var item in c.EnumerateArray()) yield return item;
    }

    static string? ResultText(JsonElement c)
    {
        if (!c.TryGetProperty("content", out var content)) return null;
        if (content.ValueKind == JsonValueKind.String) return content.GetString();
        if (content.ValueKind == JsonValueKind.Array)
            return string.Join(" ", content.EnumerateArray().Select(x => x.Str("text")).Where(x => x != null));
        return null;
    }

    static string? ToolDetail(JsonElement tool)
    {
        var input = tool.Obj("input");
        if (input.ValueKind != JsonValueKind.Object) return null;
        if (tool.Str("name") == "TodoWrite" && input.TryGetProperty("todos", out var todos) && todos.ValueKind == JsonValueKind.Array)
            return $"{todos.GetArrayLength()} maddelik yapılacaklar listesi";
        foreach (var key in new[] { "file_path", "command", "query", "url", "pattern", "path", "description", "prompt", "notebook_path" })
            if (input.Str(key) is { Length: > 0 } v) return Clip(v.Replace('\n', ' '), 240);
        return null;
    }

    static string? ParseStart(string name)
    {
        var m = ReName.Match(name);
        return m.Success && DateTime.TryParseExact(m.Groups[1].Value + m.Groups[2].Value, "yyyyMMddHHmmss", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? Json.Iso(d) : null;
    }

    static string ReadTail(string path, int bytes)
    {
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        var start = Math.Max(0, fs.Length - bytes);
        fs.Seek(start, SeekOrigin.Begin);
        var buf = new byte[fs.Length - start];
        var read = fs.Read(buf, 0, buf.Length);
        return Encoding.UTF8.GetString(buf, 0, read);
    }

    static string? Clip(string? s, int max) => s is null ? null : s.Length <= max ? s : s[..max] + "…";
}

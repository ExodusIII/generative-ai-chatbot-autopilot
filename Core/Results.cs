using System.Globalization;
using System.Text.RegularExpressions;
using Markdig;

namespace AutopilotApp.Core;

public sealed class ResultFile
{
    public string Path { get; init; } = "";
    public string Name { get; init; } = "";
    public string Title { get; init; } = "";
    public string Kind { get; init; } = "other";     // research | check | journal | other
    public string Ext { get; init; } = "";
    public long Size { get; init; }
    public string Modified { get; init; } = "";
}

/// sonuclar/ klasöründeki raporlar. Markdown sunucuda HTML'e çevrilir; ham HTML kapalı (araştırma içeriği webden gelir).
public static class Results
{
    static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UseAdvancedExtensions()
        .DisableHtml()
        .Build();

    static readonly HashSet<string> Listed = new(StringComparer.OrdinalIgnoreCase) { ".md", ".html", ".htm", ".txt", ".json", ".csv", ".pdf" };
    static readonly Regex HtmlTitle = new(@"<title[^>]*>(.*?)</title>", RegexOptions.IgnoreCase | RegexOptions.Singleline);

    public static List<ResultFile> List(string project)
    {
        var dir = Paths.ResultsDir(project);
        if (!Directory.Exists(dir)) return new();
        return new DirectoryInfo(dir).EnumerateFiles()
            .Where(f => Listed.Contains(f.Extension))
            .Select(f => new ResultFile
            {
                Path = Paths.Relative(project, f.FullName),
                Name = f.Name,
                Title = TitleOf(f),
                Kind = KindOf(f.Name),
                Ext = f.Extension.TrimStart('.').ToLowerInvariant(),
                Size = f.Length,
                Modified = Json.Iso(f.LastWriteTime),
            })
            .OrderByDescending(r => r.Modified, StringComparer.Ordinal)
            .ToList();
    }

    public static Dictionary<string, object?> Read(string project, string rel)
    {
        var full = Paths.Resolve(project, rel);
        var fi = new FileInfo(full);
        if (!fi.Exists) throw new FileNotFoundException("Dosya bulunamadı: " + rel);
        var result = new Dictionary<string, object?>
        {
            ["path"] = Paths.Relative(project, full),
            ["name"] = fi.Name,
            ["size"] = fi.Length,
            ["modified"] = Json.Iso(fi.LastWriteTime),
            ["title"] = TitleOf(fi),
        };
        switch (fi.Extension.ToLowerInvariant())
        {
            case ".md":
                var text = Paths.ReadShared(full);
                result["kind"] = "markdown";
                result["html"] = Markdown.ToHtml(text, Pipeline);
                result["words"] = Regex.Matches(text, @"\w+").Count;
                break;
            case ".html":
            case ".htm":
                result["kind"] = "html";
                break;
            case ".txt":
            case ".json":
            case ".csv":
            case ".log":
                var raw = Paths.ReadShared(full);
                result["kind"] = "text";
                result["text"] = raw.Length > 500_000 ? raw[..500_000] + "\n…" : raw;
                break;
            default:
                result["kind"] = "binary";
                break;
        }
        return result;
    }

    static string KindOf(string name) =>
        name.StartsWith("arastirma", StringComparison.OrdinalIgnoreCase) ? "research" :
        name.StartsWith("kontrol", StringComparison.OrdinalIgnoreCase) ? "check" :
        name.StartsWith("gunluk", StringComparison.OrdinalIgnoreCase) ? "journal" : "other";

    static string TitleOf(FileInfo f)
    {
        try
        {
            if (f.Extension.Equals(".md", StringComparison.OrdinalIgnoreCase))
            {
                using var sr = new StreamReader(new FileStream(f.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete));
                for (var i = 0; i < 60 && sr.ReadLine() is { } line; i++)
                    if (line.StartsWith("# ")) return line[2..].Trim().Trim('*');
            }
            else if (f.Extension.StartsWith(".htm", StringComparison.OrdinalIgnoreCase))
            {
                using var sr = new StreamReader(new FileStream(f.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete));
                var buf = new char[8192];
                var n = sr.Read(buf, 0, buf.Length);
                var m = HtmlTitle.Match(new string(buf, 0, n));
                if (m.Success) return System.Net.WebUtility.HtmlDecode(m.Groups[1].Value.Trim());
            }
        }
        catch { }
        return Pretty(f.Name);
    }

    /// "arastirma-acik-bankacilik.md" → "Acik bankacilik"
    static string Pretty(string name)
    {
        var s = System.IO.Path.GetFileNameWithoutExtension(name);
        s = Regex.Replace(s, "^(arastirma|kontrol|gunluk)-", "", RegexOptions.IgnoreCase).Replace('-', ' ').Trim();
        return s.Length == 0 ? name : char.ToUpper(s[0], new CultureInfo("tr-TR")) + s[1..];
    }
}

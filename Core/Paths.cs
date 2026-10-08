namespace AutopilotApp.Core;

public static class Paths
{
    public static string Normalize(string path)
    {
        var full = Path.GetFullPath(path).TrimEnd('\\', '/');
        return full.EndsWith(':') ? full + "\\" : full;   // "D:" değil "D:\"
    }

    /// Proje kökü altındaki göreli yolu tam yola çevirir; kökün dışına çıkmaya izin vermez.
    public static string Resolve(string root, string rel)
    {
        var r = Normalize(root);
        var full = Path.GetFullPath(Path.Combine(r, rel.Replace('/', '\\')));
        var prefix = r.EndsWith('\\') ? r : r + "\\";
        if (!full.Equals(r, StringComparison.OrdinalIgnoreCase) && !full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            throw new UnauthorizedAccessException("Proje klasörü dışındaki dosyalara erişilemez.");
        return full;
    }

    public static string Relative(string root, string full) =>
        Path.GetRelativePath(Normalize(root), full).Replace('\\', '/');

    public static string TasksFile(string project) => Path.Combine(project, "TASKS.md");
    public static string StateDir(string project) => Path.Combine(project, ".autopilot");
    public static string LogsDir(string project) => Path.Combine(project, ".autopilot", "logs");
    public static string ResultsDir(string project) => Path.Combine(project, "sonuclar");

    public static string ProjectName(string project)
    {
        var home = Normalize(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile));
        if (Normalize(project).Equals(home, StringComparison.OrdinalIgnoreCase)) return "Ana klasör";
        var name = Path.GetFileName(Normalize(project));
        return string.IsNullOrEmpty(name) ? project : name;
    }

    /// Başka bir işlem yazarken de okuyabilmek için paylaşımlı okuma.
    public static string ReadShared(string path)
    {
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var sr = new StreamReader(fs, System.Text.Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        return sr.ReadToEnd();
    }
}

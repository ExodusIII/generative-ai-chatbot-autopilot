using System.Text.Json;
using System.Windows.Threading;
using AutopilotApp.Core;
using Microsoft.Web.WebView2.Core;

namespace AutopilotApp;

/// Arayüz (JS) ile uygulama arasındaki mesajlaşma: {id, method, params} → {id, ok, result|error}; olaylar {event, data}.
public sealed class Bridge
{
    public const string Host = "autopilot.internal";
    public const string Origin = "https://" + Host + "/";

    readonly Dispatcher _ui;
    readonly Func<string, JsonElement, Task<object?>> _handler;
    CoreWebView2? _core;

    public Bridge(Dispatcher ui, Func<string, JsonElement, Task<object?>> handler)
    {
        _ui = ui;
        _handler = handler;
    }

    public void Attach(CoreWebView2 core)
    {
        _core = core;
        core.WebMessageReceived += OnMessage;
    }

    async void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith(Origin, StringComparison.OrdinalIgnoreCase)) return;   // sadece kendi sayfamız
        long id = 0;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            id = root.GetProperty("id").GetInt64();
            var method = root.GetProperty("method").GetString() ?? "";
            var args = root.TryGetProperty("params", out var p) ? p.Clone() : default;
            var result = await _handler(method, args);
            Post(new { id, ok = true, result });
        }
        catch (Exception ex)
        {
            var inner = ex is AggregateException { InnerException: { } ie } ? ie : ex;
            Post(new { id, ok = false, error = inner.Message });
        }
    }

    public void Emit(string evt, object? data = null) => Post(new { @event = evt, data });

    void Post(object message)
    {
        var json = JsonSerializer.Serialize(message, Json.Web);
        if (_ui.CheckAccess()) _core?.PostWebMessageAsJson(json);
        else _ui.InvokeAsync(() => _core?.PostWebMessageAsJson(json));
    }
}

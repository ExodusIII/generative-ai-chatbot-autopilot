using System.ComponentModel;
using System.Diagnostics;
using System.Windows;
using AutopilotApp.Core;
using Microsoft.Web.WebView2.Core;

namespace AutopilotApp;

public partial class MainWindow : Window
{
    readonly AppHost _host;
    readonly string? _startView;
    readonly bool _demo;
    bool _exiting;
    bool _webStarted;

    public MainWindow(bool startHidden, string? startView = null, bool demo = false)
    {
        InitializeComponent();
        _startView = startView is "dashboard" or "tasks" or "results" or "logs" or "settings" ? startView : null;
        _demo = demo;
        _host = new AppHost(this);
        RestoreBounds_();
        SourceInitialized += (_, _) => _host.ApplyTheme(_host.IsDark ? "dark" : "light");
        Loaded += async (_, _) => await StartWebAsync();
        Closing += OnClosing;
        if (!startHidden) Show();
    }

    async Task StartWebAsync()
    {
        if (_webStarted) return;
        _webStarted = true;
        try
        {
            Web.DefaultBackgroundColor = _host.IsDark ? System.Drawing.Color.FromArgb(11, 13, 18) : System.Drawing.Color.FromArgb(246, 247, 250);
            var dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ClaudeAutopilot", "WebView2");
            var env = await CoreWebView2Environment.CreateAsync(null, dataDir);
            await Web.EnsureCoreWebView2Async(env);

            var core = Web.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping(Bridge.Host, Path.Combine(AppContext.BaseDirectory, "web"), CoreWebView2HostResourceAccessKind.DenyCors);
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
#if !DEBUG
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
#endif
            // Uygulama dışına gidilmez; web bağlantıları varsayılan tarayıcıda açılır.
            core.NewWindowRequested += (_, e) => { e.Handled = true; OpenExternal(e.Uri); };
            core.NavigationStarting += (_, e) =>
            {
                if (e.Uri.StartsWith(Bridge.Origin, StringComparison.OrdinalIgnoreCase)) return;
                e.Cancel = true;
                OpenExternal(e.Uri);
            };
            _host.Bridge.Attach(core);
            var query = new List<string>();
            if (_startView != null) query.Add("view=" + _startView);
            if (_demo) query.Add("demo=1");   // örnek verilerle aç (tanıtım / ekran görüntüsü)
            core.Navigate(Bridge.Origin + "index.html" + (query.Count > 0 ? "?" + string.Join("&", query) : ""));
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(this, "Microsoft Edge WebView2 Runtime bulunamadı.\nhttps://developer.microsoft.com/microsoft-edge/webview2 adresinden kurup uygulamayı yeniden aç.",
                "Claude Autopilot", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    static void OpenExternal(string uri)
    {
        if (Uri.TryCreate(uri, UriKind.Absolute, out var u) && (u.Scheme == Uri.UriSchemeHttp || u.Scheme == Uri.UriSchemeHttps))
            Process.Start(new ProcessStartInfo(u.AbsoluteUri) { UseShellExecute = true });
    }

    public void ShowFromTray()
    {
        if (!IsVisible) Show();
        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        Activate();
        Topmost = true;
        Topmost = false;
        Focus();
    }

    public void ExitApp()
    {
        _exiting = true;
        Close();
    }

    void OnClosing(object? sender, CancelEventArgs e)
    {
        SaveBounds();
        if (!_exiting && _host.Settings.Value.MinimizeToTray)
        {
            e.Cancel = true;
            Hide();
            _host.ShowTrayHintOnce();
            return;
        }
        _host.Dispose();
        Application.Current.Shutdown();
    }

    void RestoreBounds_()
    {
        var b = _host.Settings.Value.Window;
        if (b is null || b.Width < MinWidth || b.Height < MinHeight) return;
        var onScreen = b.Left >= SystemParameters.VirtualScreenLeft - 20
            && b.Top >= SystemParameters.VirtualScreenTop - 20
            && b.Left + b.Width <= SystemParameters.VirtualScreenLeft + SystemParameters.VirtualScreenWidth + 20
            && b.Top + b.Height <= SystemParameters.VirtualScreenTop + SystemParameters.VirtualScreenHeight + 20;
        if (!onScreen) return;
        WindowStartupLocation = WindowStartupLocation.Manual;
        Left = b.Left;
        Top = b.Top;
        Width = b.Width;
        Height = b.Height;
        if (b.Maximized) WindowState = WindowState.Maximized;
    }

    void SaveBounds()
    {
        var r = WindowState == WindowState.Normal ? new Rect(Left, Top, Width, Height) : RestoreBounds;
        if (r.IsEmpty || r.Width < 100) return;
        _host.Settings.Value.Window = new WindowBounds
        {
            Left = r.Left,
            Top = r.Top,
            Width = r.Width,
            Height = r.Height,
            Maximized = WindowState == WindowState.Maximized,
        };
        try { _host.Settings.Save(); } catch { }
    }
}

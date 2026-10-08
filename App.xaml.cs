using System.Windows;

namespace AutopilotApp;

public partial class App : Application
{
    const string MutexName = "ClaudeAutopilot.SingleInstance";
    const string ShowEventName = "ClaudeAutopilot.Show";

    Mutex? _mutex;
    bool _ownsMutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        _mutex = new Mutex(true, MutexName, out _ownsMutex);
        if (!_ownsMutex)
        {
            // Zaten açık: var olan pencereyi öne getir.
            try { EventWaitHandle.OpenExisting(ShowEventName).Set(); } catch { }
            Shutdown();
            return;
        }

        base.OnStartup(e);
        var viewIndex = Array.IndexOf(e.Args, "--view");
        var startView = viewIndex >= 0 && viewIndex + 1 < e.Args.Length ? e.Args[viewIndex + 1] : null;
        var window = new MainWindow(startHidden: e.Args.Contains("--tray"), startView, demo: e.Args.Contains("--demo"));
        var showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName);
        new Thread(() =>
        {
            while (showEvent.WaitOne()) Dispatcher.InvokeAsync(window.ShowFromTray);
        }) { IsBackground = true, Name = "ShowSignal" }.Start();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        if (_ownsMutex) _mutex?.ReleaseMutex();
        _mutex?.Dispose();
        base.OnExit(e);
    }
}

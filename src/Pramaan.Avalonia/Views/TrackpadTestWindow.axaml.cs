using Avalonia.Controls;
using Avalonia.Input;
using Pramaan.Avalonia.ViewModels;
using System;

namespace Pramaan.Avalonia.Views;

public partial class TrackpadTestWindow : Window
{
    private TrackpadTestViewModel ViewModel => (TrackpadTestViewModel)DataContext!;
    private global::Avalonia.Point _lastPosition;
    private bool _isFirstMove = true;

    public TrackpadTestWindow()
    {
        InitializeComponent();
        
        ViewModel.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(TrackpadTestViewModel.IsComplete) && ViewModel.IsComplete)
            {
                Close();
            }
        };
    }

    private void Window_PointerMoved(object? sender, PointerEventArgs e)
    {
        var currentPosition = e.GetPosition(this);
        
        if (_isFirstMove)
        {
            _lastPosition = currentPosition;
            _isFirstMove = false;
            return;
        }
        
        int deltaX = (int)(currentPosition.X - _lastPosition.X);
        int deltaY = (int)(currentPosition.Y - _lastPosition.Y);
        
        if (Math.Abs(deltaX) > 5 || Math.Abs(deltaY) > 5)
        {
            ViewModel.RegisterMovement(deltaX, deltaY);
        }
        
        _lastPosition = currentPosition;
    }

    private void Window_PointerPressed(object? sender, PointerPressedEventArgs e)
    {
        var properties = e.GetCurrentPoint(this).Properties;
        bool isRightClick = properties.IsRightButtonPressed;
        ViewModel.RegisterClick(isRightClick);
    }

    private void Window_PointerWheelChanged(object? sender, PointerWheelEventArgs e)
    {
        // Avalonia scroll delta is typically smaller (-1.0 to 1.0 per tick) while WPF is 120 per click.
        // The ViewModel might expect integers. Let's multiply by 120 to match WPF scaling roughly
        ViewModel.RegisterScroll((int)(e.Delta.Y * 120));
    }

    public (bool Passed, string Message) GetResult()
    {
        return (ViewModel.Passed, ViewModel.ResultMessage);
    }
}

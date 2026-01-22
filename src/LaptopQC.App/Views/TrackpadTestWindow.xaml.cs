using System.Windows;
using System.Windows.Input;
using LaptopQC.App.ViewModels;

namespace LaptopQC.App.Views;

/// <summary>
/// Trackpad test window - captures mouse movements, clicks, and scroll for testing
/// </summary>
public partial class TrackpadTestWindow : Window
{
    private TrackpadTestViewModel ViewModel => (TrackpadTestViewModel)DataContext;
    private System.Windows.Point _lastPosition;
    private bool _isFirstMove = true;

    public TrackpadTestWindow()
    {
        InitializeComponent();
        
        // Subscribe to completion
        ViewModel.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(TrackpadTestViewModel.IsComplete) && ViewModel.IsComplete)
            {
                DialogResult = ViewModel.Passed;
                Close();
            }
        };
    }

    /// <summary>
    /// Handle mouse movement
    /// </summary>
    private void Window_MouseMove(object sender, MouseEventArgs e)
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
        
        // Only register if there's significant movement
        if (Math.Abs(deltaX) > 5 || Math.Abs(deltaY) > 5)
        {
            ViewModel.RegisterMovement(deltaX, deltaY);
        }
        
        _lastPosition = currentPosition;
    }

    /// <summary>
    /// Handle mouse clicks
    /// </summary>
    private void Window_MouseDown(object sender, MouseButtonEventArgs e)
    {
        bool isRightClick = e.ChangedButton == MouseButton.Right;
        ViewModel.RegisterClick(isRightClick);
    }

    /// <summary>
    /// Handle scroll wheel
    /// </summary>
    private void Window_MouseWheel(object sender, MouseWheelEventArgs e)
    {
        ViewModel.RegisterScroll(e.Delta);
    }

    /// <summary>
    /// Gets the test result
    /// </summary>
    public (bool Passed, string Message) GetResult()
    {
        return (ViewModel.Passed, ViewModel.ResultMessage);
    }
}

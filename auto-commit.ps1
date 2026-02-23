# Auto Git Commit Watcher (Debounced + Safe)
$repo = "C:\Users\mhwen\OneDrive\Documents\GitHub\ClientChat"
$pending = $false
$lastChange = Get-Date

Write-Host "Watching $repo for changes..."

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $repo
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.Filter = "*.*"

$action = {
    param($source, $eventArgs)

    # Ignore OneDrive temp files
    if ($eventArgs.FullPath -match "~\$") { return }

    $global:pending = $true
    $global:lastChange = Get-Date
}

Register-ObjectEvent $watcher Changed -Action $action
Register-ObjectEvent $watcher Created -Action $action
Register-ObjectEvent $watcher Deleted -Action $action
Register-ObjectEvent $watcher Renamed -Action $action

while ($true) {
    Start-Sleep -Seconds 1

    if ($pending -and ((Get-Date) - $lastChange).TotalSeconds -ge 5) {
        Write-Host "Committing changes..."
        git -C $repo add .
        git -C $repo commit -m "Auto-commit from OneDrive" --allow-empty-message --no-edit
        $pending = $false
    }
}
# Auto Git Commit Watcher
$repo = "C:\Users\mhwen\OneDrive\Documents\GitHub\ClientServer"

Write-Host "Watching $repo for changes..."

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $repo
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.Filter = "*.*"

$action = {
    Start-Sleep -Seconds 2  # allow OneDrive to finish syncing

    git -C $repo add .
    git -C $repo commit -m "Auto-commit from OneDrive" --allow-empty-message --no-edit
}

Register-ObjectEvent $watcher Changed -Action $action
Register-ObjectEvent $watcher Created -Action $action
Register-ObjectEvent $watcher Deleted -Action $action
Register-ObjectEvent $watcher Renamed -Action $action

while ($true) { Start-Sleep -Seconds 1 }
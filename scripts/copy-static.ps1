# Post-build: copy static assets into dist/
$dirs = @('data', 'icons', 'css')
foreach ($dir in $dirs) {
    if (Test-Path $dir) { Copy-Item -Path $dir -Destination "dist\$dir" -Recurse -Force }
}
$files = @('sw.js', 'manifest.json')
foreach ($f in $files) {
    if (Test-Path $f) { Copy-Item -Path $f -Destination "dist\$f" -Force }
}
Write-Output "Static assets copied to dist/"

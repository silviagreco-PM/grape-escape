$ErrorActionPreference = 'Stop'
$root = "C:\Users\silvia\OneDrive\Desktop\app-fiscale"
$prefix = 'http://127.0.0.1:3333/'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $root at $prefix"
$mime = @{ '.html'='text/html'; '.js'='application/javascript'; '.css'='text/css'; '.csv'='text/csv'; '.json'='application/json'; '.png'='image/png'; '.jpg'='image/jpeg' }
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = $ctx.Request.Url.LocalPath.TrimStart('/')
    if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
    $path = Join-Path $root $rel
    if (Test-Path $path -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
  } catch { }
}

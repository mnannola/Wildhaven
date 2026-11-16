$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$frames=Get-Content -Raw performance-results/deer-draw-commands.json | ConvertFrom-Json -AsHashtable
$poses=@('deer','deer-walk-2','deer-run-1','deer-graze-2','deer-sleep','deer-family-nurse-2')
$suffixes=@('','-antlerless','-fawn-antlerless')
$bitmap=[Drawing.Bitmap]::new(1320,570)
$canvas=[Drawing.Graphics]::FromImage($bitmap)
$canvas.Clear([Drawing.ColorTranslator]::FromHtml('#728348'))
$canvas.SmoothingMode='AntiAlias'
$font=[Drawing.Font]::new('Arial',11)
function Color($n,$alpha=1){return [Drawing.Color]::FromArgb([int]($alpha*255),([int]$n -shr 16)-band 255,([int]$n -shr 8)-band 255,[int]$n-band 255)}
for($row=0;$row -lt 3;$row++){for($col=0;$col -lt 8;$col++){
 $action=@('walk','run','idle')[$row];$key='deer-'+$action+'-'+($col*2)+'-antlerless'
 $canvas.ResetTransform();$canvas.DrawString($key.Replace('deer','').Replace('-antlerless',' doe').Replace('-fawn doe',' fawn'),$font,[Drawing.Brushes]::White,([single]($col*165+4)),([single]($row*190+7)))
 $canvas.TranslateTransform($col*165+10,$row*190+30);$canvas.ScaleTransform((4/3),(4/3))
 $brush=[Drawing.SolidBrush]::new([Drawing.Color]::Black);$pen=[Drawing.Pen]::new([Drawing.Color]::Black,1);$path=$null;$last=$null
 foreach($command in $frames[$key]){
  $a=@($command | Select-Object -Skip 1)
  switch($command[0]){
   'fillStyle' {$brush.Dispose();$alpha=if($a.Count -gt 1){$a[1]}else{1};$brush=[Drawing.SolidBrush]::new((Color $a[0] $alpha))}
   'lineStyle' {$pen.Dispose();$alpha=if($a.Count -gt 2){$a[2]}else{1};$pen=[Drawing.Pen]::new((Color $a[1] $alpha),[single]$a[0])}
   'fillEllipse' {$canvas.FillEllipse($brush,[single]($a[0]-$a[2]/2),[single]($a[1]-$a[3]/2),[single]$a[2],[single]$a[3])}
   'fillCircle' {$canvas.FillEllipse($brush,[single]($a[0]-$a[2]),[single]($a[1]-$a[2]),[single]($a[2]*2),[single]($a[2]*2))}
   'fillTriangle' {$points=[Drawing.PointF[]]@([Drawing.PointF]::new($a[0],$a[1]),[Drawing.PointF]::new($a[2],$a[3]),[Drawing.PointF]::new($a[4],$a[5]));$canvas.FillPolygon($brush,$points)}
   'beginPath' {if($path){$path.Dispose()};$path=[Drawing.Drawing2D.GraphicsPath]::new();$last=$null}
   'moveTo' {$last=[Drawing.PointF]::new($a[0],$a[1])}
   'lineTo' {$next=[Drawing.PointF]::new($a[0],$a[1]);$path.AddLine($last,$next);$last=$next}
   'strokePath' {$canvas.DrawPath($pen,$path)}
  }
 }
 $brush.Dispose();$pen.Dispose();if($path){$path.Dispose()}
}}
$canvas.Dispose();$font.Dispose();$bitmap.Save((Join-Path $PWD 'performance-results/deer-movement-preview.png'));$bitmap.Dispose()

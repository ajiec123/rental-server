#!/usr/bin/env pwsh
# Test sewa 1 menit via REST API (mirror operator app payload shape).

$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$end = $now + 60000

$session = [ordered]@{
    sessionId       = "sess-test-$now"
    customerName    = 'Andi 1 Menit'
    customerPhone   = '081234567890'
    startTime       = $now
    durationMinutes = 1
    endTime         = $end
    paymentMethod   = 'Cash'
    paymentStatus   = 'Lunas'
    amount          = 5000
    gamePlaying     = 'Coba 1 Menit'
    cashierName     = 'Tester'
}

$tx = [ordered]@{
    id              = "tx-test-$now"
    stationId       = 'st-606393'
    stationName     = 'Station 01'
    durationMinutes = 1
    durationLabel   = '1 Jam'
    paymentMethod   = 'Cash'
    paymentStatus   = 'Lunas'
    amount          = 5000
    formattedAmount = 'Rp 5k'
    timeLabel       = 'now'
    dateLabel       = 'today'
    timestamp       = $now
    cashierName     = 'Tester'
    customerName    = 'Andi 1 Menit'
    consoleType     = 'PS3'
    receiptNumber   = "NEX-TEST-$now"
}

$payload = @{ stationId = 'st-606393'; session = $session; transaction = $tx }
$json = $payload | ConvertTo-Json -Depth 8

$resp = Invoke-WebRequest -Uri http://localhost:3000/api/sessions/start `
    -Method POST -ContentType 'application/json' -Body $json `
    -UseBasicParsing -TimeoutSec 5

Write-Host $resp.Content
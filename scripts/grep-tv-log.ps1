$out = adb -s 192.168.1.14:5555 logcat -d -v time TVReceiver:V '*:S'
"LINES=$($out.Length)"
$out | Select-String -Pattern 'INIT_STATE|pairings|matchStation|renderTimerOverlay|hiding overlay|TV will subscribe|customerName' | Select-Object -First 30
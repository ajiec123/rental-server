$out = adb -s 192.168.1.14:5555 logcat -d -v time TVReceiver:V '*:S'
$out | Select-String -Pattern 'pairings|matchStation|hiding overlay|TV will subscribe|renderTimerOverlay' | Select-Object -First 30
"---END--- length=$($out.Length)"
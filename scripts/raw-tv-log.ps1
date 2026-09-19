$out = adb -s 192.168.1.14:5555 logcat -d -v time TVReceiver:V '*:S'
$out | Select-Object -First 40
"---END--- length=$($out.Length)"
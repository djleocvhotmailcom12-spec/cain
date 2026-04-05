$token = "18GNZ2Z333:JGBVZDFFRMN2WOTCEKQPXWQKFGYYTZMT"
$base = "https://api.mikweb.com.br/v1/admin"
$headers = @{ "Authorization" = "Bearer $token"; "Accept" = "application/json" }

"--- TEST 1: Exactly 'full_name=MARCIO' ---"
Invoke-RestMethod -Uri "$base/customers?full_name=MARCIO" -Headers $headers | Select-Object -ExpandProperty customers | Select-Object full_name -First 1

"--- TEST 2: Exactly 'full_name=MARCIO GUIDA SOARES' ---"
Invoke-RestMethod -Uri "$base/customers?full_name=MARCIO%20GUIDA%20SOARES" -Headers $headers | Select-Object -ExpandProperty customers | Select-Object full_name -First 1

"--- TEST 3: Partial 'full_name=MARCIO' (Checking if it works as partial naturally) ---"
Invoke-RestMethod -Uri "$base/customers?full_name=MARCIO" -Headers $headers | Select-Object -ExpandProperty customers | Measure-Object | Select-Object Count

"--- TEST 4: Attempt 'q=MARCIO' (Many APIs use 'q' for general search) ---"
try {
    Invoke-RestMethod -Uri "$base/customers?q=MARCIO" -Headers $headers | Select-Object -ExpandProperty customers | Select-Object full_name -First 2
} catch { "q=... not supported" }

"--- TEST 5: Attempt 'name=MARCIO' ---"
try {
    Invoke-RestMethod -Uri "$base/customers?name=MARCIO" -Headers $headers | Select-Object -ExpandProperty customers | Select-Object full_name -First 2
} catch { "name=... not supported" }

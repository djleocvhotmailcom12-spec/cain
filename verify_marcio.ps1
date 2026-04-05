$token = "18GNZ2Z333:JGBVZDFFRMN2WOTCEKQPXWQKFGYYTZMT"
$base = "https://api.mikweb.com.br/v1/admin"
$headers = @{ "Authorization" = "Bearer $token"; "Accept" = "application/json" }

"--- Search all clients and filter for MARCIO ---"
$res = Invoke-RestMethod -Uri "$base/customers?limit=100" -Headers $headers
$res.customers | Where-Object { $_.full_name -like "*MARCIO*" } | Select-Object id, full_name | ConvertTo-Json

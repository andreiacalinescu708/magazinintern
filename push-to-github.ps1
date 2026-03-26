# Script pentru a împinge codul pe GitHub folosind API-ul
# Necesită variabila $env:GITHUB_TOKEN

$token = $env:GITHUB_TOKEN
$repoId = "1179108667"
$baseUrl = "https://api.github.com/repositories/$repoId"

if (-not $token) {
    Write-Error "Setează variabila GITHUB_TOKEN"
    exit 1
}

$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
    Accept = "application/vnd.github.v3+json"
}

# Obținem SHA-ul ultimului commit
try {
    $commit = Invoke-RestMethod -Uri "$baseUrl/commits/master" -Headers $headers
    $latestSha = $commit.sha
    Write-Host "Ultimul commit: $latestSha"
} catch {
    Write-Error "Nu pot obține ultimul commit: $_"
    exit 1
}

# Obținem tree-ul curent
try {
    $tree = Invoke-RestMethod -Uri "$baseUrl/git/trees/$latestSha" -Headers $headers
    $baseTreeSha = $tree.sha
    Write-Host "Tree SHA: $baseTreeSha"
} catch {
    Write-Error "Nu pot obține tree-ul: $_"
    exit 1
}

# Funcție pentru a crea un blob
function Create-Blob($content) {
    $body = @{
        content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($content))
        encoding = "base64"
    } | ConvertTo-Json
    
    $blob = Invoke-RestMethod -Uri "$baseUrl/git/blobs" -Method Post -Headers $headers -Body $body
    return $blob.sha
}

# Funcție pentru a crea un tree nou
function Create-Tree($baseTree, $path, $sha) {
    $body = @{
        base_tree = $baseTree
        tree = @(@{
            path = $path
            mode = "100644"
            type = "blob"
            sha = $sha
        })
    } | ConvertTo-Json -Depth 10
    
    $newTree = Invoke-RestMethod -Uri "$baseUrl/git/trees" -Method Post -Headers $headers -Body $body
    return $newTree.sha
}

# Funcție pentru a crea un commit
function Create-Commit($message, $tree, $parent) {
    $body = @{
        message = $message
        tree = $tree
        parents = @($parent)
    } | ConvertTo-Json
    
    $commit = Invoke-RestMethod -Uri "$baseUrl/git/commits" -Method Post -Headers $headers -Body $body
    return $commit.sha
}

# Funcție pentru a actualiza referința
function Update-Ref($sha) {
    $body = @{
        sha = $sha
        force = $true
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "$baseUrl/git/refs/heads/master" -Method Patch -Headers $headers -Body $body | Out-Null
}

Write-Host "Codul este pregătit pentru a fi împins prin API."
Write-Host "Din păcate, această metodă este foarte complexă pentru multe fișiere."
Write-Host ""
Write-Host "RECOMMANDARE: Așteptați câteva minute și încercați din nou comanda:"
Write-Host "  git push origin master"
Write-Host ""
Write-Host "Sau încercați să folosiți GitHub Desktop sau să încărcați manual fișierele."

#!/usr/bin/env powershell
# CMS Build Script for Windows / Cross-platform
# Builds backend, packages (tsdown), and frontend with Bun

param(
    [string]$Environment = "dev",
    [switch]$Release = $false,
    [switch]$Frontend = $true,
    [switch]$Packages = $true,
    [switch]$Backend = $true,
    [switch]$Test = $false
)

# Colors for output
$Reset = "`e[0m"
$Red = "`e[31m"
$Green = "`e[32m"
$Yellow = "`e[33m"
$Blue = "`e[34m"
$Cyan = "`e[36m"

function Write-Status([string]$message, [string]$color = $Cyan) {
    Write-Host "$color[$(Get-Date -Format 'HH:mm:ss')] $message$Reset"
}

function Write-Success([string]$message) {
    Write-Status $message $Green
}

function Write-Error([string]$message) {
    Write-Status $message $Red
}

function Write-Warning([string]$message) {
    Write-Status $message $Yellow
}

$startTime = Get-Date

Write-Status "Starting CMS build (Bun + Tsdown)..."
Write-Status "Environment: $Environment"
Write-Status "Release mode: $Release"
Write-Status "Build packages: $Packages"
Write-Status "Build frontend: $Frontend"
Write-Status "Build backend: $Backend"
Write-Status "Run tests: $Test"
Write-Status ""

$env:CMS_ENV = $Environment

# Step 1: Build Backend
if ($Backend) {
    Write-Status "Building backend..." $Blue
    $cargoArgs = @()
    if ($Release) {
        $cargoArgs += "--release"
    }
    
    try {
        cargo build @cargoArgs
        Write-Success "Backend built successfully"
    }
    catch {
        Write-Error "Backend build failed: $_"
        exit 1
    }
    Write-Status ""
}

# Step 2: Build Workspace Packages with Tsdown
if ($Packages) {
    Write-Status "Building packages with tsdown..." $Blue
    try {
        bun run build:packages
        Write-Success "Packages built successfully"
    }
    catch {
        Write-Error "Packages build failed: $_"
        exit 1
    }
    Write-Status ""
}

# Step 3: Build Frontend
if ($Frontend) {
    Write-Status "Building frontend..." $Blue
    try {
        bun --filter @cms/app run build
        Write-Success "Frontend built successfully"
    }
    catch {
        Write-Error "Frontend build failed: $_"
        exit 1
    }
    Write-Status ""
}

# Step 4: Run Tests
if ($Test) {
    Write-Status "Running tests..." $Blue
    try {
        cargo test
        Write-Success "Rust tests passed"
        bun test
        Write-Success "Workspace tests passed"
    }
    catch {
        Write-Warning "Tests failed: $_"
    }
    Write-Status ""
}

$endTime = Get-Date
$duration = $endTime - $startTime
Write-Success "Build completed in $($duration.TotalSeconds) seconds"

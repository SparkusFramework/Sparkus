# Runs a command pinned to logical CPUs 4-7 at below-normal priority, so it never
# shares a physical core with a pinned bench server (CPUs 2-3) or autocannon (8-15).
# Children inherit both settings from this process.
# Usage: powershell -NoProfile -File scripts/quiet.ps1 "<bash command>"
$self = [System.Diagnostics.Process]::GetCurrentProcess()
$self.ProcessorAffinity = [IntPtr]0xF0
$self.PriorityClass = "BelowNormal"
& bash -c ($args -join " ")
exit $LASTEXITCODE

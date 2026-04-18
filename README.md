# @rampartscan/cli

Rampart Security CLI — scan websites for vulnerabilities from your terminal.

## Installation

```bash
npm install -g @rampartscan/cli
```

Requires Node.js 18+.

## Quick Start

```bash
# Authenticate
rampart auth login --api-key YOUR_API_KEY

# Run a scan (waits for results by default)
rampart scan example.com

# Check your credit balance
rampart credits
```

## Commands

### `rampart scan <domain>`

Run a security scan against a domain. The CLI waits for the scan to complete and displays a live progress view of all 13 scan phases.

```bash
# Run a scan and wait for results
rampart scan example.com

# Output results as JSON
rampart scan example.com --json

# Set a custom timeout (default: 10 minutes)
rampart scan example.com --timeout 15
```

**Options:**

| Flag | Description |
|------|-------------|
| `--json` | Output results as JSON instead of the formatted display |
| `--timeout <minutes>` | Maximum time to wait for scan completion (default: `10`) |

**Default output:**

```
🔍 Starting scan for example.com...

  Setting up asset...
  ✔ DNS Reconnaissance
  ✔ Subdomain Discovery  (3 findings)
  ✔ CT Log Query
  ✔ WHOIS Lookup
  ✔ Security Headers  (2 findings)
  ✔ TLS/SSL Analysis  (1 finding)
  ✔ Path Discovery
  ✔ JS Bundle Analysis
  ✔ CORS Configuration
  ✔ API Spec Discovery
  ✔ Unauthenticated API Testing
  ✔ AI Verification
  ✔ Attack Narrative Enrichment

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Score: 72/100 (Grade C)
  Findings: 6 (1 Critical, 2 High, 2 Medium, 1 Low)

  📄 Full report: https://rampartscan.com/dashboard/scans/42/report
  💳 Credits remaining: 9/10
```

### `rampart scan status <scanId>`

Check the status of a running or completed scan. Returns JSON.

```bash
rampart scan status 42
```

### `rampart scan results <scanId>`

View the full results of a completed scan. Returns JSON.

```bash
rampart scan results 42
```

### `rampart scans list`

List your 10 most recent scans.

```bash
rampart scans list
```

**Output:**

```
  [A 95/100] example.com — completed — 4/16/2026
  [C 72/100] staging.example.com — completed — 4/15/2026
  [? ] test.example.com — running — 4/15/2026
```

### `rampart auth login`

Authenticate with your Rampart API key. Supports interactive prompt or inline flag.

```bash
# Interactive prompt
rampart auth login

# Provide key directly
rampart auth login --api-key YOUR_API_KEY
```

### `rampart auth status`

Check whether you're authenticated and display a masked version of the stored key.

```bash
rampart auth status
# ✅ Authenticated (rmp_live...x4k2)
```

### `rampart auth logout`

Remove the saved API key from local config.

```bash
rampart auth logout
# ✅ Logged out.
```

### `rampart credits`

Check your scan credit balance.

```bash
rampart credits
```

**Output:**

```
  Plan: pro
  Credits: 9/10
  Used: 1
  Resets: 5/1/2026
```

## CI/CD Integration

Use `--json` to get machine-readable output for CI/CD pipelines:

```yaml
# GitHub Actions
- name: Security Scan
  env:
    RAMPART_API_KEY: ${{ secrets.RAMPART_API_KEY }}
  run: npx @rampartscan/cli scan example.com --json
```

**Fail on critical findings:**

```yaml
- name: Security Scan
  env:
    RAMPART_API_KEY: ${{ secrets.RAMPART_API_KEY }}
  run: |
    npx @rampartscan/cli scan example.com --json > results.json
    CRITICAL=$(jq '.severity_counts.critical // 0' results.json)
    if [ "$CRITICAL" -gt 0 ]; then
      echo "❌ $CRITICAL critical findings detected"
      exit 1
    fi
```

## Claude Code Integration

Rampart includes a ready-made Claude Code slash command. Add it to any project so Claude can run security scans for you:

```bash
# Copy the command into your project
mkdir -p .claude/commands
cp node_modules/@rampartscan/cli/.claude/commands/security-scan.md .claude/commands/

# Or curl it directly
mkdir -p .claude/commands
curl -fsSL https://raw.githubusercontent.com/RampartScan/cli/main/.claude/commands/security-scan.md \
  -o .claude/commands/security-scan.md
```

Then in Claude Code:

```
/project:security-scan example.com
```

Claude will install the CLI if needed, run the scan, and give you a prioritized list of fixes with code changes specific to your project.

## Configuration

### Config File

Credentials are stored at:

```
~/.config/rampart-cli/config.json
```

The file is created with restrictive permissions (`600` for the file, `700` for the directory).

### Environment Variables

| Variable | Description |
|----------|-------------|
| `RAMPART_API_KEY` | API key — overrides the stored config value |
| `RAMPART_API_URL` | API base URL (default: `https://api.rampartscan.com`) |

Environment variables take precedence over the config file.

## License

MIT

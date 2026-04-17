# @rampartscan/cli

Rampart Security CLI — scan websites for vulnerabilities from your terminal.

## Installation

```bash
npm install -g @rampartscan/cli
```

Requires Node.js 18+.

## Quick Start

```bash
# Option 1: Start a free trial (1 scan, no credit card)
rampart auth trial

# Option 2: Authenticate with an API key
rampart auth login --api-key YOUR_API_KEY

# Run a scan (waits for results by default)
rampart scan example.com

# Check your credit balance
rampart credits
```

> **Tip:** If you run `rampart scan` without authenticating first, the CLI will
> interactively prompt you to start a trial or enter an API key.

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

**Trial account output** shows trial-specific credit info after the scan:

```
  💳 Trial scans remaining: 0/1 (expires 5/17/2026)
  ⭐ Upgrade for unlimited scans: https://rampartscan.com/pricing
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

### `rampart auth trial`

Start a free trial or check the status of an existing one. No credit card required — get 1 free scan to try Rampart.

The trial flow:
1. Enter your email address
2. Receive a 6-digit verification code
3. Enter the code to activate your trial

```bash
rampart auth trial
```

**Starting a new trial:**

```
🚀 Try Rampart free — 1 scan, no credit card required.

Email: you@example.com

📧 We sent a 6-digit code to you@example.com

Verification code: 123456

✅ Trial activated for you@example.com
   1 scan remaining (expires 5/17/2026)
```

**Checking an existing trial:**

```
✅ Trial account (you@example.com)
   Scans remaining: 1/1
   Expires: 5/17/2026

⭐ Upgrade for unlimited scans: https://rampartscan.com/pricing
```

### `rampart auth status`

Check whether you're authenticated and display account info.

```bash
rampart auth status
```

**With an API key:**

```
✅ Authenticated (rmp_live...x4k2)
```

**With a trial account:**

```
✅ Trial account (you@example.com)
   Scans: 1/1 remaining
   Expires: 5/17/2026

⭐ Upgrade for unlimited scans: https://rampartscan.com/pricing
```

**With an expired trial:**

```
⚠️  Trial expired (you@example.com)
   Scans: 0/1 remaining
   Expires: 4/17/2026

⭐ Upgrade for unlimited scans: https://rampartscan.com/pricing
```

### `rampart auth logout`

Remove the saved API key and trial info from local config.

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

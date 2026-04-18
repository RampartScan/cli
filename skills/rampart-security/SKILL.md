---
name: rampart-security
description: Run Rampart security scans on web applications from your AI agent. Installs the CLI, handles auth, scans domains, and provides actionable fix recommendations.
---

# Rampart Security Scan

Scan web applications for security vulnerabilities using [Rampart](https://rampartscan.com). Performs comprehensive, non-intrusive scanning with AI-powered verification and attack narrative enrichment.

## What It Scans

13 phases covering:
- DNS reconnaissance & subdomain discovery
- Security header analysis (CSP, HSTS, X-Frame-Options, etc.)
- TLS/SSL configuration review
- Path & API endpoint discovery
- JavaScript bundle analysis for leaked secrets/API keys
- CORS misconfiguration detection
- AI-powered false positive filtering
- Attack narrative generation for each finding

## Setup

Install the CLI globally if not already available:

```bash
npm install -g @rampartscan/cli
```

Authenticate — if `RAMPART_API_KEY` is not set in the environment, run:

```bash
rampart auth login
```

This opens the browser to create an account and get a free trial API key (1 free scan credit included).

## Running a Scan

```bash
# Scan a domain (human-readable output)
rampart scan example.com

# Scan with JSON output (for programmatic use)
rampart scan example.com --json

# Check credit balance
rampart credits
```

## Interpreting Results

After running a scan:

1. **Report the security score and grade** (e.g., "Score: 78/100, Grade B")
2. **List all findings by severity** — critical and high first
3. **For each finding**, explain:
   - What the vulnerability is
   - Why it matters (real-world attack scenario)
   - How to fix it with specific code changes for this project
4. **Create a prioritized action plan** ordered by impact and effort
5. **Save JSON results** to `security-scan-results.json` in the project root when using `--json`

## Other Commands

```bash
# List recent scans
rampart scans list

# Check a specific scan's status
rampart scan status <scanId>

# View full scan results
rampart scan results <scanId>

# Auth management
rampart auth login          # authenticate
rampart auth login --api-key <key>  # authenticate with key directly
rampart auth status         # check auth status
rampart auth logout         # remove saved credentials
```

## CI/CD Integration

```yaml
# GitHub Actions example
- name: Security Scan
  env:
    RAMPART_API_KEY: ${{ secrets.RAMPART_API_KEY }}
  run: |
    npx @rampartscan/cli scan example.com --json > results.json
    CRITICAL=$(jq '.severity_counts.critical // 0' results.json)
    if [ "$CRITICAL" -gt 0 ]; then
      echo "❌ $CRITICAL critical findings"
      exit 1
    fi
```

## Important Notes

- Scans are **passive and non-intrusive** — they detect vulnerabilities without exploiting them
- Each scan costs 1 credit — check balance with `rampart credits`
- Full interactive report available at the URL in scan output
- Environment variable `RAMPART_API_KEY` overrides stored config

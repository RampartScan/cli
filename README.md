# @rampart/cli

Rampart Security CLI — scan websites for vulnerabilities from your terminal.

## Installation

```bash
npm install -g @rampart/cli
```

## Quick Start

```bash
# Authenticate
rampart auth login --api-key YOUR_API_KEY

# Run a scan
rampart scan example.com --wait

# Check credits
rampart credits
```

## Commands

| Command | Description |
|---------|-------------|
| `rampart scan <domain>` | Start a scan |
| `rampart scan <domain> --wait` | Start and wait for results |
| `rampart scan <domain> --wait --json` | JSON output for CI/CD |
| `rampart scans list` | List recent scans |
| `rampart credits` | Check credit balance |
| `rampart auth login` | Authenticate |
| `rampart auth status` | Check auth status |

## CI/CD

```yaml
- name: Security Scan
  env:
    RAMPART_API_KEY: ${{ secrets.RAMPART_API_KEY }}
  run: |
    npx @rampart/cli scan example.com --wait --json > results.json
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `RAMPART_API_KEY` | API key (alternative to `rampart auth login`) |
| `RAMPART_API_URL` | Custom API URL (default: production) |

# Rampart Security CLI

Rampart is a security scanning tool for web applications. When installed globally (`npm install -g @rampartscan/cli`), it provides the `rampart` command.

## Quick Reference

```bash
# Authenticate (opens browser for free trial signup)
rampart auth login

# Or set API key directly
rampart auth login --api-key <key>
# Or via env var: export RAMPART_API_KEY=<key>

# Scan a domain
rampart scan example.com

# Scan with JSON output (for programmatic use)
rampart scan example.com --json

# Check credit balance
rampart credits

# List recent scans
rampart scans list

# Check scan status / results
rampart scan status <scanId>
rampart scan results <scanId>
```

## What Rampart Scans

13 scan phases covering:
- DNS recon, subdomain discovery, CT logs, WHOIS
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- TLS/SSL analysis
- Path & API endpoint discovery
- JS bundle secret scanning
- CORS misconfiguration
- AI-powered false positive filtering
- Attack narrative generation

## Custom Command

Use `/project:security-scan <domain>` to run a full scan and get actionable fix recommendations for this project.

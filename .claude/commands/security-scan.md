---
description: Run a Rampart security scan on a domain or the current project's domain
allowed-tools: Bash, Read, Glob
---

## Rampart Security Scan

Run an external security scan against a web application using the Rampart CLI. This performs a comprehensive, non-intrusive scan covering:

- DNS reconnaissance & subdomain discovery
- Security header analysis (CSP, HSTS, X-Frame-Options, etc.)
- TLS/SSL configuration review
- Path & API endpoint discovery
- JavaScript bundle analysis for leaked secrets
- CORS misconfiguration detection
- AI-powered verification to filter false positives
- Attack narrative enrichment for each finding

### Setup (one-time)

If `rampart` is not installed, install it:

```bash
npm install -g @rampartscan/cli
```

If not authenticated, check for `RAMPART_API_KEY` in the environment. If missing, run:

```bash
rampart auth login
```

This opens `rampartscan.com/cli/sign-up` in your browser to create an account and get a free trial API key (includes 1 free scan credit).

### Run the scan

Scan the target domain. If no domain is provided via `$ARGUMENTS`, look for a domain in the project — check `package.json` homepage, `vercel.json`, `.env*` files, or `README.md` for a likely production URL. If you still can't determine one, ask the user.

```bash
rampart scan $ARGUMENTS --json
```

### Interpret results

After the scan completes:

1. **Report the security score and grade** (e.g., "Score: 78/100, Grade B")
2. **List all findings by severity** — critical and high first
3. **For each finding**, explain:
   - What the vulnerability is
   - Why it matters (the real-world attack scenario)
   - How to fix it with specific code changes for this project
4. **Create a prioritized action plan** — order fixes by impact and effort
5. **If `--json` output is available**, save results to `security-scan-results.json` in the project root

### Important notes

- Rampart scans are **passive and non-intrusive** — they don't exploit vulnerabilities, only detect them
- Each scan costs 1 credit. Check balance with `rampart credits`
- Full interactive report available at the URL in the scan output

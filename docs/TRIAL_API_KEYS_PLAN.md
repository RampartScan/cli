# Trial API Keys — Implementation Plan

**Feature:** Email-gated trial API keys for RampartScan CLI  
**Date:** 2026-04-17  
**Status:** Draft

---

## 1. Overview

Today, using the RampartScan CLI requires a paid account. A user must:
1. Sign up at rampartscan.com
2. Subscribe to a plan
3. Generate an API key in the dashboard
4. Paste it into `rampart auth login`

This creates massive friction for developers who just want to try the product. Most will bounce before step 2.

**Trial API keys** let anyone run a scan in under 60 seconds:

```
$ rampart scan example.com
→ No API key found. Enter your email for a free trial (3 scans, 7 days):
→ Email: dev@company.com
→ Check your email for a 6-digit code.
→ Code: 482901
→ ✅ Trial activated! Starting scan...
```

No credit card. No dashboard. No friction. The CLI becomes the top of the funnel.

### Why This Matters

- **Developer-first acquisition** — security tools sell through the CLI, not landing pages
- **Viral loop** — trial users share scan results; recipients want to try it too
- **Qualification** — email capture gives us a lead for follow-up regardless of conversion
- **Low risk** — 3 scans over 7 days is enough to impress, not enough to abuse

---

## 2. User Experience (CLI Flow)

### 2.1 First Run — No API Key

```
$ rampart scan example.com

  ⚠️  No API key configured.

  Try Rampart free — 3 scans, no credit card required.
  
  Email: developer@company.com

  📧 We sent a 6-digit code to developer@company.com
  Code: 847293

  ✅ Trial activated! (3 scans remaining, expires Apr 24)

🔍 Starting scan for example.com...

  ✔ DNS Reconnaissance
  ✔ Subdomain Discovery  (2 findings)
  ✔ CT Log Query
  ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Score: 72/100 (Grade C)
  Findings: 14 (1 Critical, 3 High, 6 Medium, 4 Low)

  📄 Full report: https://rampartscan.com/dashboard/scans/42/report
  💳 Trial scans remaining: 2/3 (expires Apr 24)

  ⭐ Upgrade for unlimited scans: https://rampartscan.com/pricing
```

### 2.2 Subsequent Runs (Trial Active)

```
$ rampart scan another-domain.com

🔍 Starting scan for another-domain.com...
  ...
  💳 Trial scans remaining: 1/3 (expires Apr 24)
```

### 2.3 Trial Exhausted (Scans Used Up)

```
$ rampart scan third-domain.com

  ❌ Trial limit reached (3/3 scans used).

  Upgrade to keep scanning: https://rampartscan.com/pricing
  Already have an account? Run: rampart auth login
```

### 2.4 Trial Expired (Time Ran Out)

```
$ rampart scan example.com

  ❌ Trial expired (was valid until Apr 24).

  Upgrade to keep scanning: https://rampartscan.com/pricing
  Already have an account? Run: rampart auth login
```

### 2.5 `rampart auth status` — Trial User

```
$ rampart auth status

  ✅ Trial account (developer@company.com)
  Scans: 1/3 remaining
  Expires: Apr 24, 2026
  
  Upgrade: https://rampartscan.com/pricing
```

### 2.6 `rampart auth status` — Paid User (Unchanged)

```
$ rampart auth status

  ✅ Authenticated (rsk_a1b2c3d4...ef90)
```

### 2.7 Explicit Trial Command

```
$ rampart auth trial

  Try Rampart free — 3 scans, no credit card required.
  
  Email: developer@company.com
  📧 Code sent. Check your email.
  Code: 847293

  ✅ Trial activated! Run: rampart scan <domain>
```

### 2.8 User Already Has Trial

```
$ rampart auth trial

  Email: developer@company.com

  ⚠️  You already have an active trial (2 scans remaining, expires Apr 24).
  Your existing trial key has been restored.
```

---

## 3. Backend Changes

### 3.1 Architecture Decision: Clerk API Keys

The existing system already uses **Clerk's API Keys** (`clerkClient.apiKeys.create()`) for paid users. Trial keys should use the same mechanism with metadata to distinguish them.

**Why Clerk API Keys (not custom tokens):**
- Same auth path — the backend already validates Clerk API keys in the proxy layer
- No new token verification code needed
- Key revocation and expiry managed by Clerk
- Consistent `rsk_*` key format

**Trial metadata** is stored in the Clerk API key's `meta` field and in a lightweight `trial_keys` table for query/enforcement.

### 3.2 New Endpoint: `POST /security_sauron/auth/trial`

Initiates a trial by creating/finding a Clerk user and sending an email OTP.

**Route:** `src/app/api/auth/trial/route.ts`

```typescript
import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

// Rate limit: 5 requests per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  // --- Rate limiting ---
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const bucket = rateLimitMap.get(ip);
  if (bucket && bucket.resetAt > now && bucket.count >= 5) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 }
    );
  }
  if (!bucket || bucket.resetAt <= now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 3600_000 });
  } else {
    bucket.count++;
  }

  const body = await req.json();
  const { email } = body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const client = await clerkClient();

    // Find or create user
    let userId: string;
    const existing = await client.users.getUserList({
      emailAddress: [normalizedEmail],
    });

    if (existing.data.length > 0) {
      userId = existing.data[0].id;
    } else {
      // Create a new user — Clerk will block disposable emails
      // if configured in Clerk Dashboard > Email & Phone > Block disposable emails
      const newUser = await client.users.createUser({
        emailAddress: [normalizedEmail],
        skipPasswordRequirement: true,
      });
      userId = newUser.id;
    }

    // Create an email verification OTP via Clerk
    // Use Clerk's Email Code verification strategy
    const verification = await client.emailAddresses.createEmailAddress({
      userId,
      emailAddress: normalizedEmail,
      primary: true,
      verified: false,
    });

    // Trigger the OTP email
    // Clerk sends a verification code when prepareVerification is called
    // via the Clerk Frontend API. For backend-initiated OTP, we use
    // a custom approach: generate a 6-digit code, store it, send via email.
    //
    // Alternative: Use Clerk's built-in OTP flow via signIn.create()
    // For server-initiated, we'll generate + email ourselves.
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(now + 10 * 60 * 1000); // 10 minute expiry

    // Store verification state (Redis preferred; in-memory for MVP)
    // In production, use Vercel KV or Upstash Redis
    await storeVerification(normalizedEmail, {
      code,
      userId,
      expiresAt: expiresAt.toISOString(),
      attempts: 0,
    });

    // Send the code via email (use Clerk's email template or Resend)
    await sendOtpEmail(normalizedEmail, code);

    return NextResponse.json({
      ok: true,
      message: "Verification code sent",
      email: normalizedEmail,
      expiresIn: 600, // seconds
    });
  } catch (err: any) {
    console.error("Trial initiation failed:", err);

    // Clerk throws specific errors for blocked emails
    if (err.errors?.[0]?.code === "form_identifier_not_found" ||
        err.errors?.[0]?.code === "form_param_value_invalid") {
      return NextResponse.json(
        { error: "This email cannot be used for trials." },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: "Failed to initiate trial. Try again." },
      { status: 500 }
    );
  }
}
```

**Request:**
```json
{ "email": "developer@company.com" }
```

**Response (success):**
```json
{
  "ok": true,
  "message": "Verification code sent",
  "email": "developer@company.com",
  "expiresIn": 600
}
```

**Response (error — disposable email):**
```json
{
  "error": "This email cannot be used for trials."
}
```

**Response (error — rate limited):**
```json
{
  "error": "Too many requests. Try again later."
}
```

### 3.3 New Endpoint: `POST /security_sauron/auth/trial/verify`

Verifies the OTP, provisions a trial API key, and returns it.

**Route:** `src/app/api/auth/trial/verify/route.ts`

```typescript
import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const TRIAL_SCAN_LIMIT = 3;
const TRIAL_DURATION_DAYS = 7;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, code } = body;

  if (!email || !code) {
    return NextResponse.json(
      { error: "Email and code are required" },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Retrieve stored verification
  const verification = await getVerification(normalizedEmail);

  if (!verification) {
    return NextResponse.json(
      { error: "No pending verification. Request a new code." },
      { status: 404 }
    );
  }

  // Check expiry
  if (new Date(verification.expiresAt) < new Date()) {
    await deleteVerification(normalizedEmail);
    return NextResponse.json(
      { error: "Code expired. Request a new one." },
      { status: 410 }
    );
  }

  // Check attempts (max 5)
  if (verification.attempts >= 5) {
    await deleteVerification(normalizedEmail);
    return NextResponse.json(
      { error: "Too many attempts. Request a new code." },
      { status: 429 }
    );
  }

  // Verify code
  if (verification.code !== code.trim()) {
    verification.attempts++;
    await storeVerification(normalizedEmail, verification);
    return NextResponse.json(
      { error: "Invalid code. Try again." },
      { status: 401 }
    );
  }

  // Code is valid — clean up
  await deleteVerification(normalizedEmail);
  const userId = verification.userId;

  try {
    const client = await clerkClient();

    // Check if user already has an active trial key
    const existingKeys = await (client as any).apiKeys.getAll({
      subject: userId,
    });
    const keys = Array.isArray(existingKeys)
      ? existingKeys
      : (existingKeys as any).data ?? [];

    const existingTrial = keys.find(
      (k: any) => !k.revoked && k.meta?.trial === true
    );

    if (existingTrial) {
      // Return existing trial info
      const trialRecord = await getTrialRecord(userId);
      return NextResponse.json({
        ok: true,
        existing: true,
        apiKey: existingTrial.secret, // Clerk returns the key on getAll
        trial: {
          email: normalizedEmail,
          scansUsed: trialRecord?.scansUsed ?? 0,
          scanLimit: TRIAL_SCAN_LIMIT,
          expiresAt: trialRecord?.expiresAt,
        },
      });
    }

    // Provision new trial API key via Clerk
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TRIAL_DURATION_DAYS);

    const apiKey = await (client as any).apiKeys.create({
      name: `Trial — ${normalizedEmail}`,
      subject: userId,
      meta: {
        trial: true,
        email: normalizedEmail,
        scanLimit: TRIAL_SCAN_LIMIT,
        expiresAt: expiresAt.toISOString(),
      },
    });

    // Create trial record in database
    await createTrialRecord({
      userId,
      email: normalizedEmail,
      apiKeyId: apiKey.id,
      scanLimit: TRIAL_SCAN_LIMIT,
      scansUsed: 0,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    });

    // Mark user's email as verified in Clerk
    const user = await client.users.getUser(userId);
    const emailObj = user.emailAddresses.find(
      (e: any) => e.emailAddress === normalizedEmail
    );
    if (emailObj && !emailObj.verification?.status) {
      // Verification handled via our custom OTP
      await client.users.updateUser(userId, {
        publicMetadata: {
          ...user.publicMetadata,
          trialActivated: true,
          trialActivatedAt: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      existing: false,
      apiKey: apiKey.secret,
      trial: {
        email: normalizedEmail,
        scansUsed: 0,
        scanLimit: TRIAL_SCAN_LIMIT,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (err: any) {
    console.error("Trial verification failed:", err);
    return NextResponse.json(
      { error: "Failed to provision trial. Try again." },
      { status: 500 }
    );
  }
}
```

**Request:**
```json
{
  "email": "developer@company.com",
  "code": "847293"
}
```

**Response (new trial):**
```json
{
  "ok": true,
  "existing": false,
  "apiKey": "rsk_a1b2c3d4e5f6...",
  "trial": {
    "email": "developer@company.com",
    "scansUsed": 0,
    "scanLimit": 3,
    "expiresAt": "2026-04-24T19:13:00.000Z"
  }
}
```

**Response (existing trial restored):**
```json
{
  "ok": true,
  "existing": true,
  "apiKey": "rsk_a1b2c3d4e5f6...",
  "trial": {
    "email": "developer@company.com",
    "scansUsed": 1,
    "scanLimit": 3,
    "expiresAt": "2026-04-24T19:13:00.000Z"
  }
}
```

**Response (invalid code):**
```json
{ "error": "Invalid code. Try again." }
```

### 3.4 New Endpoint: `GET /security_sauron/auth/trial/status`

Returns trial status for a given API key. Used by `rampart auth status`.

**Route:** `src/app/api/auth/trial/status/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the API key via Clerk and check trial metadata
  const keyData = await verifyApiKey(apiKey);
  if (!keyData) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  if (!keyData.meta?.trial) {
    return NextResponse.json({
      trial: false,
    });
  }

  const trialRecord = await getTrialRecord(keyData.subject);

  return NextResponse.json({
    trial: true,
    email: trialRecord?.email || keyData.meta.email,
    scansUsed: trialRecord?.scansUsed ?? 0,
    scanLimit: trialRecord?.scanLimit ?? 3,
    scansRemaining: Math.max(
      0,
      (trialRecord?.scanLimit ?? 3) - (trialRecord?.scansUsed ?? 0)
    ),
    expiresAt: trialRecord?.expiresAt || keyData.meta.expiresAt,
    expired: new Date(trialRecord?.expiresAt || keyData.meta.expiresAt) < new Date(),
  });
}
```

**Response:**
```json
{
  "trial": true,
  "email": "developer@company.com",
  "scansUsed": 1,
  "scanLimit": 3,
  "scansRemaining": 2,
  "expiresAt": "2026-04-24T19:13:00.000Z",
  "expired": false
}
```

### 3.5 Trial Enforcement on Scan Endpoint

The scan creation endpoint (`POST /security_sauron/scans`) in the general_backend already validates the API key. We need to add trial-specific checks.

**Where:** In the general_backend's scan creation handler (Python/FastAPI).

```python
# In the scan creation endpoint (general_backend)

async def create_scan(request: ScanRequest, api_key: APIKeyData = Depends(verify_api_key)):
    # --- Trial enforcement ---
    if api_key.meta.get("trial"):
        trial = await get_trial_record(api_key.subject)
        
        if not trial:
            raise HTTPException(status_code=403, detail={
                "code": "TRIAL_NOT_FOUND",
                "message": "Trial record not found."
            })
        
        # Check expiry
        if datetime.fromisoformat(trial["expires_at"]) < datetime.utcnow():
            raise HTTPException(status_code=403, detail={
                "code": "TRIAL_EXPIRED",
                "message": "Trial expired.",
                "expires_at": trial["expires_at"],
                "upgrade_url": "https://rampartscan.com/pricing"
            })
        
        # Check scan limit
        if trial["scans_used"] >= trial["scan_limit"]:
            raise HTTPException(status_code=403, detail={
                "code": "TRIAL_EXHAUSTED",
                "message": f"Trial limit reached ({trial['scan_limit']}/{trial['scan_limit']} scans used).",
                "scans_used": trial["scans_used"],
                "scan_limit": trial["scan_limit"],
                "upgrade_url": "https://rampartscan.com/pricing"
            })
        
        # Increment scan count
        await increment_trial_scans(api_key.subject)
    
    # ... existing scan logic continues ...
```

**Error response shapes the CLI must handle:**

```json
// TRIAL_EXPIRED
{
  "detail": {
    "code": "TRIAL_EXPIRED",
    "message": "Trial expired.",
    "expires_at": "2026-04-24T19:13:00.000Z",
    "upgrade_url": "https://rampartscan.com/pricing"
  }
}

// TRIAL_EXHAUSTED
{
  "detail": {
    "code": "TRIAL_EXHAUSTED",
    "message": "Trial limit reached (3/3 scans used).",
    "scans_used": 3,
    "scan_limit": 3,
    "upgrade_url": "https://rampartscan.com/pricing"
  }
}
```

### 3.6 Clerk API Usage Summary

| Action | Method | Notes |
|--------|--------|-------|
| Find user by email | `clerkClient.users.getUserList({ emailAddress: [email] })` | Returns list; check `.data.length` |
| Create user (no password) | `clerkClient.users.createUser({ emailAddress: [email], skipPasswordRequirement: true })` | Clerk blocks disposable emails if enabled in dashboard |
| Create API key | `clerkClient.apiKeys.create({ name, subject: userId, meta: {...} })` | Returns `{ id, secret }` — `secret` is the raw key |
| List user's API keys | `clerkClient.apiKeys.getAll({ subject: userId })` | Filter by `meta.trial` |
| Revoke API key | `clerkClient.apiKeys.revoke(keyId)` | Used if trial needs force-expiry |
| Update user metadata | `clerkClient.users.updateUser(userId, { publicMetadata: {...} })` | Track trial activation |

### 3.7 OTP Email Delivery

Two options for sending the verification code:

**Option A: Resend (Recommended)**  
The team already has Resend set up. Send a branded email:

```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOtpEmail(email: string, code: string): Promise<void> {
  await resend.emails.send({
    from: "Rampart Security <noreply@rampartscan.com>",
    to: email,
    subject: `${code} — Your Rampart verification code`,
    html: `
      <h2>Your verification code</h2>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">${code}</p>
      <p>Enter this code in your terminal to activate your free trial.</p>
      <p>This code expires in 10 minutes.</p>
      <br/>
      <p style="color: #666; font-size: 12px;">
        If you didn't request this, you can safely ignore this email.
      </p>
    `,
  });
}
```

**Option B: Clerk Email Templates**  
Configure a custom email template in Clerk Dashboard for OTP verification. More integrated but less flexible.

**Recommendation:** Use Resend — it's already in the stack, gives full control over branding, and has better deliverability tracking.

### 3.8 Verification State Storage

OTP codes need temporary storage (10-minute TTL). Options:

| Storage | Pros | Cons | Recommended? |
|---------|------|------|:---:|
| **Vercel KV (Upstash Redis)** | Persistent, TTL-native, no cold starts | Slight cost ($0.10/10K commands) | ✅ Production |
| **In-memory Map** | Zero setup, fast | Lost on redeploy, no horizontal scaling | MVP only |
| **Database row** | Already have DB | Needs cleanup job, heavier | ❌ |

**Recommended approach:** Use Vercel KV with a simple wrapper:

```typescript
import { kv } from "@vercel/kv";

interface VerificationState {
  code: string;
  userId: string;
  expiresAt: string;
  attempts: number;
}

async function storeVerification(email: string, state: VerificationState) {
  await kv.set(`trial:otp:${email}`, JSON.stringify(state), { ex: 600 }); // 10 min TTL
}

async function getVerification(email: string): Promise<VerificationState | null> {
  const raw = await kv.get<string>(`trial:otp:${email}`);
  return raw ? JSON.parse(raw) : null;
}

async function deleteVerification(email: string) {
  await kv.del(`trial:otp:${email}`);
}
```

---

## 4. CLI Changes

### 4.1 Config Changes

Extend the config interface to store trial metadata alongside the API key:

**`src/config.ts` changes:**

```typescript
interface Config {
  apiKey: string;
  apiUrl: string;
  trial?: {
    email: string;
    scanLimit: number;
    scansUsed: number;
    expiresAt: string;
  };
}

// New helpers
export function getTrialInfo(): Config["trial"] | null {
  const config = readConfig();
  return config.trial ?? null;
}

export function setTrialInfo(trial: Config["trial"]): void {
  const config = readConfig();
  config.trial = trial;
  writeConfig(config);
}

export function clearTrialInfo(): void {
  const config = readConfig();
  delete config.trial;
  writeConfig(config);
}

export function isTrialKey(): boolean {
  return !!readConfig().trial;
}
```

**Config file example (trial user):**
```json
{
  "apiKey": "rsk_a1b2c3d4e5f6...",
  "apiUrl": "https://api.rampartscan.com",
  "trial": {
    "email": "developer@company.com",
    "scanLimit": 3,
    "scansUsed": 0,
    "expiresAt": "2026-04-24T19:13:00.000Z"
  }
}
```

### 4.2 New API Methods

Add trial-specific methods to `src/api.ts`:

```typescript
// These don't require an API key — add to RampartAPI as static methods
// or create a separate Trial client

export class TrialAPI {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.RAMPART_API_URL || "https://api.rampartscan.com";
  }

  async requestTrial(email: string): Promise<{
    ok: boolean;
    message: string;
    email: string;
    expiresIn: number;
  }> {
    const res = await fetch(`${this.baseUrl}/auth/trial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return body;
  }

  async verifyTrial(email: string, code: string): Promise<{
    ok: boolean;
    existing: boolean;
    apiKey: string;
    trial: {
      email: string;
      scansUsed: number;
      scanLimit: number;
      expiresAt: string;
    };
  }> {
    const res = await fetch(`${this.baseUrl}/auth/trial/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return body;
  }

  async getTrialStatus(apiKey: string): Promise<{
    trial: boolean;
    email?: string;
    scansUsed?: number;
    scanLimit?: number;
    scansRemaining?: number;
    expiresAt?: string;
    expired?: boolean;
  }> {
    const res = await fetch(`${this.baseUrl}/auth/trial/status`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return body;
  }
}
```

### 4.3 Trial Flow Function

Shared logic for the interactive trial sign-up, used by both `auth trial` and the auto-trigger:

**`src/trial.ts`:**

```typescript
import * as readline from "readline";
import { TrialAPI } from "./api";
import { setApiKey, setTrialInfo } from "./config";

export async function runTrialFlow(): Promise<boolean> {
  const trialApi = new TrialAPI();

  console.log("\n  Try Rampart free — 3 scans, no credit card required.\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  try {
    // Step 1: Get email
    const email = (await ask("  Email: ")).trim();
    if (!email || !email.includes("@")) {
      console.log("\n  ❌ Invalid email.\n");
      return false;
    }

    // Step 2: Request OTP
    try {
      await trialApi.requestTrial(email);
    } catch (err: any) {
      console.log(`\n  ❌ ${err.message}\n`);
      return false;
    }

    console.log(`\n  📧 We sent a 6-digit code to ${email}`);

    // Step 3: Get code (allow 3 attempts)
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = (await ask("  Code: ")).trim();
      if (!code) continue;

      try {
        const result = await trialApi.verifyTrial(email, code);

        // Save to config
        setApiKey(result.apiKey);
        setTrialInfo({
          email: result.trial.email,
          scanLimit: result.trial.scanLimit,
          scansUsed: result.trial.scansUsed,
          expiresAt: result.trial.expiresAt,
        });

        const expiryDate = new Date(result.trial.expiresAt).toLocaleDateString(
          "en-US",
          { month: "short", day: "numeric" }
        );
        const remaining = result.trial.scanLimit - result.trial.scansUsed;

        if (result.existing) {
          console.log(
            `\n  ⚠️  Existing trial restored (${remaining} scans remaining, expires ${expiryDate})\n`
          );
        } else {
          console.log(
            `\n  ✅ Trial activated! (${remaining} scans remaining, expires ${expiryDate})\n`
          );
        }

        return true;
      } catch (err: any) {
        if (attempt < 2) {
          console.log(`  ❌ ${err.message}`);
        } else {
          console.log(`\n  ❌ Too many failed attempts. Run "rampart auth trial" to try again.\n`);
        }
      }
    }

    return false;
  } finally {
    rl.close();
  }
}
```

### 4.4 Auto-Trigger on Missing Key

Modify `src/api.ts` to offer the trial flow instead of just throwing:

```typescript
import { getApiKey, getApiUrl, isTrialKey, getTrialInfo } from "./config";
import { runTrialFlow } from "./trial";

export class RampartAPI {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = getApiUrl();
    this.apiKey = getApiKey();
  }

  // Called by scan command before constructing RampartAPI
  static async ensureAuth(): Promise<boolean> {
    const key = getApiKey();
    if (key) return true;

    // Check if stdin is a TTY (interactive terminal)
    if (!process.stdin.isTTY) {
      console.error("❌ No API key configured. Set RAMPART_API_KEY or run: rampart auth login");
      return false;
    }

    console.log("  ⚠️  No API key configured.\n");
    console.log("  Options:");
    console.log("    1. Start a free trial (3 scans, no credit card)");
    console.log("    2. Enter an existing API key");
    console.log("");

    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const choice = await new Promise<string>((resolve) =>
      rl.question("  Choice (1/2): ", resolve)
    );
    rl.close();

    if (choice.trim() === "2") {
      // Delegate to existing login flow
      const { setApiKey } = await import("./config");
      const rl2 = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const key = await new Promise<string>((resolve) =>
        rl2.question("  API Key: ", resolve)
      );
      rl2.close();
      if (key.trim()) {
        setApiKey(key.trim());
        console.log("  ✅ API key saved.\n");
        return true;
      }
      return false;
    }

    // Default: trial flow
    return runTrialFlow();
  }

  // ...rest of class unchanged
}
```

**Update `src/commands/scan.ts`** to call `ensureAuth()` before constructing `RampartAPI`:

```typescript
// At the top of the scan action handler, before `const api = new RampartAPI()`:

const hasAuth = await RampartAPI.ensureAuth();
if (!hasAuth) {
  process.exit(1);
}
const api = new RampartAPI();
```

### 4.5 New `auth trial` Command

Add to `src/commands/auth.ts`:

```typescript
import { runTrialFlow } from "../trial";
import { getTrialInfo, clearTrialInfo } from "../config";

authCommand
  .command("trial")
  .description("Start a free trial (3 scans, 7 days)")
  .action(async () => {
    const existing = getTrialInfo();
    if (existing && getApiKey()) {
      const remaining = existing.scanLimit - existing.scansUsed;
      const expired = new Date(existing.expiresAt) < new Date();

      if (!expired && remaining > 0) {
        const expiryDate = new Date(existing.expiresAt).toLocaleDateString(
          "en-US",
          { month: "short", day: "numeric" }
        );
        console.log(`\n  ⚠️  You already have an active trial.`);
        console.log(`  Scans: ${remaining}/${existing.scanLimit} remaining`);
        console.log(`  Expires: ${expiryDate}\n`);
        return;
      }
    }

    const success = await runTrialFlow();
    if (!success) {
      process.exit(1);
    }
  });
```

### 4.6 Enhanced `auth status`

Update the existing status command to show trial info:

```typescript
authCommand
  .command("status")
  .description("Check authentication status")
  .action(async () => {
    const key = getApiKey();
    if (!key) {
      console.log("\n  ❌ Not authenticated. Run \"rampart auth login\" or \"rampart auth trial\".\n");
      return;
    }

    const trial = getTrialInfo();
    if (trial) {
      const remaining = trial.scanLimit - trial.scansUsed;
      const expired = new Date(trial.expiresAt) < new Date();
      const expiryDate = new Date(trial.expiresAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      console.log("");
      if (expired) {
        console.log("  ⚠️  Trial expired");
      } else if (remaining <= 0) {
        console.log("  ⚠️  Trial scans exhausted");
      } else {
        console.log("  ✅ Trial account");
      }
      console.log(`  Email: ${trial.email}`);
      console.log(`  Scans: ${remaining}/${trial.scanLimit} remaining`);
      console.log(`  Expires: ${expiryDate}${expired ? " (expired)" : ""}`);
      console.log("");
      console.log(`  Upgrade: https://rampartscan.com/pricing`);
      console.log("");

      // Optionally refresh from server
      try {
        const { TrialAPI } = await import("../api");
        const trialApi = new TrialAPI();
        const serverStatus = await trialApi.getTrialStatus(key);
        if (serverStatus.trial && serverStatus.scansUsed !== undefined) {
          // Update local cache
          const { setTrialInfo } = await import("../config");
          setTrialInfo({
            ...trial,
            scansUsed: serverStatus.scansUsed,
          });
        }
      } catch {
        // Offline — show cached data (already displayed above)
      }
    } else {
      const masked = key.slice(0, 8) + "..." + key.slice(-4);
      console.log(`\n  ✅ Authenticated (${masked})\n`);
    }
  });
```

### 4.7 Trial-Specific Error Handling

Update `src/api.ts` error handling to detect trial errors:

```typescript
private async request(path: string, options: RequestInit = {}): Promise<any> {
  // ...existing fetch logic...

  if (!res.ok) {
    const body: any = await res.json().catch(() => ({}));

    // Handle trial-specific errors
    const detail = typeof body.detail === "object" ? body.detail : {};
    
    if (detail.code === "TRIAL_EXPIRED") {
      throw new TrialError(
        "Trial expired.",
        "TRIAL_EXPIRED",
        detail.upgrade_url
      );
    }
    if (detail.code === "TRIAL_EXHAUSTED") {
      throw new TrialError(
        `Trial limit reached (${detail.scans_used}/${detail.scan_limit} scans used).`,
        "TRIAL_EXHAUSTED",
        detail.upgrade_url
      );
    }

    // ...existing error handling...
  }
}

export class TrialError extends Error {
  code: string;
  upgradeUrl: string;

  constructor(message: string, code: string, upgradeUrl: string) {
    super(message);
    this.name = "TrialError";
    this.code = code;
    this.upgradeUrl = upgradeUrl;
  }
}
```

**Catch in `scan.ts`:**

```typescript
} catch (err: any) {
  if (err instanceof TrialError) {
    console.log(`\n  ❌ ${err.message}\n`);
    console.log(`  Upgrade to keep scanning: ${err.upgradeUrl}`);
    console.log(`  Already have an account? Run: rampart auth login\n`);
    process.exit(1);
  }
  // ...existing error handling...
}
```

### 4.8 Post-Scan Trial Info

After a successful scan, show trial status in the summary:

```typescript
// At the end of scan.ts, after displaying results:

const trialInfo = getTrialInfo();
if (trialInfo) {
  // Refresh from local config (server already incremented)
  try {
    const trialApi = new TrialAPI();
    const serverStatus = await trialApi.getTrialStatus(api.getKey());
    if (serverStatus.trial) {
      trialInfo.scansUsed = serverStatus.scansUsed ?? trialInfo.scansUsed;
      setTrialInfo(trialInfo);
    }
  } catch {}

  const remaining = trialInfo.scanLimit - trialInfo.scansUsed;
  const expiryDate = new Date(trialInfo.expiresAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  console.log(`  💳 Trial scans remaining: ${remaining}/${trialInfo.scanLimit} (expires ${expiryDate})`);
  console.log(`\n  ⭐ Upgrade for unlimited scans: https://rampartscan.com/pricing`);
}
```

---

## 5. Abuse Prevention

### 5.1 Disposable Email Blocking

Clerk has a **built-in disposable email blocker**. Enable it in:  
**Clerk Dashboard → User & Authentication → Email, Phone, Username → Block disposable email addresses**

This rejects emails from known disposable providers (guerrillamail, tempmail, etc.) at user creation time.

### 5.2 Rate Limiting

| Endpoint | Limit | Key | Window |
|----------|-------|-----|--------|
| `POST /auth/trial` | 5 requests | IP address | 1 hour |
| `POST /auth/trial/verify` | 5 attempts | Email address | Per OTP (stored in verification state) |

**Implementation:** In-memory rate limiting for MVP (as shown in §3.2). For production, use Vercel KV:

```typescript
async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const current = await kv.incr(`ratelimit:${key}`);
  if (current === 1) {
    await kv.expire(`ratelimit:${key}`, Math.ceil(windowMs / 1000));
  }
  return current <= limit;
}
```

### 5.3 One Trial Per Email

Enforced at two levels:

1. **Clerk level:** `getUserList({ emailAddress })` finds existing users before creating new ones
2. **Database level:** The `trial_keys` table has a unique constraint on `email`
3. **Key reuse:** If a verified user requests another trial, the existing key is returned (not a new one)

### 5.4 Additional Hardening (Phase 2)

- **Fingerprinting:** Store a hash of IP + User-Agent on trial creation. Flag multiple trials from the same fingerprint.
- **Domain validation:** Beyond disposable blocking, optionally require that the email domain has MX records.
- **CAPTCHA:** If abuse is detected, add a Turnstile CAPTCHA challenge before OTP send. The CLI would open the browser for this.
- **Geographic limiting:** Block or flag trials from high-abuse regions (configurable).

---

## 6. Database / Schema

### 6.1 New Table: `trial_keys`

This table tracks trial-specific state. The actual API key lives in Clerk; this table handles scan counting and expiry enforcement.

```sql
CREATE TABLE trial_keys (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,                    -- Clerk user ID
  email         TEXT NOT NULL UNIQUE,             -- Normalized email
  api_key_id    TEXT NOT NULL,                    -- Clerk API key ID
  scan_limit    INTEGER NOT NULL DEFAULT 3,
  scans_used    INTEGER NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_at  TIMESTAMPTZ,                     -- Set when user upgrades to paid
  
  CONSTRAINT trial_keys_email_unique UNIQUE (email)
);

CREATE INDEX idx_trial_keys_user_id ON trial_keys(user_id);
CREATE INDEX idx_trial_keys_api_key_id ON trial_keys(api_key_id);
```

### 6.2 Existing Models — No Changes Needed

The existing `scans`, `assets`, `credits`, and `findings` tables don't need modification. Trial scans use the same data structures — they're just regular scans that happen to be initiated by a trial API key.

**Key insight:** The trial enforcement happens *before* the scan is created. Once a scan passes trial validation, it's a normal scan in the system. This means:

- Trial scan results persist even after the trial expires
- Scan history carries over when a user upgrades
- No special "trial scan" type needed

### 6.3 Clerk API Key Metadata

The Clerk API key's `meta` field stores:

```json
{
  "trial": true,
  "email": "developer@company.com",
  "scanLimit": 3,
  "expiresAt": "2026-04-24T19:13:00.000Z"
}
```

This is duplicated from `trial_keys` for fast checking at the API key verification layer without a DB query.

---

## 7. Migration Path

### 7.1 Trial → Paid Upgrade

When a trial user visits `https://rampartscan.com/pricing` and subscribes:

1. **Clerk recognizes them** — they already have a Clerk account (created during trial)
2. **They sign in** — using their email (password or magic link — they can set a password on first dashboard visit)
3. **Subscription is attached** — Clerk Billing ties the plan to their user ID
4. **New API key** — they generate a full API key in the dashboard
5. **CLI switch** — they run `rampart auth login` with their new key, which overwrites the trial config

**CLI prompt after trial exhaustion:**
```
  ❌ Trial limit reached (3/3 scans used).

  Upgrade to keep scanning: https://rampartscan.com/pricing
  Already have an account? Run: rampart auth login
```

**Backend cleanup:** When a trial user subscribes (detected via Clerk webhook or on next API call), set `trial_keys.converted_at = NOW()`. The trial key can be revoked or left to expire naturally.

### 7.2 Scan History Preservation

Since trial scans are stored as regular scans tied to the Clerk user ID, they automatically appear in the dashboard once the user upgrades and signs in. No migration needed.

### 7.3 Password Setup

Trial users are created without a password (`skipPasswordRequirement: true`). On first dashboard visit, they'll be prompted to set one via Clerk's standard flow. Alternatively, they can use Clerk's magic link sign-in with the same email.

### 7.4 Upgrade Detection in CLI

Optionally, when a trial user runs `rampart auth status` and their trial is expired/exhausted, the CLI could check if they've upgraded:

```typescript
// In auth status handler, after showing trial-expired message:
// Check if user now has a subscription
try {
  const trialApi = new TrialAPI();
  const status = await trialApi.getTrialStatus(key);
  if (!status.trial) {
    // Key is no longer trial — user may have upgraded
    clearTrialInfo();
    console.log("  ✅ Account upgraded! Your key is now active.\n");
  }
} catch {}
```

---

## 8. Implementation Order

### Phase 1: Backend Foundation (2-3 days)

1. **Create `trial_keys` table** in the general_backend database
2. **Set up Vercel KV** for OTP storage (or use existing Redis if available)
3. **Implement `POST /auth/trial`** — email validation, Clerk user creation, OTP generation + sending via Resend
4. **Implement `POST /auth/trial/verify`** — OTP verification, Clerk API key provisioning, trial record creation
5. **Implement `GET /auth/trial/status`** — trial status lookup by API key
6. **Enable disposable email blocking** in Clerk Dashboard
7. **Write integration tests** for the trial endpoints

### Phase 2: Trial Enforcement (1-2 days)

8. **Add trial checks to scan endpoint** in the general_backend — expiry check, scan count check, increment on success
9. **Define error response shapes** — `TRIAL_EXPIRED`, `TRIAL_EXHAUSTED` with structured detail objects
10. **Test enforcement** — verify a trial key is rejected after 3 scans and after 7 days

### Phase 3: CLI Integration (2-3 days)

11. **Extend `config.ts`** — add `trial` field, `getTrialInfo`, `setTrialInfo`, `clearTrialInfo`, `isTrialKey`
12. **Create `src/trial.ts`** — interactive trial sign-up flow with readline
13. **Create `TrialAPI` class** in `src/api.ts` — unauthenticated endpoints for trial request/verify/status
14. **Add `auth trial` command** to `src/commands/auth.ts`
15. **Add auto-trigger** — `RampartAPI.ensureAuth()` called at the top of `scan` command
16. **Update `auth status`** — show trial info (email, scans remaining, expiry)
17. **Add `TrialError` class** and trial-specific error handling in the API client
18. **Update scan output** — show trial scans remaining after successful scan
19. **Build + manual test** the full flow end-to-end

### Phase 4: Polish & Hardening (1-2 days)

20. **Rate limiting** — production-grade rate limiting with Vercel KV
21. **Email template** — branded Resend template for OTP emails
22. **Edge cases** — handle offline, non-TTY (CI), existing paid key + trial command
23. **Update README** — document the trial flow, `auth trial` command
24. **Clerk webhook** — (optional) listen for subscription events to auto-revoke trial keys

### Phase 5: Analytics & Iteration (ongoing)

25. **Track funnel** — trial_started → trial_verified → first_scan → trial_exhausted → upgrade
26. **Instrument events** — send to PostHog/Mixpanel from the backend
27. **Tune limits** — adjust scan count and duration based on conversion data
28. **A/B test** — try 5 scans / 14 days vs 3 scans / 7 days

---

## Appendix: Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API key system | Clerk API Keys (not custom JWTs) | Same verification path as paid keys, less code |
| OTP delivery | Resend (not Clerk emails) | Already in stack, better control, deliverability tracking |
| OTP storage | Vercel KV (not in-memory) | Survives redeployments, supports horizontal scaling |
| Trial metadata | Dual storage (Clerk meta + DB table) | Fast key-level checks + queryable scan counting |
| Scan limit | 3 scans / 7 days | Enough to demonstrate value, not enough to freeload |
| CLI auto-trigger | Interactive choice menu (trial vs login) | Doesn't force trial on users who already have a key to paste |
| Scan history | Shared with paid account | Zero migration friction; trial scans just work after upgrade |

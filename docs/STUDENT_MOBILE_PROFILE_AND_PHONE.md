# Student mobile API — profile, phone change, and AI implementation prompt

Base path: **`/api/student`**. All authenticated routes expect:

`Authorization: Bearer <token>`

Unless noted, JSON bodies use `Content-Type: application/json`.

---

## Critical: why `PUT /profile` never changes the phone

`PUT /api/student/profile` is implemented in `studentController.updateProfile` and **intentionally removes** phone-related fields from the request before saving:

- `studentNumber`, `parentNumber`, `studentCountryCode`, `parentCountryCode` are **deleted** from `updates`.
- Only **`firstName`**, **`lastName`**, **`schoolName`**, and **`grade`** can be updated through this route.

**The mobile app must not** expect sending `studentNumber` in `PUT /profile` to persist. That is by design (security / verified channel for phone changes).

---

## How to change the student’s phone number (correct flow)

Phone updates use **OTP to the new number**, then **verify** — verification **persists** `studentCountryCode` and `studentNumber` on the user.

### Preconditions

1. Student is logged in (valid Bearer token).
2. Profile is complete (`isCompleteData === true`), because profile routes sit **after** `requireCompleteProfile` in `routes/studentMobile.js`.

### Step 1 — Send OTP

**`POST /api/student/profile/send-otp`**

Body:

```json
{
  "countryCode": "+20",
  "phoneNumber": "10012345678"
}
```

- `countryCode` must be one of: **`+966`**, **`+20`**, **`+971`**, **`+965`**.
- `phoneNumber` is normalized to digits only; length must match the country:

| `countryCode` | Required digit count |
|---------------|----------------------|
| `+966`        | 9                    |
| `+20`         | 11                   |
| `+971`        | 9                    |
| `+965`        | 8                    |

**Early errors (no OTP sent):**

- Number already on **another** account.
- Same digits as the current **parent** phone (same country) — not allowed.

**Success (200):** `{ "success": true, "message": "OTP sent successfully", "expiresIn": 300 }`

### Step 2 — Verify OTP (this step saves the new phone)

**`POST /api/student/profile/verify-otp`**

Body (use the **same** `countryCode` and `phoneNumber` as step 1):

```json
{
  "countryCode": "+20",
  "phoneNumber": "10012345678",
  "otp": "123456"
}
```

**Success (200):**

```json
{
  "success": true,
  "message": "Phone number verified and updated successfully",
  "data": {
    "studentCountryCode": "+20",
    "studentNumber": "10012345678",
    "user": { }
  }
}
```

`data.user` is the same shape as login/register profile (`buildProfilePayload`).

**After success:** update the client’s cached profile from `data.user` (or call `GET /api/student/profile`). **Do not** call `PUT /profile` expecting to set the phone.

### Common failures

| Message | Meaning |
|---------|---------|
| `OTP not found or expired` | Wrong key, expired, or new send-otp replaced the challenge |
| `Invalid OTP` | Wrong code |
| `This phone number is already registered to another account` | Duplicate |
| `Student and parent phone numbers cannot be the same` | Business rule |
| `Student number must be N digits for the selected country` | Format |

---

## Related profile endpoints (same auth + complete profile)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/student/profile` | Full profile + achievements |
| `PUT` | `/api/student/profile` | **Only** name, school, grade (no phone) |
| `POST` | `/api/student/profile/picture` | Multipart field **`profilePicture`** (image, max 5MB) |
| `POST` | `/api/student/profile/send-otp` | Send OTP to **new** student phone |
| `POST` | `/api/student/profile/verify-otp` | Verify OTP **and save** new student phone |

Settings and password:

| Method | Path | Body summary |
|--------|------|----------------|
| `GET` | `/api/student/settings` | — |
| `PUT` | `/api/student/settings` | Optional `theme`, `notifications`, `language` |
| `PUT` | `/api/student/settings/password` | `currentPassword`, `newPassword` (min 6) |

---

## Prompt you can give to another AI (mobile implementation)

Copy everything below this line into a ticket or chat.

---

**Task:** Implement “change student phone” in the student mobile app against our backend.

**Facts:**

1. Base URL: `<BASE>/api/student`.
2. Auth: `Authorization: Bearer <token>` on all profile routes.
3. `PUT /profile` accepts JSON but **ignores** phone fields; only `firstName`, `lastName`, `schoolName`, `grade` update the user. **Never** use PUT profile to change phone.
4. To change phone:
   - `POST /profile/send-otp` with `{ "countryCode": "+20", "phoneNumber": "<local digits only per country rules>" }`.
   - User receives OTP on the **new** number.
   - `POST /profile/verify-otp` with `{ "countryCode", "phoneNumber", "otp" }` — **same** phone fields as send-otp.
5. On verify success, response includes `data.studentCountryCode`, `data.studentNumber`, and `data.user`. Refresh local user state from `data.user` or refetch `GET /profile`.
6. Country codes allowed: `+966`, `+20`, `+971`, `+965`. Digit lengths: +966/+971 → 9, +20 → 11, +965 → 8.
7. Handle 400 errors with `message` for duplicates, parent=same-as-student, invalid length, invalid OTP, expired OTP.

**UI flow suggestion:** Screen “New phone” → pick country → enter local number → Send code → Enter OTP → on success show confirmation and update profile cache.

---

## Changelog (backend)

- **`profileVerifyOtp`** now writes **`studentCountryCode`** and **`studentNumber`** after a valid OTP, and returns `data.user` plus normalized phone fields.
- **`profileSendOtp`** now validates country code, digit length, duplicate number, and parent/student clash **before** sending OTP.

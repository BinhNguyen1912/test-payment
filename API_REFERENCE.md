# TrustWow — API reference (sinh tự động từ source)

> Nguồn: `/tmp/be-develop/src` (git origin/develop af90ebbf). Sinh bằng `tools/gen-api-reference.mjs` qua TypeScript compiler API, không viết tay, không sửa backend.
> Response thành công bọc `{success, statusCode, data, meta?}`; lỗi `{success:false, statusCode, error:{code, message, fieldErrors?}}`. IPN VNPay là body trần `{RspCode, Message}`.
> **Quy tắc test: KHÔNG seed data; mọi dữ liệu do API tạo; danh sách lấy bằng API GET, không hardcode id/email/số tiền.**
> Tiền tố mọi đường dẫn: `/api/v1`. Auth mobile = Bearer; web = cookie + `X-CSRF-Token`. Header `Device-Id` bắt buộc khi đăng nhập.

> Tổng: **338 endpoint** thuộc 19 module (auth, otp, ekyc, sub-account, bank-account, pin, smart-otp, access-control, marketplace, commitment, payment, payout, finance, double-entry, membership, voucher, cart, referral, tax-report).

## Module `auth`

### MobileAuthController  `/mobile/auth`  — `src/modules/auth/controllers/mobile.auth.controller.ts`

#### `POST /api/v1/mobile/auth/sign-in`
[Session] Sign in — returns accessToken + refreshToken in response body. Device-Id header is required.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `SignInDto`
    - `clientId`: `AuthClientId` — IsEnum — { enum: AuthClientId, example: AuthClientId.User, description: 'TrustWow application requesting authentication. This scopes the active devic
    - `identifier`: `string` — IsString, IsNotEmpty, IsPhoneOrEmail — { example: 'anhdomixi@gmail.com', description: 'Vietnamese phone number (10 digits, starts with 0) or email address — ' + 'whichever the acc
    - `password`: `string` — IsString, IsNotEmpty — { example: 'Tw123123!', description: 'Account password. Sent as-is over TLS; never logged.', }
- Response: `ApiEnvelopeResponse(SignInDeviceResDto)` · `Promise<SignInDeviceResDto>`
    - `outcome`: `"PROCEED" | "TWO_FACTOR_REQUIRED"` — { enum: ['PROCEED', 'TWO_FACTOR_REQUIRED'], description: 'PROCEED — full access granted. TWO_FACTOR_REQUIRED — verify email OTP before token
    - `method?`: `TwoFactorMethod | undefined` — { enum: [TwoFactorMethod.Email] }
    - `twoFactorToken?`: `string | undefined` — { description: 'Opaque pre-auth 2FA token. Not an access or refresh token.', }
    - `resendInSeconds?`: `number | undefined` — { example: 120 }
    - `accessToken?`: `string | undefined` — { description: 'Mobile only — bearer access token' }
    - `refreshToken?`: `string | undefined` — { description: 'Mobile only — refresh token (web uses cookie)', }
    - `expiresIn?`: `number | undefined` — { example: 900 }
    - `tokenType?`: `"Bearer" | undefined` — { enum: ['Bearer'] }
    - `message?`: `string | undefined`

#### `POST /api/v1/mobile/auth/2fa/verify`
[2FA] Verify email OTP after sign-in challenge — issues mobile tokens only after success. Device-Id header is required.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 10 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyTwoFactorReqDto`
    - `twoFactorToken`: `string` — IsString — { description: 'Opaque 2FA challenge token returned by sign-in.', }
    - `code`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6 }
    - `rememberDevice?`: `boolean | undefined` — IsOptional, IsBoolean — { default: false }
- Response: `ApiEnvelopeResponse(SignInDeviceResDto)` · `Promise<SignInDeviceResDto>`
    - `outcome`: `"PROCEED" | "TWO_FACTOR_REQUIRED"` — { enum: ['PROCEED', 'TWO_FACTOR_REQUIRED'], description: 'PROCEED — full access granted. TWO_FACTOR_REQUIRED — verify email OTP before token
    - `method?`: `TwoFactorMethod | undefined` — { enum: [TwoFactorMethod.Email] }
    - `twoFactorToken?`: `string | undefined` — { description: 'Opaque pre-auth 2FA token. Not an access or refresh token.', }
    - `resendInSeconds?`: `number | undefined` — { example: 120 }
    - `accessToken?`: `string | undefined` — { description: 'Mobile only — bearer access token' }
    - `refreshToken?`: `string | undefined` — { description: 'Mobile only — refresh token (web uses cookie)', }
    - `expiresIn?`: `number | undefined` — { example: 900 }
    - `tokenType?`: `"Bearer" | undefined` — { enum: ['Bearer'] }
    - `message?`: `string | undefined`

#### `POST /api/v1/mobile/auth/2fa/resend`
[2FA] Resend sign-in email OTP — rotates the 2FA token. Device-Id header is required.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `ResendTwoFactorReqDto`
    - `twoFactorToken`: `string` — IsString — { description: 'Opaque 2FA challenge token returned by sign-in or resend.', }
- Response: `ApiEnvelopeResponse(SignInDeviceResDto)` · `Promise<SignInDeviceResDto>`
    - `outcome`: `"PROCEED" | "TWO_FACTOR_REQUIRED"` — { enum: ['PROCEED', 'TWO_FACTOR_REQUIRED'], description: 'PROCEED — full access granted. TWO_FACTOR_REQUIRED — verify email OTP before token
    - `method?`: `TwoFactorMethod | undefined` — { enum: [TwoFactorMethod.Email] }
    - `twoFactorToken?`: `string | undefined` — { description: 'Opaque pre-auth 2FA token. Not an access or refresh token.', }
    - `resendInSeconds?`: `number | undefined` — { example: 120 }
    - `accessToken?`: `string | undefined` — { description: 'Mobile only — bearer access token' }
    - `refreshToken?`: `string | undefined` — { description: 'Mobile only — refresh token (web uses cookie)', }
    - `expiresIn?`: `number | undefined` — { example: 900 }
    - `tokenType?`: `"Bearer" | undefined` — { enum: ['Bearer'] }
    - `message?`: `string | undefined`

#### `GET /api/v1/mobile/auth/2fa/status`
[2FA] Get my two-factor status.
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(TwoFactorStatusResDto)` · `Promise<TwoFactorStatusResDto>`
    - `enabled`: `boolean`
    - `method`: `TwoFactorMethod | null` — { enum: [TwoFactorMethod.Email], nullable: true }
    - `enabledAt`: `string | null` — { type: String, format: 'date-time', nullable: true }

#### `POST /api/v1/mobile/auth/2fa/settings/challenge`
[2FA] Start enable/disable settings challenge — verifies current password and sends email OTP.
- Điều kiện: `Authenticated` · `CsrfExempt` · `RateLimit({ userPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `ChallengeTwoFactorSettingsReqDto`
    - `action`: `"enable" | "disable"` — IsIn — { enum: ['enable', 'disable'] }
    - `currentPassword`: `string` — IsString
- Response: `ApiEnvelopeResponse(TrustedDeviceTwoFactorResDto)` · `Promise<TrustedDeviceTwoFactorResDto>`
    - `settingsTwoFactorToken`: `string`
    - `expiresIn`: `number` — { example: 300 }
    - `resendInSeconds`: `number` — { example: 120 }

#### `POST /api/v1/mobile/auth/2fa/enable`
[2FA] Enable email two-factor authentication after settings OTP.
- Điều kiện: `Authenticated` · `CsrfExempt` · `RateLimit({ userPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `EnableTwoFactorReqDto`
    - `settingsTwoFactorToken`: `string` — IsString — { description: 'Opaque settings challenge token returned by /2fa/settings/challenge.', }
    - `code`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6 }
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto)` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }

#### `POST /api/v1/mobile/auth/2fa/disable`
[2FA] Disable email two-factor authentication after settings OTP.
- Điều kiện: `Authenticated` · `CsrfExempt` · `RateLimit({ userPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `DisableTwoFactorReqDto`
    - `settingsTwoFactorToken`: `string` — IsString — { description: 'Opaque settings challenge token returned by /2fa/settings/challenge.', }
    - `code`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6 }
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto)` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }

#### `POST /api/v1/mobile/auth/refresh-token`
[Session] Refresh tokens — send current refreshToken in body, receive new accessToken + refreshToken pair.
- Điều kiện: `Public` · `RateLimit({ ipPerMin: 10 })` · `HttpCode(HttpStatus.OK)`
- Body: `RefreshTokenDto`
    - `refreshToken`: `string` — IsString — { example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
- Response: `ApiEnvelopeResponse(AuthTokensResponseDto)` · `Promise<AuthTokensResponseDto>`
    - `accessToken`: `string` — { description: 'JWT access token used for API authorization.', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', }
    - `refreshToken`: `string` — { description: 'JWT refresh token used to obtain a new access token.', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', }
    - `expiresIn`: `number` — { description: 'Access token lifetime in seconds.', example: 900, }
    - `tokenType`: `string` — { description: 'Token scheme used in the Authorization header.', example: 'Bearer', default: 'Bearer', }

#### `POST /api/v1/mobile/auth/logout`
[Session] Logout current session — send refreshToken in body to revoke the session. Always returns 200 (anti-enumeration).
- Điều kiện: `Public` · `CsrfExempt` · `HttpCode(HttpStatus.OK)` · `RateLimit({ ipPerMin: 30 })`
- Body: `LogoutMobileDto`
    - `refreshToken`: `string` — IsString, IsNotEmpty — { example: 'eyJhbGciOiJIUzI1NiIs...', description: 'Refresh token JWT issued at sign-in or refresh. Anti-enumeration: invalid/expired tokens
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto)` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }

#### `POST /api/v1/mobile/auth/logout-all`
[Session] Logout from all devices — revokes every active session on this account. Requires valid Bearer access token.
- Điều kiện: `Authenticated` · `CsrfExempt` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 5 })`
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto)` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }

#### `GET /api/v1/mobile/auth/devices`
[Device Trust] List all device sessions — returns ACTIVE and valid UNVERIFIED devices. isCurrent=true flags the calling device.
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(DeviceListResDto)` · `Promise<DeviceListResDto>`
    - `devices`: `DeviceListItemDto[]` — { type: [DeviceListItemDto] }

#### `GET /api/v1/mobile/auth/login-history`
Get my login history — one entry per login with device, IP, approximate location and time. Always scoped to the current user.
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(LoginHistoryItemDto)` · `Promise<CursorPaginatedResponse<LoginHistoryItemDto>>`
    - `data`: `LoginHistoryItemDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `POST /api/v1/mobile/auth/verify-phone`
[Sign-up v2, Step 1/3] Check phone availability — 200 if the number is free, 409 PHONE_ALREADY_EXISTS if already registered.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 10 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyPhoneReqDto`
    - `phoneNumber`: `string` — IsString, IsNotEmpty, Matches — { example: '0912345678', description: 'Vietnamese phone number (10 digits, starts with 0).', }
- Response: `ApiEnvelopeResponse(VerifyPhoneAvailabilityResDto)` · `Promise<VerifyPhoneAvailabilityResDto>`
    - `status`: `boolean` — { example: true }
    - `message`: `string` — { example: 'Phone number is available' }
- Lỗi/Status: `429: RATE_LIMITED`

#### `POST /api/v1/mobile/auth/sign-up`
[Sign-up v2, Step 2/3] Create account — submit phone + firstName + lastName + password. An OTP is sent to the phone number.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `SignUpPhoneReqDto`
    - `phoneNumber`: `string` — IsString, IsNotEmpty, Matches — { example: '0912345678', description: 'Vietnamese phone number (10 digits, starts with 0).', }
    - `firstName`: `string` — IsString, IsNotEmpty, MinLength, MaxLength — { example: 'Quoc', minLength: 2, maxLength: 50 }
    - `lastName`: `string` — IsString, IsNotEmpty, MinLength, MaxLength — { example: 'Trung', minLength: 2, maxLength: 50 }
    - `password`: `string` — IsString, MinLength, MaxLength, Matches — { example: 'Str0ng!Pass', description: 'Must be 8–72 characters and contain at least one uppercase letter, one lowercase letter, one digit, 
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto)` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }
- Lỗi/Status: `429: RATE_LIMITED`

#### `POST /api/v1/mobile/auth/phone/verify-otp`
[Sign-up v2, Step 3/3] Verify phone OTP — activates account (Pending → Active) and returns access + refresh tokens.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 10 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyPhoneOtpReqDto`
    - `phoneNumber`: `string` — IsString, IsNotEmpty, Matches — { example: '0912345678', description: 'Vietnamese phone number (10 digits, starts with 0).', }
    - `otp`: `string` — IsString, IsNotEmpty, Length, Matches — { example: '123456', description: 'OTP code (exactly 6 digits).', }
    - `invitationCode?`: `string | undefined` — IsOptional, IsString, MaxLength — { example: 'TRW7K9F2QX', description: 'Optional invitation code from the referrer. If valid, the referrer earns ' + 'trust score on successf
- Response: `ApiEnvelopeResponse(AuthTokensResponseDto)` · `Promise<AuthTokensResponseDto>`
    - `accessToken`: `string` — { description: 'JWT access token used for API authorization.', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', }
    - `refreshToken`: `string` — { description: 'JWT refresh token used to obtain a new access token.', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', }
    - `expiresIn`: `number` — { description: 'Access token lifetime in seconds.', example: 900, }
    - `tokenType`: `string` — { description: 'Token scheme used in the Authorization header.', example: 'Bearer', default: 'Bearer', }
- Lỗi/Status: `429: RATE_LIMITED`

#### `POST /api/v1/mobile/auth/phone/resend-otp`
[Sign-up v2] Resend the phone OTP — subject to a 2-minute cooldown and hourly caps. Returns the resend/expiry countdown.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyPhoneReqDto`
    - `phoneNumber`: `string` — IsString, IsNotEmpty, Matches — { example: '0912345678', description: 'Vietnamese phone number (10 digits, starts with 0).', }
- Response: `ApiEnvelopeResponse(PhoneOtpStatusResDto)` · `Promise<PhoneOtpStatusResDto>`
    - `otpSent`: `boolean` — { description: 'Whether an active (non-expired) OTP currently exists.', example: true, }
    - `resendInSeconds`: `number` — { description: 'Seconds until a resend is allowed (0 = allowed now).', example: 120, }
    - `expiresInSeconds`: `number` — { description: 'Seconds until the current code expires (0 = none active).', example: 300, }
- Lỗi/Status: `429: OTP_RESEND_COOLDOWN | OTP_HOURLY_CAP_EXCEEDED | RATE_LIMITED` | `503: OTP_DELIVERY_FAILED`

#### `POST /api/v1/mobile/auth/phone/otp-status`
[Sign-up v2] Phone OTP status — resume the resend/expiry countdown after the app was closed or crashed.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 20 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyPhoneReqDto`
    - `phoneNumber`: `string` — IsString, IsNotEmpty, Matches — { example: '0912345678', description: 'Vietnamese phone number (10 digits, starts with 0).', }
- Response: `ApiEnvelopeResponse(PhoneOtpStatusResDto)` · `Promise<PhoneOtpStatusResDto>`
    - `otpSent`: `boolean` — { description: 'Whether an active (non-expired) OTP currently exists.', example: true, }
    - `resendInSeconds`: `number` — { description: 'Seconds until a resend is allowed (0 = allowed now).', example: 120, }
    - `expiresInSeconds`: `number` — { description: 'Seconds until the current code expires (0 = none active).', example: 300, }
- Lỗi/Status: `429: RATE_LIMITED`

#### `POST /api/v1/mobile/auth/forgot-password`
[Forgot Password, Step 1/3] Request password-reset OTP via email or phone (Zalo) — always returns 200 (anti-enumeration).
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `ForgotPasswordReqDto`
    - `channel`: `ResetChannel` — IsEnum — { enum: ResetChannel, example: ResetChannel.Email, description: 'Delivery channel for the reset OTP: "email" (via email) or "phone" (via Zal
    - `target`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'user@example.com', description: 'Destination that receives the reset OTP. Email address when channel=email (normalised to lowerc
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto, 'Generic message — always returned (anti-enumeration).')` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }
- Lỗi/Status: `429: RATE_LIMITED (per-IP only — does NOT indicate email status)`

#### `POST /api/v1/mobile/auth/verify-reset-otp`
[Forgot Password, Step 2/3] Verify password-reset OTP — returns a 10-minute reset JWT required for Step 3.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 10 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyResetOtpReqDto`
    - `channel`: `ResetChannel` — IsEnum — { enum: ResetChannel, example: ResetChannel.Email, description: 'Same channel used in Step 1 (forgot-password).', }
    - `target`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'user@example.com', description: 'Destination that received the reset OTP — email (channel=email) or VN phone 0XXXXXXXXX (channel
    - `otp`: `string` — IsString, IsNotEmpty, Matches — { example: '123456', description: '6-digit numeric OTP sent to the target.', }
- Response: `ApiEnvelopeResponse(VerifyResetOtpResponseDto)` · `Promise<VerifyResetOtpResponseDto>`
    - `resetToken`: `string` — { description: 'Short-lived (10 min) JWT to authorise the subsequent /reset-password call.', example: 'eyJhbGciOiJIUzI1NiIs...', }
- Lỗi/Status: `429: OTP_MAX_ATTEMPTS_REACHED | RATE_LIMITED`

#### `POST /api/v1/mobile/auth/reset-password`
[Forgot Password, Step 3/3] Set new password — uses the reset JWT from Step 2. ALL active sessions are revoked immediately.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `ResetPasswordReqDto`
    - `resetToken`: `string` — IsString, IsNotEmpty — { description: 'Short-lived (10 min) reset JWT issued by /auth/verify-reset-otp.', example: 'eyJhbGciOiJIUzI1NiIs...', }
    - `newPassword`: `string` — IsString, IsNotEmpty, MinLength, MaxLength, Matches — { example: 'NewP@ssw0rd1', description: 'New password. 8-72 chars; must contain at least one uppercase, one lowercase, one digit, and one sp
    - `confirmPassword`: `string` — IsString, IsNotEmpty, MaxLength, Match — { example: 'NewP@ssw0rd1', description: 'Must exactly match newPassword.', maxLength: 72, }
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto)` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }

#### `POST /api/v1/mobile/auth/change-password`
[Account] Change password — verifies currentPassword via bcrypt before updating. Set logoutOtherDevices=true to revoke other sessions.
- Điều kiện: `Authenticated` · `CsrfExempt` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 5 })`
- Body: `ChangePasswordReqDto`
    - `currentPassword`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'OldP@ssw0rd', description: 'Current password — verified via bcrypt.compare.', maxLength: 72, }
    - `newPassword`: `string` — IsString, IsNotEmpty, MinLength, MaxLength, Matches, Matches, Matches, Matches — { example: 'NewP@ssw0rd1', description: 'New password. Must contain at least 1 uppercase, 1 lowercase, 1 digit, 1 special character. 8-72 ch
    - `confirmPassword`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'NewP@ssw0rd1', description: 'Must equal newPassword. Cross-field check runs in service.', maxLength: 72, }
    - `logoutOtherDevices?`: `boolean | undefined` — IsOptional, IsBoolean — { example: false, description: 'If true, all OTHER active sessions of this user are revoked (current session preserved). Use when user suspe
    - `refreshToken?`: `string | undefined` — IsOptional, IsString — { example: 'eyJhbGciOiJIUzI1NiIs...', description: 'Refresh token of the calling device. Required only when logoutOtherDevices=true to prese
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto)` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }
- Lỗi/Status: `HttpStatus.LOCKED: Account temporarily locked after too many failed attempts. Error code: ACCOUNT_LOCKED. Response body includes `error.metadata.lockedUntil` (ISO 8601 timestamp) — clients use this for a countdown UI.`

#### `POST /api/v1/mobile/auth/deactivate-account`
[Account] Temporarily deactivate account — all sessions revoked immediately. Account auto-reactivates on next login or after the chosen duration.
- Điều kiện: `Authenticated` · `CsrfExempt` · `RateLimit({ userPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `DeactivateAccountReqDto`
    - `password`: `string` — IsString, MinLength, MaxLength — { example: 'CurrentPassw0rd!', minLength: 8, maxLength: 72, description: 'Current password — re-confirmed before the account is deactivated.
    - `reactivationPolicy`: `ReactivationPolicy` — IsEnum — { enum: ReactivationPolicy, example: ReactivationPolicy.Days30, description: '30_days | until_login. ' + '`until_login` = only a successful 
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto, 'Account deactivated; all sessions revoked.')` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }

#### `POST /api/v1/mobile/auth/delete-account`
[Account] Permanently delete account — revokes all sessions, soft-deletes the users row (for audit), hard-deletes the profile to free the username.
- Điều kiện: `Authenticated` · `CsrfExempt` · `RateLimit({ userPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `DeleteAccountReqDto`
    - `password`: `string` — IsString, IsNotEmpty, MinLength, MaxLength — { example: 'CurrentPassw0rd!', minLength: 8, maxLength: 72, description: 'Current password — re-confirmed before the account is deleted.', }
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto, 'Account deleted; all sessions revoked.')` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }
- Lỗi/Status: `HttpStatus.LOCKED: 'Account temporarily locked after too many failed attempts elsewhere. ' + 'Error code: ACCOUNT_LOCKED; response body includes ' + '`error.metadata.lockedUntil` (ISO 8601).'`

#### `POST /api/v1/mobile/auth/email/request-verification`
[Email Verification, Step 1/2] Send OTP to the VERIFIED PHONE (Zalo/eSMS) — for phone-registered users adding their first email.
- Điều kiện: `Authenticated` · `CsrfExempt` · `RateLimit({ userPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `RequestEmailVerificationReqDto`
    - `email`: `string` — IsEmail, IsNotEmpty — { example: 'user@example.com', description: 'Email address to verify. Normalised to lowercase.', }
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto, 'OTP sent.')` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }
- Lỗi/Status: `429: RATE_LIMITED`

#### `POST /api/v1/mobile/auth/email/verify`
[Email Verification, Step 2/2] Submit email + phone OTP — atomically writes email + emailVerifiedAt to the user row.
- Điều kiện: `Authenticated` · `CsrfExempt` · `RateLimit({ userPerMin: 10 })` · `HttpCode(HttpStatus.OK)`
- Body: `ConfirmEmailVerificationReqDto`
    - `email`: `string` — IsEmail, IsNotEmpty — { example: 'user@example.com', description: 'The email submitted at /email/request-verification. Written to the account once the OTP is veri
    - `otp`: `string` — IsString, IsNotEmpty, Matches — { example: '123456', description: '6-digit numeric one-time password sent to your verified phone number (Zalo/eSMS).', }
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto, 'Email verified.')` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }
- Lỗi/Status: `429: OTP_MAX_ATTEMPTS_REACHED | RATE_LIMITED`

#### `POST /api/v1/mobile/auth/email/resend`
[Email Verification] Resend the email-verification OTP to the account phone (Zalo/eSMS) — always returns 200 (anti-enumeration). Subject to 2-min cooldown + hourly caps.
- Điều kiện: `Authenticated` · `CsrfExempt` · `RateLimit({ userPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `RequestEmailVerificationReqDto`
    - `email`: `string` — IsEmail, IsNotEmpty — { example: 'user@example.com', description: 'Email address to verify. Normalised to lowercase.', }
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto, 'Generic success.')` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }
- Lỗi/Status: `429: RATE_LIMITED`

#### `POST /api/v1/mobile/auth/change-phone/request`
[Change Phone, Step 1/2] Send a verification OTP to the new phone number.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 3, ipPerMin: 10, })` · `HttpCode(HttpStatus.OK)`
- Body: `RequestPhoneChangeReqDto`
    - `newPhone`: `string` — IsString, IsNotEmpty, MaxLength, Matches — { example: '0912345678', description: 'New Vietnamese phone number in normalized national format (10 digits starting with 0).', maxLength: 1
- Response: `ApiEnvelopeResponse(PhoneOtpStatusResDto, 'Phone-change OTP countdown.')` · `Promise<PhoneOtpStatusResDto>`
    - `otpSent`: `boolean` — { description: 'Whether an active (non-expired) OTP currently exists.', example: true, }
    - `resendInSeconds`: `number` — { description: 'Seconds until a resend is allowed (0 = allowed now).', example: 120, }
    - `expiresInSeconds`: `number` — { description: 'Seconds until the current code expires (0 = none active).', example: 300, }
- Lỗi/Status: `429: RATE_LIMITED | OTP_RESEND_COOLDOWN | OTP_HOURLY_CAP_EXCEEDED`

#### `POST /api/v1/mobile/auth/change-phone/verify`
[Change Phone, Step 2/2] Verify the new-phone OTP and atomically update the phone number.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 5, ipPerMin: 20, })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyPhoneChangeReqDto`
    - `otp`: `string` — IsString, IsNotEmpty, MaxLength, Length, Matches — { example: '123456', description: 'Six-digit OTP sent to the new phone number.', minLength: 6, maxLength: 6, }
    - `newPhone`: `string` — IsString, IsNotEmpty, MaxLength, Matches — { example: '0912345678', description: 'New Vietnamese phone number in normalized national format (10 digits starting with 0).', maxLength: 1
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto, 'Phone changed successfully.')` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }
- Lỗi/Status: `429: RATE_LIMITED | OTP_MAX_ATTEMPTS_REACHED`

#### `POST /api/v1/mobile/auth/change-email/request`
[Change Email, Step 1/2] Initiate email change — verify current password, then send OTP to the CURRENT (old) email address.
- Điều kiện: `Authenticated` · `CsrfExempt` · `RateLimit({ userPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `RequestEmailChangeReqDto`
    - `newEmail`: `string` — IsEmail, IsNotEmpty, MaxLength — { example: 'new@example.com', maxLength: 255, description: 'The new email address to change to.', }
    - `currentPassword`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'CurrentP@ssw0rd', maxLength: 72, description: // bcrypt silently truncates at 72 bytes — MaxLength(72) prevents false-positive m
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto, 'OTP sent to the current (old) email.')` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }
- Lỗi/Status: `HttpStatus.LOCKED: ACCOUNT_LOCKED — too many failed attempts; body includes lockedUntil.` | `429: OTP_RESEND_COOLDOWN | OTP_HOURLY_CAP_EXCEEDED | RATE_LIMITED — OTP-core anti-abuse.`

#### `POST /api/v1/mobile/auth/change-email/verify`
[Change Email, Step 2/2] Submit OTP and atomically swap users.email — revokes other sessions, writes audit row.
- Điều kiện: `Authenticated` · `CsrfExempt` · `RateLimit({ userPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyEmailChangeReqDto`
    - `newEmail`: `string` — IsEmail, IsNotEmpty, MaxLength — { example: 'new@example.com', maxLength: 255, description: 'The new email address submitted at /request.', }
    - `otp`: `string` — IsString, IsNotEmpty, Matches — { example: '123456', pattern: '^[0-9]{6}$', description: 'The 6-digit OTP sent to newEmail.', }
    - `refreshToken?`: `string | undefined` — IsOptional, IsString, IsJWT, MaxLength — { description: "Caller's current refresh token (JWT). When provided the service " + 'preserves the associated session while revoking all oth
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto, 'Email changed successfully.')` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }
- Lỗi/Status: `429: OTP_MAX_ATTEMPTS_REACHED`

#### `POST /api/v1/mobile/auth/change-email/resend`
[Change Email] Resend OTP for pending email change — always returns 200 (anti-enumeration). Subject to 2-min cooldown + 3/hour rolling cap.
- Điều kiện: `Authenticated` · `CsrfExempt` · `RateLimit({ userPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `ResendEmailChangeOtpReqDto`
    - `newEmail`: `string` — IsEmail, IsNotEmpty, MaxLength — { example: 'new@example.com', maxLength: 255, description: 'The new email address submitted at /request (OTP target address).', }
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto, 'Generic success (OTP may or may not have been sent).')` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }

### WebAuthController  `/web/auth`  — `src/modules/auth/controllers/web.auth.controller.ts`

#### `POST /api/v1/web/auth/sign-in`
[Session] Sign in — sets access_token + refresh_token as HttpOnly cookies. Device-Id header is required.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `WebSignInDto`
    - `clientId`: `AuthClientId.User` — Equals — { enum: [AuthClientId.User], example: AuthClientId.User, description: 'Web supports only the User client. Merchant and Creator accounts are 
    - `identifier`: `string` — IsString, IsNotEmpty, IsPhoneOrEmail — { example: 'anhdomixi@gmail.com', description: 'Vietnamese phone number (10 digits, starts with 0) or email address — ' + 'whichever the acc
    - `password`: `string` — IsString, IsNotEmpty — { example: 'Tw123123!', description: 'Account password. Sent as-is over TLS; never logged.', }
- Response: `ApiEnvelopeResponse(SignInDeviceResDto)` · `Promise<SignInDeviceResDto>`
    - `outcome`: `"PROCEED" | "TWO_FACTOR_REQUIRED"` — { enum: ['PROCEED', 'TWO_FACTOR_REQUIRED'], description: 'PROCEED — full access granted. TWO_FACTOR_REQUIRED — verify email OTP before token
    - `method?`: `TwoFactorMethod | undefined` — { enum: [TwoFactorMethod.Email] }
    - `twoFactorToken?`: `string | undefined` — { description: 'Opaque pre-auth 2FA token. Not an access or refresh token.', }
    - `resendInSeconds?`: `number | undefined` — { example: 120 }
    - `accessToken?`: `string | undefined` — { description: 'Mobile only — bearer access token' }
    - `refreshToken?`: `string | undefined` — { description: 'Mobile only — refresh token (web uses cookie)', }
    - `expiresIn?`: `number | undefined` — { example: 900 }
    - `tokenType?`: `"Bearer" | undefined` — { enum: ['Bearer'] }
    - `message?`: `string | undefined`

#### `POST /api/v1/web/auth/2fa/verify`
[2FA] Verify email OTP after sign-in challenge — sets web auth cookies only after success. Device-Id header is required.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 10 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyTwoFactorReqDto`
    - `twoFactorToken`: `string` — IsString — { description: 'Opaque 2FA challenge token returned by sign-in.', }
    - `code`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6 }
    - `rememberDevice?`: `boolean | undefined` — IsOptional, IsBoolean — { default: false }
- Response: `ApiEnvelopeResponse(SignInDeviceResDto)` · `Promise<SignInDeviceResDto>`
    - `outcome`: `"PROCEED" | "TWO_FACTOR_REQUIRED"` — { enum: ['PROCEED', 'TWO_FACTOR_REQUIRED'], description: 'PROCEED — full access granted. TWO_FACTOR_REQUIRED — verify email OTP before token
    - `method?`: `TwoFactorMethod | undefined` — { enum: [TwoFactorMethod.Email] }
    - `twoFactorToken?`: `string | undefined` — { description: 'Opaque pre-auth 2FA token. Not an access or refresh token.', }
    - `resendInSeconds?`: `number | undefined` — { example: 120 }
    - `accessToken?`: `string | undefined` — { description: 'Mobile only — bearer access token' }
    - `refreshToken?`: `string | undefined` — { description: 'Mobile only — refresh token (web uses cookie)', }
    - `expiresIn?`: `number | undefined` — { example: 900 }
    - `tokenType?`: `"Bearer" | undefined` — { enum: ['Bearer'] }
    - `message?`: `string | undefined`

#### `POST /api/v1/web/auth/2fa/resend`
[2FA] Resend sign-in email OTP — rotates the 2FA token. Device-Id header is required.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `ResendTwoFactorReqDto`
    - `twoFactorToken`: `string` — IsString — { description: 'Opaque 2FA challenge token returned by sign-in or resend.', }
- Response: `ApiEnvelopeResponse(SignInDeviceResDto)` · `Promise<SignInDeviceResDto>`
    - `outcome`: `"PROCEED" | "TWO_FACTOR_REQUIRED"` — { enum: ['PROCEED', 'TWO_FACTOR_REQUIRED'], description: 'PROCEED — full access granted. TWO_FACTOR_REQUIRED — verify email OTP before token
    - `method?`: `TwoFactorMethod | undefined` — { enum: [TwoFactorMethod.Email] }
    - `twoFactorToken?`: `string | undefined` — { description: 'Opaque pre-auth 2FA token. Not an access or refresh token.', }
    - `resendInSeconds?`: `number | undefined` — { example: 120 }
    - `accessToken?`: `string | undefined` — { description: 'Mobile only — bearer access token' }
    - `refreshToken?`: `string | undefined` — { description: 'Mobile only — refresh token (web uses cookie)', }
    - `expiresIn?`: `number | undefined` — { example: 900 }
    - `tokenType?`: `"Bearer" | undefined` — { enum: ['Bearer'] }
    - `message?`: `string | undefined`

#### `GET /api/v1/web/auth/2fa/status`
[2FA] Get my two-factor status.
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(TwoFactorStatusResDto)` · `Promise<TwoFactorStatusResDto>`
    - `enabled`: `boolean`
    - `method`: `TwoFactorMethod | null` — { enum: [TwoFactorMethod.Email], nullable: true }
    - `enabledAt`: `string | null` — { type: String, format: 'date-time', nullable: true }

#### `POST /api/v1/web/auth/2fa/settings/challenge`
[2FA] Start enable/disable settings challenge — verifies current password and sends email OTP. Requires x-csrf-token header.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `ChallengeTwoFactorSettingsReqDto`
    - `action`: `"enable" | "disable"` — IsIn — { enum: ['enable', 'disable'] }
    - `currentPassword`: `string` — IsString
- Response: `ApiEnvelopeResponse(TrustedDeviceTwoFactorResDto)` · `Promise<TrustedDeviceTwoFactorResDto>`
    - `settingsTwoFactorToken`: `string`
    - `expiresIn`: `number` — { example: 300 }
    - `resendInSeconds`: `number` — { example: 120 }

#### `POST /api/v1/web/auth/2fa/enable`
[2FA] Enable email two-factor authentication after settings OTP. Requires x-csrf-token header.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `EnableTwoFactorReqDto`
    - `settingsTwoFactorToken`: `string` — IsString — { description: 'Opaque settings challenge token returned by /2fa/settings/challenge.', }
    - `code`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6 }
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto)` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }

#### `POST /api/v1/web/auth/2fa/disable`
[2FA] Disable email two-factor authentication after settings OTP. Requires x-csrf-token header.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `DisableTwoFactorReqDto`
    - `settingsTwoFactorToken`: `string` — IsString — { description: 'Opaque settings challenge token returned by /2fa/settings/challenge.', }
    - `code`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6 }
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto)` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }

#### `POST /api/v1/web/auth/refresh-token`
[Session] Refresh tokens — reads refresh_token cookie, rewrites access_token + refresh_token + csrf_token cookies.
- Điều kiện: `Public` · `RateLimit({ ipPerMin: 10 })` · `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto)` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }

#### `POST /api/v1/web/auth/logout`
[Session] Logout current session — reads refresh_token cookie to revoke the session, then clears all auth cookies. Always returns 200.
- Điều kiện: `Public` · `CsrfExempt` · `HttpCode(HttpStatus.OK)` · `RateLimit({ ipPerMin: 30 })`
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto)` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }

#### `POST /api/v1/web/auth/logout-all`
[Session] Logout from all devices — revokes every active session, clears auth cookies. Requires x-csrf-token header.
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 5 })`
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto)` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }

#### `GET /api/v1/web/auth/devices`
[Device Trust] List all device sessions — returns ACTIVE and valid UNVERIFIED devices. isCurrent=true flags the calling device.
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(DeviceListResDto)` · `Promise<DeviceListResDto>`
    - `devices`: `DeviceListItemDto[]` — { type: [DeviceListItemDto] }

#### `GET /api/v1/web/auth/login-history`
Get my login history — one entry per login with device, IP, approximate location and time. Always scoped to the current user.
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(LoginHistoryItemDto)` · `Promise<CursorPaginatedResponse<LoginHistoryItemDto>>`
    - `data`: `LoginHistoryItemDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `POST /api/v1/web/auth/verify-phone`
[Sign-up v2, Step 1/3] Check phone availability — 200 if the number is free, 409 PHONE_ALREADY_EXISTS if already registered.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 10 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyPhoneReqDto`
    - `phoneNumber`: `string` — IsString, IsNotEmpty, Matches — { example: '0912345678', description: 'Vietnamese phone number (10 digits, starts with 0).', }
- Response: `ApiEnvelopeResponse(VerifyPhoneAvailabilityResDto)` · `Promise<VerifyPhoneAvailabilityResDto>`
    - `status`: `boolean` — { example: true }
    - `message`: `string` — { example: 'Phone number is available' }
- Lỗi/Status: `429: RATE_LIMITED`

#### `POST /api/v1/web/auth/sign-up`
[Sign-up v2, Step 2/3] Create account — submit phone + firstName + lastName + password. An OTP is sent to the phone number.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `SignUpPhoneReqDto`
    - `phoneNumber`: `string` — IsString, IsNotEmpty, Matches — { example: '0912345678', description: 'Vietnamese phone number (10 digits, starts with 0).', }
    - `firstName`: `string` — IsString, IsNotEmpty, MinLength, MaxLength — { example: 'Quoc', minLength: 2, maxLength: 50 }
    - `lastName`: `string` — IsString, IsNotEmpty, MinLength, MaxLength — { example: 'Trung', minLength: 2, maxLength: 50 }
    - `password`: `string` — IsString, MinLength, MaxLength, Matches — { example: 'Str0ng!Pass', description: 'Must be 8–72 characters and contain at least one uppercase letter, one lowercase letter, one digit, 
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto)` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }
- Lỗi/Status: `503: SMS_NOT_CONFIGURED` | `429: RATE_LIMITED`

#### `POST /api/v1/web/auth/phone/verify-otp`
[Sign-up v2, Step 3/3] Verify phone OTP — activates account (Pending → Active) and sets access_token + refresh_token cookies.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 10 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyPhoneOtpReqDto`
    - `phoneNumber`: `string` — IsString, IsNotEmpty, Matches — { example: '0912345678', description: 'Vietnamese phone number (10 digits, starts with 0).', }
    - `otp`: `string` — IsString, IsNotEmpty, Length, Matches — { example: '123456', description: 'OTP code (exactly 6 digits).', }
    - `invitationCode?`: `string | undefined` — IsOptional, IsString, MaxLength — { example: 'TRW7K9F2QX', description: 'Optional invitation code from the referrer. If valid, the referrer earns ' + 'trust score on successf
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto)` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }
- Lỗi/Status: `429: RATE_LIMITED`

#### `POST /api/v1/web/auth/phone/resend-otp`
[Sign-up v2] Resend the phone OTP — 2-minute cooldown + hourly caps. Returns the resend/expiry countdown.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyPhoneReqDto`
    - `phoneNumber`: `string` — IsString, IsNotEmpty, Matches — { example: '0912345678', description: 'Vietnamese phone number (10 digits, starts with 0).', }
- Response: `ApiEnvelopeResponse(PhoneOtpStatusResDto)` · `Promise<PhoneOtpStatusResDto>`
    - `otpSent`: `boolean` — { description: 'Whether an active (non-expired) OTP currently exists.', example: true, }
    - `resendInSeconds`: `number` — { description: 'Seconds until a resend is allowed (0 = allowed now).', example: 120, }
    - `expiresInSeconds`: `number` — { description: 'Seconds until the current code expires (0 = none active).', example: 300, }
- Lỗi/Status: `429: OTP_RESEND_COOLDOWN | OTP_HOURLY_CAP_EXCEEDED | RATE_LIMITED` | `503: OTP_DELIVERY_FAILED`

#### `POST /api/v1/web/auth/phone/otp-status`
[Sign-up v2] Phone OTP status — resume the resend/expiry countdown after the browser tab was closed.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 20 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyPhoneReqDto`
    - `phoneNumber`: `string` — IsString, IsNotEmpty, Matches — { example: '0912345678', description: 'Vietnamese phone number (10 digits, starts with 0).', }
- Response: `ApiEnvelopeResponse(PhoneOtpStatusResDto)` · `Promise<PhoneOtpStatusResDto>`
    - `otpSent`: `boolean` — { description: 'Whether an active (non-expired) OTP currently exists.', example: true, }
    - `resendInSeconds`: `number` — { description: 'Seconds until a resend is allowed (0 = allowed now).', example: 120, }
    - `expiresInSeconds`: `number` — { description: 'Seconds until the current code expires (0 = none active).', example: 300, }
- Lỗi/Status: `429: RATE_LIMITED`

#### `POST /api/v1/web/auth/forgot-password`
[Forgot Password, Step 1/3] Request password-reset OTP via email or phone (Zalo) — always returns 200 (anti-enumeration).
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `ForgotPasswordReqDto`
    - `channel`: `ResetChannel` — IsEnum — { enum: ResetChannel, example: ResetChannel.Email, description: 'Delivery channel for the reset OTP: "email" (via email) or "phone" (via Zal
    - `target`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'user@example.com', description: 'Destination that receives the reset OTP. Email address when channel=email (normalised to lowerc
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto, 'Generic message — always returned (anti-enumeration).')` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }
- Lỗi/Status: `429: RATE_LIMITED (per-IP only — does NOT indicate email status)`

#### `POST /api/v1/web/auth/verify-reset-otp`
[Forgot Password, Step 2/3] Verify password-reset OTP — returns a 10-minute reset JWT required for Step 3.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 10 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyResetOtpReqDto`
    - `channel`: `ResetChannel` — IsEnum — { enum: ResetChannel, example: ResetChannel.Email, description: 'Same channel used in Step 1 (forgot-password).', }
    - `target`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'user@example.com', description: 'Destination that received the reset OTP — email (channel=email) or VN phone 0XXXXXXXXX (channel
    - `otp`: `string` — IsString, IsNotEmpty, Matches — { example: '123456', description: '6-digit numeric OTP sent to the target.', }
- Response: `ApiEnvelopeResponse(VerifyResetOtpResponseDto)` · `Promise<VerifyResetOtpResponseDto>`
    - `resetToken`: `string` — { description: 'Short-lived (10 min) JWT to authorise the subsequent /reset-password call.', example: 'eyJhbGciOiJIUzI1NiIs...', }
- Lỗi/Status: `429: OTP_MAX_ATTEMPTS_REACHED | RATE_LIMITED`

#### `POST /api/v1/web/auth/reset-password`
[Forgot Password, Step 3/3] Set new password — uses the reset JWT from Step 2. ALL active sessions are revoked immediately.
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `ResetPasswordReqDto`
    - `resetToken`: `string` — IsString, IsNotEmpty — { description: 'Short-lived (10 min) reset JWT issued by /auth/verify-reset-otp.', example: 'eyJhbGciOiJIUzI1NiIs...', }
    - `newPassword`: `string` — IsString, IsNotEmpty, MinLength, MaxLength, Matches — { example: 'NewP@ssw0rd1', description: 'New password. 8-72 chars; must contain at least one uppercase, one lowercase, one digit, and one sp
    - `confirmPassword`: `string` — IsString, IsNotEmpty, MaxLength, Match — { example: 'NewP@ssw0rd1', description: 'Must exactly match newPassword.', maxLength: 72, }
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto)` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }

#### `POST /api/v1/web/auth/change-password`
[Account] Change password — verifies currentPassword before updating. Reads refresh_token cookie to preserve caller session when logoutOtherDevices=true. Requires x-csrf-token header.
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 5 })`
- Body: `ChangePasswordReqDto`
    - `currentPassword`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'OldP@ssw0rd', description: 'Current password — verified via bcrypt.compare.', maxLength: 72, }
    - `newPassword`: `string` — IsString, IsNotEmpty, MinLength, MaxLength, Matches, Matches, Matches, Matches — { example: 'NewP@ssw0rd1', description: 'New password. Must contain at least 1 uppercase, 1 lowercase, 1 digit, 1 special character. 8-72 ch
    - `confirmPassword`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'NewP@ssw0rd1', description: 'Must equal newPassword. Cross-field check runs in service.', maxLength: 72, }
    - `logoutOtherDevices?`: `boolean | undefined` — IsOptional, IsBoolean — { example: false, description: 'If true, all OTHER active sessions of this user are revoked (current session preserved). Use when user suspe
    - `refreshToken?`: `string | undefined` — IsOptional, IsString — { example: 'eyJhbGciOiJIUzI1NiIs...', description: 'Refresh token of the calling device. Required only when logoutOtherDevices=true to prese
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto)` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }
- Lỗi/Status: `HttpStatus.LOCKED: Account temporarily locked after too many failed attempts. Error code: ACCOUNT_LOCKED. Response body includes `error.metadata.lockedUntil` (ISO 8601 timestamp) — clients use this for a countdown UI.`

#### `POST /api/v1/web/auth/deactivate-account`
[Account] Temporarily deactivate account — all sessions revoked, auth cookies cleared. Account auto-reactivates on next login or after chosen duration. Requires x-csrf-token header.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `DeactivateAccountReqDto`
    - `password`: `string` — IsString, MinLength, MaxLength — { example: 'CurrentPassw0rd!', minLength: 8, maxLength: 72, description: 'Current password — re-confirmed before the account is deactivated.
    - `reactivationPolicy`: `ReactivationPolicy` — IsEnum — { enum: ReactivationPolicy, example: ReactivationPolicy.Days30, description: '30_days | until_login. ' + '`until_login` = only a successful 
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto, 'Account deactivated; all sessions revoked.')` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }

#### `POST /api/v1/web/auth/delete-account`
[Account] Permanently delete account — revokes all sessions, clears cookies, soft-deletes the users row, hard-deletes the profile to free the username. Requires x-csrf-token header.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `DeleteAccountReqDto`
    - `password`: `string` — IsString, IsNotEmpty, MinLength, MaxLength — { example: 'CurrentPassw0rd!', minLength: 8, maxLength: 72, description: 'Current password — re-confirmed before the account is deleted.', }
- Response: `ApiEnvelopeResponse(AuthMessageResponseDto, 'Account deleted; sessions revoked; cookies cleared.')` · `Promise<AuthMessageResponseDto>`
    - `message`: `string` — { example: 'Logout successful' }
- Lỗi/Status: `HttpStatus.LOCKED: 'Account temporarily locked. Error code: ACCOUNT_LOCKED; ' + '`error.metadata.lockedUntil` (ISO 8601) in response body.'`

#### `POST /api/v1/web/auth/email/request-verification`
[Email Verification, Step 1/2] Send OTP to the VERIFIED PHONE (Zalo/eSMS) — for phone-registered users adding their first email. Requires x-csrf-token header.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `RequestEmailVerificationReqDto`
    - `email`: `string` — IsEmail, IsNotEmpty — { example: 'user@example.com', description: 'Email address to verify. Normalised to lowercase.', }
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto, 'OTP sent.')` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }
- Lỗi/Status: `429: RATE_LIMITED`

#### `POST /api/v1/web/auth/email/verify`
[Email Verification, Step 2/2] Submit email + phone OTP — atomically writes email + emailVerifiedAt to the user row. Requires x-csrf-token header.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 10 })` · `HttpCode(HttpStatus.OK)`
- Body: `ConfirmEmailVerificationReqDto`
    - `email`: `string` — IsEmail, IsNotEmpty — { example: 'user@example.com', description: 'The email submitted at /email/request-verification. Written to the account once the OTP is veri
    - `otp`: `string` — IsString, IsNotEmpty, Matches — { example: '123456', description: '6-digit numeric one-time password sent to your verified phone number (Zalo/eSMS).', }
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto, 'Email verified.')` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }
- Lỗi/Status: `429: OTP_MAX_ATTEMPTS_REACHED | RATE_LIMITED`

#### `POST /api/v1/web/auth/email/resend`
[Email Verification] Resend the email-verification OTP to the account phone (Zalo/eSMS) — always returns 200 (anti-enumeration). Subject to 2-min cooldown + hourly caps. Requires x-csrf-token header.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `RequestEmailVerificationReqDto`
    - `email`: `string` — IsEmail, IsNotEmpty — { example: 'user@example.com', description: 'Email address to verify. Normalised to lowercase.', }
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto, 'Generic success.')` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }
- Lỗi/Status: `429: RATE_LIMITED`

#### `POST /api/v1/web/auth/change-phone/request`
[Change Phone, Step 1/2] Send a verification OTP to the new phone number. Requires x-csrf-token.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 3, ipPerMin: 10, })` · `HttpCode(HttpStatus.OK)`
- Body: `RequestPhoneChangeReqDto`
    - `newPhone`: `string` — IsString, IsNotEmpty, MaxLength, Matches — { example: '0912345678', description: 'New Vietnamese phone number in normalized national format (10 digits starting with 0).', maxLength: 1
- Response: `ApiEnvelopeResponse(PhoneOtpStatusResDto, 'Phone-change OTP countdown.')` · `Promise<PhoneOtpStatusResDto>`
    - `otpSent`: `boolean` — { description: 'Whether an active (non-expired) OTP currently exists.', example: true, }
    - `resendInSeconds`: `number` — { description: 'Seconds until a resend is allowed (0 = allowed now).', example: 120, }
    - `expiresInSeconds`: `number` — { description: 'Seconds until the current code expires (0 = none active).', example: 300, }
- Lỗi/Status: `429: RATE_LIMITED | OTP_RESEND_COOLDOWN | OTP_HOURLY_CAP_EXCEEDED`

#### `POST /api/v1/web/auth/change-phone/verify`
[Change Phone, Step 2/2] Verify the new-phone OTP and atomically update the phone number. Requires x-csrf-token.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 5, ipPerMin: 20, })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyPhoneChangeReqDto`
    - `otp`: `string` — IsString, IsNotEmpty, MaxLength, Length, Matches — { example: '123456', description: 'Six-digit OTP sent to the new phone number.', minLength: 6, maxLength: 6, }
    - `newPhone`: `string` — IsString, IsNotEmpty, MaxLength, Matches — { example: '0912345678', description: 'New Vietnamese phone number in normalized national format (10 digits starting with 0).', maxLength: 1
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto, 'Phone changed successfully.')` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }
- Lỗi/Status: `429: RATE_LIMITED | OTP_MAX_ATTEMPTS_REACHED`

#### `POST /api/v1/web/auth/change-email/request`
[Change Email, Step 1/2] Initiate email change — verify current password, then send OTP to the CURRENT (old) email address. Requires x-csrf-token header.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `RequestEmailChangeReqDto`
    - `newEmail`: `string` — IsEmail, IsNotEmpty, MaxLength — { example: 'new@example.com', maxLength: 255, description: 'The new email address to change to.', }
    - `currentPassword`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'CurrentP@ssw0rd', maxLength: 72, description: // bcrypt silently truncates at 72 bytes — MaxLength(72) prevents false-positive m
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto, 'OTP sent to the current (old) email.')` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }
- Lỗi/Status: `HttpStatus.LOCKED: ACCOUNT_LOCKED — too many failed attempts; body includes lockedUntil.` | `429: OTP_RESEND_COOLDOWN | OTP_HOURLY_CAP_EXCEEDED | RATE_LIMITED — OTP-core anti-abuse.`

#### `POST /api/v1/web/auth/change-email/verify`
[Change Email, Step 2/2] Submit OTP and atomically swap users.email — revokes other sessions, writes audit row. Requires x-csrf-token header.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 5 })` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyEmailChangeReqDto`
    - `newEmail`: `string` — IsEmail, IsNotEmpty, MaxLength — { example: 'new@example.com', maxLength: 255, description: 'The new email address submitted at /request.', }
    - `otp`: `string` — IsString, IsNotEmpty, Matches — { example: '123456', pattern: '^[0-9]{6}$', description: 'The 6-digit OTP sent to newEmail.', }
    - `refreshToken?`: `string | undefined` — IsOptional, IsString, IsJWT, MaxLength — { description: "Caller's current refresh token (JWT). When provided the service " + 'preserves the associated session while revoking all oth
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto, 'Email changed successfully.')` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }
- Lỗi/Status: `429: OTP_MAX_ATTEMPTS_REACHED`

#### `POST /api/v1/web/auth/change-email/resend`
[Change Email] Resend OTP for pending email change — always returns 200 (anti-enumeration). Subject to 2-min cooldown + 3/hour rolling cap. Requires x-csrf-token header.
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 3 })` · `HttpCode(HttpStatus.OK)`
- Body: `ResendEmailChangeOtpReqDto`
    - `newEmail`: `string` — IsEmail, IsNotEmpty, MaxLength — { example: 'new@example.com', maxLength: 255, description: 'The new email address submitted at /request (OTP target address).', }
- Response: `ApiEnvelopeResponse(WebAuthMessageResponseDto, 'Generic success (OTP may or may not have been sent).')` · `Promise<WebAuthMessageResponseDto>`
    - `message`: `string` — { example: 'Sign in successful' }

## Module `otp`

### PublicOtpCallbackController  `/public/otp`  — `src/modules/otp/controllers/public.otp-callback.controller.ts`

#### `GET /api/v1/public/otp/esms-callback/:secret`
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 120 })` · `HttpCode(HttpStatus.OK)`
- Path `secret`: `string`
- Query: `EsmsCallbackReqDto`
    - `RequestId`: `string` — IsString, IsNotEmpty, MaxLength — { description: 'Our idempotency key echoed back.', maxLength: 64, }
    - `SendStatus`: `string` — IsString, IsNotEmpty, MaxLength — { description: 'Message status: 1=pending-approval, 2=queued, 4=rejected, 5=sent, 7=awaiting-report.', maxLength: 8, }
    - `SendSuccess?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Count of successful sends.', maxLength: 16, }
    - `SendFailed?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Count of failed sends.', maxLength: 16 }
    - `SMSID?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'eSMS message id.', maxLength: 64 }
    - `partnerids?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Zalo transaction id.', maxLength: 128 }
    - `error_info?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Zalo delivery detail (JSON).', maxLength: 2048, }
    - `oaid?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Sending OA id.', maxLength: 64 }
    - `TypeId?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Message type id.', maxLength: 16 }
    - `telcoid?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Telco id.', maxLength: 16 }
    - `phonenumber?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Recipient phone (Zalo UID).', maxLength: 32, }
    - `TotalPrice?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Total price.', maxLength: 32 }
    - `TotalReceiver?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Total receivers.', maxLength: 16 }
    - `TotalSent?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Total sent.', maxLength: 16 }
    - `tempid?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Zalo template send id.', maxLength: 64 }
- Response: `Promise<{ received: boolean; }>`

## Module `ekyc`

### MobileEkycController  `/mobile/ekyc`  — `src/modules/ekyc/controllers/mobile.ekyc.controller.ts`

#### `POST /api/v1/mobile/ekyc/ocr-id-files`
VNPT compact OCR flow: upload CCCD front and back files, then OCR both sides in one VNPT request.
- Điều kiện: `Authenticated` · `RateLimit(EKYC_UPLOAD_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(VnptOcrIdFromFilesResDto)` · `Promise<VnptOcrIdFromFilesResDto>`
    - `frontHash`: `string`
    - `backHash`: `string`
    - `steps`: `VnptEkycStepResDto[]` — { type: [VnptEkycStepResDto] }
    - `provider`: `"VNPT"`
    - `clientSession`: `string`
    - `providerResponse`: `VnptJsonObject` — { type: 'object', additionalProperties: true, description: 'Sanitized VNPT OCR fields approved for the public API. Raw provider payload is n
    - `fullName?`: `string | undefined`
    - `idNumber?`: `string | undefined`
    - `dateOfBirth?`: `string | undefined`
    - `gender?`: `string | undefined`
    - `nationality?`: `string | undefined`
    - `issueDate?`: `string | undefined`
    - `issueLocation?`: `string | undefined`

#### `POST /api/v1/mobile/ekyc/face-compare`
VNPT final eKYC step: upload selfie, validate liveness + face match, then write the final approved/rejected eKYC record.
- Điều kiện: `Authenticated` · `RateLimit(EKYC_UPLOAD_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Body: `VnptFaceCompareReqDto`
    - `frontHash`: `string` — IsString, IsNotEmpty, MaxLength — { description: 'Hash returned after uploading the CCCD front.' }
    - `backHash`: `string` — IsString, IsNotEmpty, MaxLength — { description: 'Hash returned after uploading the CCCD back.' }
    - `clientSession?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Optional client session returned by OCR. When provided it must match the cached OCR session; backend always reuses the cache
- Response: `ApiOkResponse({
    description:
      'Submitted through VNPT, or the alr)` · `Promise<void>`

#### `GET /api/v1/mobile/ekyc/status`
Get my eKYC verification status. Always HTTP 200. When the user has never submitted, returns { success: false, status: 200, message: "No eKYC submission yet", data: {} } — FE branches on envelope.succ
- Điều kiện: `Authenticated` · `RateLimit(EKYC_READ_RATE_LIMIT)`
- Response: `ApiOkResponse({
    description:
      'The eKYC record, or the never-subm)` · `Promise<void>`

### WebEkycController  `/web/ekyc`  — `src/modules/ekyc/controllers/web.ekyc.controller.ts`

#### `GET /api/v1/web/ekyc/status`
Get my eKYC verification status. Always HTTP 200. When the user has never submitted, returns { success: false, status: 200, message: "No eKYC submission yet", data: {} } — FE branches on envelope.succ
- Điều kiện: `Authenticated` · `RateLimit(EKYC_READ_RATE_LIMIT)`
- Response: `ApiOkResponse({
    description:
      'The eKYC record, or the never-subm)` · `Promise<void>`

#### `GET /api/v1/web/ekyc`
List all eKYC verifications (cursor-paginated, filterable by status)
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.EkycRead)`
- Query: `EkycListQueryDto`
    - `status?`: `EkycStatus | undefined` — IsEnum, IsOptional — { enum: EkycStatus, description: 'Filter by status' }
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(AdminEkycResponseDto)` · `Promise<CursorPaginatedResponse<AdminEkycResponseDto>>`
    - `data`: `AdminEkycResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/ekyc/:userId`
Get eKYC verification for a specific user
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.EkycRead)`
- Path ``: `EkycUserIdParamDto`
- Response: `ApiEnvelopeResponse(AdminEkycResponseDto)` · `Promise<AdminEkycResponseDto>`
    - `userId`: `string` — { description: 'Owner of this verification. Pass it back as the {userId} path param of the approve / reject endpoints.', example: '873611447
    - `status`: `EkycStatus` — { enum: EkycStatus }
    - `verifiedAt?`: `Date | undefined`
    - `rejectedReason?`: `string | undefined`
    - `createdAt`: `Date`
    - `updatedAt`: `Date`

#### `PATCH /api/v1/web/ekyc/:userId/approve`
Manually approve an eKYC verification
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.EkycReview)` · `HttpCode(HttpStatus.OK)`
- Path ``: `EkycUserIdParamDto`
- Response: `ApiEnvelopeResponse(AdminEkycResponseDto)` · `Promise<AdminEkycResponseDto>`
    - `userId`: `string` — { description: 'Owner of this verification. Pass it back as the {userId} path param of the approve / reject endpoints.', example: '873611447
    - `status`: `EkycStatus` — { enum: EkycStatus }
    - `verifiedAt?`: `Date | undefined`
    - `rejectedReason?`: `string | undefined`
    - `createdAt`: `Date`
    - `updatedAt`: `Date`

#### `PATCH /api/v1/web/ekyc/:userId/reject`
Manually reject an eKYC verification with a reason
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.EkycReview)` · `HttpCode(HttpStatus.OK)`
- Path ``: `EkycUserIdParamDto`
- Body: `AdminRejectEkycDto`
    - `reason`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'ID document is unclear or expired' }
- Response: `ApiEnvelopeResponse(AdminEkycResponseDto)` · `Promise<AdminEkycResponseDto>`
    - `userId`: `string` — { description: 'Owner of this verification. Pass it back as the {userId} path param of the approve / reject endpoints.', example: '873611447
    - `status`: `EkycStatus` — { enum: EkycStatus }
    - `verifiedAt?`: `Date | undefined`
    - `rejectedReason?`: `string | undefined`
    - `createdAt`: `Date`
    - `updatedAt`: `Date`

## Module `sub-account`

### MobileSubAccountCollaborationController  `/mobile/sub-accounts`  — `src/modules/sub-account/controllers/mobile.sub-account-collaboration.controller.ts`

#### `GET /api/v1/mobile/sub-accounts/:subAccountId/collaborator-candidates`
Search root users who can be invited as collaborators
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RateLimit(COLLABORATION_CANDIDATE_SEARCH_RATE_LIMIT)`
- Path `subAccountId`: `string`
- Query: `SearchProfileQueryDto`
    - `q`: `string` — IsString, IsNotEmpty, MinLength, MaxLength, Matches — { description: 'Search term. Username is matched as a substring (contains). Phone is matched only when `q` is a COMPLETE Vietnamese number (
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(MobileCollaborationCandidateResponseDto, 'Cursor-paginated collaborator candidates. `ekycVerified` is)` · `Promise<CursorPaginatedResponse<MobileCollaborationCandidateResponseDto>>`
    - `data`: `MobileCollaborationCandidateResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `403: SUB_ACCOUNT_COLLABORATION_FORBIDDEN`

### MobileSubAccountController  `/mobile/sub-accounts`  — `src/modules/sub-account/controllers/mobile.sub-account.controller.ts`

#### `GET /api/v1/mobile/sub-accounts/roles`
List roles assignable to a new sub-account.
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Response: `Promise<AssignableRoleResDto[]>`
    - `roleId`: `string` — { description: 'Role id.', example: '7' }
    - `roleCode`: `string` — { description: 'Stable technical role code.', example: 'merchant', }
    - `roleName`: `string` — { description: 'Localized role display name.', example: 'Merchant', }
    - `description`: `string | null` — { type: String, description: 'Human-readable role description.', example: 'Sub-account role: merchant', nullable: true, }
    - `isCurrent`: `boolean` — { description: 'Whether this role is the RBAC role of the currently authenticated account.', example: false, }

#### `GET /api/v1/mobile/sub-accounts/categories`
List the active categories a Merchant or Creator account can choose from.
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Query: `ListSubAccountCategoriesQueryDto`
    - `role`: `"creator" | "merchant"` — IsIn — { enum: SUB_ACCOUNT_ROLE_NAMES, description: 'Role whose category vocabulary to return. Merchant and Creator use separate category lists.', 
- Response: `Promise<SubAccountCategoryResDto[]>`
    - `id`: `string` — { description: 'Category id.', example: '1', type: 'string' }
    - `code`: `string` — { description: 'Stable technical category code.', example: 'beauty', }
    - `name`: `string` — { description: 'Category display name in the request locale.', example: 'Beauty', }

#### `GET /api/v1/mobile/sub-accounts`
List personal, owned, and collaborative account contexts.
- Điều kiện: `RequireEkyc`
- Query: `ListFamilyAccountsQueryDto`
    - `role?`: `"creator" | "merchant" | undefined` — IsOptional, IsIn — { enum: SUB_ACCOUNT_ROLE_NAMES, description: 'Filter owned and collaborative sub-accounts by role. The personal root account is always retur
- Response: `Promise<FamilyAccountResDto[]>`
    - `userId`: `string` — { description: 'Account user id.', example: '42' }
    - `parentUserId`: `string | null` — { type: String, description: 'Parent root user id for owned sub-accounts. Null for personal and collaborative accounts.', example: '10', nul
    - `isCurrent`: `boolean` — { description: 'True when this row is the currently selected account context.', }
    - `isRoot`: `boolean` — { description: 'True when this row is the primary account.' }
    - `isSubAccount`: `boolean` — { description: 'True when this row is a sub-account.' }
    - `accessType`: `FamilyAccountAccessType` — { description: 'How the authenticated root user can access this account.', enum: FamilyAccountAccessType, }
    - `contextRole`: `string | null` — { type: String, description: 'Owner for an owned sub-account, the collaboration role for a collaborative account, or null for personal acces
    - `role`: `string | null` — { type: String, nullable: true, description: 'Assigned role name.', example: 'merchant', }
    - `status`: `FamilyAccountStatus` — { description: 'Public account status. Rejected sub-account requests are projected from internally deleted records.', enum: FamilyAccountSta
    - `createdAt`: `string` — { description: 'When the account was created/requested.', format: 'date-time', }
    - `profile`: `AccountProfileSummaryResDto | null` — { type: AccountProfileSummaryResDto, nullable: true, example: { username: 'trust_merchant_a1b2c3', name: 'Trust Merchant', displayName: 'Tru
    - `categories`: `SubAccountCategoryResDto[] | null` — { type: [SubAccountCategoryResDto], nullable: true, description: 'Categories chosen for a Merchant or Creator account, in picker order, name

#### `GET /api/v1/mobile/sub-accounts/:id/suspension-appeals`
List suspension appeals submitted for one owned sub-account.
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Path `id`: `string`
- Response: `Promise<SubAccountSuspensionAppealResDto[]>`
    - `id`: `string` — { description: 'Appeal id.' }
    - `subAccountUserId`: `string` — { description: 'Suspended sub-account user id.' }
    - `submittedByUserId`: `string` — { description: 'Root account user id that submitted the appeal.', }
    - `status`: `SubAccountSuspensionAppealStatus` — { enum: SubAccountSuspensionAppealStatus, example: SubAccountSuspensionAppealStatus.Pending, }
    - `reason`: `string` — { description: 'Appeal reason.' }
    - `adminResponse`: `string | null` — { type: String, description: 'Admin response after review.', nullable: true, }
    - `reviewedByUserId`: `string | null` — { type: String, description: 'Admin user id that reviewed the appeal.', nullable: true, }
    - `reviewedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `403: SUB_ACCOUNT_APPEAL_FORBIDDEN`

#### `POST /api/v1/mobile/sub-accounts/:id/suspension-appeals`
Appeal the suspension of one owned sub-account.
- Điều kiện: `RequireEkyc` · `RequireMembership` · `HttpCode(HttpStatus.OK)` · `RateLimit(SUB_ACCOUNT_HIGH_WRITE_RATE_LIMIT)`
- Path `id`: `string`
- Body: `CreateSuspensionAppealReqDto`
    - `reason`: `string` — IsString, MinLength, MaxLength — { description: 'Reason for asking admin to review the suspension.', minLength: 10, maxLength: 1000, example: 'The business license was updat
- Response: `ApiEnvelopeResponse(SubAccountSuspensionAppealResDto)` · `Promise<SubAccountSuspensionAppealResDto>`
    - `id`: `string` — { description: 'Appeal id.' }
    - `subAccountUserId`: `string` — { description: 'Suspended sub-account user id.' }
    - `submittedByUserId`: `string` — { description: 'Root account user id that submitted the appeal.', }
    - `status`: `SubAccountSuspensionAppealStatus` — { enum: SubAccountSuspensionAppealStatus, example: SubAccountSuspensionAppealStatus.Pending, }
    - `reason`: `string` — { description: 'Appeal reason.' }
    - `adminResponse`: `string | null` — { type: String, description: 'Admin response after review.', nullable: true, }
    - `reviewedByUserId`: `string | null` — { type: String, description: 'Admin user id that reviewed the appeal.', nullable: true, }
    - `reviewedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `403: SUB_ACCOUNT_APPEAL_FORBIDDEN` | `409: SUB_ACCOUNT_APPEAL_TARGET_NOT_SUSPENDED or SUB_ACCOUNT_APPEAL_DUPLICATE_PENDING`

#### `POST /api/v1/mobile/sub-accounts`
Submit a sub-account creation request for admin approval. The account remains pending and cannot be switched into until approved.
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequireEkyc` · `RequireMembership` · `RateLimit(SUB_ACCOUNT_HIGH_WRITE_RATE_LIMIT)`
- Body: `CreateSubAccountReqDto`
    - `role`: `"creator" | "merchant"` — IsIn — { description: 'Role to assign to the new sub-account.', enum: SUB_ACCOUNT_ROLE_NAMES, example: 'merchant', }
    - `name?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Backward-compatible profile/account label saved to user_profiles.fullName. ' + 'Do not use this as the public author label f
    - `legalProfile`: `SubAccountLegalProfileReqDto` — IsDefined — { description: 'Legal/compliance profile submitted for admin review before the sub-account can be used. ' + 'Creator types: individual, hous
      - **SubAccountLegalProfileReqDto**
        - `legalEntityType`: `SubAccountLegalEntityType` — IsEnum — { description: 'Creator: individual, household_business or company. Merchant: household_business or company only. organization is not suppor
        - `legalName`: `string` — IsString, IsNotEmpty, MaxLength — { description: 'Legal/compliance name from business registration or identity record. ' + 'This is not the public display label; render respo
        - `taxCode?`: `string | undefined` — IsOptional, IsString, MaxLength, Matches — { description: 'Required for merchants and non-individual creators. Individual Creator onboarding may omit it, but paid sales require it. ' 
        - `businessRegistrationNumber?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Business or household business registration number.', example: '0312345678', maxLength: 50, }
        - `businessRegistrationIssuedAt?`: `string | undefined` — IsOptional, IsDateString — { description: 'Business registration issue date.', example: '2025-01-15', format: 'date', }
        - `businessRegistrationIssuedBy?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Business registration issuing authority.', example: 'Ho Chi Minh City Department of Planning and Investment', maxLength: 255
        - `registeredAddress?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Registered head office or legal address.', example: '123 Nguyen Hue, Ben Nghe Ward, District 1, Ho Chi Minh City', maxLength
        - `operatingAddress?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Operating address if different from registered address.', example: '456 Le Loi, Ben Thanh Ward, District 1, Ho Chi Minh City
        - `contactEmail?`: `string | undefined` — IsOptional, IsEmail, MaxLength — { description: 'Compliance contact email.', example: 'legal@example.vn', maxLength: 255, }
        - `contactPhone?`: `string | undefined` — IsOptional, IsPhoneNumber, MaxLength — { description: 'Compliance contact phone number.', example: '+84901234567', maxLength: 20, }
        - `websiteUrl?`: `string | undefined` — IsOptional, IsUrl, MaxLength — { description: 'Official website URL.', example: 'https://example.vn', maxLength: 500, }
        - `businessLine?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Primary registered business line or creator business line.', example: 'Retail e-commerce and consumer goods', maxLength: 255
    - `merchantProfile?`: `SubAccountMerchantProfileReqDto | undefined` — IsOptional — { description: 'Required when role is `merchant`. Must not be sent when role is `creator`.', type: SubAccountMerchantProfileReqDto, example:
    - `creatorProfile?`: `SubAccountCreatorProfileReqDto | undefined` — IsOptional — { description: 'Required when role is `creator`. Must not be sent when role is `merchant`.', type: SubAccountCreatorProfileReqDto, example: 
- Response: `ApiEnvelopeResponse(SubAccountResDto)` · `Promise<SubAccountResDto>`
    - `userId`: `string` — { description: 'Sub-account user id.', example: '42' }
    - `parentUserId`: `string` — { description: 'Parent (root) account user id.', example: '10', }
    - `role`: `string` — { description: 'Assigned role name.', example: 'merchant' }
    - `status`: `UserStatus` — { description: 'Account status. `pending` = awaiting admin approval (not usable yet, cannot be switched into); ' + '`active` = approved and 
    - `createdAt`: `string` — { description: 'When the sub-account was requested.', format: 'date-time', }
    - `message?`: `string | undefined` — { description: 'User-facing status message. Pending requests are waiting for admin approval and cannot be switched into yet.', example: 'Sub
    - `profile`: `AccountProfileSummaryResDto | null` — { type: AccountProfileSummaryResDto, nullable: true, example: { username: 'trust_merchant_a1b2c3', name: 'Trust Merchant', displayName: 'Tru
    - `legalProfile`: `SubAccountLegalProfileResDto | null` — { description: 'Legal/compliance profile submitted for admin review. Not intended for public profile rendering.', type: SubAccountLegalProfi
    - `merchantProfile`: `SubAccountMerchantProfileResDto | null` — { description: 'Merchant-specific profile details. Present only for merchant roles.', type: SubAccountMerchantProfileResDto, nullable: true,
    - `creatorProfile`: `SubAccountCreatorProfileResDto | null` — { description: 'Creator-specific profile details. Present only for creator roles.', type: SubAccountCreatorProfileResDto, nullable: true, ex
- Lỗi/Status: `400: 'SUB_ACCOUNT_PROFILE_INVALID with fieldErrors when role-specific profiles are missing or sent for the wrong role, or when `categoryIds` is empty, has duplicates, or contains an id that is unknown, inactive, or not a cate` | `409: SUB_ACCOUNT_LIMIT_REACHED`

#### `POST /api/v1/mobile/sub-accounts/switch`
Switch the session to personal, an owned sub-account, or a collaborative Merchant/Creator context.
- Điều kiện: `RequireEkyc` · `HttpCode(HttpStatus.OK)` · `RateLimit(SUB_ACCOUNT_MUTATION_RATE_LIMIT)`
- Body: `SwitchAccountReqDto`
    - `targetUserId`: `string` — IsBigIntId — { description: 'Target user id to switch the active session to. Must be a member of the caller account family (the root or one of its sub-ac
- Response: `ApiEnvelopeResponse(SwitchAccountResDto)` · `Promise<SwitchAccountResDto>`
    - `clientId`: `AuthClientId` — { enum: AuthClientId, example: AuthClientId.Merchant, description: 'Client application bound to the new session. This does not change when s
    - `authenticatedUserId`: `string` — { example: '10', type: String, description: 'Root user who authenticated with identifier and password.', }
    - `activeAccountUserId`: `string | null` — { example: '42', nullable: true, type: String, description: 'Selected Merchant/Creator account user id; null after switching back to the roo
    - `accountRole`: `"creator" | "merchant" | null` — { enum: ['merchant', 'creator'], example: 'merchant', nullable: true, description: 'Role of the selected managed account; null for the root 
    - `accessType`: `"personal" | "owner" | "collaborator"` — { enum: ['personal', 'owner', 'collaborator'], example: 'owner', description: '`owner` for an owned account, `collaborator` for an assigned 
    - `contextRole`: `string | null` — { type: String, nullable: true, example: null, description: 'Assigned collaboration role such as `content_merchant`; null for owner and pers
    - `accessToken`: `string` — { description: 'JWT access token used for API authorization.', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', }
    - `refreshToken`: `string` — { description: 'JWT refresh token used to obtain a new access token.', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', }
    - `expiresIn`: `number` — { description: 'Access token lifetime in seconds.', example: 900, }
    - `tokenType`: `string` — { description: 'Token scheme used in the Authorization header.', example: 'Bearer', default: 'Bearer', }

### WebAdminCreatorCategoryController  `/web/admin/creator-categories`  — `src/modules/sub-account/controllers/web.admin.creator-category.controller.ts`

#### `GET /api/v1/web/admin/creator-categories`
[Admin] List Creator categories
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.SubAccountCategoriesManage)`
- Query: `ListAdminSubAccountCategoriesQueryDto`
    - `isActive?`: `boolean | undefined` — IsOptional, IsBoolean — { description: 'Only active (`true`) or only inactive (`false`) categories. Omit for both.', example: true, }
    - `page?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: DEFAULT_PAGE, default: DEFAULT_PAGE }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT, }
- Response: `Promise<PaginatedResponse<AdminSubAccountCategoryResDto>>`
    - `data`: `AdminSubAccountCategoryResDto[]`
    - `meta`: `{ total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; ha`

#### `POST /api/v1/web/admin/creator-categories`
[Admin] Create a Creator category
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.SubAccountCategoriesManage)` · `RateLimit({ userPerMin: 30 })`
- Body: `CreateSubAccountCategoryReqDto`
    - `code`: `string` — IsString, IsNotEmpty, MaxLength, Matches — { example: 'home_living', maxLength: 80, description: 'Stable machine code, lowercase snake_case, unique within this category list. Trimmed;
    - `nameVi`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'Nhà cửa & Đời sống', maxLength: 255 }
    - `nameEn`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'Home & Living', maxLength: 255 }
    - `description?`: `string | null | undefined` — IsOptional, IsString, MaxLength — { type: String, nullable: true, maxLength: 2000 }
    - `sortOrder?`: `number | undefined` — IsOptional, IsInt, Min, Max — { example: 40, minimum: 0, maximum: 2147483647, default: 0, }
- Response: `ApiEnvelopeResponse(AdminSubAccountCategoryResDto, 'The created category.')` · `Promise<AdminSubAccountCategoryResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `code`: `string` — { example: 'beauty' }
    - `nameVi`: `string` — { example: 'Làm đẹp' }
    - `nameEn`: `string` — { example: 'Beauty' }
    - `description`: `string | null` — { nullable: true, type: String }
    - `sortOrder`: `number` — { example: 10 }
    - `isActive`: `boolean` — { example: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `HttpStatus.CONFLICT: SUB_ACCOUNT_CATEGORY_CODE_CONFLICT`

#### `PATCH /api/v1/web/admin/creator-categories/:id`
[Admin] Update a Creator category
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.SubAccountCategoriesManage)` · `RateLimit({ userPerMin: 30 })`
- Path `id`: `string`
- Body: `UpdateSubAccountCategoryReqDto`
    - `nameVi?`: `string | undefined` — ValidateIf, IsString, IsNotEmpty, MaxLength — { example: 'Nhà cửa & Đời sống', maxLength: 255 }
    - `nameEn?`: `string | undefined` — ValidateIf, IsString, IsNotEmpty, MaxLength — { example: 'Home & Living', maxLength: 255 }
    - `description?`: `string | null | undefined` — IsOptional, IsString, MaxLength — { type: String, nullable: true, maxLength: 2000, description: 'Send `null` to clear the description.', }
    - `sortOrder?`: `number | undefined` — ValidateIf, IsInt, Min, Max — { example: 40, minimum: 0, maximum: 2147483647 }
- Response: `ApiEnvelopeResponse(AdminSubAccountCategoryResDto, 'The updated category.')` · `Promise<AdminSubAccountCategoryResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `code`: `string` — { example: 'beauty' }
    - `nameVi`: `string` — { example: 'Làm đẹp' }
    - `nameEn`: `string` — { example: 'Beauty' }
    - `description`: `string | null` — { nullable: true, type: String }
    - `sortOrder`: `number` — { example: 10 }
    - `isActive`: `boolean` — { example: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `HttpStatus.NOT_FOUND: SUB_ACCOUNT_CATEGORY_NOT_FOUND`

#### `PATCH /api/v1/web/admin/creator-categories/:id/status`
[Admin] Activate or deactivate a Creator category
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.SubAccountCategoriesManage)` · `RateLimit({ userPerMin: 30 })`
- Path `id`: `string`
- Body: `SetSubAccountCategoryStatusReqDto`
    - `isActive`: `boolean` — IsBoolean — { example: false, description: '`false` retires the category: it leaves the picker and cannot be chosen for new accounts, but stays on accou
- Response: `ApiEnvelopeResponse(AdminSubAccountCategoryResDto, 'The category with its new status.')` · `Promise<AdminSubAccountCategoryResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `code`: `string` — { example: 'beauty' }
    - `nameVi`: `string` — { example: 'Làm đẹp' }
    - `nameEn`: `string` — { example: 'Beauty' }
    - `description`: `string | null` — { nullable: true, type: String }
    - `sortOrder`: `number` — { example: 10 }
    - `isActive`: `boolean` — { example: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `HttpStatus.NOT_FOUND: SUB_ACCOUNT_CATEGORY_NOT_FOUND`

### WebAdminMerchantCategoryController  `/web/admin/merchant-categories`  — `src/modules/sub-account/controllers/web.admin.merchant-category.controller.ts`

#### `GET /api/v1/web/admin/merchant-categories`
[Admin] List Merchant categories
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.SubAccountCategoriesManage)`
- Query: `ListAdminSubAccountCategoriesQueryDto`
    - `isActive?`: `boolean | undefined` — IsOptional, IsBoolean — { description: 'Only active (`true`) or only inactive (`false`) categories. Omit for both.', example: true, }
    - `page?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: DEFAULT_PAGE, default: DEFAULT_PAGE }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT, }
- Response: `Promise<PaginatedResponse<AdminSubAccountCategoryResDto>>`
    - `data`: `AdminSubAccountCategoryResDto[]`
    - `meta`: `{ total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; ha`

#### `POST /api/v1/web/admin/merchant-categories`
[Admin] Create a Merchant category
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.SubAccountCategoriesManage)` · `RateLimit({ userPerMin: 30 })`
- Body: `CreateSubAccountCategoryReqDto`
    - `code`: `string` — IsString, IsNotEmpty, MaxLength, Matches — { example: 'home_living', maxLength: 80, description: 'Stable machine code, lowercase snake_case, unique within this category list. Trimmed;
    - `nameVi`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'Nhà cửa & Đời sống', maxLength: 255 }
    - `nameEn`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'Home & Living', maxLength: 255 }
    - `description?`: `string | null | undefined` — IsOptional, IsString, MaxLength — { type: String, nullable: true, maxLength: 2000 }
    - `sortOrder?`: `number | undefined` — IsOptional, IsInt, Min, Max — { example: 40, minimum: 0, maximum: 2147483647, default: 0, }
- Response: `ApiEnvelopeResponse(AdminSubAccountCategoryResDto, 'The created category.')` · `Promise<AdminSubAccountCategoryResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `code`: `string` — { example: 'beauty' }
    - `nameVi`: `string` — { example: 'Làm đẹp' }
    - `nameEn`: `string` — { example: 'Beauty' }
    - `description`: `string | null` — { nullable: true, type: String }
    - `sortOrder`: `number` — { example: 10 }
    - `isActive`: `boolean` — { example: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `HttpStatus.CONFLICT: SUB_ACCOUNT_CATEGORY_CODE_CONFLICT`

#### `PATCH /api/v1/web/admin/merchant-categories/:id`
[Admin] Update a Merchant category
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.SubAccountCategoriesManage)` · `RateLimit({ userPerMin: 30 })`
- Path `id`: `string`
- Body: `UpdateSubAccountCategoryReqDto`
    - `nameVi?`: `string | undefined` — ValidateIf, IsString, IsNotEmpty, MaxLength — { example: 'Nhà cửa & Đời sống', maxLength: 255 }
    - `nameEn?`: `string | undefined` — ValidateIf, IsString, IsNotEmpty, MaxLength — { example: 'Home & Living', maxLength: 255 }
    - `description?`: `string | null | undefined` — IsOptional, IsString, MaxLength — { type: String, nullable: true, maxLength: 2000, description: 'Send `null` to clear the description.', }
    - `sortOrder?`: `number | undefined` — ValidateIf, IsInt, Min, Max — { example: 40, minimum: 0, maximum: 2147483647 }
- Response: `ApiEnvelopeResponse(AdminSubAccountCategoryResDto, 'The updated category.')` · `Promise<AdminSubAccountCategoryResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `code`: `string` — { example: 'beauty' }
    - `nameVi`: `string` — { example: 'Làm đẹp' }
    - `nameEn`: `string` — { example: 'Beauty' }
    - `description`: `string | null` — { nullable: true, type: String }
    - `sortOrder`: `number` — { example: 10 }
    - `isActive`: `boolean` — { example: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `HttpStatus.NOT_FOUND: SUB_ACCOUNT_CATEGORY_NOT_FOUND`

#### `PATCH /api/v1/web/admin/merchant-categories/:id/status`
[Admin] Activate or deactivate a Merchant category
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.SubAccountCategoriesManage)` · `RateLimit({ userPerMin: 30 })`
- Path `id`: `string`
- Body: `SetSubAccountCategoryStatusReqDto`
    - `isActive`: `boolean` — IsBoolean — { example: false, description: '`false` retires the category: it leaves the picker and cannot be chosen for new accounts, but stays on accou
- Response: `ApiEnvelopeResponse(AdminSubAccountCategoryResDto, 'The category with its new status.')` · `Promise<AdminSubAccountCategoryResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `code`: `string` — { example: 'beauty' }
    - `nameVi`: `string` — { example: 'Làm đẹp' }
    - `nameEn`: `string` — { example: 'Beauty' }
    - `description`: `string | null` — { nullable: true, type: String }
    - `sortOrder`: `number` — { example: 10 }
    - `isActive`: `boolean` — { example: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `HttpStatus.NOT_FOUND: SUB_ACCOUNT_CATEGORY_NOT_FOUND`

### WebAdminSubAccountController  `/web/admin/sub-accounts`  — `src/modules/sub-account/controllers/web.admin.sub-account.controller.ts`

#### `GET /api/v1/web/admin/sub-accounts/settings`
Get sub-account management quotas
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.SubAccountConfigRead)`
- Response: `ApiEnvelopeResponse(SubAccountSettingsResDto)` · `Promise<SubAccountSettingsResDto>`
    - `maxMerchantAccounts`: `number` — { example: 5 }
    - `maxCreatorAccounts`: `number` — { example: 5 }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `PATCH /api/v1/web/admin/sub-accounts/settings`
Update sub-account management quotas
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.SubAccountConfigManage)`
- Body: `UpdateSubAccountSettingsReqDto`
    - `maxMerchantAccounts?`: `number | undefined` — IsOptional, IsInt, Min, Max — { example: 3, minimum: 0, maximum: 10000 }
    - `maxCreatorAccounts?`: `number | undefined` — IsOptional, IsInt, Min, Max — { example: 3, minimum: 0, maximum: 10000 }
- Response: `ApiEnvelopeResponse(SubAccountSettingsResDto)` · `Promise<SubAccountSettingsResDto>`
    - `maxMerchantAccounts`: `number` — { example: 5 }
    - `maxCreatorAccounts`: `number` — { example: 5 }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `GET /api/v1/web/admin/sub-accounts/quota-overages`
List roots over their sub-account quotas
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.SubAccountConfigRead)`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(SubAccountQuotaOverageResDto)` · `Promise<CursorPaginatedResponse<SubAccountQuotaOverageResDto>>`
    - `data`: `SubAccountQuotaOverageResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/admin/sub-accounts`
List sub-account requests
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.UsersRead)`
- Query: `ListSubAccountReviewsQueryDto`
    - `status?`: `UserStatus | undefined` — IsOptional, IsEnum — { description: 'Which sub-accounts to list. `pending` (default) is the review queue; ' + '`active` are the approved ones; `deleted` are the 
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(SubAccountReviewResDto, 'Sub-account requests in the requested status, newest first.)` · `Promise<CursorPaginatedResponse<SubAccountReviewResDto>>`
    - `data`: `SubAccountReviewResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/admin/sub-accounts/suspension-appeals`
List sub-account suspension appeals
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.UsersRead)`
- Query: `ListSuspensionAppealsQueryDto`
    - `status?`: `SubAccountSuspensionAppealStatus | undefined` — IsOptional, IsEnum — { description: 'Filter appeals by review status.', enum: SubAccountSuspensionAppealStatus, example: SubAccountSuspensionAppealStatus.Pending
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(SubAccountSuspensionAppealResDto, 'Sub-account suspension appeals, newest first.')` · `Promise<CursorPaginatedResponse<SubAccountSuspensionAppealResDto>>`
    - `data`: `SubAccountSuspensionAppealResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `POST /api/v1/web/admin/sub-accounts/suspension-appeals/:appealId/resolve`
Resolve a sub-account suspension appeal
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.UsersStatusManage)`
- Path `appealId`: `string`
- Body: `ResolveSuspensionAppealReqDto`
    - `decision`: `"approved" | "rejected"` — IsIn — { description: 'Admin decision for the pending appeal.', enum: SUSPENSION_APPEAL_DECISIONS, example: 'approved', }
    - `adminResponse?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Admin response shown with the appeal result.', maxLength: 1000, example: 'Documents verified. The sub-account was restored.'
- Response: `ApiEnvelopeResponse(SubAccountSuspensionAppealResDto, 'The appeal after admin review.')` · `Promise<SubAccountSuspensionAppealResDto>`
    - `id`: `string` — { description: 'Appeal id.' }
    - `subAccountUserId`: `string` — { description: 'Suspended sub-account user id.' }
    - `submittedByUserId`: `string` — { description: 'Root account user id that submitted the appeal.', }
    - `status`: `SubAccountSuspensionAppealStatus` — { enum: SubAccountSuspensionAppealStatus, example: SubAccountSuspensionAppealStatus.Pending, }
    - `reason`: `string` — { description: 'Appeal reason.' }
    - `adminResponse`: `string | null` — { type: String, description: 'Admin response after review.', nullable: true, }
    - `reviewedByUserId`: `string | null` — { type: String, description: 'Admin user id that reviewed the appeal.', nullable: true, }
    - `reviewedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `400: VALIDATION_FAILED` | `404: RESOURCE_NOT_FOUND (SUB_ACCOUNT)` | `409: SUB_ACCOUNT_APPEAL_NOT_PENDING or SUB_ACCOUNT_APPEAL_TARGET_NOT_SUSPENDED`

#### `POST /api/v1/web/admin/sub-accounts/:id/approve`
Approve a sub-account request
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.UsersStatusManage)`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(SubAccountReviewResDto, 'The sub-account after approval.')` · `Promise<SubAccountReviewResDto>`
    - `parentProfile`: `AccountProfileSummaryResDto | null` — { description: 'Public profile of the account that requested this sub-account.', type: AccountProfileSummaryResDto, nullable: true, }
    - `userId`: `string` — { description: 'Sub-account user id.', example: '42' }
    - `parentUserId`: `string` — { description: 'Parent (root) account user id.', example: '10', }
    - `role`: `string` — { description: 'Assigned role name.', example: 'merchant' }
    - `status`: `UserStatus` — { description: 'Account status. `pending` = awaiting admin approval (not usable yet, cannot be switched into); ' + '`active` = approved and 
    - `createdAt`: `string` — { description: 'When the sub-account was requested.', format: 'date-time', }
    - `message?`: `string | undefined` — { description: 'User-facing status message. Pending requests are waiting for admin approval and cannot be switched into yet.', example: 'Sub
    - `profile`: `AccountProfileSummaryResDto | null` — { type: AccountProfileSummaryResDto, nullable: true, example: { username: 'trust_merchant_a1b2c3', name: 'Trust Merchant', displayName: 'Tru
    - `legalProfile`: `SubAccountLegalProfileResDto | null` — { description: 'Legal/compliance profile submitted for admin review. Not intended for public profile rendering.', type: SubAccountLegalProfi
    - `merchantProfile`: `SubAccountMerchantProfileResDto | null` — { description: 'Merchant-specific profile details. Present only for merchant roles.', type: SubAccountMerchantProfileResDto, nullable: true,
    - `creatorProfile`: `SubAccountCreatorProfileResDto | null` — { description: 'Creator-specific profile details. Present only for creator roles.', type: SubAccountCreatorProfileResDto, nullable: true, ex
- Lỗi/Status: `404: RESOURCE_NOT_FOUND (SUB_ACCOUNT)` | `409: SUB_ACCOUNT_NOT_PENDING` | `400: SUB_ACCOUNT_LEGAL_PROFILE_INVALID — merchant compliance fields must be complete`

#### `POST /api/v1/web/admin/sub-accounts/:id/reject`
Reject a sub-account request
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.UsersStatusManage)`
- Path `id`: `string`
- Body: `RejectSubAccountReqDto`
    - `reason`: `string` — IsString, IsNotEmpty, MaxLength — { description: 'Reason for rejecting the request. Required, 1–500 chars. Written verbatim to the audit row (action SUB_ACCOUNT_REJECT, after
- Response: `ApiEnvelopeResponse(SubAccountReviewResDto, 'The sub-account after rejection.')` · `Promise<SubAccountReviewResDto>`
    - `parentProfile`: `AccountProfileSummaryResDto | null` — { description: 'Public profile of the account that requested this sub-account.', type: AccountProfileSummaryResDto, nullable: true, }
    - `userId`: `string` — { description: 'Sub-account user id.', example: '42' }
    - `parentUserId`: `string` — { description: 'Parent (root) account user id.', example: '10', }
    - `role`: `string` — { description: 'Assigned role name.', example: 'merchant' }
    - `status`: `UserStatus` — { description: 'Account status. `pending` = awaiting admin approval (not usable yet, cannot be switched into); ' + '`active` = approved and 
    - `createdAt`: `string` — { description: 'When the sub-account was requested.', format: 'date-time', }
    - `message?`: `string | undefined` — { description: 'User-facing status message. Pending requests are waiting for admin approval and cannot be switched into yet.', example: 'Sub
    - `profile`: `AccountProfileSummaryResDto | null` — { type: AccountProfileSummaryResDto, nullable: true, example: { username: 'trust_merchant_a1b2c3', name: 'Trust Merchant', displayName: 'Tru
    - `legalProfile`: `SubAccountLegalProfileResDto | null` — { description: 'Legal/compliance profile submitted for admin review. Not intended for public profile rendering.', type: SubAccountLegalProfi
    - `merchantProfile`: `SubAccountMerchantProfileResDto | null` — { description: 'Merchant-specific profile details. Present only for merchant roles.', type: SubAccountMerchantProfileResDto, nullable: true,
    - `creatorProfile`: `SubAccountCreatorProfileResDto | null` — { description: 'Creator-specific profile details. Present only for creator roles.', type: SubAccountCreatorProfileResDto, nullable: true, ex
- Lỗi/Status: `400: VALIDATION_FAILED` | `404: RESOURCE_NOT_FOUND (SUB_ACCOUNT)` | `409: SUB_ACCOUNT_NOT_PENDING`

### WebSubAccountCollaborationController  `/web/sub-accounts`  — `src/modules/sub-account/controllers/web.sub-account-collaboration.controller.ts`

#### `GET /api/v1/web/sub-accounts/:subAccountId/collaborator-candidates`
Search root users who can be invited as collaborators
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RateLimit(COLLABORATION_CANDIDATE_SEARCH_RATE_LIMIT)`
- Path `subAccountId`: `string`
- Query: `SearchProfileQueryDto`
    - `q`: `string` — IsString, IsNotEmpty, MinLength, MaxLength, Matches — { description: 'Search term. Username is matched as a substring (contains). Phone is matched only when `q` is a COMPLETE Vietnamese number (
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(WebCollaborationCandidateResponseDto, 'Cursor-paginated collaborator candidates. `ekycVerified` is)` · `Promise<CursorPaginatedResponse<WebCollaborationCandidateResponseDto>>`
    - `data`: `WebCollaborationCandidateResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `403: SUB_ACCOUNT_COLLABORATION_FORBIDDEN`

### WebSubAccountController  `/web/sub-accounts`  — `src/modules/sub-account/controllers/web.sub-account.controller.ts`

#### `GET /api/v1/web/sub-accounts/roles`
List roles assignable to a new sub-account.
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Response: `Promise<AssignableRoleResDto[]>`
    - `roleId`: `string` — { description: 'Role id.', example: '7' }
    - `roleCode`: `string` — { description: 'Stable technical role code.', example: 'merchant', }
    - `roleName`: `string` — { description: 'Localized role display name.', example: 'Merchant', }
    - `description`: `string | null` — { type: String, description: 'Human-readable role description.', example: 'Sub-account role: merchant', nullable: true, }
    - `isCurrent`: `boolean` — { description: 'Whether this role is the RBAC role of the currently authenticated account.', example: false, }

#### `GET /api/v1/web/sub-accounts/categories`
List the active categories a Merchant or Creator account can choose from.
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Query: `ListSubAccountCategoriesQueryDto`
    - `role`: `"creator" | "merchant"` — IsIn — { enum: SUB_ACCOUNT_ROLE_NAMES, description: 'Role whose category vocabulary to return. Merchant and Creator use separate category lists.', 
- Response: `Promise<SubAccountCategoryResDto[]>`
    - `id`: `string` — { description: 'Category id.', example: '1', type: 'string' }
    - `code`: `string` — { description: 'Stable technical category code.', example: 'beauty', }
    - `name`: `string` — { description: 'Category display name in the request locale.', example: 'Beauty', }

#### `GET /api/v1/web/sub-accounts`
List personal, owned, and collaborative account contexts.
- Điều kiện: `RequireEkyc`
- Query: `ListFamilyAccountsQueryDto`
    - `role?`: `"creator" | "merchant" | undefined` — IsOptional, IsIn — { enum: SUB_ACCOUNT_ROLE_NAMES, description: 'Filter owned and collaborative sub-accounts by role. The personal root account is always retur
- Response: `Promise<FamilyAccountResDto[]>`
    - `userId`: `string` — { description: 'Account user id.', example: '42' }
    - `parentUserId`: `string | null` — { type: String, description: 'Parent root user id for owned sub-accounts. Null for personal and collaborative accounts.', example: '10', nul
    - `isCurrent`: `boolean` — { description: 'True when this row is the currently selected account context.', }
    - `isRoot`: `boolean` — { description: 'True when this row is the primary account.' }
    - `isSubAccount`: `boolean` — { description: 'True when this row is a sub-account.' }
    - `accessType`: `FamilyAccountAccessType` — { description: 'How the authenticated root user can access this account.', enum: FamilyAccountAccessType, }
    - `contextRole`: `string | null` — { type: String, description: 'Owner for an owned sub-account, the collaboration role for a collaborative account, or null for personal acces
    - `role`: `string | null` — { type: String, nullable: true, description: 'Assigned role name.', example: 'merchant', }
    - `status`: `FamilyAccountStatus` — { description: 'Public account status. Rejected sub-account requests are projected from internally deleted records.', enum: FamilyAccountSta
    - `createdAt`: `string` — { description: 'When the account was created/requested.', format: 'date-time', }
    - `profile`: `AccountProfileSummaryResDto | null` — { type: AccountProfileSummaryResDto, nullable: true, example: { username: 'trust_merchant_a1b2c3', name: 'Trust Merchant', displayName: 'Tru
    - `categories`: `SubAccountCategoryResDto[] | null` — { type: [SubAccountCategoryResDto], nullable: true, description: 'Categories chosen for a Merchant or Creator account, in picker order, name

#### `GET /api/v1/web/sub-accounts/:id/suspension-appeals`
List suspension appeals submitted for one owned sub-account.
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Path `id`: `string`
- Response: `Promise<SubAccountSuspensionAppealResDto[]>`
    - `id`: `string` — { description: 'Appeal id.' }
    - `subAccountUserId`: `string` — { description: 'Suspended sub-account user id.' }
    - `submittedByUserId`: `string` — { description: 'Root account user id that submitted the appeal.', }
    - `status`: `SubAccountSuspensionAppealStatus` — { enum: SubAccountSuspensionAppealStatus, example: SubAccountSuspensionAppealStatus.Pending, }
    - `reason`: `string` — { description: 'Appeal reason.' }
    - `adminResponse`: `string | null` — { type: String, description: 'Admin response after review.', nullable: true, }
    - `reviewedByUserId`: `string | null` — { type: String, description: 'Admin user id that reviewed the appeal.', nullable: true, }
    - `reviewedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `403: SUB_ACCOUNT_APPEAL_FORBIDDEN`

#### `POST /api/v1/web/sub-accounts/:id/suspension-appeals`
Appeal the suspension of one owned sub-account.
- Điều kiện: `RequireEkyc` · `RequireMembership` · `HttpCode(HttpStatus.OK)` · `RateLimit(SUB_ACCOUNT_HIGH_WRITE_RATE_LIMIT)`
- Path `id`: `string`
- Body: `CreateSuspensionAppealReqDto`
    - `reason`: `string` — IsString, MinLength, MaxLength — { description: 'Reason for asking admin to review the suspension.', minLength: 10, maxLength: 1000, example: 'The business license was updat
- Response: `ApiEnvelopeResponse(SubAccountSuspensionAppealResDto)` · `Promise<SubAccountSuspensionAppealResDto>`
    - `id`: `string` — { description: 'Appeal id.' }
    - `subAccountUserId`: `string` — { description: 'Suspended sub-account user id.' }
    - `submittedByUserId`: `string` — { description: 'Root account user id that submitted the appeal.', }
    - `status`: `SubAccountSuspensionAppealStatus` — { enum: SubAccountSuspensionAppealStatus, example: SubAccountSuspensionAppealStatus.Pending, }
    - `reason`: `string` — { description: 'Appeal reason.' }
    - `adminResponse`: `string | null` — { type: String, description: 'Admin response after review.', nullable: true, }
    - `reviewedByUserId`: `string | null` — { type: String, description: 'Admin user id that reviewed the appeal.', nullable: true, }
    - `reviewedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `403: SUB_ACCOUNT_APPEAL_FORBIDDEN` | `409: SUB_ACCOUNT_APPEAL_TARGET_NOT_SUSPENDED or SUB_ACCOUNT_APPEAL_DUPLICATE_PENDING`

#### `POST /api/v1/web/sub-accounts`
Submit a sub-account creation request for admin approval. The account remains pending and cannot be switched into until approved.
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequireEkyc` · `RequireMembership` · `RateLimit(SUB_ACCOUNT_HIGH_WRITE_RATE_LIMIT)`
- Body: `CreateSubAccountReqDto`
    - `role`: `"creator" | "merchant"` — IsIn — { description: 'Role to assign to the new sub-account.', enum: SUB_ACCOUNT_ROLE_NAMES, example: 'merchant', }
    - `name?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Backward-compatible profile/account label saved to user_profiles.fullName. ' + 'Do not use this as the public author label f
    - `legalProfile`: `SubAccountLegalProfileReqDto` — IsDefined — { description: 'Legal/compliance profile submitted for admin review before the sub-account can be used. ' + 'Creator types: individual, hous
      - **SubAccountLegalProfileReqDto**
        - `legalEntityType`: `SubAccountLegalEntityType` — IsEnum — { description: 'Creator: individual, household_business or company. Merchant: household_business or company only. organization is not suppor
        - `legalName`: `string` — IsString, IsNotEmpty, MaxLength — { description: 'Legal/compliance name from business registration or identity record. ' + 'This is not the public display label; render respo
        - `taxCode?`: `string | undefined` — IsOptional, IsString, MaxLength, Matches — { description: 'Required for merchants and non-individual creators. Individual Creator onboarding may omit it, but paid sales require it. ' 
        - `businessRegistrationNumber?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Business or household business registration number.', example: '0312345678', maxLength: 50, }
        - `businessRegistrationIssuedAt?`: `string | undefined` — IsOptional, IsDateString — { description: 'Business registration issue date.', example: '2025-01-15', format: 'date', }
        - `businessRegistrationIssuedBy?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Business registration issuing authority.', example: 'Ho Chi Minh City Department of Planning and Investment', maxLength: 255
        - `registeredAddress?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Registered head office or legal address.', example: '123 Nguyen Hue, Ben Nghe Ward, District 1, Ho Chi Minh City', maxLength
        - `operatingAddress?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Operating address if different from registered address.', example: '456 Le Loi, Ben Thanh Ward, District 1, Ho Chi Minh City
        - `contactEmail?`: `string | undefined` — IsOptional, IsEmail, MaxLength — { description: 'Compliance contact email.', example: 'legal@example.vn', maxLength: 255, }
        - `contactPhone?`: `string | undefined` — IsOptional, IsPhoneNumber, MaxLength — { description: 'Compliance contact phone number.', example: '+84901234567', maxLength: 20, }
        - `websiteUrl?`: `string | undefined` — IsOptional, IsUrl, MaxLength — { description: 'Official website URL.', example: 'https://example.vn', maxLength: 500, }
        - `businessLine?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Primary registered business line or creator business line.', example: 'Retail e-commerce and consumer goods', maxLength: 255
    - `merchantProfile?`: `SubAccountMerchantProfileReqDto | undefined` — IsOptional — { description: 'Required when role is `merchant`. Must not be sent when role is `creator`.', type: SubAccountMerchantProfileReqDto, example:
    - `creatorProfile?`: `SubAccountCreatorProfileReqDto | undefined` — IsOptional — { description: 'Required when role is `creator`. Must not be sent when role is `merchant`.', type: SubAccountCreatorProfileReqDto, example: 
- Response: `ApiEnvelopeResponse(SubAccountResDto)` · `Promise<SubAccountResDto>`
    - `userId`: `string` — { description: 'Sub-account user id.', example: '42' }
    - `parentUserId`: `string` — { description: 'Parent (root) account user id.', example: '10', }
    - `role`: `string` — { description: 'Assigned role name.', example: 'merchant' }
    - `status`: `UserStatus` — { description: 'Account status. `pending` = awaiting admin approval (not usable yet, cannot be switched into); ' + '`active` = approved and 
    - `createdAt`: `string` — { description: 'When the sub-account was requested.', format: 'date-time', }
    - `message?`: `string | undefined` — { description: 'User-facing status message. Pending requests are waiting for admin approval and cannot be switched into yet.', example: 'Sub
    - `profile`: `AccountProfileSummaryResDto | null` — { type: AccountProfileSummaryResDto, nullable: true, example: { username: 'trust_merchant_a1b2c3', name: 'Trust Merchant', displayName: 'Tru
    - `legalProfile`: `SubAccountLegalProfileResDto | null` — { description: 'Legal/compliance profile submitted for admin review. Not intended for public profile rendering.', type: SubAccountLegalProfi
    - `merchantProfile`: `SubAccountMerchantProfileResDto | null` — { description: 'Merchant-specific profile details. Present only for merchant roles.', type: SubAccountMerchantProfileResDto, nullable: true,
    - `creatorProfile`: `SubAccountCreatorProfileResDto | null` — { description: 'Creator-specific profile details. Present only for creator roles.', type: SubAccountCreatorProfileResDto, nullable: true, ex
- Lỗi/Status: `400: 'SUB_ACCOUNT_PROFILE_INVALID with fieldErrors when role-specific profiles are missing or sent for the wrong role, or when `categoryIds` is empty, has duplicates, or contains an id that is unknown, inactive, or not a cate` | `409: SUB_ACCOUNT_LIMIT_REACHED`

#### `POST /api/v1/web/sub-accounts/switch`
Switch the session to personal, an owned sub-account, or a collaborative Merchant/Creator context. New auth cookies are set on the response.
- Điều kiện: `RequireEkyc` · `HttpCode(HttpStatus.OK)` · `RateLimit(SUB_ACCOUNT_MUTATION_RATE_LIMIT)`
- Body: `SwitchAccountReqDto`
    - `targetUserId`: `string` — IsBigIntId — { description: 'Target user id to switch the active session to. Must be a member of the caller account family (the root or one of its sub-ac
- Response: `ApiEnvelopeResponse(WebSwitchAccountResDto)` · `Promise<WebSwitchAccountResDto>`
    - `message`: `string` — { example: 'Switched account' }
    - `clientId`: `AuthClientId` — { enum: AuthClientId, example: AuthClientId.Merchant, description: 'Client application bound to the new session. This does not change when s
    - `authenticatedUserId`: `string` — { example: '10', type: String, description: 'Root user who authenticated with identifier and password.', }
    - `activeAccountUserId`: `string | null` — { example: '42', nullable: true, type: String, description: 'Selected Merchant/Creator account user id; null after switching back to the roo
    - `accountRole`: `"creator" | "merchant" | null` — { enum: ['merchant', 'creator'], example: 'merchant', nullable: true, description: 'Role of the selected managed account; null for the root 
    - `accessType`: `"personal" | "owner" | "collaborator"` — { enum: ['personal', 'owner', 'collaborator'], example: 'owner', description: '`owner` for an owned account, `collaborator` for an assigned 
    - `contextRole`: `string | null` — { type: String, nullable: true, example: null, description: 'Assigned collaboration role such as `content_merchant`; null for owner and pers

## Module `bank-account`

### MobileBankAccountController  `/mobile/bank-accounts`  — `src/modules/bank-account/controllers/mobile.bank-account.controller.ts`

#### `GET /api/v1/mobile/bank-accounts/me`
Get my bank account (mobile)
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.FinanceSubAccountRead)` · `Authenticated` · `RateLimit({ userPerMin: 60 })` · `HttpCode(HttpStatus.OK)`
- Response: `ApiOkResponse({
    schema: {
      type: 'object',
      required: ['succ)` · `Promise<BankAccountResDto | null>`
    - `id`: `string` — { example: '1', type: 'string' }
    - `userId`: `string` — { example: '42', type: 'string' }
    - `bankBin`: `string` — { example: '970422' }
    - `bankCode`: `string` — { example: 'STB' }
    - `bankName`: `string` — { example: 'Ngân hàng TMCP Sài Gòn Thương Tín' }
    - `bankShortName`: `string` — { example: 'Sacombank' }
    - `accountNumberMasked`: `string` — { example: '********3650' }
    - `accountLast4`: `string` — { example: '3650' }
    - `accountName`: `string` — { example: 'NGO BA TAN TAI' }
    - `logoUrl`: `string | null` — { type: String, example: 'https://cdn.vietqr.io/img/STB.png', nullable: true, }
    - `verifiedAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/mobile/bank-accounts`
Verify and add my bank account (mobile)
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireSmartOtpProof({ purpose: SmartOtpPurpose.BankAccountChange, subjectType: S)` · `RequireContextPermissions(PERMISSION_KEYS.FinanceSubAccountManage)` · `Authenticated` · `RateLimit({ userPerMin: 2, ipPerMin: 10, burst: { limit: 1, ttlMs: 10_)` · `HttpCode(HttpStatus.OK)`
- Body: `RootAddBankAccountReqDto`
    - `smartOtp`: `SmartOtpProofDto` — IsObject — { type: SmartOtpProofDto, description: 'Smart OTP proof bound to this root-user bank change.', }
      - **SmartOtpProofDto**
        - `requestId`: `string` — IsString, IsNotEmpty, IsBigIntId — { example: '1234' }
        - `code`: `string` — Matches — { example: '147258', pattern: '^\\d{6}$' }
    - `password`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'CurrentPassw0rd!', maxLength: 72, description: 'Current password of the authenticated operator.', }
    - `otp`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6, description: 'OTP sent to the authenticated account email. Bank-account mutations require r
    - `bank`: `string` — IsNumberString, Length — { description: 'Vietnam bank BIN used by OpenBankGate lookup.', example: '970422', minLength: 6, maxLength: 6, }
    - `account`: `string` — IsNumberString, Length — { description: 'Bank account number to verify and save.', example: '0987654321', minLength: 4, maxLength: 32, }
- Response: `ApiEnvelopeResponse(BankAccountResDto)` · `Promise<BankAccountResDto>`
    - `id`: `string` — { example: '1', type: 'string' }
    - `userId`: `string` — { example: '42', type: 'string' }
    - `bankBin`: `string` — { example: '970422' }
    - `bankCode`: `string` — { example: 'STB' }
    - `bankName`: `string` — { example: 'Ngân hàng TMCP Sài Gòn Thương Tín' }
    - `bankShortName`: `string` — { example: 'Sacombank' }
    - `accountNumberMasked`: `string` — { example: '********3650' }
    - `accountLast4`: `string` — { example: '3650' }
    - `accountName`: `string` — { example: 'NGO BA TAN TAI' }
    - `logoUrl`: `string | null` — { type: String, example: 'https://cdn.vietqr.io/img/STB.png', nullable: true, }
    - `verifiedAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/mobile/bank-accounts/otp`
Request OTP for replacing or deleting my bank account (mobile)
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.FinanceSubAccountManage)` · `Authenticated` · `RateLimit({ userPerMin: 2, ipPerMin: 10, burst: { limit: 1, ttlMs: 10_)` · `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(BankAccountOtpStatusResDto)` · `Promise<BankAccountOtpStatusResDto>`
    - `channel`: `"email"` — { enum: ['email'], example: 'email', description: 'Delivery channel used for the sensitive bank-account action OTP.', }
    - `otpSent`: `boolean` — { example: true, description: 'Whether an active OTP exists for this action.', }
    - `resendInSeconds`: `number` — { example: 120, description: 'Seconds until another OTP request is allowed.', }
    - `expiresInSeconds`: `number` — { example: 300, description: 'Seconds until the active OTP expires.', }

#### `PATCH /api/v1/mobile/bank-accounts/me`
Verify and replace my bank account (mobile)
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireSmartOtpProof({ purpose: SmartOtpPurpose.BankAccountChange, subjectType: S)` · `RequireContextPermissions(PERMISSION_KEYS.FinanceSubAccountManage)` · `Authenticated` · `RateLimit({ userPerMin: 2, ipPerMin: 10, burst: { limit: 1, ttlMs: 10_)` · `HttpCode(HttpStatus.OK)`
- Body: `RootUpdateBankAccountReqDto`
    - `smartOtp`: `SmartOtpProofDto` — IsObject — { type: SmartOtpProofDto, description: 'Smart OTP proof bound to this root-user bank change.', }
      - **SmartOtpProofDto**
        - `requestId`: `string` — IsString, IsNotEmpty, IsBigIntId — { example: '1234' }
        - `code`: `string` — Matches — { example: '147258', pattern: '^\\d{6}$' }
    - `password`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'CurrentPassw0rd!', maxLength: 72, description: 'Current password of the authenticated operator.', }
    - `otp`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6, description: 'OTP sent to the authenticated account email. Bank-account mutations require r
    - `bank`: `string` — IsNumberString, Length — { description: 'Vietnam bank BIN used by OpenBankGate lookup.', example: '970422', minLength: 6, maxLength: 6, }
    - `account`: `string` — IsNumberString, Length — { description: 'Bank account number to verify and save.', example: '0987654321', minLength: 4, maxLength: 32, }
- Response: `ApiEnvelopeResponse(BankAccountResDto)` · `Promise<BankAccountResDto>`
    - `id`: `string` — { example: '1', type: 'string' }
    - `userId`: `string` — { example: '42', type: 'string' }
    - `bankBin`: `string` — { example: '970422' }
    - `bankCode`: `string` — { example: 'STB' }
    - `bankName`: `string` — { example: 'Ngân hàng TMCP Sài Gòn Thương Tín' }
    - `bankShortName`: `string` — { example: 'Sacombank' }
    - `accountNumberMasked`: `string` — { example: '********3650' }
    - `accountLast4`: `string` — { example: '3650' }
    - `accountName`: `string` — { example: 'NGO BA TAN TAI' }
    - `logoUrl`: `string | null` — { type: String, example: 'https://cdn.vietqr.io/img/STB.png', nullable: true, }
    - `verifiedAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `DELETE /api/v1/mobile/bank-accounts/me`
Delete my bank account (mobile)
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireSmartOtpProof({ purpose: SmartOtpPurpose.BankAccountChange, subjectType: S)` · `RequireContextPermissions(PERMISSION_KEYS.FinanceSubAccountManage)` · `Authenticated` · `RateLimit({ userPerMin: 2, ipPerMin: 10, burst: { limit: 1, ttlMs: 10_)` · `HttpCode(HttpStatus.OK)`
- Body: `RootBankAccountSensitiveActionReqDto`
    - `smartOtp`: `SmartOtpProofDto` — IsObject — { type: SmartOtpProofDto, description: 'Smart OTP proof bound to this root-user bank change.', }
      - **SmartOtpProofDto**
        - `requestId`: `string` — IsString, IsNotEmpty, IsBigIntId — { example: '1234' }
        - `code`: `string` — Matches — { example: '147258', pattern: '^\\d{6}$' }
    - `password`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'CurrentPassw0rd!', maxLength: 72, description: 'Current password of the authenticated operator.', }
    - `otp`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6, description: 'OTP sent to the authenticated account email. Bank-account mutations require r
- Response: `Promise<null>`

### MobileMerchantBankAccountController  `/mobile/merchant/bank-accounts`  — `src/modules/bank-account/controllers/mobile.merchant.bank-account.controller.ts`

#### `POST /api/v1/mobile/merchant/bank-accounts/otp`
Request or resend email OTP for a Merchant Owner bank change
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Response: `ApiEnvelopeResponse(BankAccountOtpStatusResDto)` · `Promise<BankAccountOtpStatusResDto>`
    - `channel`: `"email"` — { enum: ['email'], example: 'email', description: 'Delivery channel used for the sensitive bank-account action OTP.', }
    - `otpSent`: `boolean` — { example: true, description: 'Whether an active OTP exists for this action.', }
    - `resendInSeconds`: `number` — { example: 120, description: 'Seconds until another OTP request is allowed.', }
    - `expiresInSeconds`: `number` — { example: 300, description: 'Seconds until the active OTP expires.', }

#### `POST /api/v1/mobile/merchant/bank-accounts`
Verify and add a Merchant Owner bank account
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequirePin(PinTokenReason.BankAccountChange)`
- Body: `ManagedAddBankAccountReqDto`
    - `bank`: `string` — IsNumberString, Length — { description: 'Vietnam bank BIN used by OpenBankGate lookup.', example: '970422', minLength: 6, maxLength: 6, }
    - `account`: `string` — IsNumberString, Length — { description: 'Bank account number to verify and save.', example: '0987654321', minLength: 4, maxLength: 32, }
    - `password`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'CurrentPassw0rd!', maxLength: 72, description: 'Current password of the authenticated operator.', }
    - `otp`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6, description: 'OTP sent to the authenticated account email. Bank-account mutations require r
- Response: `ApiEnvelopeResponse(BankAccountResDto)` · `Promise<BankAccountResDto>`
    - `id`: `string` — { example: '1', type: 'string' }
    - `userId`: `string` — { example: '42', type: 'string' }
    - `bankBin`: `string` — { example: '970422' }
    - `bankCode`: `string` — { example: 'STB' }
    - `bankName`: `string` — { example: 'Ngân hàng TMCP Sài Gòn Thương Tín' }
    - `bankShortName`: `string` — { example: 'Sacombank' }
    - `accountNumberMasked`: `string` — { example: '********3650' }
    - `accountLast4`: `string` — { example: '3650' }
    - `accountName`: `string` — { example: 'NGO BA TAN TAI' }
    - `logoUrl`: `string | null` — { type: String, example: 'https://cdn.vietqr.io/img/STB.png', nullable: true, }
    - `verifiedAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `PATCH /api/v1/mobile/merchant/bank-accounts/me`
Verify and replace a Merchant Owner bank account
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequirePin(PinTokenReason.BankAccountChange)`
- Body: `ManagedUpdateBankAccountReqDto`
    - `bank`: `string` — IsNumberString, Length — { description: 'Vietnam bank BIN used by OpenBankGate lookup.', example: '970422', minLength: 6, maxLength: 6, }
    - `account`: `string` — IsNumberString, Length — { description: 'Bank account number to verify and save.', example: '0987654321', minLength: 4, maxLength: 32, }
    - `password`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'CurrentPassw0rd!', maxLength: 72, description: 'Current password of the authenticated operator.', }
    - `otp`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6, description: 'OTP sent to the authenticated account email. Bank-account mutations require r
- Response: `ApiEnvelopeResponse(BankAccountResDto)` · `Promise<BankAccountResDto>`
    - `id`: `string` — { example: '1', type: 'string' }
    - `userId`: `string` — { example: '42', type: 'string' }
    - `bankBin`: `string` — { example: '970422' }
    - `bankCode`: `string` — { example: 'STB' }
    - `bankName`: `string` — { example: 'Ngân hàng TMCP Sài Gòn Thương Tín' }
    - `bankShortName`: `string` — { example: 'Sacombank' }
    - `accountNumberMasked`: `string` — { example: '********3650' }
    - `accountLast4`: `string` — { example: '3650' }
    - `accountName`: `string` — { example: 'NGO BA TAN TAI' }
    - `logoUrl`: `string | null` — { type: String, example: 'https://cdn.vietqr.io/img/STB.png', nullable: true, }
    - `verifiedAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `DELETE /api/v1/mobile/merchant/bank-accounts/me`
Delete a Merchant Owner bank account
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequirePin(PinTokenReason.BankAccountChange)`
- Body: `ManagedBankAccountSensitiveActionReqDto`
    - `password`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'CurrentPassw0rd!', maxLength: 72, description: 'Current password of the authenticated operator.', }
    - `otp`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6, description: 'OTP sent to the authenticated account email. Bank-account mutations require r
- Response: `Promise<null>`

### PublicBankAccountController  `/public/bank-accounts`  — `src/modules/bank-account/controllers/public.bank-account.controller.ts`

#### `GET /api/v1/public/bank-accounts/banks`
List supported Vietnamese bank codes
- Điều kiện: `Public` · `RateLimit({ ipPerMin: 60, burst: { limit: 10, ttlMs: 10_000 }, sustain)`
- Response: `Promise<BankOptionResDto[]>`
    - `name`: `string` — { example: 'Ngân hàng TMCP Công thương Việt Nam' }
    - `code`: `string` — { example: 'ICB' }
    - `bin`: `string` — { example: '970415', type: 'string' }
    - `shortName`: `string` — { example: 'VietinBank' }
    - `logoUrl`: `string | null` — { type: String, example: 'https://cdn.vietqr.io/img/ICB.png', nullable: true, }
    - `lookupSupported`: `boolean` — { example: true }

### WebBankAccountController  `/web/bank-accounts`  — `src/modules/bank-account/controllers/web.bank-account.controller.ts`

#### `GET /api/v1/web/bank-accounts/me`
Get my bank account (web)
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.FinanceSubAccountRead)` · `Authenticated` · `RateLimit({ userPerMin: 60 })` · `HttpCode(HttpStatus.OK)`
- Response: `ApiOkResponse({
    schema: {
      type: 'object',
      required: ['succ)` · `Promise<BankAccountResDto | null>`
    - `id`: `string` — { example: '1', type: 'string' }
    - `userId`: `string` — { example: '42', type: 'string' }
    - `bankBin`: `string` — { example: '970422' }
    - `bankCode`: `string` — { example: 'STB' }
    - `bankName`: `string` — { example: 'Ngân hàng TMCP Sài Gòn Thương Tín' }
    - `bankShortName`: `string` — { example: 'Sacombank' }
    - `accountNumberMasked`: `string` — { example: '********3650' }
    - `accountLast4`: `string` — { example: '3650' }
    - `accountName`: `string` — { example: 'NGO BA TAN TAI' }
    - `logoUrl`: `string | null` — { type: String, example: 'https://cdn.vietqr.io/img/STB.png', nullable: true, }
    - `verifiedAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/web/bank-accounts`
Verify and add my bank account (web)
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireSmartOtpProof({ purpose: SmartOtpPurpose.BankAccountChange, subjectType: S)` · `RequireContextPermissions(PERMISSION_KEYS.FinanceSubAccountManage)` · `Authenticated` · `RateLimit({ userPerMin: 2, ipPerMin: 10, burst: { limit: 1, ttlMs: 10_)` · `HttpCode(HttpStatus.OK)`
- Body: `RootAddBankAccountReqDto`
    - `smartOtp`: `SmartOtpProofDto` — IsObject — { type: SmartOtpProofDto, description: 'Smart OTP proof bound to this root-user bank change.', }
      - **SmartOtpProofDto**
        - `requestId`: `string` — IsString, IsNotEmpty, IsBigIntId — { example: '1234' }
        - `code`: `string` — Matches — { example: '147258', pattern: '^\\d{6}$' }
    - `password`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'CurrentPassw0rd!', maxLength: 72, description: 'Current password of the authenticated operator.', }
    - `otp`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6, description: 'OTP sent to the authenticated account email. Bank-account mutations require r
    - `bank`: `string` — IsNumberString, Length — { description: 'Vietnam bank BIN used by OpenBankGate lookup.', example: '970422', minLength: 6, maxLength: 6, }
    - `account`: `string` — IsNumberString, Length — { description: 'Bank account number to verify and save.', example: '0987654321', minLength: 4, maxLength: 32, }
- Response: `ApiEnvelopeResponse(BankAccountResDto)` · `Promise<BankAccountResDto>`
    - `id`: `string` — { example: '1', type: 'string' }
    - `userId`: `string` — { example: '42', type: 'string' }
    - `bankBin`: `string` — { example: '970422' }
    - `bankCode`: `string` — { example: 'STB' }
    - `bankName`: `string` — { example: 'Ngân hàng TMCP Sài Gòn Thương Tín' }
    - `bankShortName`: `string` — { example: 'Sacombank' }
    - `accountNumberMasked`: `string` — { example: '********3650' }
    - `accountLast4`: `string` — { example: '3650' }
    - `accountName`: `string` — { example: 'NGO BA TAN TAI' }
    - `logoUrl`: `string | null` — { type: String, example: 'https://cdn.vietqr.io/img/STB.png', nullable: true, }
    - `verifiedAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/web/bank-accounts/otp`
Request OTP for replacing or deleting my bank account (web)
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.FinanceSubAccountManage)` · `Authenticated` · `RateLimit({ userPerMin: 2, ipPerMin: 10, burst: { limit: 1, ttlMs: 10_)` · `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(BankAccountOtpStatusResDto)` · `Promise<BankAccountOtpStatusResDto>`
    - `channel`: `"email"` — { enum: ['email'], example: 'email', description: 'Delivery channel used for the sensitive bank-account action OTP.', }
    - `otpSent`: `boolean` — { example: true, description: 'Whether an active OTP exists for this action.', }
    - `resendInSeconds`: `number` — { example: 120, description: 'Seconds until another OTP request is allowed.', }
    - `expiresInSeconds`: `number` — { example: 300, description: 'Seconds until the active OTP expires.', }

#### `PATCH /api/v1/web/bank-accounts/me`
Verify and replace my bank account (web)
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireSmartOtpProof({ purpose: SmartOtpPurpose.BankAccountChange, subjectType: S)` · `RequireContextPermissions(PERMISSION_KEYS.FinanceSubAccountManage)` · `Authenticated` · `RateLimit({ userPerMin: 2, ipPerMin: 10, burst: { limit: 1, ttlMs: 10_)` · `HttpCode(HttpStatus.OK)`
- Body: `RootUpdateBankAccountReqDto`
    - `smartOtp`: `SmartOtpProofDto` — IsObject — { type: SmartOtpProofDto, description: 'Smart OTP proof bound to this root-user bank change.', }
      - **SmartOtpProofDto**
        - `requestId`: `string` — IsString, IsNotEmpty, IsBigIntId — { example: '1234' }
        - `code`: `string` — Matches — { example: '147258', pattern: '^\\d{6}$' }
    - `password`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'CurrentPassw0rd!', maxLength: 72, description: 'Current password of the authenticated operator.', }
    - `otp`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6, description: 'OTP sent to the authenticated account email. Bank-account mutations require r
    - `bank`: `string` — IsNumberString, Length — { description: 'Vietnam bank BIN used by OpenBankGate lookup.', example: '970422', minLength: 6, maxLength: 6, }
    - `account`: `string` — IsNumberString, Length — { description: 'Bank account number to verify and save.', example: '0987654321', minLength: 4, maxLength: 32, }
- Response: `ApiEnvelopeResponse(BankAccountResDto)` · `Promise<BankAccountResDto>`
    - `id`: `string` — { example: '1', type: 'string' }
    - `userId`: `string` — { example: '42', type: 'string' }
    - `bankBin`: `string` — { example: '970422' }
    - `bankCode`: `string` — { example: 'STB' }
    - `bankName`: `string` — { example: 'Ngân hàng TMCP Sài Gòn Thương Tín' }
    - `bankShortName`: `string` — { example: 'Sacombank' }
    - `accountNumberMasked`: `string` — { example: '********3650' }
    - `accountLast4`: `string` — { example: '3650' }
    - `accountName`: `string` — { example: 'NGO BA TAN TAI' }
    - `logoUrl`: `string | null` — { type: String, example: 'https://cdn.vietqr.io/img/STB.png', nullable: true, }
    - `verifiedAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `DELETE /api/v1/web/bank-accounts/me`
Delete my bank account (web)
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireSmartOtpProof({ purpose: SmartOtpPurpose.BankAccountChange, subjectType: S)` · `RequireContextPermissions(PERMISSION_KEYS.FinanceSubAccountManage)` · `Authenticated` · `RateLimit({ userPerMin: 2, ipPerMin: 10, burst: { limit: 1, ttlMs: 10_)` · `HttpCode(HttpStatus.OK)`
- Body: `RootBankAccountSensitiveActionReqDto`
    - `smartOtp`: `SmartOtpProofDto` — IsObject — { type: SmartOtpProofDto, description: 'Smart OTP proof bound to this root-user bank change.', }
      - **SmartOtpProofDto**
        - `requestId`: `string` — IsString, IsNotEmpty, IsBigIntId — { example: '1234' }
        - `code`: `string` — Matches — { example: '147258', pattern: '^\\d{6}$' }
    - `password`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'CurrentPassw0rd!', maxLength: 72, description: 'Current password of the authenticated operator.', }
    - `otp`: `string` — IsString, Length — { example: '123456', minLength: 6, maxLength: 6, description: 'OTP sent to the authenticated account email. Bank-account mutations require r
- Response: `Promise<null>`

## Module `pin`

### MobilePinController  `/mobile/pin`  — `src/modules/pin/controllers/mobile.pin.controller.ts`

#### `GET /api/v1/mobile/pin/status`
Get account PIN status for Owner or authorized Merchant Finance
- Điều kiện: `RequireContextPermissions(PERMISSION_KEYS.FinanceSubAccountManage)` · `Authenticated` · `RateLimit({ userPerMin: 30 })`
- Response: `ApiEnvelopeResponse(PinStatusResDto)` · `Promise<PinStatusResDto>`
    - `configured`: `boolean` — { example: true }
    - `status`: `PinStatus` — { enum: PinStatus, example: PinStatus.Active }
    - `lockedUntil`: `string | null` — { type: String, nullable: true, example: null, description: 'Set only while status is TEMPORARILY_LOCKED.', }
    - `attemptsRemaining`: `number | null` — { type: Number, nullable: true, example: 5, description: 'Wrong entries left before the next lock. Null when not configured or hard locked.'

#### `POST /api/v1/mobile/pin/setup`
Set up the PIN of my Merchant/Creator account
- Điều kiện: `Authenticated` · `RateLimit(PIN_MUTATION_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Body: `SetupPinReqDto`
    - `pin`: `string` — IsString, Matches — { example: '482915', pattern: PIN_PATTERN }
    - `password`: `string` — IsString, MinLength, MaxLength — { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, description: "Password of the owner's personal (root) account.", }
- Response: `ApiEnvelopeResponse(PinStatusResDto)` · `Promise<PinStatusResDto>`
    - `configured`: `boolean` — { example: true }
    - `status`: `PinStatus` — { enum: PinStatus, example: PinStatus.Active }
    - `lockedUntil`: `string | null` — { type: String, nullable: true, example: null, description: 'Set only while status is TEMPORARILY_LOCKED.', }
    - `attemptsRemaining`: `number | null` — { type: Number, nullable: true, example: 5, description: 'Wrong entries left before the next lock. Null when not configured or hard locked.'

#### `POST /api/v1/mobile/pin/change`
Change the PIN of my Merchant/Creator account
- Điều kiện: `Authenticated` · `RateLimit(PIN_MUTATION_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Body: `ChangePinReqDto`
    - `currentPin`: `string` — IsString, Matches — { example: '482915', pattern: PIN_PATTERN }
    - `newPin`: `string` — IsString, Matches — { example: '731604', pattern: PIN_PATTERN }
    - `password`: `string` — IsString, MinLength, MaxLength — { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, description: "Password of the owner's personal (root) account.", }
- Response: `ApiEnvelopeResponse(PinStatusResDto)` · `Promise<PinStatusResDto>`
    - `configured`: `boolean` — { example: true }
    - `status`: `PinStatus` — { enum: PinStatus, example: PinStatus.Active }
    - `lockedUntil`: `string | null` — { type: String, nullable: true, example: null, description: 'Set only while status is TEMPORARILY_LOCKED.', }
    - `attemptsRemaining`: `number | null` — { type: Number, nullable: true, example: 5, description: 'Wrong entries left before the next lock. Null when not configured or hard locked.'

#### `POST /api/v1/mobile/pin/reset/otp`
Send an email OTP to reset a forgotten PIN
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 2, ipPerMin: 10, burst: { limit: 1, ttlMs: 10_)` · `HttpCode(HttpStatus.OK)`
- Body: `RequestPinResetOtpReqDto`
    - `password`: `string` — IsString, MinLength, MaxLength — { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, description: "Password of the owner's personal (root) account.", }
- Response: `ApiEnvelopeResponse(PinResetOtpResDto)` · `Promise<PinResetOtpResDto>`
    - `channel`: `PinResetOtpChannel` — { enum: PinResetOtpChannel, example: PinResetOtpChannel.Email }
    - `otpSent`: `boolean` — { example: true }
    - `resendInSeconds`: `number` — { example: 120 }
    - `expiresInSeconds`: `number` — { example: 300 }

#### `POST /api/v1/mobile/pin/reset`
Reset a forgotten or locked PIN with email OTP
- Điều kiện: `Authenticated` · `RateLimit(PIN_MUTATION_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Body: `ResetPinReqDto`
    - `otp`: `string` — IsString, Matches — { example: '928351', pattern: '^\\d{6}$', description: 'OTP sent by POST pin/reset/otp to the verified email.', }
    - `newPin`: `string` — IsString, Matches — { example: '731604', pattern: PIN_PATTERN }
    - `password`: `string` — IsString, MinLength, MaxLength — { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, description: "Password of the owner's personal (root) account.", }
- Response: `ApiEnvelopeResponse(PinStatusResDto)` · `Promise<PinStatusResDto>`
    - `configured`: `boolean` — { example: true }
    - `status`: `PinStatus` — { enum: PinStatus, example: PinStatus.Active }
    - `lockedUntil`: `string | null` — { type: String, nullable: true, example: null, description: 'Set only while status is TEMPORARILY_LOCKED.', }
    - `attemptsRemaining`: `number | null` — { type: Number, nullable: true, example: 5, description: 'Wrong entries left before the next lock. Null when not configured or hard locked.'

#### `GET /api/v1/mobile/pin/history`
Owner reads PIN usage history for the selected Merchant
- Điều kiện: `Authenticated` · `RateLimit({ userPerMin: 30 })`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(PinUsageHistoryResDto)` · `Promise<CursorPaginatedResponse<PinUsageHistoryResDto>>`
    - `data`: `PinUsageHistoryResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `POST /api/v1/mobile/pin/verify`
Verify the Owner-managed account PIN and get an actor-bound one-time token
- Điều kiện: `RequireContextPermissions(PERMISSION_KEYS.FinanceSubAccountManage)` · `Authenticated` · `RateLimit({ userPerMin: 5, ipPerMin: 20, sustained: { limit: 60, ttlMs)` · `HttpCode(HttpStatus.OK)`
- Body: `VerifyPinReqDto`
    - `pin`: `string` — IsString, Matches — { example: '482915', pattern: PIN_PATTERN }
    - `reason`: `PinTokenReason` — IsEnum — { enum: PinTokenReason, example: PinTokenReason.Payout, description: 'The single action the returned token may authorize. A route decorated 
- Response: `ApiEnvelopeResponse(PinTokenResDto)` · `Promise<PinTokenResDto>`
    - `pinToken`: `string` — { example: 'q3Zb1n0mS8yC4k6pV7xR2wLhT9aDfGjKuEoIzNcYvBs', description: 'Send as header X-Pin-Token on exactly one request to a route requiri
    - `reason`: `PinTokenReason` — { enum: PinTokenReason, example: PinTokenReason.Payout }
    - `expiresIn`: `number` — { example: 60 }
    - `expiresAt`: `string` — { example: '2026-09-30T10:01:00.000Z' }

## Module `smart-otp`

### MobileSmartOtpController  `/mobile/smart-otp`  — `src/modules/smart-otp/controllers/mobile.smart-otp.controller.ts`

#### `POST /api/v1/mobile/smart-otp/enroll/init`
Begin Smart OTP enrollment (requires eKYC)
- Điều kiện: `Authenticated` · `RequireEkyc({ fresh: true })` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 5, ipPerMin: 10 })`
- Body: `EnrollInitReqDto`
    - `password`: `string` — IsString, MinLength, MaxLength — { minLength: 8, maxLength: 128, description: 'Current account password. Required for all enrollments.', }
    - `deviceId`: `string` — IsString, IsNotEmpty, MaxLength — { description: 'Stable client device identifier (Keychain/Keystore UUID)', maxLength: 128, }
    - `platform`: `SmartOtpPlatform` — IsEnum — { enum: SmartOtpPlatform }
    - `publicKey`: `string` — IsString, IsNotEmpty, MaxLength — { description: 'Device EC P-256 public key — SPKI PEM or base64(DER). Generated in Secure Enclave / StrongBox.', maxLength: 4096, }
    - `recoveryToken?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'One-time recovery grant returned by REVOKE; required when re-enrolling after any prior device without an active device.', ma
    - `keyAttestation?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Hardware key attestation blob (Android Key Attestation / iOS App Attest), base64.', maxLength: 20000, }
    - `hardwareInfo?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Opaque device hardware descriptor (model/os), hashed at rest.', maxLength: 2048, }
    - `integrity?`: `DeviceIntegrityDto | undefined` — IsOptional, IsObject — { type: DeviceIntegrityDto }
    - `smartOtp?`: `SmartOtpProofDto | undefined` — IsOptional, IsObject — { type: SmartOtpProofDto, description: 'Required when replacing an existing active Smart OTP device. Create with purpose SMART_OTP_ENROLL an
- Response: `ApiEnvelopeResponse(EnrollInitResDto)` · `Promise<EnrollInitResDto>`
    - `enrollmentId`: `string` — { description: 'Opaque enrollment id — pass to /enroll/confirm', }
    - `challenge`: `string` — { description: 'Nonce to sign with the device private key (base64url)', }
    - `expiresIn`: `number` — { description: 'Seconds until the enrollment challenge expires', }

#### `POST /api/v1/mobile/smart-otp/enroll/confirm`
Complete Smart OTP enrollment (proof of possession)
- Điều kiện: `Authenticated` · `RequireEkyc({ fresh: true })` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 5 })`
- Body: `EnrollConfirmReqDto`
    - `enrollmentId`: `string` — IsString, IsNotEmpty, MaxLength — { description: 'Enrollment id returned by /enroll/init', maxLength: 64, }
    - `signature`: `string` — IsString, IsNotEmpty, MaxLength — { description: 'Base64 DER (X9.62) or raw IEEE-P1363 ECDSA P-256 signature of the exact enrollment nonce, signed by the device private key.'
    - `pin`: `string` — Matches — { description: 'New six-digit Smart OTP PIN for this device. Required on every enrollment and replaces the previous PIN.', pattern: '^\\d{6}
- Response: `ApiEnvelopeResponse(SmartOtpDeviceResDto)` · `Promise<SmartOtpDeviceResDto>`
    - `deviceId`: `string`
    - `platform`: `SmartOtpPlatform` — { enum: SmartOtpPlatform }
    - `activatedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `lastUsedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }

#### `POST /api/v1/mobile/smart-otp/setup`
Set up Smart OTP PIN for the active device
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 5 })`
- Header `HEADER_DEVICE_ID`: `string | undefined`
- Body: `SetupSmartOtpReqDto`
    - `password`: `string` — IsString, MinLength, MaxLength — { minLength: 8, maxLength: 128 }
    - `pin`: `string` — Matches — { example: '482915', pattern: '^\\d{6}$' }
- Response: `ApiEnvelopeResponse(SmartOtpSetupResDto)` · `Promise<SmartOtpSetupResDto>`
    - `configured`: `boolean`
    - `status`: `SmartOtpCredentialStatus` — { enum: SmartOtpCredentialStatus }
    - `configuredAt`: `string` — { format: 'date-time' }

#### `GET /api/v1/mobile/smart-otp/status`
Smart OTP enrollment status for the current user
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(SmartOtpStatusResDto)` · `Promise<SmartOtpStatusResDto>`
    - `status`: `SmartOtpAccountStatus` — { enum: SmartOtpAccountStatus }
    - `deviceEnrolled`: `boolean` — { description: 'Whether the user has an active Smart OTP device', }
    - `deviceStatus`: `string | null` — { enum: ['ACTIVE', 'REVOKED', 'DEACTIVATED'], nullable: true, }
    - `pinConfigured`: `boolean` — { description: 'Whether the user has configured a Smart OTP PIN', }
    - `pinStatus`: `SmartOtpCredentialStatus` — { enum: SmartOtpCredentialStatus }
    - `requiresSetup`: `boolean` — { description: 'Whether enrollment/PIN setup is still required', }
    - `device?`: `SmartOtpDeviceResDto | undefined` — { type: SmartOtpDeviceResDto, nullable: true }

#### `POST /api/v1/mobile/smart-otp/pin/change`
Change the current Smart OTP PIN
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 5 })`
- Body: `ChangeSmartOtpPinReqDto`
    - `password`: `string` — IsString, MinLength, MaxLength — { minLength: 8, maxLength: 128 }
    - `currentPin`: `string` — Matches — { example: '482915', pattern: '^\\d{6}$' }
    - `newPin`: `string` — Matches — { example: '731604', pattern: '^\\d{6}$' }
- Response: `ApiEnvelopeResponse(SmartOtpPinChangedResDto)` · `Promise<SmartOtpPinChangedResDto>`
    - `changed`: `boolean`
    - `changedAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/mobile/smart-otp/pin/reset`
Request reset OTP or reset the Smart OTP PIN
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 5 })`
- Body: `ResetSmartOtpPinReqDto`
    - `action`: `SmartOtpPinResetAction` — IsEnum — { enum: SmartOtpPinResetAction, description: 'REQUEST_OTP sends a delivery OTP. RESET_PIN verifies that OTP and changes the Smart OTP PIN.',
    - `password`: `string` — IsString, MinLength, MaxLength — { minLength: 8, maxLength: 128 }
    - `otp?`: `string | undefined` — ValidateIf, IsDefined, Matches — { example: '928351', pattern: '^\\d{6}$', description: 'Required when action is RESET_PIN', }
    - `newPin?`: `string | undefined` — ValidateIf, IsDefined, Matches — { example: '731604', pattern: '^\\d{6}$', description: 'Required when action is RESET_PIN', }
- Response: `ApiEnvelopeResponse(SmartOtpPinResetResDto)` · `Promise<SmartOtpPinResetResDto>`
    - `action`: `SmartOtpPinResetAction` — { enum: SmartOtpPinResetAction }
    - `otpSent?`: `boolean | undefined`
    - `channel?`: `string | undefined` — { enum: ['email', 'zalo'] }
    - `expiresAt?`: `string | undefined` — { format: 'date-time' }
    - `resendAt?`: `string | undefined` — { format: 'date-time' }
    - `reset?`: `boolean | undefined`
    - `changedAt?`: `string | undefined` — { format: 'date-time' }

#### `GET /api/v1/mobile/smart-otp/requests`
List Smart OTP approval requests for the user
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)`
- Query: `ListSmartOtpRequestsQueryDto`
    - `status?`: `SmartOtpRequestStatus | undefined` — IsOptional, IsEnum — { enum: SmartOtpRequestStatus }
- Response: `ApiEnvelopeResponse(SmartOtpRequestListResDto)` · `Promise<SmartOtpRequestListResDto>`
    - `items`: `SmartOtpRequestResDto[]` — { type: [SmartOtpRequestResDto] }

#### `GET /api/v1/mobile/smart-otp/requests/:requestId`
Get a Smart OTP approval request detail
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)`
- Path `requestId`: `string`
- Response: `ApiEnvelopeResponse(SmartOtpRequestResDto)` · `Promise<SmartOtpRequestResDto>`
    - `requestId`: `string`
    - `purpose`: `SmartOtpPurpose` — { enum: SmartOtpPurpose }
    - `subjectType`: `SmartOtpSubjectType` — { enum: SmartOtpSubjectType }
    - `subjectId`: `string`
    - `status`: `SmartOtpRequestStatus` — { enum: SmartOtpRequestStatus }
    - `referenceCode`: `string | null` — { type: String, nullable: true }
    - `statusReason`: `string | null` — { type: String, nullable: true }
    - `displayContext`: `Record<string, unknown>` — { type: 'object', additionalProperties: true }
    - `expiresAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/mobile/smart-otp/requests/:requestId/cancel`
Cancel a pending Smart OTP approval request
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 10 })`
- Path `requestId`: `string`
- Response: `ApiEnvelopeResponse(SmartOtpRequestResDto)` · `Promise<SmartOtpRequestResDto>`
    - `requestId`: `string`
    - `purpose`: `SmartOtpPurpose` — { enum: SmartOtpPurpose }
    - `subjectType`: `SmartOtpSubjectType` — { enum: SmartOtpSubjectType }
    - `subjectId`: `string`
    - `status`: `SmartOtpRequestStatus` — { enum: SmartOtpRequestStatus }
    - `referenceCode`: `string | null` — { type: String, nullable: true }
    - `statusReason`: `string | null` — { type: String, nullable: true }
    - `displayContext`: `Record<string, unknown>` — { type: 'object', additionalProperties: true }
    - `expiresAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/mobile/smart-otp/requests`
Create a client-allowed Smart OTP request
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 10 })`
- Body: `CreateSmartOtpRequestReqDto`
    - `purpose`: `SmartOtpPurpose` — IsEnum — { enum: SmartOtpPurpose }
    - `subject`: `SmartOtpSubjectReqDto` — IsDefined, IsObject — { type: SmartOtpSubjectReqDto }
      - **SmartOtpSubjectReqDto**
        - `type`: `SmartOtpSubjectType` — IsEnum — { enum: SmartOtpSubjectType }
        - `id`: `string` — IsString, IsNotEmpty, MaxLength — { example: '1234', maxLength: 128 }
    - `params?`: `Record<string, unknown> | undefined` — IsOptional, IsObject — { type: 'object', additionalProperties: true, example: { voucherId: '456' }, }
- Header `IDEMPOTENCY_KEY_HEADER`: `string | undefined`
- Response: `ApiEnvelopeResponse(SmartOtpRequestResDto)` · `Promise<SmartOtpRequestResDto>`
    - `requestId`: `string`
    - `purpose`: `SmartOtpPurpose` — { enum: SmartOtpPurpose }
    - `subjectType`: `SmartOtpSubjectType` — { enum: SmartOtpSubjectType }
    - `subjectId`: `string`
    - `status`: `SmartOtpRequestStatus` — { enum: SmartOtpRequestStatus }
    - `referenceCode`: `string | null` — { type: String, nullable: true }
    - `statusReason`: `string | null` — { type: String, nullable: true }
    - `displayContext`: `Record<string, unknown>` — { type: 'object', additionalProperties: true }
    - `expiresAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/mobile/smart-otp/requests/:requestId/issue`
Create a signing challenge or issue a one-time Smart OTP code
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 10 })`
- Path `requestId`: `string`
- Header `HEADER_DEVICE_ID`: `string | undefined`
- Body: `IssueSmartOtpReqDto`
    - `action`: `SmartOtpIssueAction` — IsEnum — { enum: SmartOtpIssueAction, description: 'CHALLENGE returns the canonical string to sign. ISSUE verifies signature + PIN and returns the on
    - `challengeId?`: `string | undefined` — ValidateIf, IsDefined, IsString, IsNotEmpty, IsBigIntId — { example: '1234', description: 'Required when action is ISSUE', }
    - `pin?`: `string | undefined` — ValidateIf, IsDefined, Matches — { example: '482915', pattern: '^\\d{6}$', description: 'Required when action is ISSUE', }
    - `signature?`: `string | undefined` — ValidateIf, IsDefined, IsString, IsNotEmpty, MaxLength — { description: 'Base64 DER (X9.62) or raw IEEE-P1363 ECDSA P-256 signature over the exact challenge canonical string', }
- Response: `ApiEnvelopeResponse(SmartOtpIssueResDto)` · `Promise<SmartOtpIssueResDto>`
    - `action`: `SmartOtpIssueAction` — { enum: SmartOtpIssueAction }
    - `challengeId?`: `string | undefined`
    - `canonical?`: `string | undefined`
    - `canonicalContext?`: `Record<string, unknown> | undefined` — { type: 'object', additionalProperties: true, description: 'Business context shown to the user before signing the canonical challenge string
    - `requestId?`: `string | undefined`
    - `authorizationId?`: `string | undefined`
    - `smartOtp?`: `string | undefined` — { example: '147258' }
    - `purpose?`: `SmartOtpPurpose | undefined` — { enum: SmartOtpPurpose }
    - `generation?`: `number | undefined`
    - `nextIssueAt?`: `string | null | undefined` — { type: String, format: 'date-time', nullable: true }
    - `remainingIssueCount?`: `number | undefined`
    - `expiresInSeconds`: `number`
    - `expiresAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/mobile/smart-otp/disable`
Disable Smart OTP for the current account
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 5 })` · `RequireSmartOtpProof({ purpose: SmartOtpPurpose.SmartOtpDisable, subjectType: Sma)`
- Body: `DisableSmartOtpReqDto`
    - `password`: `string` — IsString, MinLength, MaxLength — { minLength: 8, maxLength: 128 }
    - `smartOtp`: `SmartOtpProofDto` — IsDefined, IsObject — { type: SmartOtpProofDto }
      - **SmartOtpProofDto**
        - `requestId`: `string` — IsString, IsNotEmpty, IsBigIntId — { example: '1234' }
        - `code`: `string` — Matches — { example: '147258', pattern: '^\\d{6}$' }
- Response: `ApiEnvelopeResponse(SmartOtpDisabledResDto)` · `Promise<SmartOtpDisabledResDto>`
    - `disabled`: `boolean` — { description: 'True when Smart OTP was disabled' }
    - `disabledAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/mobile/smart-otp/revoke`
Revoke the active Smart OTP device (self-service)
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 5 })`
- Body: `RevokeSmartOtpReqDto`
    - `action`: `SmartOtpRevokeAction` — IsEnum — { enum: SmartOtpRevokeAction }
    - `password`: `string` — IsString, MinLength, MaxLength — { minLength: 8, maxLength: 128 }
    - `otp?`: `string | undefined` — ValidateIf, IsDefined, Matches — { pattern: '^\\d{6}$', description: 'Required for REVOKE after REQUEST_OTP', }
    - `newDeviceId?`: `string | undefined` — ValidateIf, IsDefined, IsString, MinLength, MaxLength — { maxLength: 128, description: 'Required for REVOKE; identifier of the new device receiving the recovery grant', }
- Response: `ApiEnvelopeResponse(SmartOtpRevokeResDto)` · `Promise<SmartOtpRevokeResDto>`
    - `action`: `SmartOtpRevokeAction` — { enum: SmartOtpRevokeAction }
    - `revoked?`: `boolean | undefined` — { description: 'True if an active device was revoked' }
    - `recoveryToken?`: `string | undefined` — { description: 'One-time grant for enrolling the new device', }
    - `recoveryTokenExpiresIn?`: `number | undefined` — { description: 'Grant lifetime in seconds' }
    - `otpSent?`: `boolean | undefined`
    - `channel?`: `string | undefined` — { enum: ['email', 'zalo'] }
    - `expiresAt?`: `string | undefined` — { format: 'date-time' }
    - `resendAt?`: `string | undefined` — { format: 'date-time' }

### WebSmartOtpController  `/web/smart-otp`  — `src/modules/smart-otp/controllers/web.smart-otp.controller.ts`

#### `POST /api/v1/web/smart-otp/requests`
Create a Smart OTP request for approval on the mobile device
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 10 })`
- Body: `CreateSmartOtpRequestReqDto`
    - `purpose`: `SmartOtpPurpose` — IsEnum — { enum: SmartOtpPurpose }
    - `subject`: `SmartOtpSubjectReqDto` — IsDefined, IsObject — { type: SmartOtpSubjectReqDto }
      - **SmartOtpSubjectReqDto**
        - `type`: `SmartOtpSubjectType` — IsEnum — { enum: SmartOtpSubjectType }
        - `id`: `string` — IsString, IsNotEmpty, MaxLength — { example: '1234', maxLength: 128 }
    - `params?`: `Record<string, unknown> | undefined` — IsOptional, IsObject — { type: 'object', additionalProperties: true, example: { voucherId: '456' }, }
- Header `IDEMPOTENCY_KEY_HEADER`: `string | undefined`
- Response: `ApiEnvelopeResponse(SmartOtpRequestResDto)` · `Promise<SmartOtpRequestResDto>`
    - `requestId`: `string`
    - `purpose`: `SmartOtpPurpose` — { enum: SmartOtpPurpose }
    - `subjectType`: `SmartOtpSubjectType` — { enum: SmartOtpSubjectType }
    - `subjectId`: `string`
    - `status`: `SmartOtpRequestStatus` — { enum: SmartOtpRequestStatus }
    - `referenceCode`: `string | null` — { type: String, nullable: true }
    - `statusReason`: `string | null` — { type: String, nullable: true }
    - `displayContext`: `Record<string, unknown>` — { type: 'object', additionalProperties: true }
    - `expiresAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }

## Module `access-control`

### WebApiEndpointController  `/web/admin/access-control`  — `src/modules/access-control/controllers/web.api-endpoint.controller.ts`

#### `GET /api/v1/web/admin/access-control/endpoints`
List discovered endpoints grouped by controller
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.AccessControlRoutesRead)`
- Response: `ApiOkResponse({
    description:
      'Envelope whose `data` is an ARRAY )` · `Promise<ApiEndpointGroupResDto[]>`
    - `controller`: `string` — { example: 'MobileAuditController', description: 'Controller class name that owns the endpoints below.', }
    - `endpoints`: `ApiEndpointResDto[]` — { type: [ApiEndpointResDto], description: 'Every discovered endpoint of this controller, ordered by controller then id.', }

### WebFeatureController  `/web/admin/access-control/features`  — `src/modules/access-control/controllers/web.feature.controller.ts`

#### `GET /api/v1/web/admin/access-control/features`
List features
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.AccessControlFeaturesRead)`
- Query: `ListFeaturesQueryDto`
    - `q?`: `string | undefined` — IsOptional, IsString, MaxLength — { example: 'chat', maxLength: 80, description: 'Case-insensitive substring match on featureCode or name (ILIKE). Omit to list every feature.
    - `page?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: DEFAULT_PAGE, default: DEFAULT_PAGE }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT, }
- Response: `Promise<PaginatedResponse<FeatureResDto>>`
    - `data`: `FeatureResDto[]`
    - `meta`: `{ total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; ha`

#### `POST /api/v1/web/admin/access-control/features/sync-config`
Re-sync features from the features-config folder
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.AccessControlFeaturesManage)`
- Response: `ApiEnvelopeResponse(SyncFeatureConfigResDto, 'Sync result')` · `Promise<SyncFeatureConfigResDto>`
    - `features`: `number` — { example: 118, description: 'Number of features declared across the features-config files.', }
    - `mappings`: `number` — { example: 241, description: 'Number of feature -> endpoint links written (many-to-many).', }
    - `unknownKeys`: `string[]` — { type: [String], example: [], description: 'Config endpoint keys that match no discovered endpoint (typo, or a renamed handler). They map n
    - `orphanFeatures`: `string[]` — { type: [String], example: [], description: 'Features the DB has that the config no longer declares. They are NEVER deleted, so their endpoi

#### `GET /api/v1/web/admin/access-control/features/unassigned-endpoints`
List gateable endpoints not mapped to any feature
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.AccessControlFeaturesRead, PERMISSION_KEYS.AccessControlRoutesRead)`
- Response: `Promise<ApiEndpointGroupResDto[]>`
    - `controller`: `string` — { example: 'MobileAuditController', description: 'Controller class name that owns the endpoints below.', }
    - `endpoints`: `ApiEndpointResDto[]` — { type: [ApiEndpointResDto], description: 'Every discovered endpoint of this controller, ordered by controller then id.', }

### WebPermissionController  `/web/admin/access-control/permissions`  — `src/modules/access-control/controllers/web.permission.controller.ts`

#### `GET /api/v1/web/admin/access-control/permissions`
List the code-owned semantic permission catalog
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.AccessControlPermissionsRead)`
- Response: `ApiOkResponse({
    description: 'Active semantic permissions grouped by r)` · `Promise<PermissionGroupResDto[]>`
    - `resource`: `string` — { example: 'users.status' }
    - `permissions`: `PermissionResDto[]` — { type: [PermissionResDto] }

### WebRoleController  `/web/admin/roles`  — `src/modules/access-control/controllers/web.role.controller.ts`

#### `GET /api/v1/web/admin/roles`
List roles
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.AccessControlRolesRead)`
- Query: `ListRolesQueryDto`
    - `q?`: `string | undefined` — IsOptional, IsString, MaxLength — { example: 'creator', maxLength: 50, description: 'Case-insensitive substring match on the role name (ILIKE). Omit to list every role. No ma
    - `scope?`: `AccessScope | undefined` — IsOptional, IsEnum — { enum: AccessScope }
    - `page?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: DEFAULT_PAGE, default: DEFAULT_PAGE }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT, }
- Response: `Promise<PaginatedResponse<RoleResDto>>`
    - `data`: `RoleResDto[]`
    - `meta`: `{ total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; ha`

#### `GET /api/v1/web/admin/roles/:id`
Get a role
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.AccessControlRolesRead)`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(RoleResDto, 'The role with its granted permissions')` · `Promise<RoleResDto>`
    - `id`: `string` — { type: 'string', example: '20', description: 'Role id (bigint serialised as string).', }
    - `roleCode`: `string` — { example: 'content_creator', description: 'Stable technical role code (max 50 chars). Use this value for client-side comparisons and integr
    - `roleName`: `string` — { example: 'Content Creator', description: 'Localized human-readable role name selected from the request locale (`X-Lang`, `?lang`, or `Acce
    - `description`: `string | null` — { type: 'string', nullable: true, example: 'Sub-account role: content creator', description: 'Optional admin note. null when never set.', }
    - `isSystem`: `boolean` — { example: false, description: 'true = system role (only `admin` today). A system role bypasses PermissionGuard entirely.', }
    - `scope`: `AccessScope` — { enum: AccessScope, example: AccessScope.Customer, description: 'Immutable authorization boundary. Staff and customer grants cannot be mixe
    - `roleType`: `RoleType` — { enum: RoleType }
    - `parentRoleId`: `string | null` — { type: 'string', nullable: true, example: '4', description: 'Immutable parent account-role id for a collaboration role; null for account ro
    - `permissions`: `PermissionResDto[]` — { type: [PermissionResDto], description: 'Active semantic permissions granted to this role. Empty array is valid.', }
    - `createdAt`: `string` — { format: 'date-time', example: '2026-07-01T08:58:49.310Z', description: 'ISO 8601 creation timestamp.', }
    - `updatedAt`: `string` — { format: 'date-time', example: '2026-07-01T08:58:49.310Z', description: 'ISO 8601 last-update timestamp.', }

## Module `marketplace`

### MobileCreatorCommitmentDashboardController  `/mobile/creator/commitment-dashboard`  — `src/modules/marketplace/controllers/mobile.creator-commitment-dashboard.controller.ts`

#### `GET /api/v1/mobile/creator/commitment-dashboard/summary`
Get Creator commitment dashboard summary
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Query: `CreatorDashboardEmptyQueryDto`
- Response: `ApiEnvelopeResponse(CreatorDashboardSummaryDto, 'Creator commitment dashboard catalog summary.')` · `Promise<CreatorDashboardSummaryDto>`
    - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
    - `totalTemplateCount`: `number` — { example: 4 }
    - `draftListingCount`: `number` — { example: 1 }
    - `publishedListingCount`: `number` — { example: 2 }
    - `unpublishedListingCount`: `number` — { example: 1 }
    - `dataAsOf`: `string` — { format: 'date-time' }
    - `generatedAt`: `string` — { format: 'date-time' }

#### `GET /api/v1/mobile/creator/commitment-dashboard/sales/overview`
Get Creator paid sales overview
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Query: `CreatorSalesDateRangeQueryDto`
    - `startDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-01', }
    - `endDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-23', }
- Response: `ApiEnvelopeResponse(CreatorSalesOverviewDto, 'Creator paid sales summary and time series.')` · `Promise<CreatorSalesOverviewDto>`
    - `report`: `CreatorDashboardReportContextDto` — { type: CreatorDashboardReportContextDto }
      - **CreatorDashboardReportContextDto**
        - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
        - `startDate`: `string` — { type: 'string', format: 'date', example: '2026-09-01' }
        - `endDate`: `string` — { type: 'string', format: 'date', example: '2026-09-23' }
        - `timezone`: `"Asia/Ho_Chi_Minh"` — { enum: ['Asia/Ho_Chi_Minh'] }
        - `startInclusiveUtc`: `string` — { format: 'date-time' }
        - `endExclusiveUtc`: `string` — { format: 'date-time' }
        - `dataAsOf`: `string` — { format: 'date-time' }
        - `generatedAt`: `string` — { format: 'date-time' }
    - `summary`: `CreatorSalesSummaryDto` — { type: CreatorSalesSummaryDto }
      - **CreatorSalesSummaryDto**
        - `grossRevenueVnd`: `string` — { type: 'string', example: '580000' }
        - `paidOrderCount`: `number` — { example: 5 }
        - `uniqueBuyerCount`: `number` — { example: 3 }
        - `averageOrderValueVnd`: `string | null` — { type: 'string', nullable: true, example: '116000' }
        - `paidButNotFulfilledOrderCount`: `number` — { example: 3 }
    - `granularity`: `"hour" | "day"` — { enum: ['hour', 'day'] }
    - `series`: `CreatorSalesBucketDto[]` — { type: CreatorSalesBucketDto, isArray: true }

#### `GET /api/v1/mobile/creator/commitment-dashboard/sales/top-products`
List Creator top commitment products
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Query: `CreatorTopProductsQueryDto`
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 5 }
    - `startDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-01', }
    - `endDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-23', }
- Response: `ApiEnvelopeResponse(CreatorTopProductsResponseDto, 'Creator top products for the selected period.')` · `Promise<CreatorTopProductsResponseDto>`
    - `report`: `CreatorDashboardReportContextDto` — { type: CreatorDashboardReportContextDto }
      - **CreatorDashboardReportContextDto**
        - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
        - `startDate`: `string` — { type: 'string', format: 'date', example: '2026-09-01' }
        - `endDate`: `string` — { type: 'string', format: 'date', example: '2026-09-23' }
        - `timezone`: `"Asia/Ho_Chi_Minh"` — { enum: ['Asia/Ho_Chi_Minh'] }
        - `startInclusiveUtc`: `string` — { format: 'date-time' }
        - `endExclusiveUtc`: `string` — { format: 'date-time' }
        - `dataAsOf`: `string` — { format: 'date-time' }
        - `generatedAt`: `string` — { format: 'date-time' }
    - `items`: `CreatorTopProductDto[]` — { type: CreatorTopProductDto, isArray: true }

#### `GET /api/v1/mobile/creator/commitment-dashboard/products/performance`
List Creator product performance
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Query: `CreatorProductPerformanceQueryDto`
    - `cursor?`: `string | undefined` — IsString, MaxLength, IsOptional — { maxLength: 4096 }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
    - `startDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-01', }
    - `endDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-23', }
- Response: `Promise<CreatorProductPerformancePage>`
    - `data`: `CreatorProductPerformanceItemDto[]`
    - `meta`: `CreatorProductPerformanceMetaDto`
      - **CreatorProductPerformanceMetaDto**
        - `nextCursor`: `string | null` — { type: String, nullable: true }
        - `hasMore`: `boolean` — { example: true }
        - `report`: `CreatorDashboardReportContextDto` — { type: CreatorDashboardReportContextDto }
          - **CreatorDashboardReportContextDto**
            - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
            - `startDate`: `string` — { type: 'string', format: 'date', example: '2026-09-01' }
            - `endDate`: `string` — { type: 'string', format: 'date', example: '2026-09-23' }
            - `timezone`: `"Asia/Ho_Chi_Minh"` — { enum: ['Asia/Ho_Chi_Minh'] }
            - `startInclusiveUtc`: `string` — { format: 'date-time' }
            - `endExclusiveUtc`: `string` — { format: 'date-time' }
            - `dataAsOf`: `string` — { format: 'date-time' }
            - `generatedAt`: `string` — { format: 'date-time' }
        - `paginationConsistency`: `"RANK_CHECKED"` — { enum: ['RANK_CHECKED'] }
        - `rankRevision`: `string` — { example: 'sha256:abc123' }

#### `GET /api/v1/mobile/creator/commitment-dashboard/products/performance/:listingId`
Get Creator product performance detail
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Path `listingId`: `string`
- Query: `CreatorSalesDateRangeQueryDto`
    - `startDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-01', }
    - `endDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-23', }
- Response: `ApiEnvelopeResponse(CreatorProductPerformanceDetailDto, 'Creator product performance detail.')` · `Promise<CreatorProductPerformanceDetailDto>`
    - `report`: `CreatorDashboardReportContextDto` — { type: CreatorDashboardReportContextDto }
      - **CreatorDashboardReportContextDto**
        - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
        - `startDate`: `string` — { type: 'string', format: 'date', example: '2026-09-01' }
        - `endDate`: `string` — { type: 'string', format: 'date', example: '2026-09-23' }
        - `timezone`: `"Asia/Ho_Chi_Minh"` — { enum: ['Asia/Ho_Chi_Minh'] }
        - `startInclusiveUtc`: `string` — { format: 'date-time' }
        - `endExclusiveUtc`: `string` — { format: 'date-time' }
        - `dataAsOf`: `string` — { format: 'date-time' }
        - `generatedAt`: `string` — { format: 'date-time' }
    - `product`: `CreatorProductPerformanceDetailProductDto` — { type: CreatorProductPerformanceDetailProductDto }
      - **CreatorProductPerformanceDetailProductDto**
        - `listingId`: `string` — { type: 'string', example: '102' }
        - `templateId`: `string` — { type: 'string', example: '501' }
        - `templateVersionId`: `string` — { type: 'string', example: '902' }
        - `versionNumber`: `number` — { example: 2 }
        - `title`: `string | null` — { type: String, nullable: true }
        - `thumbnailUrl`: `string | null` — { type: String, nullable: true }
        - `currentListingStatus`: `CommitmentListingStatus` — { enum: CommitmentListingStatus }
        - `paidQuantity`: `number` — { example: 2 }
        - `grossRevenueVnd`: `string` — { type: 'string', example: '300000' }
        - `uniqueBuyerCount`: `number` — { example: 2 }
    - `summary`: `CreatorSalesSummaryDto` — { type: CreatorSalesSummaryDto }
      - **CreatorSalesSummaryDto**
        - `grossRevenueVnd`: `string` — { type: 'string', example: '580000' }
        - `paidOrderCount`: `number` — { example: 5 }
        - `uniqueBuyerCount`: `number` — { example: 3 }
        - `averageOrderValueVnd`: `string | null` — { type: 'string', nullable: true, example: '116000' }
        - `paidButNotFulfilledOrderCount`: `number` — { example: 3 }
    - `granularity`: `"hour" | "day"` — { enum: ['hour', 'day'] }
    - `series`: `CreatorSalesBucketDto[]` — { type: CreatorSalesBucketDto, isArray: true }

#### `GET /api/v1/mobile/creator/commitment-dashboard/sales/orders`
List Creator paid sales orders
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Query: `CreatorSalesOrdersQueryDto`
    - `cursor?`: `string | undefined` — IsString, MaxLength, IsOptional — { maxLength: 4096 }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
    - `fulfillmentView?`: `CreatorSalesFulfillmentView | undefined` — IsEnum, IsOptional — { enum: CreatorSalesFulfillmentView, default: CreatorSalesFulfillmentView.All, }
    - `startDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-01', }
    - `endDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-23', }
- Response: `Promise<CreatorSalesOrdersPage>`
    - `data`: `CreatorSalesOrderItemDto[]`
    - `meta`: `CreatorSalesOrdersMetaDto`
      - **CreatorSalesOrdersMetaDto**
        - `nextCursor`: `string | null` — { type: String, nullable: true }
        - `hasMore`: `boolean` — { example: true }
        - `report`: `CreatorDashboardReportContextDto` — { type: CreatorDashboardReportContextDto }
          - **CreatorDashboardReportContextDto**
            - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
            - `startDate`: `string` — { type: 'string', format: 'date', example: '2026-09-01' }
            - `endDate`: `string` — { type: 'string', format: 'date', example: '2026-09-23' }
            - `timezone`: `"Asia/Ho_Chi_Minh"` — { enum: ['Asia/Ho_Chi_Minh'] }
            - `startInclusiveUtc`: `string` — { format: 'date-time' }
            - `endExclusiveUtc`: `string` — { format: 'date-time' }
            - `dataAsOf`: `string` — { format: 'date-time' }
            - `generatedAt`: `string` — { format: 'date-time' }
        - `paginationConsistency`: `"LIVE_KEYSET"` — { enum: ['LIVE_KEYSET'] }

#### `GET /api/v1/mobile/creator/commitment-dashboard/sales/orders/:orderId`
Get Creator paid sales order detail
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Path `orderId`: `string`
- Response: `ApiEnvelopeResponse(CreatorSalesOrderDetailDto, 'Creator paid sales order detail.')` · `Promise<CreatorSalesOrderDetailDto>`
    - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
    - `dataAsOf`: `string` — { format: 'date-time' }
    - `generatedAt`: `string` — { format: 'date-time' }
    - `product`: `CreatorSalesOrderProductDto` — { type: CreatorSalesOrderProductDto }
      - **CreatorSalesOrderProductDto**
        - `listingId`: `string` — { type: 'string', example: '102' }
        - `templateId`: `string` — { type: 'string', example: '501' }
        - `templateVersionId`: `string` — { type: 'string', example: '902' }
        - `versionNumber`: `number` — { example: 2 }
        - `title`: `string` — { example: 'Run 5km' }
    - `payment`: `CreatorSalesOrderPaymentDto` — { type: CreatorSalesOrderPaymentDto }
      - **CreatorSalesOrderPaymentDto**
        - `orderId`: `string` — { type: 'string', example: '87' }
        - `checkoutUnitId`: `string | null` — { type: 'string', nullable: true, example: '981' }
        - `status`: `"SUCCESS"` — { enum: ['SUCCESS'] }
        - `amountVnd`: `string` — { type: 'string', example: '150000' }
        - `currency`: `"VND"` — { enum: ['VND'] }
        - `paidAt`: `string` — { format: 'date-time' }
    - `fulfillment`: `CreatorSalesOrderFulfillmentDto` — { type: CreatorSalesOrderFulfillmentDto }
      - **CreatorSalesOrderFulfillmentDto**
        - `status`: `PaymentFulfillmentStatus` — { enum: PaymentFulfillmentStatus }
        - `fulfilledAt`: `string | null` — { type: String, format: 'date-time', nullable: true }

#### `GET /api/v1/mobile/creator/commitment-dashboard/sales/orders/:orderId/units/:checkoutUnitId`
Get Creator cart sale unit detail
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Path `orderId`: `string`
- Path `checkoutUnitId`: `string`
- Response: `ApiEnvelopeResponse(CreatorSalesOrderDetailDto, 'Creator cart sale detail.')` · `Promise<CreatorSalesOrderDetailDto>`
    - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
    - `dataAsOf`: `string` — { format: 'date-time' }
    - `generatedAt`: `string` — { format: 'date-time' }
    - `product`: `CreatorSalesOrderProductDto` — { type: CreatorSalesOrderProductDto }
      - **CreatorSalesOrderProductDto**
        - `listingId`: `string` — { type: 'string', example: '102' }
        - `templateId`: `string` — { type: 'string', example: '501' }
        - `templateVersionId`: `string` — { type: 'string', example: '902' }
        - `versionNumber`: `number` — { example: 2 }
        - `title`: `string` — { example: 'Run 5km' }
    - `payment`: `CreatorSalesOrderPaymentDto` — { type: CreatorSalesOrderPaymentDto }
      - **CreatorSalesOrderPaymentDto**
        - `orderId`: `string` — { type: 'string', example: '87' }
        - `checkoutUnitId`: `string | null` — { type: 'string', nullable: true, example: '981' }
        - `status`: `"SUCCESS"` — { enum: ['SUCCESS'] }
        - `amountVnd`: `string` — { type: 'string', example: '150000' }
        - `currency`: `"VND"` — { enum: ['VND'] }
        - `paidAt`: `string` — { format: 'date-time' }
    - `fulfillment`: `CreatorSalesOrderFulfillmentDto` — { type: CreatorSalesOrderFulfillmentDto }
      - **CreatorSalesOrderFulfillmentDto**
        - `status`: `PaymentFulfillmentStatus` — { enum: PaymentFulfillmentStatus }
        - `fulfilledAt`: `string | null` — { type: String, format: 'date-time', nullable: true }

### MobileCreatorCommitmentListingController  `/mobile/creator/commitment-listings`  — `src/modules/marketplace/controllers/mobile.creator-commitment-listing.controller.ts`

#### `GET /api/v1/mobile/creator/commitment-listings`
List my commitment listings
- Điều kiện: `RateLimit(CREATOR_MARKETPLACE_READ_RATE_LIMIT)`
- Query: `CreatorCommitmentListingQueryDto`
    - `status?`: `CommitmentListingStatus | undefined` — IsIn, IsOptional — { enum: COMMITMENT_LISTING_STATUSES }
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(CreatorCommitmentListingListItemDto, 'Creator-scoped commitment listings.')` · `Promise<CursorPaginatedResponse<CreatorCommitmentListingListItemDto>>`
    - `data`: `CreatorCommitmentListingListItemDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `POST /api/v1/mobile/creator/commitment-listings`
Create a draft commitment listing
- Điều kiện: `RequireEkyc` · `RequireMembership` · `HttpCode(HttpStatus.OK)` · `RateLimit(CREATOR_MARKETPLACE_WRITE_RATE_LIMIT)`
- Body: `CreateCommitmentListingDto`
    - `templateVersionId`: `string` — IsBigIntId — { type: 'string', example: '902' }
    - `templateId?`: `string | undefined` — IsBigIntId, IsOptional — { type: 'string', example: '321', deprecated: true, description: 'Deprecated TRUST-718 compatibility field; backend derives templateId from 
    - `priceAmount`: `string` — IsBigIntString — { type: 'string', example: '99000' }
    - `currency`: `string` — IsString — { example: 'VND' }
    - `saleLimit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 2147483647, example: 50, description: 'Total copies this listing may sell (50 means 50 in total, never "50 more"). Re
    - `availableFrom?`: `string | null | undefined` — IsISO8601, IsOptional — { type: String, format: 'date-time', nullable: true }
    - `availableUntil?`: `string | null | undefined` — IsISO8601, IsOptional — { type: String, format: 'date-time', nullable: true }
    - `sortOrder?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 2147483647, default: 0 }
    - `metadata?`: `Record<string, unknown> | null | undefined` — IsObject, IsOptional — { type: 'object', additionalProperties: true, nullable: true, }
    - `affiliateShareBps?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 5000, default: 0, example: 500, description: "Basis points of the gross sale price paid by the Creator to the buyer's
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentListingResponseDto, 'Created draft commitment listing.')` · `Promise<CreatorCommitmentListingResponseDto>`
    - `id`: `string` — { type: 'string', example: '1001' }
    - `templateId`: `string` — { type: 'string', example: '321' }
    - `templateVersionId`: `string` — { type: 'string', example: '902' }
    - `templateVersionStatus`: `CommitmentTemplateVersionStatus` — { enum: CommitmentTemplateVersionStatus }
    - `templateVersionRevision`: `number` — { example: 2 }
    - `creatorUserId`: `string` — { type: 'string', example: '88' }
    - `status`: `CommitmentListingStatus` — { enum: CommitmentListingStatus }
    - `priceAmount`: `string` — { type: 'string', example: '99000' }
    - `currency`: `string` — { example: 'VND' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points of the gross sale price paid by the Creator to the buyer's referrer. 5
    - `saleLimit`: `number | null` — { type: 'integer', nullable: true, example: 50, description: 'Total copies this listing may sell. Null only for legacy rows.', }
    - `soldQuantity`: `number` — { example: 0, description: 'Copies already sold (goods transaction committed).', }
    - `availableFrom`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `availableUntil`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `publishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishReason`: `CommitmentListingUnpublishReason | null` — { enum: CommitmentListingUnpublishReason, nullable: true, description: 'Set once the Listing is UNPUBLISHED: VERSION_REPLACED, MANUAL, SOLD_
    - `replacedByListingId`: `string | null` — { type: 'string', nullable: true }
    - `revision`: `number`
    - `publicationRevision`: `number`
    - `sortOrder`: `number`
    - `metadata`: `Record<string, unknown> | null` — { type: 'object', additionalProperties: true, nullable: true, }
    - `moderation`: `CreatorCommitmentListingModerationViewDto | null` — { type: CreatorCommitmentListingModerationViewDto, nullable: true, }
    - `createdAt`: `string | Date` — { format: 'date-time' }
    - `updatedAt`: `string | Date` — { format: 'date-time' }
    - `publicationOutcome?`: `CommitmentListingPublicationOutcome | null | undefined` — { enum: CommitmentListingPublicationOutcome, nullable: true, description: 'Present on publish responses only. PUBLISHED is the only value th

#### `GET /api/v1/mobile/creator/commitment-listings/:listingId`
Get one of my commitment listings
- Điều kiện: `RateLimit(CREATOR_MARKETPLACE_READ_RATE_LIMIT)`
- Path `listingId`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentListingDetailDto, 'Creator-scoped commitment listing detail.')` · `Promise<CreatorCommitmentListingDetailDto>`
    - `commitment`: `CreatorCommitmentListingDetailDefinitionDto` — { type: CreatorCommitmentListingDetailDefinitionDto, }
      - **CreatorCommitmentListingDetailDefinitionDto**
        - `description`: `string | null` — { type: String, nullable: true }
        - `templateId`: `string` — { type: 'string', example: '321' }
        - `templateVersionId`: `string` — { type: 'string', example: '902' }
        - `versionNumber`: `number` — { example: 1 }
        - `code`: `string` — { example: 'run-5km' }
        - `slug`: `string | null` — { type: String, example: 'run-5km-7-days', nullable: true, }
        - `title`: `string` — { example: 'Run 5km' }
        - `shortDescription`: `string | null` — { type: String, nullable: true }
        - `flowType`: `CommitmentFlowType | null` — { enum: CommitmentFlowType, nullable: true }
        - `productType`: `CommitmentProductType | null` — { enum: CommitmentProductType, nullable: true }
        - `maxUsages`: `number | null` — { type: Number, nullable: true, minimum: 1 }
        - `category`: `MarketplaceCategorySummaryDto | null` — { type: MarketplaceCategorySummaryDto, nullable: true, }
        - `allowRevivalCard`: `boolean` — { example: true }
        - `revivalCardLimit`: `number` — { example: 2 }
        - `revivalCardPrice`: `MarketplacePriceDto | null` — { type: MarketplacePriceDto, nullable: true }
    - `metadata`: `null` — { type: 'object', additionalProperties: true, nullable: true, }
    - `id`: `string` — { type: 'string', example: '1001' }
    - `status`: `CommitmentListingStatus` — { enum: CommitmentListingStatus }
    - `price`: `MarketplacePriceDto` — { type: MarketplacePriceDto }
      - **MarketplacePriceDto**
        - `amount`: `string` — { type: 'string', example: '99000' }
        - `currency`: `string` — { example: 'VND' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points of the gross sale price paid by the Creator to the buyer's referrer. 5
    - `visibility`: `CreatorCommitmentListingVisibilityDto` — { type: CreatorCommitmentListingVisibilityDto }
      - **CreatorCommitmentListingVisibilityDto**
        - `state`: `CreatorCommitmentListingVisibilityState` — { enum: CreatorCommitmentListingVisibilityState }
        - `isVisible`: `boolean`
        - `reason`: `CreatorCommitmentListingVisibilityReason | null` — { enum: CreatorCommitmentListingVisibilityReason, nullable: true, }
    - `capabilities`: `CreatorCommitmentListingCapabilitiesDto` — { type: CreatorCommitmentListingCapabilitiesDto }
      - **CreatorCommitmentListingCapabilitiesDto**
        - `canEdit`: `boolean`
        - `canPublish`: `boolean`
        - `canUnpublish`: `boolean`
        - `canDelete`: `boolean` — { description: 'True only while the Listing is a never-published DRAFT that can be physically deleted.', }
    - `saleLimit`: `number | null` — { type: 'integer', nullable: true, example: 50, description: 'Total copies this listing may sell. Null only for legacy rows.', }
    - `soldQuantity`: `number` — { example: 0, description: 'Copies already sold (goods transaction committed).', }
    - `availableFrom`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `availableUntil`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `publishedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `unpublishedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `unpublishReason`: `CommitmentListingUnpublishReason | null` — { enum: CommitmentListingUnpublishReason, nullable: true, description: 'Why this Listing left the Marketplace. VERSION_REPLACED when a newer
    - `replacedByListingId`: `string | null` — { type: 'string', nullable: true, description: 'Listing that replaced this one (VERSION_REPLACED only).', }
    - `isLatestActivatedVersion`: `boolean` — { description: 'This Version is the release head, even if its Listing was manually retired.', }
    - `isCurrentPublishedListing`: `boolean` — { description: 'This exact Listing is the PUBLISHED one.' }
    - `isSellableNow`: `boolean` — { description: 'This Listing satisfies public Marketplace eligibility right now.', }
    - `canCreateNextVersion`: `boolean` — { description: 'The family can prepare a next sequential Version (release head, active root, no draft, not an activated EXCLUSIVE family).',
    - `currentPublishedListingId`: `string | null` — { type: 'string', nullable: true }
    - `latestActivatedVersionId`: `string | null` — { type: 'string', nullable: true }
    - `revision`: `number`
    - `publicationRevision`: `number`
    - `sortOrder`: `number`
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
    - `moderation`: `CreatorCommitmentListingModerationViewDto | null` — { type: CreatorCommitmentListingModerationViewDto, nullable: true, }

#### `PATCH /api/v1/mobile/creator/commitment-listings/:listingId`
Update a commitment listing
- Điều kiện: `RequireEkyc` · `RequireMembership` · `HttpCode(HttpStatus.OK)` · `RateLimit(CREATOR_MARKETPLACE_WRITE_RATE_LIMIT)`
- Path `listingId`: `string`
- Body: `UpdateCommitmentListingDto`
    - `expectedListingRevision`: `number` — IsInt, Min — { minimum: 1 }
    - `priceAmount?`: `string | undefined` — IsBigIntString, IsOptional — { type: 'string', example: '99000' }
    - `currency?`: `string | undefined` — IsString, IsOptional — { example: 'VND' }
    - `saleLimit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 2147483647, example: 50, description: 'Total copies this listing may sell (50 means 50 in total, never "50 more"). On
    - `availableFrom?`: `string | null | undefined` — IsISO8601, IsOptional — { type: String, format: 'date-time', nullable: true }
    - `availableUntil?`: `string | null | undefined` — IsISO8601, IsOptional — { type: String, format: 'date-time', nullable: true }
    - `sortOrder?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 2147483647 }
    - `metadata?`: `Record<string, unknown> | null | undefined` — IsObject, IsOptional — { type: 'object', additionalProperties: true, nullable: true, }
    - `affiliateShareBps?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 5000, example: 500, description: "Basis points of the gross sale price paid by the Creator to the buyer's referrer. 5
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentListingResponseDto, 'Updated commitment listing.')` · `Promise<CreatorCommitmentListingResponseDto>`
    - `id`: `string` — { type: 'string', example: '1001' }
    - `templateId`: `string` — { type: 'string', example: '321' }
    - `templateVersionId`: `string` — { type: 'string', example: '902' }
    - `templateVersionStatus`: `CommitmentTemplateVersionStatus` — { enum: CommitmentTemplateVersionStatus }
    - `templateVersionRevision`: `number` — { example: 2 }
    - `creatorUserId`: `string` — { type: 'string', example: '88' }
    - `status`: `CommitmentListingStatus` — { enum: CommitmentListingStatus }
    - `priceAmount`: `string` — { type: 'string', example: '99000' }
    - `currency`: `string` — { example: 'VND' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points of the gross sale price paid by the Creator to the buyer's referrer. 5
    - `saleLimit`: `number | null` — { type: 'integer', nullable: true, example: 50, description: 'Total copies this listing may sell. Null only for legacy rows.', }
    - `soldQuantity`: `number` — { example: 0, description: 'Copies already sold (goods transaction committed).', }
    - `availableFrom`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `availableUntil`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `publishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishReason`: `CommitmentListingUnpublishReason | null` — { enum: CommitmentListingUnpublishReason, nullable: true, description: 'Set once the Listing is UNPUBLISHED: VERSION_REPLACED, MANUAL, SOLD_
    - `replacedByListingId`: `string | null` — { type: 'string', nullable: true }
    - `revision`: `number`
    - `publicationRevision`: `number`
    - `sortOrder`: `number`
    - `metadata`: `Record<string, unknown> | null` — { type: 'object', additionalProperties: true, nullable: true, }
    - `moderation`: `CreatorCommitmentListingModerationViewDto | null` — { type: CreatorCommitmentListingModerationViewDto, nullable: true, }
    - `createdAt`: `string | Date` — { format: 'date-time' }
    - `updatedAt`: `string | Date` — { format: 'date-time' }
    - `publicationOutcome?`: `CommitmentListingPublicationOutcome | null | undefined` — { enum: CommitmentListingPublicationOutcome, nullable: true, description: 'Present on publish responses only. PUBLISHED is the only value th

#### `POST /api/v1/mobile/creator/commitment-listings/:listingId/publish`
Submit a commitment listing for pre-publish moderation
- Điều kiện: `RequireEkyc` · `RequireMembership` · `HttpCode(HttpStatus.OK)` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.publish)`
- Path `listingId`: `string`
- Body: `PublishCommitmentListingDto`
    - `expectedVersionRevision`: `number` — IsInt, Min — { minimum: 1 }
    - `expectedListingRevision`: `number` — IsInt, Min — { minimum: 1 }
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentListingResponseDto, 'Publish submission result. HTTP 200 can return PUBLISHED, D)` · `Promise<CreatorCommitmentListingResponseDto>`
    - `id`: `string` — { type: 'string', example: '1001' }
    - `templateId`: `string` — { type: 'string', example: '321' }
    - `templateVersionId`: `string` — { type: 'string', example: '902' }
    - `templateVersionStatus`: `CommitmentTemplateVersionStatus` — { enum: CommitmentTemplateVersionStatus }
    - `templateVersionRevision`: `number` — { example: 2 }
    - `creatorUserId`: `string` — { type: 'string', example: '88' }
    - `status`: `CommitmentListingStatus` — { enum: CommitmentListingStatus }
    - `priceAmount`: `string` — { type: 'string', example: '99000' }
    - `currency`: `string` — { example: 'VND' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points of the gross sale price paid by the Creator to the buyer's referrer. 5
    - `saleLimit`: `number | null` — { type: 'integer', nullable: true, example: 50, description: 'Total copies this listing may sell. Null only for legacy rows.', }
    - `soldQuantity`: `number` — { example: 0, description: 'Copies already sold (goods transaction committed).', }
    - `availableFrom`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `availableUntil`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `publishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishReason`: `CommitmentListingUnpublishReason | null` — { enum: CommitmentListingUnpublishReason, nullable: true, description: 'Set once the Listing is UNPUBLISHED: VERSION_REPLACED, MANUAL, SOLD_
    - `replacedByListingId`: `string | null` — { type: 'string', nullable: true }
    - `revision`: `number`
    - `publicationRevision`: `number`
    - `sortOrder`: `number`
    - `metadata`: `Record<string, unknown> | null` — { type: 'object', additionalProperties: true, nullable: true, }
    - `moderation`: `CreatorCommitmentListingModerationViewDto | null` — { type: CreatorCommitmentListingModerationViewDto, nullable: true, }
    - `createdAt`: `string | Date` — { format: 'date-time' }
    - `updatedAt`: `string | Date` — { format: 'date-time' }
    - `publicationOutcome?`: `CommitmentListingPublicationOutcome | null | undefined` — { enum: CommitmentListingPublicationOutcome, nullable: true, description: 'Present on publish responses only. PUBLISHED is the only value th

#### `DELETE /api/v1/mobile/creator/commitment-listings/:listingId`
Delete a draft commitment listing
- Điều kiện: `RequireEkyc` · `RequireMembership` · `HttpCode(HttpStatus.OK)` · `RateLimit(CREATOR_MARKETPLACE_WRITE_RATE_LIMIT)`
- Path `listingId`: `string`
- Body: `DeleteCommitmentListingDto`
    - `expectedListingRevision`: `number` — IsInt, Min — { minimum: 1, example: 4, description: 'Optimistic Listing revision the Creator last read. A mismatch is rejected with COMMITMENT_LISTING_RE
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(DeletedCommitmentListingResponseDto, 'Deleted draft commitment listing.')` · `Promise<DeletedCommitmentListingResponseDto>`
    - `id`: `string` — { type: 'string', example: '2001' }
    - `deleted`: `boolean` — { example: true, description: 'Always true on a successful delete.', }

### MobileMarketplaceController  `/mobile/marketplace`  — `src/modules/marketplace/controllers/mobile.marketplace.controller.ts`

#### `GET /api/v1/mobile/marketplace/commitments`
List marketplace commitment listings
- Điều kiện: `Public` · `RateLimit(MARKETPLACE_PUBLIC_READ_RATE_LIMIT)`
- Query: `CommitmentMarketplaceQueryDto`
    - `categoryId?`: `string | undefined` — IsBigIntId, IsOptional — { type: 'string', description: 'Filter by commitment template category ID.', example: '12', }
    - `creatorId?`: `string | undefined` — IsBigIntId, IsOptional — { type: 'string', description: 'Filter by Creator account user ID.', example: '88', }
    - `productType?`: `CommitmentProductType | undefined` — IsEnum, IsOptional — { enum: CommitmentProductType }
    - `minPrice?`: `string | undefined` — IsBigIntString, IsOptional — { type: 'string', example: '10000' }
    - `maxPrice?`: `string | undefined` — IsBigIntString, IsOptional — { type: 'string', example: '99000' }
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(CommitmentMarketplaceListItemDto, 'Published commitment listings available in the marketplace.)` · `Promise<CursorPaginatedResponse<CommitmentMarketplaceListItemDto>>`
    - `data`: `CommitmentMarketplaceListItemDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `400: COMMITMENT_LISTING_INVALID_CURSOR`

#### `GET /api/v1/mobile/marketplace/commitments/:listingId`
Get a marketplace commitment listing
- Điều kiện: `Public` · `RateLimit(MARKETPLACE_PUBLIC_READ_RATE_LIMIT)`
- Path `listingId`: `string`
- Response: `ApiEnvelopeResponse(CommitmentMarketplaceDetailDto, 'Published commitment listing detail.')` · `Promise<CommitmentMarketplaceDetailDto>`
    - `metadata`: `Record<string, unknown> | null` — { type: 'object', additionalProperties: true, nullable: true, }
    - `id`: `string` — { type: 'string', example: '1001' }
    - `kind`: `CommitmentListingKind` — IsEnum — { enum: CommitmentListingKind, example: 'COMMITMENT' }
    - `campaign?`: `CommitmentMarketplaceCampaignDto | undefined` — IsOptional — { type: CommitmentMarketplaceCampaignDto, nullable: true, description: 'Campaign-only sponsored reward disclosure; absent for ordinary Commi
    - `status`: `CommitmentListingStatus` — { enum: CommitmentListingStatus }
    - `price`: `MarketplacePriceDto` — { type: MarketplacePriceDto }
      - **MarketplacePriceDto**
        - `amount`: `string` — { type: 'string', example: '99000' }
        - `currency`: `string` — { example: 'VND' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points (0-5000 = 0-50%) of the price the Creator pays the buyer's referrer, i
    - `affiliateAmountVnd`: `string` — { type: 'string', example: '4950', description: "Estimated affiliate payout in whole VND for the buyer's referrer, " + 'computed as HALF_UP(
    - `publishedAt`: `string` — { format: 'date-time' }
    - `availableFrom`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `availableUntil`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `creator`: `MarketplaceCreatorSummaryDto` — { type: MarketplaceCreatorSummaryDto }
      - **MarketplaceCreatorSummaryDto**
        - `id`: `string` — { type: 'string', example: '88' }
        - `displayName`: `string` — { example: 'Creator Name' }
        - `avatarUrl`: `string | null` — { type: String, nullable: true }
    - `ratingSummary`: `CommitmentRatingSummaryDto` — { type: CommitmentRatingSummaryDto }
      - **CommitmentRatingSummaryDto**
        - `averageRating`: `number | null` — { type: Number, nullable: true, example: 4.35 }
        - `reviewCount`: `number` — { example: 127 }
        - `scope`: `"TEMPLATE_ALL_VERSIONS"` — { example: 'TEMPLATE_ALL_VERSIONS' }
    - `availability`: `CommitmentMarketplaceAvailabilityDto` — { type: () => CommitmentMarketplaceAvailabilityDto, description: 'Advisory stock facts. Checkout re-checks capacity under lock, so this may 
      - **CommitmentMarketplaceAvailabilityDto**
        - `saleLimit`: `number | null` — { type: 'integer', nullable: true, description: 'Total copies the creator offers; null for legacy unconfigured listings.', }
        - `remainingQuantity`: `number` — { type: 'integer', description: 'Copies still buyable now (sale limit minus sold and temporarily reserved copies). No buyer or order details
        - `soldOut`: `boolean` — { description: 'True when remainingQuantity is 0 (sold out or fully reserved right now).', }
    - `commitment`: `CommitmentMarketplaceDefinitionDto` — { type: CommitmentMarketplaceDefinitionDto }
      - **CommitmentMarketplaceDefinitionDto**
        - `templateId`: `string` — { type: 'string', example: '321' }
        - `templateVersionId`: `string` — { type: 'string', example: '902' }
        - `versionNumber`: `number` — { example: 1 }
        - `slug`: `string | null` — { type: String, example: 'run-5km-7-days', nullable: true, }
        - `code`: `string` — { example: 'run-5km' }
        - `title`: `string` — { example: 'Run 5km' }
        - `description`: `string | null` — { type: String, nullable: true }
        - `flowType`: `CommitmentFlowType` — { enum: CommitmentFlowType }
        - `productType`: `CommitmentProductType` — { enum: CommitmentProductType }
        - `maxUsages`: `number | null` — { type: Number, nullable: true, minimum: 1 }
        - `certificate`: `CommitmentCertificatePreviewDto` — { type: CommitmentCertificatePreviewDto }
          - **CommitmentCertificatePreviewDto**
            - `type`: `CertificateType.CommitmentV1 | CertificateType.CommitmentV2 | CertificateType.CommitmentV3` — { enum: [ CertificateType.CommitmentV1, CertificateType.CommitmentV2, CertificateType.CommitmentV3, ], }
            - `version`: `"V1" | "V2" | "V3"` — { enum: ['V1', 'V2', 'V3'] }
            - `name`: `"Mầm Tín" | "Kết Tín" | "Chứng Tín"` — { enum: ['Mầm Tín', 'Kết Tín', 'Chứng Tín'] }
            - `verificationLevel`: `"Basic" | "Confirmed" | "Verified"` — { enum: ['Basic', 'Confirmed', 'Verified'] }
            - `requirements`: `string[]` — { type: [String] }
            - `policyVersion`: `number` — { example: 1 }
            - `witnessRequired`: `boolean` — { example: false }
            - `requiredWitnessCount`: `number` — { example: 0 }
            - `independentReviewerEnabled`: `boolean` — { example: false }
        - `category`: `MarketplaceCategorySummaryDto | null` — { type: MarketplaceCategorySummaryDto, nullable: true, }
        - `allowRevivalCard`: `boolean` — { example: true }
        - `revivalCardLimit`: `number` — { example: 2 }
        - `revivalCardPrice`: `MarketplacePriceDto | null` — { type: MarketplacePriceDto, nullable: true }
- Lỗi/Status: `400: VALIDATION_FAILED` | `404: COMMITMENT_LISTING_NOT_FOUND`

#### `POST /api/v1/mobile/marketplace/commitments/:listingId/purchase`
Mobile commitment purchase is awaiting IAP
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ ipPerMin: 30, userPerMin: 20 })`
- Response: `never`
- Lỗi/Status: `409: CART_COMMITMENT_IAP_NOT_AVAILABLE`

#### `GET /api/v1/mobile/marketplace/vouchers`
List marketplace vouchers
- Điều kiện: `Authenticated` · `RateLimit(MARKETPLACE_READ_RATE_LIMIT)`
- Query: `VoucherProductQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned in `meta.nextCursor` of the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20, example: 20, description: 'Page size. Values above 50 are rejected with 400.', }
    - `q?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Case-insensitive partial match on the product name or the issuer name.', example: 'Voucher A', }
- Response: `ApiEnvelopeCursorResponse(VoucherProductResponseDto, 'Published and buyable voucher products in the marketplace.')` · `Promise<CursorPaginatedResponse<VoucherProductResponseDto>>`
    - `data`: `VoucherProductResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/mobile/marketplace/vouchers/:id`
Get a marketplace voucher product
- Điều kiện: `Authenticated` · `RateLimit(MARKETPLACE_READ_RATE_LIMIT)`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(VoucherProductResponseDto, 'The marketplace voucher product.')` · `Promise<VoucherProductResponseDto>`
    - `id`: `string` — { type: 'string', example: '8', description: 'Product id (bigint serialized as a string).', }
    - `publicId`: `string` — { type: 'string', format: 'uuid', example: 'c3c9af31-6d09-4f61-b6e4-1b5debd37e83', description: 'Unguesable public identifier for marketplac
    - `issuerId`: `string` — { type: 'string', example: '1', description: 'Issuer id.' }
    - `packageId`: `string | null` — { nullable: true, type: 'string', example: '12', description: 'Package id when this product was created by a merchant package.', }
    - `issuerName`: `string | null` — { type: String, nullable: true, example: 'TrustWow Official', description: 'Issuer display name. Null when the issuer row is missing.', }
    - `name`: `string` — { example: 'Voucher A 50k', description: 'Product name.' }
    - `title`: `string | null` — { type: String, nullable: true, example: 'Voucher A 50k', }
    - `subtitle`: `string | null` — { type: String, nullable: true, example: 'Save more today', }
    - `description`: `string | null` — { type: String, nullable: true, example: 'Valid on eligible orders.', }
    - `categoryId`: `string | null` — { nullable: true, type: 'string', example: '3' }
    - `categoryName`: `string | null` — { type: String, nullable: true, example: 'Ăn uống' }
    - `thumbnailUrl`: `string | null` — { type: String, nullable: true }
    - `bannerUrl`: `string | null` — { type: String, nullable: true }
    - `voucherType`: `VoucherProductType` — { enum: ['DISCOUNT_AMOUNT', 'DISCOUNT_PERCENT'] }
    - `discount`: `VoucherProductDiscount` — { example: { amount: 50000 } }
    - `faceValue`: `number` — { example: 50000, description: 'Face value of the voucher, in whole VND — what it is worth.', }
    - `salePrice`: `number` — { example: 45000, description: 'Sale price, in whole VND. This, not faceValue, is what the buyer pays.', }
    - `currency`: `string` — { example: 'VND', description: 'ISO-4217 currency code.' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points (0-5000 = 0-50%) of the sale price the seller pays the buyer's referre
    - `affiliateAmountVnd`: `string` — { type: 'string', example: '2500', description: "Estimated affiliate payout in whole VND for the buyer's referrer, " + 'computed as HALF_UP(
    - `isTransferable`: `boolean` — { example: true, description: 'Whether a bought voucher can be staked into a commitment.', }
    - `maxSupply`: `number | null` — { type: Number, nullable: true, example: 100, description: 'Maximum total issuance. null = unlimited supply.', }
    - `issuedCount`: `number` — { example: 10, description: 'Voucher instances already minted for this product.', }
    - `remainingSupply`: `number | null` — { type: Number, nullable: true, example: 90, description: 'maxSupply - issuedCount. null = unlimited. 0 means the next purchase fails with 4
    - `validFrom`: `string | null` — { type: String, nullable: true, format: 'date-time', example: '2026-06-20T00:00:00.000Z', description: 'Sale window opens. Null = on sale im
    - `validUntil`: `string | null` — { type: String, nullable: true, format: 'date-time', example: '2026-12-31T23:59:59.000Z', description: 'Sale window closes. Null = no end da
    - `purchaseStartsAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Marketplace purchase window opens. Null = on sale immediately.', }
    - `purchaseEndsAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Marketplace purchase window closes. Null = no end date.', }
    - `perUserLimit`: `number` — { example: 1 }
    - `status`: `string` — { enum: VOUCHER_PRODUCT_STATUS_VALUES, enumName: 'VoucherProductStatus', example: 'ACTIVE', description: 'DRAFT = not in the catalog. ACTIVE
    - `termsAndConditions`: `string | null` — { type: String, nullable: true }
    - `usageInstructions`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time', example: '2026-06-23T06:47:30.073Z' }
    - `updatedAt`: `string` — { format: 'date-time', example: '2026-07-10T07:32:46.175Z' }
- Lỗi/Status: `404: VOUCHER_PRODUCT_NOT_FOUND`

#### `POST /api/v1/mobile/marketplace/vouchers/:productId/purchase`
Buy a marketplace voucher with VNPay
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ ipPerMin: 30, userPerMin: 20 })`
- Path `productId`: `string`
- Body: `CreateVoucherVnpayOrderDto`
    - `idempotencyKey`: `string` — IsUUID, IsNotEmpty — { type: 'string', example: 'd0ef00ba-246a-42e8-aaa9-60b5adc56dd9', description: 'Client-generated UUID v4 for voucher checkout idempotency. 
    - `bankCode?`: `"VNPAYQR" | "VNBANK" | "INTCARD" | undefined` — IsOptional, IsIn — { description: 'Pre-select a payment method on VNPay.', enum: VNPAY_BANK_CODES, }
    - `locale?`: `"vn" | "en" | undefined` — IsOptional, IsIn — { description: 'Language of the VNPay checkout page.', enum: ['vn', 'en'], default: 'vn', }
- Ip: `string`
- Response: `ApiEnvelopeResponse(VoucherVnpayOrderResDto, 'The pending payment order and signed VNPay checkout URL.')` · `Promise<VoucherVnpayOrderResDto>`
    - `orderId`: `string` — { type: 'string', example: '42' }
    - `txnRef`: `string` — { example: 'TW260712103000A1B2C3D4' }
    - `productId`: `string` — { type: 'string', example: '8' }
    - `amountVnd`: `number` — { example: 50_000, description: 'Amount charged, in VND — the product sale price (server-set).', }
    - `paymentUrl`: `string | null` — { type: String, nullable: true, description: 'Signed VNPay checkout URL. Null only for an idempotency replay whose order is no longer payabl
    - `expiresAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `400: VOUCHER_VNPAY_AMOUNT_NOT_SUPPORTED` | `409: VOUCHER_SOLD_OUT | VOUCHER_PRODUCT_INACTIVE | VOUCHER_PRODUCT_PER_USER_LIMIT_EXCEEDED | VOUCHER_PURCHASE_BUSY | PAYMENT_TOO_MANY_PENDING_ORDERS | PAYMENT_TOO_MANY_RESERVATIONS | FINANCE_AFFILIATE_SHARE_UNSUPPORTED` | `503: PAYMENT_GATEWAY_UNAVAILABLE`

#### `GET /api/v1/mobile/marketplace/search`
Search marketplace vouchers and commitments
- Điều kiện: `Authenticated` · `RateLimit(MARKETPLACE_SEARCH_RATE_LIMIT)`
- Query: `MarketplaceSearchQueryDto`
    - `q?`: `string | undefined` — IsString, MinLength, MaxLength, IsOptional — { minLength: 2, maxLength: 100, example: 'ca phe' }
    - `types?`: `MarketplaceSearchItemType[] | undefined` — IsArray, ArrayMaxSize, IsEnum, IsOptional — { enum: MarketplaceSearchItemType, isArray: true }
    - `voucherCategoryIds?`: `string[] | undefined` — IsArray, ArrayMaxSize, IsBigIntId, IsOptional — { type: 'string', isArray: true }
    - `commitmentCategoryIds?`: `string[] | undefined` — IsArray, ArrayMaxSize, IsBigIntId, IsOptional — { type: 'string', isArray: true }
    - `issuerIds?`: `string[] | undefined` — IsArray, ArrayMaxSize, IsBigIntId, IsOptional — { type: 'string', isArray: true }
    - `creatorIds?`: `string[] | undefined` — IsArray, ArrayMaxSize, IsBigIntId, IsOptional — { type: 'string', isArray: true }
    - `voucherTypes?`: `VoucherProductType[] | undefined` — IsArray, ArrayMaxSize, IsEnum, IsOptional — { enum: VOUCHER_PRODUCT_TYPES, isArray: true }
    - `commitmentProductTypes?`: `CommitmentProductType[] | undefined` — IsArray, ArrayMaxSize, IsEnum, IsOptional — { enum: CommitmentProductType, isArray: true }
    - `minPrice?`: `string | undefined` — IsString, IsOptional — { type: 'string', example: '10000' }
    - `maxPrice?`: `string | undefined` — IsString, IsOptional — { type: 'string', example: '99000' }
    - `sort?`: `MarketplaceSearchSort | undefined` — IsEnum, IsOptional — { enum: MarketplaceSearchSort }
    - `cursor?`: `string | undefined` — IsString, MaxLength, IsOptional — { maxLength: 2048 }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `Promise<CursorPaginatedResponse<MarketplaceSearchItemDto>>`
    - `data`: `MarketplaceSearchItemDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `400: MARKETPLACE_SEARCH_FILTER_TYPE_MISMATCH, MARKETPLACE_SEARCH_INVALID_CURSOR, MARKETPLACE_SEARCH_INVALID_PRICE, or VALIDATION_FAILED` | `401: UNAUTHORIZED` | `429: CALL_RATE_LIMITED` | `503: MARKETPLACE_SEARCH_TIMEOUT`

### WebCreatorCommitmentDashboardController  `/web/creator/commitment-dashboard`  — `src/modules/marketplace/controllers/web.creator-commitment-dashboard.controller.ts`

#### `GET /api/v1/web/creator/commitment-dashboard/summary`
Get Creator commitment dashboard summary
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Query: `CreatorDashboardEmptyQueryDto`
- Response: `ApiEnvelopeResponse(CreatorDashboardSummaryDto, 'Creator commitment dashboard catalog summary.')` · `Promise<CreatorDashboardSummaryDto>`
    - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
    - `totalTemplateCount`: `number` — { example: 4 }
    - `draftListingCount`: `number` — { example: 1 }
    - `publishedListingCount`: `number` — { example: 2 }
    - `unpublishedListingCount`: `number` — { example: 1 }
    - `dataAsOf`: `string` — { format: 'date-time' }
    - `generatedAt`: `string` — { format: 'date-time' }

#### `GET /api/v1/web/creator/commitment-dashboard/sales/overview`
Get Creator paid sales overview
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Query: `CreatorSalesDateRangeQueryDto`
    - `startDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-01', }
    - `endDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-23', }
- Response: `ApiEnvelopeResponse(CreatorSalesOverviewDto, 'Creator paid sales summary and time series.')` · `Promise<CreatorSalesOverviewDto>`
    - `report`: `CreatorDashboardReportContextDto` — { type: CreatorDashboardReportContextDto }
      - **CreatorDashboardReportContextDto**
        - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
        - `startDate`: `string` — { type: 'string', format: 'date', example: '2026-09-01' }
        - `endDate`: `string` — { type: 'string', format: 'date', example: '2026-09-23' }
        - `timezone`: `"Asia/Ho_Chi_Minh"` — { enum: ['Asia/Ho_Chi_Minh'] }
        - `startInclusiveUtc`: `string` — { format: 'date-time' }
        - `endExclusiveUtc`: `string` — { format: 'date-time' }
        - `dataAsOf`: `string` — { format: 'date-time' }
        - `generatedAt`: `string` — { format: 'date-time' }
    - `summary`: `CreatorSalesSummaryDto` — { type: CreatorSalesSummaryDto }
      - **CreatorSalesSummaryDto**
        - `grossRevenueVnd`: `string` — { type: 'string', example: '580000' }
        - `paidOrderCount`: `number` — { example: 5 }
        - `uniqueBuyerCount`: `number` — { example: 3 }
        - `averageOrderValueVnd`: `string | null` — { type: 'string', nullable: true, example: '116000' }
        - `paidButNotFulfilledOrderCount`: `number` — { example: 3 }
    - `granularity`: `"hour" | "day"` — { enum: ['hour', 'day'] }
    - `series`: `CreatorSalesBucketDto[]` — { type: CreatorSalesBucketDto, isArray: true }

#### `GET /api/v1/web/creator/commitment-dashboard/sales/top-products`
List Creator top commitment products
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Query: `CreatorTopProductsQueryDto`
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 5 }
    - `startDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-01', }
    - `endDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-23', }
- Response: `ApiEnvelopeResponse(CreatorTopProductsResponseDto, 'Creator top products for the selected period.')` · `Promise<CreatorTopProductsResponseDto>`
    - `report`: `CreatorDashboardReportContextDto` — { type: CreatorDashboardReportContextDto }
      - **CreatorDashboardReportContextDto**
        - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
        - `startDate`: `string` — { type: 'string', format: 'date', example: '2026-09-01' }
        - `endDate`: `string` — { type: 'string', format: 'date', example: '2026-09-23' }
        - `timezone`: `"Asia/Ho_Chi_Minh"` — { enum: ['Asia/Ho_Chi_Minh'] }
        - `startInclusiveUtc`: `string` — { format: 'date-time' }
        - `endExclusiveUtc`: `string` — { format: 'date-time' }
        - `dataAsOf`: `string` — { format: 'date-time' }
        - `generatedAt`: `string` — { format: 'date-time' }
    - `items`: `CreatorTopProductDto[]` — { type: CreatorTopProductDto, isArray: true }

#### `GET /api/v1/web/creator/commitment-dashboard/products/performance`
List Creator product performance
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Query: `CreatorProductPerformanceQueryDto`
    - `cursor?`: `string | undefined` — IsString, MaxLength, IsOptional — { maxLength: 4096 }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
    - `startDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-01', }
    - `endDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-23', }
- Response: `Promise<CreatorProductPerformancePage>`
    - `data`: `CreatorProductPerformanceItemDto[]`
    - `meta`: `CreatorProductPerformanceMetaDto`
      - **CreatorProductPerformanceMetaDto**
        - `nextCursor`: `string | null` — { type: String, nullable: true }
        - `hasMore`: `boolean` — { example: true }
        - `report`: `CreatorDashboardReportContextDto` — { type: CreatorDashboardReportContextDto }
          - **CreatorDashboardReportContextDto**
            - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
            - `startDate`: `string` — { type: 'string', format: 'date', example: '2026-09-01' }
            - `endDate`: `string` — { type: 'string', format: 'date', example: '2026-09-23' }
            - `timezone`: `"Asia/Ho_Chi_Minh"` — { enum: ['Asia/Ho_Chi_Minh'] }
            - `startInclusiveUtc`: `string` — { format: 'date-time' }
            - `endExclusiveUtc`: `string` — { format: 'date-time' }
            - `dataAsOf`: `string` — { format: 'date-time' }
            - `generatedAt`: `string` — { format: 'date-time' }
        - `paginationConsistency`: `"RANK_CHECKED"` — { enum: ['RANK_CHECKED'] }
        - `rankRevision`: `string` — { example: 'sha256:abc123' }

#### `GET /api/v1/web/creator/commitment-dashboard/products/performance/:listingId`
Get Creator product performance detail
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Path `listingId`: `string`
- Query: `CreatorSalesDateRangeQueryDto`
    - `startDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-01', }
    - `endDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-23', }
- Response: `ApiEnvelopeResponse(CreatorProductPerformanceDetailDto, 'Creator product performance detail.')` · `Promise<CreatorProductPerformanceDetailDto>`
    - `report`: `CreatorDashboardReportContextDto` — { type: CreatorDashboardReportContextDto }
      - **CreatorDashboardReportContextDto**
        - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
        - `startDate`: `string` — { type: 'string', format: 'date', example: '2026-09-01' }
        - `endDate`: `string` — { type: 'string', format: 'date', example: '2026-09-23' }
        - `timezone`: `"Asia/Ho_Chi_Minh"` — { enum: ['Asia/Ho_Chi_Minh'] }
        - `startInclusiveUtc`: `string` — { format: 'date-time' }
        - `endExclusiveUtc`: `string` — { format: 'date-time' }
        - `dataAsOf`: `string` — { format: 'date-time' }
        - `generatedAt`: `string` — { format: 'date-time' }
    - `product`: `CreatorProductPerformanceDetailProductDto` — { type: CreatorProductPerformanceDetailProductDto }
      - **CreatorProductPerformanceDetailProductDto**
        - `listingId`: `string` — { type: 'string', example: '102' }
        - `templateId`: `string` — { type: 'string', example: '501' }
        - `templateVersionId`: `string` — { type: 'string', example: '902' }
        - `versionNumber`: `number` — { example: 2 }
        - `title`: `string | null` — { type: String, nullable: true }
        - `thumbnailUrl`: `string | null` — { type: String, nullable: true }
        - `currentListingStatus`: `CommitmentListingStatus` — { enum: CommitmentListingStatus }
        - `paidQuantity`: `number` — { example: 2 }
        - `grossRevenueVnd`: `string` — { type: 'string', example: '300000' }
        - `uniqueBuyerCount`: `number` — { example: 2 }
    - `summary`: `CreatorSalesSummaryDto` — { type: CreatorSalesSummaryDto }
      - **CreatorSalesSummaryDto**
        - `grossRevenueVnd`: `string` — { type: 'string', example: '580000' }
        - `paidOrderCount`: `number` — { example: 5 }
        - `uniqueBuyerCount`: `number` — { example: 3 }
        - `averageOrderValueVnd`: `string | null` — { type: 'string', nullable: true, example: '116000' }
        - `paidButNotFulfilledOrderCount`: `number` — { example: 3 }
    - `granularity`: `"hour" | "day"` — { enum: ['hour', 'day'] }
    - `series`: `CreatorSalesBucketDto[]` — { type: CreatorSalesBucketDto, isArray: true }

#### `GET /api/v1/web/creator/commitment-dashboard/sales/orders`
List Creator paid sales orders
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Query: `CreatorSalesOrdersQueryDto`
    - `cursor?`: `string | undefined` — IsString, MaxLength, IsOptional — { maxLength: 4096 }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
    - `fulfillmentView?`: `CreatorSalesFulfillmentView | undefined` — IsEnum, IsOptional — { enum: CreatorSalesFulfillmentView, default: CreatorSalesFulfillmentView.All, }
    - `startDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-01', }
    - `endDate?`: `string | undefined` — IsString, Matches, IsOptional — { type: 'string', format: 'date', example: '2026-09-23', }
- Response: `Promise<CreatorSalesOrdersPage>`
    - `data`: `CreatorSalesOrderItemDto[]`
    - `meta`: `CreatorSalesOrdersMetaDto`
      - **CreatorSalesOrdersMetaDto**
        - `nextCursor`: `string | null` — { type: String, nullable: true }
        - `hasMore`: `boolean` — { example: true }
        - `report`: `CreatorDashboardReportContextDto` — { type: CreatorDashboardReportContextDto }
          - **CreatorDashboardReportContextDto**
            - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
            - `startDate`: `string` — { type: 'string', format: 'date', example: '2026-09-01' }
            - `endDate`: `string` — { type: 'string', format: 'date', example: '2026-09-23' }
            - `timezone`: `"Asia/Ho_Chi_Minh"` — { enum: ['Asia/Ho_Chi_Minh'] }
            - `startInclusiveUtc`: `string` — { format: 'date-time' }
            - `endExclusiveUtc`: `string` — { format: 'date-time' }
            - `dataAsOf`: `string` — { format: 'date-time' }
            - `generatedAt`: `string` — { format: 'date-time' }
        - `paginationConsistency`: `"LIVE_KEYSET"` — { enum: ['LIVE_KEYSET'] }

#### `GET /api/v1/web/creator/commitment-dashboard/sales/orders/:orderId`
Get Creator paid sales order detail
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Path `orderId`: `string`
- Response: `ApiEnvelopeResponse(CreatorSalesOrderDetailDto, 'Creator paid sales order detail.')` · `Promise<CreatorSalesOrderDetailDto>`
    - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
    - `dataAsOf`: `string` — { format: 'date-time' }
    - `generatedAt`: `string` — { format: 'date-time' }
    - `product`: `CreatorSalesOrderProductDto` — { type: CreatorSalesOrderProductDto }
      - **CreatorSalesOrderProductDto**
        - `listingId`: `string` — { type: 'string', example: '102' }
        - `templateId`: `string` — { type: 'string', example: '501' }
        - `templateVersionId`: `string` — { type: 'string', example: '902' }
        - `versionNumber`: `number` — { example: 2 }
        - `title`: `string` — { example: 'Run 5km' }
    - `payment`: `CreatorSalesOrderPaymentDto` — { type: CreatorSalesOrderPaymentDto }
      - **CreatorSalesOrderPaymentDto**
        - `orderId`: `string` — { type: 'string', example: '87' }
        - `checkoutUnitId`: `string | null` — { type: 'string', nullable: true, example: '981' }
        - `status`: `"SUCCESS"` — { enum: ['SUCCESS'] }
        - `amountVnd`: `string` — { type: 'string', example: '150000' }
        - `currency`: `"VND"` — { enum: ['VND'] }
        - `paidAt`: `string` — { format: 'date-time' }
    - `fulfillment`: `CreatorSalesOrderFulfillmentDto` — { type: CreatorSalesOrderFulfillmentDto }
      - **CreatorSalesOrderFulfillmentDto**
        - `status`: `PaymentFulfillmentStatus` — { enum: PaymentFulfillmentStatus }
        - `fulfilledAt`: `string | null` — { type: String, format: 'date-time', nullable: true }

#### `GET /api/v1/web/creator/commitment-dashboard/sales/orders/:orderId/units/:checkoutUnitId`
Get Creator cart sale unit detail
- Điều kiện: `RequireEkyc` · `RequireMembership`
- Path `orderId`: `string`
- Path `checkoutUnitId`: `string`
- Response: `ApiEnvelopeResponse(CreatorSalesOrderDetailDto, 'Creator cart sale detail.')` · `Promise<CreatorSalesOrderDetailDto>`
    - `creatorAccountId`: `string` — { type: 'string', example: '7001' }
    - `dataAsOf`: `string` — { format: 'date-time' }
    - `generatedAt`: `string` — { format: 'date-time' }
    - `product`: `CreatorSalesOrderProductDto` — { type: CreatorSalesOrderProductDto }
      - **CreatorSalesOrderProductDto**
        - `listingId`: `string` — { type: 'string', example: '102' }
        - `templateId`: `string` — { type: 'string', example: '501' }
        - `templateVersionId`: `string` — { type: 'string', example: '902' }
        - `versionNumber`: `number` — { example: 2 }
        - `title`: `string` — { example: 'Run 5km' }
    - `payment`: `CreatorSalesOrderPaymentDto` — { type: CreatorSalesOrderPaymentDto }
      - **CreatorSalesOrderPaymentDto**
        - `orderId`: `string` — { type: 'string', example: '87' }
        - `checkoutUnitId`: `string | null` — { type: 'string', nullable: true, example: '981' }
        - `status`: `"SUCCESS"` — { enum: ['SUCCESS'] }
        - `amountVnd`: `string` — { type: 'string', example: '150000' }
        - `currency`: `"VND"` — { enum: ['VND'] }
        - `paidAt`: `string` — { format: 'date-time' }
    - `fulfillment`: `CreatorSalesOrderFulfillmentDto` — { type: CreatorSalesOrderFulfillmentDto }
      - **CreatorSalesOrderFulfillmentDto**
        - `status`: `PaymentFulfillmentStatus` — { enum: PaymentFulfillmentStatus }
        - `fulfilledAt`: `string | null` — { type: String, format: 'date-time', nullable: true }

### WebCreatorCommitmentListingController  `/web/creator/commitment-listings`  — `src/modules/marketplace/controllers/web.creator-commitment-listing.controller.ts`

#### `GET /api/v1/web/creator/commitment-listings`
List my commitment listings
- Điều kiện: `RateLimit(CREATOR_MARKETPLACE_READ_RATE_LIMIT)`
- Query: `CreatorCommitmentListingQueryDto`
    - `status?`: `CommitmentListingStatus | undefined` — IsIn, IsOptional — { enum: COMMITMENT_LISTING_STATUSES }
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(CreatorCommitmentListingListItemDto, 'Creator-scoped commitment listings.')` · `Promise<CursorPaginatedResponse<CreatorCommitmentListingListItemDto>>`
    - `data`: `CreatorCommitmentListingListItemDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `POST /api/v1/web/creator/commitment-listings`
Create a draft commitment listing
- Điều kiện: `RequireEkyc` · `RequireMembership` · `HttpCode(HttpStatus.OK)` · `RateLimit(CREATOR_MARKETPLACE_WRITE_RATE_LIMIT)`
- Body: `CreateCommitmentListingDto`
    - `templateVersionId`: `string` — IsBigIntId — { type: 'string', example: '902' }
    - `templateId?`: `string | undefined` — IsBigIntId, IsOptional — { type: 'string', example: '321', deprecated: true, description: 'Deprecated TRUST-718 compatibility field; backend derives templateId from 
    - `priceAmount`: `string` — IsBigIntString — { type: 'string', example: '99000' }
    - `currency`: `string` — IsString — { example: 'VND' }
    - `saleLimit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 2147483647, example: 50, description: 'Total copies this listing may sell (50 means 50 in total, never "50 more"). Re
    - `availableFrom?`: `string | null | undefined` — IsISO8601, IsOptional — { type: String, format: 'date-time', nullable: true }
    - `availableUntil?`: `string | null | undefined` — IsISO8601, IsOptional — { type: String, format: 'date-time', nullable: true }
    - `sortOrder?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 2147483647, default: 0 }
    - `metadata?`: `Record<string, unknown> | null | undefined` — IsObject, IsOptional — { type: 'object', additionalProperties: true, nullable: true, }
    - `affiliateShareBps?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 5000, default: 0, example: 500, description: "Basis points of the gross sale price paid by the Creator to the buyer's
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentListingResponseDto, 'Created draft commitment listing.')` · `Promise<CreatorCommitmentListingResponseDto>`
    - `id`: `string` — { type: 'string', example: '1001' }
    - `templateId`: `string` — { type: 'string', example: '321' }
    - `templateVersionId`: `string` — { type: 'string', example: '902' }
    - `templateVersionStatus`: `CommitmentTemplateVersionStatus` — { enum: CommitmentTemplateVersionStatus }
    - `templateVersionRevision`: `number` — { example: 2 }
    - `creatorUserId`: `string` — { type: 'string', example: '88' }
    - `status`: `CommitmentListingStatus` — { enum: CommitmentListingStatus }
    - `priceAmount`: `string` — { type: 'string', example: '99000' }
    - `currency`: `string` — { example: 'VND' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points of the gross sale price paid by the Creator to the buyer's referrer. 5
    - `saleLimit`: `number | null` — { type: 'integer', nullable: true, example: 50, description: 'Total copies this listing may sell. Null only for legacy rows.', }
    - `soldQuantity`: `number` — { example: 0, description: 'Copies already sold (goods transaction committed).', }
    - `availableFrom`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `availableUntil`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `publishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishReason`: `CommitmentListingUnpublishReason | null` — { enum: CommitmentListingUnpublishReason, nullable: true, description: 'Set once the Listing is UNPUBLISHED: VERSION_REPLACED, MANUAL, SOLD_
    - `replacedByListingId`: `string | null` — { type: 'string', nullable: true }
    - `revision`: `number`
    - `publicationRevision`: `number`
    - `sortOrder`: `number`
    - `metadata`: `Record<string, unknown> | null` — { type: 'object', additionalProperties: true, nullable: true, }
    - `moderation`: `CreatorCommitmentListingModerationViewDto | null` — { type: CreatorCommitmentListingModerationViewDto, nullable: true, }
    - `createdAt`: `string | Date` — { format: 'date-time' }
    - `updatedAt`: `string | Date` — { format: 'date-time' }
    - `publicationOutcome?`: `CommitmentListingPublicationOutcome | null | undefined` — { enum: CommitmentListingPublicationOutcome, nullable: true, description: 'Present on publish responses only. PUBLISHED is the only value th

#### `GET /api/v1/web/creator/commitment-listings/:listingId`
Get one of my commitment listings
- Điều kiện: `RateLimit(CREATOR_MARKETPLACE_READ_RATE_LIMIT)`
- Path `listingId`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentListingDetailDto, 'Creator-scoped commitment listing detail.')` · `Promise<CreatorCommitmentListingDetailDto>`
    - `commitment`: `CreatorCommitmentListingDetailDefinitionDto` — { type: CreatorCommitmentListingDetailDefinitionDto, }
      - **CreatorCommitmentListingDetailDefinitionDto**
        - `description`: `string | null` — { type: String, nullable: true }
        - `templateId`: `string` — { type: 'string', example: '321' }
        - `templateVersionId`: `string` — { type: 'string', example: '902' }
        - `versionNumber`: `number` — { example: 1 }
        - `code`: `string` — { example: 'run-5km' }
        - `slug`: `string | null` — { type: String, example: 'run-5km-7-days', nullable: true, }
        - `title`: `string` — { example: 'Run 5km' }
        - `shortDescription`: `string | null` — { type: String, nullable: true }
        - `flowType`: `CommitmentFlowType | null` — { enum: CommitmentFlowType, nullable: true }
        - `productType`: `CommitmentProductType | null` — { enum: CommitmentProductType, nullable: true }
        - `maxUsages`: `number | null` — { type: Number, nullable: true, minimum: 1 }
        - `category`: `MarketplaceCategorySummaryDto | null` — { type: MarketplaceCategorySummaryDto, nullable: true, }
        - `allowRevivalCard`: `boolean` — { example: true }
        - `revivalCardLimit`: `number` — { example: 2 }
        - `revivalCardPrice`: `MarketplacePriceDto | null` — { type: MarketplacePriceDto, nullable: true }
    - `metadata`: `null` — { type: 'object', additionalProperties: true, nullable: true, }
    - `id`: `string` — { type: 'string', example: '1001' }
    - `status`: `CommitmentListingStatus` — { enum: CommitmentListingStatus }
    - `price`: `MarketplacePriceDto` — { type: MarketplacePriceDto }
      - **MarketplacePriceDto**
        - `amount`: `string` — { type: 'string', example: '99000' }
        - `currency`: `string` — { example: 'VND' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points of the gross sale price paid by the Creator to the buyer's referrer. 5
    - `visibility`: `CreatorCommitmentListingVisibilityDto` — { type: CreatorCommitmentListingVisibilityDto }
      - **CreatorCommitmentListingVisibilityDto**
        - `state`: `CreatorCommitmentListingVisibilityState` — { enum: CreatorCommitmentListingVisibilityState }
        - `isVisible`: `boolean`
        - `reason`: `CreatorCommitmentListingVisibilityReason | null` — { enum: CreatorCommitmentListingVisibilityReason, nullable: true, }
    - `capabilities`: `CreatorCommitmentListingCapabilitiesDto` — { type: CreatorCommitmentListingCapabilitiesDto }
      - **CreatorCommitmentListingCapabilitiesDto**
        - `canEdit`: `boolean`
        - `canPublish`: `boolean`
        - `canUnpublish`: `boolean`
        - `canDelete`: `boolean` — { description: 'True only while the Listing is a never-published DRAFT that can be physically deleted.', }
    - `saleLimit`: `number | null` — { type: 'integer', nullable: true, example: 50, description: 'Total copies this listing may sell. Null only for legacy rows.', }
    - `soldQuantity`: `number` — { example: 0, description: 'Copies already sold (goods transaction committed).', }
    - `availableFrom`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `availableUntil`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `publishedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `unpublishedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `unpublishReason`: `CommitmentListingUnpublishReason | null` — { enum: CommitmentListingUnpublishReason, nullable: true, description: 'Why this Listing left the Marketplace. VERSION_REPLACED when a newer
    - `replacedByListingId`: `string | null` — { type: 'string', nullable: true, description: 'Listing that replaced this one (VERSION_REPLACED only).', }
    - `isLatestActivatedVersion`: `boolean` — { description: 'This Version is the release head, even if its Listing was manually retired.', }
    - `isCurrentPublishedListing`: `boolean` — { description: 'This exact Listing is the PUBLISHED one.' }
    - `isSellableNow`: `boolean` — { description: 'This Listing satisfies public Marketplace eligibility right now.', }
    - `canCreateNextVersion`: `boolean` — { description: 'The family can prepare a next sequential Version (release head, active root, no draft, not an activated EXCLUSIVE family).',
    - `currentPublishedListingId`: `string | null` — { type: 'string', nullable: true }
    - `latestActivatedVersionId`: `string | null` — { type: 'string', nullable: true }
    - `revision`: `number`
    - `publicationRevision`: `number`
    - `sortOrder`: `number`
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
    - `moderation`: `CreatorCommitmentListingModerationViewDto | null` — { type: CreatorCommitmentListingModerationViewDto, nullable: true, }

#### `PATCH /api/v1/web/creator/commitment-listings/:listingId`
Update a commitment listing
- Điều kiện: `RequireEkyc` · `RequireMembership` · `HttpCode(HttpStatus.OK)` · `RateLimit(CREATOR_MARKETPLACE_WRITE_RATE_LIMIT)`
- Path `listingId`: `string`
- Body: `UpdateCommitmentListingDto`
    - `expectedListingRevision`: `number` — IsInt, Min — { minimum: 1 }
    - `priceAmount?`: `string | undefined` — IsBigIntString, IsOptional — { type: 'string', example: '99000' }
    - `currency?`: `string | undefined` — IsString, IsOptional — { example: 'VND' }
    - `saleLimit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 2147483647, example: 50, description: 'Total copies this listing may sell (50 means 50 in total, never "50 more"). On
    - `availableFrom?`: `string | null | undefined` — IsISO8601, IsOptional — { type: String, format: 'date-time', nullable: true }
    - `availableUntil?`: `string | null | undefined` — IsISO8601, IsOptional — { type: String, format: 'date-time', nullable: true }
    - `sortOrder?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 2147483647 }
    - `metadata?`: `Record<string, unknown> | null | undefined` — IsObject, IsOptional — { type: 'object', additionalProperties: true, nullable: true, }
    - `affiliateShareBps?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 5000, example: 500, description: "Basis points of the gross sale price paid by the Creator to the buyer's referrer. 5
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentListingResponseDto, 'Updated commitment listing.')` · `Promise<CreatorCommitmentListingResponseDto>`
    - `id`: `string` — { type: 'string', example: '1001' }
    - `templateId`: `string` — { type: 'string', example: '321' }
    - `templateVersionId`: `string` — { type: 'string', example: '902' }
    - `templateVersionStatus`: `CommitmentTemplateVersionStatus` — { enum: CommitmentTemplateVersionStatus }
    - `templateVersionRevision`: `number` — { example: 2 }
    - `creatorUserId`: `string` — { type: 'string', example: '88' }
    - `status`: `CommitmentListingStatus` — { enum: CommitmentListingStatus }
    - `priceAmount`: `string` — { type: 'string', example: '99000' }
    - `currency`: `string` — { example: 'VND' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points of the gross sale price paid by the Creator to the buyer's referrer. 5
    - `saleLimit`: `number | null` — { type: 'integer', nullable: true, example: 50, description: 'Total copies this listing may sell. Null only for legacy rows.', }
    - `soldQuantity`: `number` — { example: 0, description: 'Copies already sold (goods transaction committed).', }
    - `availableFrom`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `availableUntil`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `publishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishReason`: `CommitmentListingUnpublishReason | null` — { enum: CommitmentListingUnpublishReason, nullable: true, description: 'Set once the Listing is UNPUBLISHED: VERSION_REPLACED, MANUAL, SOLD_
    - `replacedByListingId`: `string | null` — { type: 'string', nullable: true }
    - `revision`: `number`
    - `publicationRevision`: `number`
    - `sortOrder`: `number`
    - `metadata`: `Record<string, unknown> | null` — { type: 'object', additionalProperties: true, nullable: true, }
    - `moderation`: `CreatorCommitmentListingModerationViewDto | null` — { type: CreatorCommitmentListingModerationViewDto, nullable: true, }
    - `createdAt`: `string | Date` — { format: 'date-time' }
    - `updatedAt`: `string | Date` — { format: 'date-time' }
    - `publicationOutcome?`: `CommitmentListingPublicationOutcome | null | undefined` — { enum: CommitmentListingPublicationOutcome, nullable: true, description: 'Present on publish responses only. PUBLISHED is the only value th

#### `POST /api/v1/web/creator/commitment-listings/:listingId/publish`
Submit a commitment listing for pre-publish moderation
- Điều kiện: `RequireEkyc` · `RequireMembership` · `HttpCode(HttpStatus.OK)` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.publish)`
- Path `listingId`: `string`
- Body: `PublishCommitmentListingDto`
    - `expectedVersionRevision`: `number` — IsInt, Min — { minimum: 1 }
    - `expectedListingRevision`: `number` — IsInt, Min — { minimum: 1 }
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentListingResponseDto, 'Publish submission result. HTTP 200 can return PUBLISHED, D)` · `Promise<CreatorCommitmentListingResponseDto>`
    - `id`: `string` — { type: 'string', example: '1001' }
    - `templateId`: `string` — { type: 'string', example: '321' }
    - `templateVersionId`: `string` — { type: 'string', example: '902' }
    - `templateVersionStatus`: `CommitmentTemplateVersionStatus` — { enum: CommitmentTemplateVersionStatus }
    - `templateVersionRevision`: `number` — { example: 2 }
    - `creatorUserId`: `string` — { type: 'string', example: '88' }
    - `status`: `CommitmentListingStatus` — { enum: CommitmentListingStatus }
    - `priceAmount`: `string` — { type: 'string', example: '99000' }
    - `currency`: `string` — { example: 'VND' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points of the gross sale price paid by the Creator to the buyer's referrer. 5
    - `saleLimit`: `number | null` — { type: 'integer', nullable: true, example: 50, description: 'Total copies this listing may sell. Null only for legacy rows.', }
    - `soldQuantity`: `number` — { example: 0, description: 'Copies already sold (goods transaction committed).', }
    - `availableFrom`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `availableUntil`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `publishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishReason`: `CommitmentListingUnpublishReason | null` — { enum: CommitmentListingUnpublishReason, nullable: true, description: 'Set once the Listing is UNPUBLISHED: VERSION_REPLACED, MANUAL, SOLD_
    - `replacedByListingId`: `string | null` — { type: 'string', nullable: true }
    - `revision`: `number`
    - `publicationRevision`: `number`
    - `sortOrder`: `number`
    - `metadata`: `Record<string, unknown> | null` — { type: 'object', additionalProperties: true, nullable: true, }
    - `moderation`: `CreatorCommitmentListingModerationViewDto | null` — { type: CreatorCommitmentListingModerationViewDto, nullable: true, }
    - `createdAt`: `string | Date` — { format: 'date-time' }
    - `updatedAt`: `string | Date` — { format: 'date-time' }
    - `publicationOutcome?`: `CommitmentListingPublicationOutcome | null | undefined` — { enum: CommitmentListingPublicationOutcome, nullable: true, description: 'Present on publish responses only. PUBLISHED is the only value th

#### `POST /api/v1/web/creator/commitment-listings/:listingId/unpublish`
Permanently retire a published Commitment SKU
- Điều kiện: `RequireEkyc` · `RequireMembership` · `HttpCode(HttpStatus.OK)` · `RateLimit(CREATOR_MARKETPLACE_WRITE_RATE_LIMIT)`
- Path `listingId`: `string`
- Body: `MutateCommitmentListingStateDto`
    - `expectedListingRevision`: `number` — IsInt, Min — { minimum: 1 }
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentListingResponseDto, 'Permanently retired commitment listing.')` · `Promise<CreatorCommitmentListingResponseDto>`
    - `id`: `string` — { type: 'string', example: '1001' }
    - `templateId`: `string` — { type: 'string', example: '321' }
    - `templateVersionId`: `string` — { type: 'string', example: '902' }
    - `templateVersionStatus`: `CommitmentTemplateVersionStatus` — { enum: CommitmentTemplateVersionStatus }
    - `templateVersionRevision`: `number` — { example: 2 }
    - `creatorUserId`: `string` — { type: 'string', example: '88' }
    - `status`: `CommitmentListingStatus` — { enum: CommitmentListingStatus }
    - `priceAmount`: `string` — { type: 'string', example: '99000' }
    - `currency`: `string` — { example: 'VND' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points of the gross sale price paid by the Creator to the buyer's referrer. 5
    - `saleLimit`: `number | null` — { type: 'integer', nullable: true, example: 50, description: 'Total copies this listing may sell. Null only for legacy rows.', }
    - `soldQuantity`: `number` — { example: 0, description: 'Copies already sold (goods transaction committed).', }
    - `availableFrom`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `availableUntil`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `publishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishedAt`: `string | Date | null` — { format: 'date-time', nullable: true }
    - `unpublishReason`: `CommitmentListingUnpublishReason | null` — { enum: CommitmentListingUnpublishReason, nullable: true, description: 'Set once the Listing is UNPUBLISHED: VERSION_REPLACED, MANUAL, SOLD_
    - `replacedByListingId`: `string | null` — { type: 'string', nullable: true }
    - `revision`: `number`
    - `publicationRevision`: `number`
    - `sortOrder`: `number`
    - `metadata`: `Record<string, unknown> | null` — { type: 'object', additionalProperties: true, nullable: true, }
    - `moderation`: `CreatorCommitmentListingModerationViewDto | null` — { type: CreatorCommitmentListingModerationViewDto, nullable: true, }
    - `createdAt`: `string | Date` — { format: 'date-time' }
    - `updatedAt`: `string | Date` — { format: 'date-time' }
    - `publicationOutcome?`: `CommitmentListingPublicationOutcome | null | undefined` — { enum: CommitmentListingPublicationOutcome, nullable: true, description: 'Present on publish responses only. PUBLISHED is the only value th

#### `DELETE /api/v1/web/creator/commitment-listings/:listingId`
Delete a draft commitment listing
- Điều kiện: `RequireEkyc` · `RequireMembership` · `HttpCode(HttpStatus.OK)` · `RateLimit(CREATOR_MARKETPLACE_WRITE_RATE_LIMIT)`
- Path `listingId`: `string`
- Body: `DeleteCommitmentListingDto`
    - `expectedListingRevision`: `number` — IsInt, Min — { minimum: 1, example: 4, description: 'Optimistic Listing revision the Creator last read. A mismatch is rejected with COMMITMENT_LISTING_RE
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(DeletedCommitmentListingResponseDto, 'Deleted draft commitment listing.')` · `Promise<DeletedCommitmentListingResponseDto>`
    - `id`: `string` — { type: 'string', example: '2001' }
    - `deleted`: `boolean` — { example: true, description: 'Always true on a successful delete.', }

### WebMarketplaceController  `/web/marketplace`  — `src/modules/marketplace/controllers/web.marketplace.controller.ts`

#### `GET /api/v1/web/marketplace/commitments`
List marketplace commitment listings
- Điều kiện: `Public` · `RateLimit(MARKETPLACE_PUBLIC_READ_RATE_LIMIT)`
- Query: `CommitmentMarketplaceQueryDto`
    - `categoryId?`: `string | undefined` — IsBigIntId, IsOptional — { type: 'string', description: 'Filter by commitment template category ID.', example: '12', }
    - `creatorId?`: `string | undefined` — IsBigIntId, IsOptional — { type: 'string', description: 'Filter by Creator account user ID.', example: '88', }
    - `productType?`: `CommitmentProductType | undefined` — IsEnum, IsOptional — { enum: CommitmentProductType }
    - `minPrice?`: `string | undefined` — IsBigIntString, IsOptional — { type: 'string', example: '10000' }
    - `maxPrice?`: `string | undefined` — IsBigIntString, IsOptional — { type: 'string', example: '99000' }
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(CommitmentMarketplaceListItemDto, 'Published commitment listings available in the marketplace.)` · `Promise<CursorPaginatedResponse<CommitmentMarketplaceListItemDto>>`
    - `data`: `CommitmentMarketplaceListItemDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `400: COMMITMENT_LISTING_INVALID_CURSOR`

#### `GET /api/v1/web/marketplace/commitments/:listingId`
Get a marketplace commitment listing
- Điều kiện: `Public` · `RateLimit(MARKETPLACE_PUBLIC_READ_RATE_LIMIT)`
- Path `listingId`: `string`
- Response: `ApiEnvelopeResponse(CommitmentMarketplaceDetailDto, 'Published commitment listing detail.')` · `Promise<CommitmentMarketplaceDetailDto>`
    - `metadata`: `Record<string, unknown> | null` — { type: 'object', additionalProperties: true, nullable: true, }
    - `id`: `string` — { type: 'string', example: '1001' }
    - `kind`: `CommitmentListingKind` — IsEnum — { enum: CommitmentListingKind, example: 'COMMITMENT' }
    - `campaign?`: `CommitmentMarketplaceCampaignDto | undefined` — IsOptional — { type: CommitmentMarketplaceCampaignDto, nullable: true, description: 'Campaign-only sponsored reward disclosure; absent for ordinary Commi
    - `status`: `CommitmentListingStatus` — { enum: CommitmentListingStatus }
    - `price`: `MarketplacePriceDto` — { type: MarketplacePriceDto }
      - **MarketplacePriceDto**
        - `amount`: `string` — { type: 'string', example: '99000' }
        - `currency`: `string` — { example: 'VND' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points (0-5000 = 0-50%) of the price the Creator pays the buyer's referrer, i
    - `affiliateAmountVnd`: `string` — { type: 'string', example: '4950', description: "Estimated affiliate payout in whole VND for the buyer's referrer, " + 'computed as HALF_UP(
    - `publishedAt`: `string` — { format: 'date-time' }
    - `availableFrom`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `availableUntil`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `creator`: `MarketplaceCreatorSummaryDto` — { type: MarketplaceCreatorSummaryDto }
      - **MarketplaceCreatorSummaryDto**
        - `id`: `string` — { type: 'string', example: '88' }
        - `displayName`: `string` — { example: 'Creator Name' }
        - `avatarUrl`: `string | null` — { type: String, nullable: true }
    - `ratingSummary`: `CommitmentRatingSummaryDto` — { type: CommitmentRatingSummaryDto }
      - **CommitmentRatingSummaryDto**
        - `averageRating`: `number | null` — { type: Number, nullable: true, example: 4.35 }
        - `reviewCount`: `number` — { example: 127 }
        - `scope`: `"TEMPLATE_ALL_VERSIONS"` — { example: 'TEMPLATE_ALL_VERSIONS' }
    - `availability`: `CommitmentMarketplaceAvailabilityDto` — { type: () => CommitmentMarketplaceAvailabilityDto, description: 'Advisory stock facts. Checkout re-checks capacity under lock, so this may 
      - **CommitmentMarketplaceAvailabilityDto**
        - `saleLimit`: `number | null` — { type: 'integer', nullable: true, description: 'Total copies the creator offers; null for legacy unconfigured listings.', }
        - `remainingQuantity`: `number` — { type: 'integer', description: 'Copies still buyable now (sale limit minus sold and temporarily reserved copies). No buyer or order details
        - `soldOut`: `boolean` — { description: 'True when remainingQuantity is 0 (sold out or fully reserved right now).', }
    - `commitment`: `CommitmentMarketplaceDefinitionDto` — { type: CommitmentMarketplaceDefinitionDto }
      - **CommitmentMarketplaceDefinitionDto**
        - `templateId`: `string` — { type: 'string', example: '321' }
        - `templateVersionId`: `string` — { type: 'string', example: '902' }
        - `versionNumber`: `number` — { example: 1 }
        - `slug`: `string | null` — { type: String, example: 'run-5km-7-days', nullable: true, }
        - `code`: `string` — { example: 'run-5km' }
        - `title`: `string` — { example: 'Run 5km' }
        - `description`: `string | null` — { type: String, nullable: true }
        - `flowType`: `CommitmentFlowType` — { enum: CommitmentFlowType }
        - `productType`: `CommitmentProductType` — { enum: CommitmentProductType }
        - `maxUsages`: `number | null` — { type: Number, nullable: true, minimum: 1 }
        - `certificate`: `CommitmentCertificatePreviewDto` — { type: CommitmentCertificatePreviewDto }
          - **CommitmentCertificatePreviewDto**
            - `type`: `CertificateType.CommitmentV1 | CertificateType.CommitmentV2 | CertificateType.CommitmentV3` — { enum: [ CertificateType.CommitmentV1, CertificateType.CommitmentV2, CertificateType.CommitmentV3, ], }
            - `version`: `"V1" | "V2" | "V3"` — { enum: ['V1', 'V2', 'V3'] }
            - `name`: `"Mầm Tín" | "Kết Tín" | "Chứng Tín"` — { enum: ['Mầm Tín', 'Kết Tín', 'Chứng Tín'] }
            - `verificationLevel`: `"Basic" | "Confirmed" | "Verified"` — { enum: ['Basic', 'Confirmed', 'Verified'] }
            - `requirements`: `string[]` — { type: [String] }
            - `policyVersion`: `number` — { example: 1 }
            - `witnessRequired`: `boolean` — { example: false }
            - `requiredWitnessCount`: `number` — { example: 0 }
            - `independentReviewerEnabled`: `boolean` — { example: false }
        - `category`: `MarketplaceCategorySummaryDto | null` — { type: MarketplaceCategorySummaryDto, nullable: true, }
        - `allowRevivalCard`: `boolean` — { example: true }
        - `revivalCardLimit`: `number` — { example: 2 }
        - `revivalCardPrice`: `MarketplacePriceDto | null` — { type: MarketplacePriceDto, nullable: true }
- Lỗi/Status: `400: VALIDATION_FAILED` | `404: COMMITMENT_LISTING_NOT_FOUND`

#### `POST /api/v1/web/marketplace/commitments/:listingId/purchase`
Buy a marketplace commitment listing with VNPay
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ ipPerMin: 30, userPerMin: 20 })`
- Path `listingId`: `string`
- Body: `CreateCommitmentTemplateVnpayOrderDto`
    - `idempotencyKey`: `string` — IsUUID, IsNotEmpty — { type: 'string', example: 'd0ef00ba-246a-42e8-aaa9-60b5adc56dd9', description: 'Client-generated UUID v4 for checkout idempotency. Send a f
    - `bankCode?`: `"VNPAYQR" | "VNBANK" | "INTCARD" | undefined` — IsOptional, IsIn — { description: 'Pre-select a payment method on VNPay.', enum: VNPAY_BANK_CODES, }
    - `locale?`: `"vn" | "en" | undefined` — IsOptional, IsIn — { description: 'Language of the VNPay checkout page.', enum: ['vn', 'en'], default: 'vn', }
- Ip: `string`
- Response: `ApiEnvelopeResponse(CommitmentTemplateVnpayOrderResDto, 'The pending payment order and its signed VNPay checkout URL)` · `Promise<CommitmentTemplateVnpayOrderResDto>`
    - `orderId`: `string` — { type: 'string', example: '42' }
    - `txnRef`: `string` — { example: 'TW260712103000A1B2C3D4' }
    - `listingId`: `string` — { type: 'string', example: '15' }
    - `templateId`: `string` — { type: 'string', example: '902' }
    - `templateVersionId`: `string` — { type: 'string', example: '903' }
    - `amountVnd`: `number` — { example: 99_000, description: 'Amount charged, in VND — the listing price, server-set.', }
    - `paymentUrl`: `string | null` — { type: String, nullable: true, description: 'Signed VNPay checkout URL. Null only for an idempotency replay whose order is no longer payabl
    - `expiresAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `409: COMMITMENT_LISTING_RESERVED | COMMITMENT_LISTING_PURCHASE_BUSY | PAYMENT_TOO_MANY_PENDING_ORDERS | FINANCE_AFFILIATE_SHARE_UNSUPPORTED` | `503: PAYMENT_GATEWAY_UNAVAILABLE`

#### `GET /api/v1/web/marketplace/vouchers`
List marketplace vouchers
- Điều kiện: `Authenticated` · `RateLimit(MARKETPLACE_READ_RATE_LIMIT)`
- Query: `VoucherProductQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned in `meta.nextCursor` of the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20, example: 20, description: 'Page size. Values above 50 are rejected with 400.', }
    - `q?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Case-insensitive partial match on the product name or the issuer name.', example: 'Voucher A', }
- Response: `ApiEnvelopeCursorResponse(VoucherProductResponseDto, 'Published and buyable voucher products in the marketplace.')` · `Promise<CursorPaginatedResponse<VoucherProductResponseDto>>`
    - `data`: `VoucherProductResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/marketplace/vouchers/:id`
Get a marketplace voucher product
- Điều kiện: `Authenticated` · `RateLimit(MARKETPLACE_READ_RATE_LIMIT)`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(VoucherProductResponseDto, 'The marketplace voucher product.')` · `Promise<VoucherProductResponseDto>`
    - `id`: `string` — { type: 'string', example: '8', description: 'Product id (bigint serialized as a string).', }
    - `publicId`: `string` — { type: 'string', format: 'uuid', example: 'c3c9af31-6d09-4f61-b6e4-1b5debd37e83', description: 'Unguesable public identifier for marketplac
    - `issuerId`: `string` — { type: 'string', example: '1', description: 'Issuer id.' }
    - `packageId`: `string | null` — { nullable: true, type: 'string', example: '12', description: 'Package id when this product was created by a merchant package.', }
    - `issuerName`: `string | null` — { type: String, nullable: true, example: 'TrustWow Official', description: 'Issuer display name. Null when the issuer row is missing.', }
    - `name`: `string` — { example: 'Voucher A 50k', description: 'Product name.' }
    - `title`: `string | null` — { type: String, nullable: true, example: 'Voucher A 50k', }
    - `subtitle`: `string | null` — { type: String, nullable: true, example: 'Save more today', }
    - `description`: `string | null` — { type: String, nullable: true, example: 'Valid on eligible orders.', }
    - `categoryId`: `string | null` — { nullable: true, type: 'string', example: '3' }
    - `categoryName`: `string | null` — { type: String, nullable: true, example: 'Ăn uống' }
    - `thumbnailUrl`: `string | null` — { type: String, nullable: true }
    - `bannerUrl`: `string | null` — { type: String, nullable: true }
    - `voucherType`: `VoucherProductType` — { enum: ['DISCOUNT_AMOUNT', 'DISCOUNT_PERCENT'] }
    - `discount`: `VoucherProductDiscount` — { example: { amount: 50000 } }
    - `faceValue`: `number` — { example: 50000, description: 'Face value of the voucher, in whole VND — what it is worth.', }
    - `salePrice`: `number` — { example: 45000, description: 'Sale price, in whole VND. This, not faceValue, is what the buyer pays.', }
    - `currency`: `string` — { example: 'VND', description: 'ISO-4217 currency code.' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points (0-5000 = 0-50%) of the sale price the seller pays the buyer's referre
    - `affiliateAmountVnd`: `string` — { type: 'string', example: '2500', description: "Estimated affiliate payout in whole VND for the buyer's referrer, " + 'computed as HALF_UP(
    - `isTransferable`: `boolean` — { example: true, description: 'Whether a bought voucher can be staked into a commitment.', }
    - `maxSupply`: `number | null` — { type: Number, nullable: true, example: 100, description: 'Maximum total issuance. null = unlimited supply.', }
    - `issuedCount`: `number` — { example: 10, description: 'Voucher instances already minted for this product.', }
    - `remainingSupply`: `number | null` — { type: Number, nullable: true, example: 90, description: 'maxSupply - issuedCount. null = unlimited. 0 means the next purchase fails with 4
    - `validFrom`: `string | null` — { type: String, nullable: true, format: 'date-time', example: '2026-06-20T00:00:00.000Z', description: 'Sale window opens. Null = on sale im
    - `validUntil`: `string | null` — { type: String, nullable: true, format: 'date-time', example: '2026-12-31T23:59:59.000Z', description: 'Sale window closes. Null = no end da
    - `purchaseStartsAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Marketplace purchase window opens. Null = on sale immediately.', }
    - `purchaseEndsAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Marketplace purchase window closes. Null = no end date.', }
    - `perUserLimit`: `number` — { example: 1 }
    - `status`: `string` — { enum: VOUCHER_PRODUCT_STATUS_VALUES, enumName: 'VoucherProductStatus', example: 'ACTIVE', description: 'DRAFT = not in the catalog. ACTIVE
    - `termsAndConditions`: `string | null` — { type: String, nullable: true }
    - `usageInstructions`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time', example: '2026-06-23T06:47:30.073Z' }
    - `updatedAt`: `string` — { format: 'date-time', example: '2026-07-10T07:32:46.175Z' }
- Lỗi/Status: `404: VOUCHER_PRODUCT_NOT_FOUND`

#### `POST /api/v1/web/marketplace/vouchers/:productId/purchase`
Buy a marketplace voucher with VNPay
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit({ ipPerMin: 30, userPerMin: 20 })`
- Path `productId`: `string`
- Body: `CreateVoucherVnpayOrderDto`
    - `idempotencyKey`: `string` — IsUUID, IsNotEmpty — { type: 'string', example: 'd0ef00ba-246a-42e8-aaa9-60b5adc56dd9', description: 'Client-generated UUID v4 for voucher checkout idempotency. 
    - `bankCode?`: `"VNPAYQR" | "VNBANK" | "INTCARD" | undefined` — IsOptional, IsIn — { description: 'Pre-select a payment method on VNPay.', enum: VNPAY_BANK_CODES, }
    - `locale?`: `"vn" | "en" | undefined` — IsOptional, IsIn — { description: 'Language of the VNPay checkout page.', enum: ['vn', 'en'], default: 'vn', }
- Ip: `string`
- Response: `ApiEnvelopeResponse(VoucherVnpayOrderResDto, 'The pending payment order and signed VNPay checkout URL.')` · `Promise<VoucherVnpayOrderResDto>`
    - `orderId`: `string` — { type: 'string', example: '42' }
    - `txnRef`: `string` — { example: 'TW260712103000A1B2C3D4' }
    - `productId`: `string` — { type: 'string', example: '8' }
    - `amountVnd`: `number` — { example: 50_000, description: 'Amount charged, in VND — the product sale price (server-set).', }
    - `paymentUrl`: `string | null` — { type: String, nullable: true, description: 'Signed VNPay checkout URL. Null only for an idempotency replay whose order is no longer payabl
    - `expiresAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `400: VOUCHER_VNPAY_AMOUNT_NOT_SUPPORTED` | `409: VOUCHER_SOLD_OUT | VOUCHER_PRODUCT_INACTIVE | VOUCHER_PRODUCT_PER_USER_LIMIT_EXCEEDED | VOUCHER_PURCHASE_BUSY | PAYMENT_TOO_MANY_PENDING_ORDERS | PAYMENT_TOO_MANY_RESERVATIONS | FINANCE_AFFILIATE_SHARE_UNSUPPORTED` | `503: PAYMENT_GATEWAY_UNAVAILABLE`

#### `GET /api/v1/web/marketplace/search`
Search marketplace vouchers and commitments
- Điều kiện: `Authenticated` · `RateLimit(MARKETPLACE_SEARCH_RATE_LIMIT)`
- Query: `MarketplaceSearchQueryDto`
    - `q?`: `string | undefined` — IsString, MinLength, MaxLength, IsOptional — { minLength: 2, maxLength: 100, example: 'ca phe' }
    - `types?`: `MarketplaceSearchItemType[] | undefined` — IsArray, ArrayMaxSize, IsEnum, IsOptional — { enum: MarketplaceSearchItemType, isArray: true }
    - `voucherCategoryIds?`: `string[] | undefined` — IsArray, ArrayMaxSize, IsBigIntId, IsOptional — { type: 'string', isArray: true }
    - `commitmentCategoryIds?`: `string[] | undefined` — IsArray, ArrayMaxSize, IsBigIntId, IsOptional — { type: 'string', isArray: true }
    - `issuerIds?`: `string[] | undefined` — IsArray, ArrayMaxSize, IsBigIntId, IsOptional — { type: 'string', isArray: true }
    - `creatorIds?`: `string[] | undefined` — IsArray, ArrayMaxSize, IsBigIntId, IsOptional — { type: 'string', isArray: true }
    - `voucherTypes?`: `VoucherProductType[] | undefined` — IsArray, ArrayMaxSize, IsEnum, IsOptional — { enum: VOUCHER_PRODUCT_TYPES, isArray: true }
    - `commitmentProductTypes?`: `CommitmentProductType[] | undefined` — IsArray, ArrayMaxSize, IsEnum, IsOptional — { enum: CommitmentProductType, isArray: true }
    - `minPrice?`: `string | undefined` — IsString, IsOptional — { type: 'string', example: '10000' }
    - `maxPrice?`: `string | undefined` — IsString, IsOptional — { type: 'string', example: '99000' }
    - `sort?`: `MarketplaceSearchSort | undefined` — IsEnum, IsOptional — { enum: MarketplaceSearchSort }
    - `cursor?`: `string | undefined` — IsString, MaxLength, IsOptional — { maxLength: 2048 }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `Promise<CursorPaginatedResponse<MarketplaceSearchItemDto>>`
    - `data`: `MarketplaceSearchItemDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `400: MARKETPLACE_SEARCH_FILTER_TYPE_MISMATCH, MARKETPLACE_SEARCH_INVALID_CURSOR, MARKETPLACE_SEARCH_INVALID_PRICE, or VALIDATION_FAILED` | `401: UNAUTHORIZED` | `429: CALL_RATE_LIMITED` | `503: MARKETPLACE_SEARCH_TIMEOUT`

### WebCreatorCommitmentProductReviewReplyController  `/web/creator/commitment-product-reviews`  — `src/modules/marketplace/reviews/controllers/web.creator-commitment-product-review-reply.controller.ts`

#### `POST /api/v1/web/creator/commitment-product-reviews/:reviewId/reply`
Create an official creator reply to a product review
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RateLimit(CREATOR_REVIEW_REPLY_WRITE_RATE_LIMIT)`
- Path `reviewId`: `string`
- Body: `CreateCommitmentProductReviewReplyDto`
    - `comment`: `string` — IsString, MaxLength — { maxLength: 1000 }
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CommitmentProductReviewReplyMutationResponseDto)` · `Promise<CommitmentProductReviewReplyMutationResponseDto>`
    - `replyId`: `string` — { example: '8101' }
    - `reviewId`: `string` — { example: '7001' }
    - `revision`: `number` — { example: 1 }

#### `PATCH /api/v1/web/creator/commitment-product-reviews/:reviewId/reply`
Update an official creator reply to a product review
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RateLimit(CREATOR_REVIEW_REPLY_WRITE_RATE_LIMIT)`
- Path `reviewId`: `string`
- Body: `UpdateCommitmentProductReviewReplyDto`
    - `expectedRevision`: `number` — IsInt, Min — { minimum: 1, example: 1 }
    - `comment`: `string` — IsString, MaxLength — { maxLength: 1000 }
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CommitmentProductReviewReplyMutationResponseDto)` · `Promise<CommitmentProductReviewReplyMutationResponseDto>`
    - `replyId`: `string` — { example: '8101' }
    - `reviewId`: `string` — { example: '7001' }
    - `revision`: `number` — { example: 1 }

## Module `commitment`

### MobileCommitmentIndependentReviewerController  `/mobile/commitments`  — `src/modules/commitment/controllers/mobile.commitment-independent-reviewer.controller.ts`

#### `GET /api/v1/mobile/commitments/:commitmentId/witness-candidates`
List safe witness and independent reviewer candidates
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Query: `IndependentReviewerCandidateQueryDto`
    - `keyword?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Safe public profile keyword filter.', maxLength: 80, }
    - `mode?`: `"VIEWER" | "NORMAL_REVIEWER" | "INDEPENDENT_REVIEWER" | undefined` — IsOptional, IsIn — { enum: INDEPENDENT_REVIEWER_CANDIDATE_MODES, description: 'Invite mode filter. Independent reviewers require their own mode.', }
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(IndependentReviewerCandidateResponseDto)` · `Promise<CursorPaginatedResponse<IndependentReviewerCandidateResponseDto>>`
    - `data`: `IndependentReviewerCandidateResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `POST /api/v1/mobile/commitments/:commitmentId/independent-reviewers`
Invite an independent reviewer to a commitment
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Body: `CreateIndependentReviewerInvitationReqDto`
    - `reviewerUserId`: `string` — IsString, Matches — { type: 'string', example: '3001' }
    - `voucherId`: `string` — IsString, Matches — { type: 'string', example: '9001' }
- Header `idempotency-key` (optional): `string`
- Response: `ApiEnvelopeResponse(IndependentReviewerAssignmentResponseDto)` · `Promise<IndependentReviewerAssignmentResponseDto>`
    - `assignmentId`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reviewerUserId`: `string` — { type: 'string' }
    - `status`: `CommitmentIndependentReviewerAssignmentStatus` — { enum: CommitmentIndependentReviewerAssignmentStatus }
    - `pendingStage`: `"PRINCIPAL_APPROVAL" | "REVIEWER_ACCEPTANCE" | "ACTIVE" | null` — { enum: ['PRINCIPAL_APPROVAL', 'REVIEWER_ACCEPTANCE', 'ACTIVE'], nullable: true, }
    - `principalApprovalExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewerAcceptanceExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewDueAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reward`: `IndependentReviewerAssignmentRewardDto | null` — { type: IndependentReviewerAssignmentRewardDto, nullable: true, }

#### `POST /api/v1/mobile/commitments/:commitmentId/independent-reviewers/:assignmentId/approve`
Approve an independent reviewer invitation
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Path `assignmentId`: `string`
- Header `idempotency-key` (optional): `string`
- Response: `ApiEnvelopeResponse(IndependentReviewerAssignmentResponseDto)` · `Promise<IndependentReviewerAssignmentResponseDto>`
    - `assignmentId`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reviewerUserId`: `string` — { type: 'string' }
    - `status`: `CommitmentIndependentReviewerAssignmentStatus` — { enum: CommitmentIndependentReviewerAssignmentStatus }
    - `pendingStage`: `"PRINCIPAL_APPROVAL" | "REVIEWER_ACCEPTANCE" | "ACTIVE" | null` — { enum: ['PRINCIPAL_APPROVAL', 'REVIEWER_ACCEPTANCE', 'ACTIVE'], nullable: true, }
    - `principalApprovalExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewerAcceptanceExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewDueAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reward`: `IndependentReviewerAssignmentRewardDto | null` — { type: IndependentReviewerAssignmentRewardDto, nullable: true, }

#### `POST /api/v1/mobile/commitments/:commitmentId/independent-reviewers/:assignmentId/reject`
Reject an independent reviewer invitation
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Path `assignmentId`: `string`
- Body: `RejectIndependentReviewerAssignmentReqDto`
    - `reason?`: `string | null | undefined` — IsOptional, IsString, MaxLength — { type: 'string', nullable: true, maxLength: 1000, example: 'Không đồng ý Reviewer này.', }
- Header `idempotency-key` (optional): `string`
- Response: `ApiEnvelopeResponse(IndependentReviewerAssignmentResponseDto)` · `Promise<IndependentReviewerAssignmentResponseDto>`
    - `assignmentId`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reviewerUserId`: `string` — { type: 'string' }
    - `status`: `CommitmentIndependentReviewerAssignmentStatus` — { enum: CommitmentIndependentReviewerAssignmentStatus }
    - `pendingStage`: `"PRINCIPAL_APPROVAL" | "REVIEWER_ACCEPTANCE" | "ACTIVE" | null` — { enum: ['PRINCIPAL_APPROVAL', 'REVIEWER_ACCEPTANCE', 'ACTIVE'], nullable: true, }
    - `principalApprovalExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewerAcceptanceExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewDueAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reward`: `IndependentReviewerAssignmentRewardDto | null` — { type: IndependentReviewerAssignmentRewardDto, nullable: true, }

#### `POST /api/v1/mobile/commitments/:commitmentId/independent-reviewers/:assignmentId/cancel`
Cancel a pending independent reviewer invitation
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Path `assignmentId`: `string`
- Header `idempotency-key` (optional): `string`
- Response: `ApiEnvelopeResponse(IndependentReviewerAssignmentResponseDto)` · `Promise<IndependentReviewerAssignmentResponseDto>`
    - `assignmentId`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reviewerUserId`: `string` — { type: 'string' }
    - `status`: `CommitmentIndependentReviewerAssignmentStatus` — { enum: CommitmentIndependentReviewerAssignmentStatus }
    - `pendingStage`: `"PRINCIPAL_APPROVAL" | "REVIEWER_ACCEPTANCE" | "ACTIVE" | null` — { enum: ['PRINCIPAL_APPROVAL', 'REVIEWER_ACCEPTANCE', 'ACTIVE'], nullable: true, }
    - `principalApprovalExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewerAcceptanceExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewDueAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reward`: `IndependentReviewerAssignmentRewardDto | null` — { type: IndependentReviewerAssignmentRewardDto, nullable: true, }

#### `GET /api/v1/mobile/commitments/:commitmentId/independent-reviews`
List independent advisory reviews for a commitment
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(IndependentReviewResponseDto)` · `Promise<CursorPaginatedResponse<IndependentReviewResponseDto>>`
    - `data`: `IndependentReviewResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/mobile/commitments/:commitmentId/missions/:missionId/independent-reviews`
List independent advisory reviews for a mission
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Path `missionId`: `string`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(IndependentReviewResponseDto)` · `Promise<CursorPaginatedResponse<IndependentReviewResponseDto>>`
    - `data`: `IndependentReviewResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/mobile/commitments/:commitmentId/missions/:missionId/independent-reviews/:reviewId`
Get one independent advisory review for a mission
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Path `missionId`: `string`
- Path `reviewId`: `string`
- Response: `ApiEnvelopeResponse(IndependentReviewResponseDto)` · `Promise<IndependentReviewResponseDto>`
    - `reviewId`: `string` — { type: 'string' }
    - `assignmentId`: `string` — { type: 'string' }
    - `assignmentMissionId`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `missionId`: `string` — { type: 'string' }
    - `verdict`: `CommitmentIndependentReviewVerdict` — { enum: CommitmentIndependentReviewVerdict }
    - `reasonCode`: `string | null` — { type: 'string', nullable: true }
    - `status`: `CommitmentIndependentReviewStatus` — { enum: CommitmentIndependentReviewStatus }
    - `evidenceSetHash`: `string` — { type: 'string' }
    - `evidenceItemCount`: `number`
    - `createdAt`: `string` — { format: 'date-time' }

### MobileCommitmentReportController  `/mobile`  — `src/modules/commitment/controllers/mobile.commitment-report.controller.ts`

#### `POST /api/v1/mobile/commitments/:commitmentId/report`
Report a purchased runtime commitment
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit(REPORT_CREATE_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Body: `CreateCommitmentReportReqDto`
    - `reason`: `CommitmentReportReason` — IsEnum — { enum: CommitmentReportReason }
    - `description`: `string` — IsString, IsNotEmpty, MinLength, MaxLength — { minLength: COMMITMENT_REPORT_MIN_DESCRIPTION_LENGTH, maxLength: COMMITMENT_REPORT_MAX_DESCRIPTION_LENGTH, }
- Response: `ApiEnvelopeResponse(CommitmentReportUserResponseDto)` · `Promise<CommitmentReportUserResponseDto>`
    - `id`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reason`: `CommitmentReportReason` — { enum: CommitmentReportReason }
    - `description`: `string`
    - `status`: `CommitmentReportStatus` — { enum: CommitmentReportStatus }
    - `evidences`: `CommitmentReportEvidenceResponseDto[]` — { type: [CommitmentReportEvidenceResponseDto] }
    - `createdAt`: `string` — { format: 'date-time' }
    - `reviewedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }

#### `GET /api/v1/mobile/commitment-reports/my`
List my commitment reports
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated`
- Query: `CommitmentReportQueryDto`
    - `status?`: `CommitmentReportStatus | undefined` — IsOptional, IsEnum — { enum: CommitmentReportStatus }
    - `reason?`: `CommitmentReportReason | undefined` — IsOptional, IsEnum — { enum: CommitmentReportReason }
    - `from?`: `string | undefined` — IsOptional, IsISO8601 — { format: 'date-time' }
    - `to?`: `string | undefined` — IsOptional, IsISO8601 — { format: 'date-time' }
    - `page?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: DEFAULT_PAGE, default: DEFAULT_PAGE }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT, }
- Response: `Promise<PaginatedResponse<CommitmentReportUserResponseDto>>`
    - `data`: `CommitmentReportUserResponseDto[]`
    - `meta`: `{ total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; ha`

#### `GET /api/v1/mobile/commitment-reports/my/:reportId`
Get my commitment report detail
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated`
- Path `reportId`: `string`
- Response: `ApiEnvelopeResponse(CommitmentReportUserResponseDto)` · `Promise<CommitmentReportUserResponseDto>`
    - `id`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reason`: `CommitmentReportReason` — { enum: CommitmentReportReason }
    - `description`: `string`
    - `status`: `CommitmentReportStatus` — { enum: CommitmentReportStatus }
    - `evidences`: `CommitmentReportEvidenceResponseDto[]` — { type: [CommitmentReportEvidenceResponseDto] }
    - `createdAt`: `string` — { format: 'date-time' }
    - `reviewedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }

### MobileCommitmentController  `/mobile/commitments`  — `src/modules/commitment/controllers/mobile.commitment.controller.ts`

#### `GET /api/v1/mobile/commitments/escalations`
List pending commitment escalations for Client Mobile
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RequirePermissions(PERMISSION_KEYS.CommitmentEscalationsRead)`
- Query: `PaginationQueryDto`
    - `page?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: DEFAULT_PAGE, default: DEFAULT_PAGE }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT, }
- Response: `Promise<PaginatedResponse<CommitmentEscalationResponseDto>>`
    - `data`: `CommitmentEscalationResponseDto[]`
    - `meta`: `{ total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; ha`

#### `PATCH /api/v1/mobile/commitments/escalations/:escalationId/resolve`
Resolve or dismiss a commitment escalation for Client Mobile
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RequirePermissions(PERMISSION_KEYS.CommitmentEscalationsManage)` · `HttpCode(HttpStatus.OK)`
- Path `escalationId`: `string`
- Body: `ResolveEscalationReqDto`
    - `status`: `EscalationStatus.Resolved | EscalationStatus.Dismissed` — IsEnum — { enum: [EscalationStatus.Resolved, EscalationStatus.Dismissed], description: 'New status: resolved or dismissed', }
    - `adminNotes?`: `string | undefined` — IsString, IsOptional, MaxLength — { maxLength: 1000 }
- Response: `ApiEnvelopeResponse(CommitmentEscalationResponseDto, 'The escalation after review.')` · `Promise<CommitmentEscalationResponseDto>`
    - `id`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reason`: `EscalationReason` — { enum: EscalationReason }
    - `status`: `EscalationStatus` — { enum: EscalationStatus }
    - `resolvedByUserId`: `string | null` — { nullable: true, type: 'string' }
    - `resolvedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `adminNotes`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `404: RESOURCE_NOT_FOUND (resource: 'COMMITMENT_ESCALATION')`

### MobileCreatorCommitmentTemplateController  `/mobile/creator/commitment-templates`  — `src/modules/commitment/controllers/mobile.creator-commitment-template.controller.ts`

#### `GET /api/v1/mobile/creator/commitment-templates`
List my creator commitment templates
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.read)`
- Response: `Promise<RawCreatorCommitmentTemplateResult[]>`

#### `GET /api/v1/mobile/creator/commitment-templates/authoring-controls`
Get my creator commitment template authoring allowances
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.read)`
- Response: `ApiEnvelopeResponse(CreatorCommitmentTemplateAuthoringControlsResponseDto, 'Creator authoring allowances.')` · `Promise<CreatorCommitmentTemplateAuthoringControlsResponseDto>`
    - `draftQuota`: `CreatorCommitmentDraftQuotaDto` — { type: CreatorCommitmentDraftQuotaDto }
      - **CreatorCommitmentDraftQuotaDto**
        - `used`: `number` — { example: 7, description: 'Unpublished drafts that use a slot.', }
        - `limit`: `number` — { example: 10 }
        - `remaining`: `number` — { example: 3, description: 'max(0, limit - used). `used` may exceed `limit` for grandfathered drafts.', }
    - `createTemplateQuota`: `CreatorCommitmentCreateTemplateQuotaDto` — { type: CreatorCommitmentCreateTemplateQuotaDto }
      - **CreatorCommitmentCreateTemplateQuotaDto**
        - `used`: `number` — { example: 4, description: 'Templates created in the rolling window.', }
        - `limit`: `number` — { example: 20 }
        - `windowSeconds`: `number` — { example: 86400 }
        - `nextSlotAt`: `string | null` — { type: 'string', format: 'date-time', nullable: true, description: 'When the next creation slot frees up. Null while a slot is available.',

#### `POST /api/v1/mobile/creator/commitment-templates`
Create a creator commitment template draft
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.create)` · `HttpCode(HttpStatus.OK)`
- Body: `CreateCreatorCommitmentTemplateDto`
    - `title`: `string` — IsString, Length — { example: 'Run 5km for 7 days', maxLength: 255 }
    - `slug?`: `string | undefined` — IsString, MaxLength, IsOptional — { example: 'run-5km-7-days', maxLength: 160 }
    - `shortDescription?`: `string | null | undefined` — IsString, MaxLength, IsOptional — { type: String, maxLength: 500, nullable: true }
    - `description?`: `string | null | undefined` — IsString, IsOptional — { type: String, nullable: true }
    - `tags?`: `string[] | undefined` — IsArray, IsString, IsOptional — { type: [String], default: [] }
    - `allowRevivalCard?`: `boolean | undefined` — IsBoolean, IsOptional — { default: false }
    - `revivalCardLimit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 3, description: 'Per-commitment Revival Card usage limit. Required when allowRevivalCard=true.', }
    - `revivalPurchaseWindowSeconds?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 900, maximum: 900, example: 900, description: 'Fixed 15-minute Revival Card purchase window. Omit this field or send 900.', }
    - `revivalCardPriceAmount?`: `string | null | undefined` — Validate — { type: 'string', nullable: true, example: '20000', maximum: MAX_REVIVAL_CARD_PRICE_VND, description: 'Price per approved Revival Card usage
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentTemplateResponseDto, 'Created creator commitment template draft.')` · `Promise<RawCreatorCommitmentTemplateResult>`

#### `GET /api/v1/mobile/creator/commitment-templates/:templateId`
Get one of my creator commitment templates
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.read)`
- Path `templateId`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentTemplateDetailResponseDto, 'Creator commitment template detail with the complete Versio)` · `Promise<CreatorCommitmentTemplateDetailResponseDto>`
    - `root`: `CreatorCommitmentTemplateRootResponseDto` — { type: CreatorCommitmentTemplateRootResponseDto }
      - **CreatorCommitmentTemplateRootResponseDto**
        - `id`: `string` — { type: 'string', example: '321' }
        - `code`: `string` — { example: 'creator-88-abc123' }
        - `slug`: `string` — { example: 'run-5km' }
        - `createdBy`: `CreatorCommitmentTemplateCreatedByDto` — { type: CreatorCommitmentTemplateCreatedByDto }
          - **CreatorCommitmentTemplateCreatedByDto**
            - `id`: `string` — { type: 'string', example: '88' }
            - `username`: `string | null` — { type: String, nullable: true, example: 'runner_minh' }
            - `displayName`: `string | null` — { type: String, nullable: true, example: 'Runner Minh' }
            - `avatarUrl`: `string | null` — { type: String, nullable: true, example: 'https://cdn.example/avatar.jpg', }
        - `createdAt`: `string` — { format: 'date-time' }
        - `updatedAt`: `string` — { format: 'date-time' }
        - `controls`: `CreatorCommitmentTemplateControlsDto` — { type: CreatorCommitmentTemplateControlsDto }
          - **CreatorCommitmentTemplateControlsDto**
            - `draftExpiresAt`: `string | null` — { type: 'string', format: 'date-time', nullable: true, description: 'When the DRAFT Version is deleted automatically if it stays untouched (
            - `nextVersionAllowedAt`: `string | null` — { type: 'string', format: 'date-time', nullable: true, description: 'Earliest time the next Version may be created (latest activation + 24h)
            - `canCreateNextVersion`: `boolean` — { description: 'UX hint only: the family has a published release, no open DRAFT and the cooldown has passed.', }
    - `versions`: `CreatorCommitmentTemplateVersionResponseDto[]` — { type: [CreatorCommitmentTemplateVersionResponseDto] }

#### `PATCH /api/v1/mobile/creator/commitment-templates/:templateId/versions/:versionId`
Update a draft creator commitment template version
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.update)` · `HttpCode(HttpStatus.OK)`
- Path `templateId`: `string`
- Path `versionId`: `string`
- Body: `UpdateCreatorCommitmentTemplateVersionDto`
    - `expectedRevision`: `number` — IsInt, Min — { example: 1 }
    - `title?`: `string | undefined` — IsString, Length, IsOptional — { maxLength: 255 }
    - `shortDescription?`: `string | null | undefined` — IsString, MaxLength, IsOptional — { type: String, maxLength: 500, nullable: true }
    - `description?`: `string | null | undefined` — IsString, IsOptional — { type: String, nullable: true }
    - `tags?`: `string[] | undefined` — IsArray, ArrayMaxSize, IsString, IsOptional — { type: [String], default: [] }
    - `categoryId?`: `string | null | undefined` — IsOptional, IsBigIntId — { type: 'string', nullable: true, description: 'Active commitment category ID (bigint string). Omit to keep, null to clear.', }
    - `language?`: `string | undefined` — IsString, MaxLength, IsOptional — { maxLength: 10 }
    - `flowType?`: `CommitmentFlowType | null | undefined` — IsEnum, IsOptional — { enum: CommitmentFlowType, nullable: true }
    - `verificationMode?`: `CommitmentVerificationMode | null | undefined` — IsEnum, IsOptional — { enum: CommitmentVerificationMode, nullable: true, description: 'SYSTEM_PROOF_DETECTION is not supported yet: existing drafts keep it, but 
    - `productType?`: `CommitmentProductType | null | undefined` — IsEnum, IsOptional — { enum: CommitmentProductType, nullable: true }
    - `maxUsages?`: `number | null | undefined` — IsInt, Min, IsOptional — { type: Number, minimum: 1, nullable: true, description: 'Uses per purchased copy: 1 for SINGLE_USE, 2+ for LIMITED_USE. Must be null for UN
    - `maxParticipants?`: `number | null | undefined` — IsInt, Min, Max, IsOptional — { type: Number, minimum: 1, maximum: MAX_COMMITMENT_PARTICIPANTS, nullable: true, description: 'Roster ceiling of a participant aggregate co
    - `scheduleType?`: `CommitmentScheduleType | null | undefined` — IsEnum, IsOptional — { enum: CommitmentScheduleType, nullable: true }
    - `fixedStartAt?`: `string | null | undefined` — IsDateString, IsOptional — { type: String, format: 'date-time', nullable: true }
    - `inviteWindowSeconds?`: `number | null | undefined` — IsInt, Min, IsOptional — { type: Number, minimum: 1, nullable: true }
    - `scheduleDurationSeconds?`: `number | null | undefined` — IsInt, Min, IsOptional — { type: Number, minimum: 1, nullable: true }
    - `firstMissionStartOffsetSeconds?`: `number | null | undefined` — IsInt, Min, IsOptional — { type: Number, minimum: 0, nullable: true }
    - `replayEnabled?`: `boolean | undefined` — IsBoolean, IsOptional — { default: false }
    - `replayMax?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: 0 }
    - `allowRevivalCard?`: `boolean | undefined` — IsBoolean, IsOptional — { default: false }
    - `revivalCardLimit?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: 0 }
    - `revivalPurchaseWindowSeconds?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 900, maximum: 900, example: 900, description: 'Fixed 15-minute Revival Card purchase window. Omit this field or send 900.', }
    - `revivalCardPriceAmount?`: `string | null | undefined` — Validate — { type: 'string', example: '20000', maximum: MAX_REVIVAL_CARD_PRICE_VND, nullable: true, description: 'Price per approved Revival Card usage
    - `certificateWitnessRequired?`: `boolean | undefined` — IsBoolean, IsOptional — { default: false }
    - `certificateRequiredWitnessCount?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: 0, default: 0 }
    - `certificateIndependentReviewerEnabled?`: `boolean | undefined` — IsBoolean, IsOptional — { default: false }
    - `allowedWitnessPermissions?`: `CommitmentWitnessPermission[] | undefined` — IsArray, ArrayMaxSize, ArrayUnique, IsEnum, IsOptional — { enum: CommitmentWitnessPermission, isArray: true, description: 'Ordinary witness permissions buyers may invite. Omit to keep the current v
    - `maxViewerWitnesses?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 100 }
    - `maxReviewerWitnesses?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 100 }
    - `independentReviewerAllowed?`: `boolean | undefined` — IsBoolean, IsOptional — { description: 'Whether buyers may invite friends as Independent Reviewers.', }
    - `maxIndependentReviewers?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 10 }
    - `missions?`: `UpdateCreatorCommitmentTemplateMissionDto[] | undefined` — IsArray, ArrayMaxSize, IsOptional — { type: [UpdateCreatorCommitmentTemplateMissionDto] }
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentTemplateResponseDto, 'Updated creator commitment template draft.')` · `Promise<RawCreatorCommitmentTemplateResult>`

#### `GET /api/v1/mobile/creator/commitment-templates/:templateId/versions/:versionId/publish-readiness`
Inspect creator commitment template publish readiness
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.readiness)`
- Path `templateId`: `string`
- Path `versionId`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentTemplatePublishReadinessResponseDto, 'Creator commitment template publish readiness report.')` · `Promise<RawCreatorPublishReadinessResult>`

#### `DELETE /api/v1/mobile/creator/commitment-templates/:templateId/versions/:versionId`
Delete the latest draft creator commitment template version
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.delete)` · `HttpCode(HttpStatus.OK)`
- Path `templateId`: `string`
- Path `versionId`: `string`
- Body: `DeleteCreatorCommitmentTemplateVersionDto`
    - `expectedRevision`: `number` — IsInt, Min — { example: 3, description: 'Optimistic Version revision the Creator last read. A mismatch is rejected with COMMITMENT_TEMPLATE_REVISION_CONF
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(DeletedCreatorCommitmentTemplateVersionResponseDto, 'Deleted creator commitment template version.')` · `Promise<DeletedCreatorCommitmentTemplateVersionResponseDto>`
    - `id`: `string` — { type: 'string', example: '103' }
    - `deleted`: `boolean` — { example: true, description: 'Always true on a successful delete.', }
    - `rootDeleted`: `boolean` — { example: false, description: 'True when the Version was the only Version of a never-published Root and the Root was physically deleted in 

### WebCommitmentIndependentReviewerController  `/web/commitments`  — `src/modules/commitment/controllers/web.commitment-independent-reviewer.controller.ts`

#### `GET /api/v1/web/commitments/:commitmentId/witness-candidates`
List safe witness and independent reviewer candidates
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Query: `IndependentReviewerCandidateQueryDto`
    - `keyword?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Safe public profile keyword filter.', maxLength: 80, }
    - `mode?`: `"VIEWER" | "NORMAL_REVIEWER" | "INDEPENDENT_REVIEWER" | undefined` — IsOptional, IsIn — { enum: INDEPENDENT_REVIEWER_CANDIDATE_MODES, description: 'Invite mode filter. Independent reviewers require their own mode.', }
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(IndependentReviewerCandidateResponseDto)` · `Promise<CursorPaginatedResponse<IndependentReviewerCandidateResponseDto>>`
    - `data`: `IndependentReviewerCandidateResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `POST /api/v1/web/commitments/:commitmentId/independent-reviewers`
Invite an independent reviewer to a commitment
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Body: `CreateIndependentReviewerInvitationReqDto`
    - `reviewerUserId`: `string` — IsString, Matches — { type: 'string', example: '3001' }
    - `voucherId`: `string` — IsString, Matches — { type: 'string', example: '9001' }
- Header `idempotency-key` (optional): `string`
- Response: `ApiEnvelopeResponse(IndependentReviewerAssignmentResponseDto)` · `Promise<IndependentReviewerAssignmentResponseDto>`
    - `assignmentId`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reviewerUserId`: `string` — { type: 'string' }
    - `status`: `CommitmentIndependentReviewerAssignmentStatus` — { enum: CommitmentIndependentReviewerAssignmentStatus }
    - `pendingStage`: `"PRINCIPAL_APPROVAL" | "REVIEWER_ACCEPTANCE" | "ACTIVE" | null` — { enum: ['PRINCIPAL_APPROVAL', 'REVIEWER_ACCEPTANCE', 'ACTIVE'], nullable: true, }
    - `principalApprovalExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewerAcceptanceExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewDueAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reward`: `IndependentReviewerAssignmentRewardDto | null` — { type: IndependentReviewerAssignmentRewardDto, nullable: true, }

#### `POST /api/v1/web/commitments/:commitmentId/independent-reviewers/:assignmentId/approve`
Approve an independent reviewer invitation
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Path `assignmentId`: `string`
- Header `idempotency-key` (optional): `string`
- Response: `ApiEnvelopeResponse(IndependentReviewerAssignmentResponseDto)` · `Promise<IndependentReviewerAssignmentResponseDto>`
    - `assignmentId`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reviewerUserId`: `string` — { type: 'string' }
    - `status`: `CommitmentIndependentReviewerAssignmentStatus` — { enum: CommitmentIndependentReviewerAssignmentStatus }
    - `pendingStage`: `"PRINCIPAL_APPROVAL" | "REVIEWER_ACCEPTANCE" | "ACTIVE" | null` — { enum: ['PRINCIPAL_APPROVAL', 'REVIEWER_ACCEPTANCE', 'ACTIVE'], nullable: true, }
    - `principalApprovalExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewerAcceptanceExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewDueAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reward`: `IndependentReviewerAssignmentRewardDto | null` — { type: IndependentReviewerAssignmentRewardDto, nullable: true, }

#### `POST /api/v1/web/commitments/:commitmentId/independent-reviewers/:assignmentId/reject`
Reject an independent reviewer invitation
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Path `assignmentId`: `string`
- Body: `RejectIndependentReviewerAssignmentReqDto`
    - `reason?`: `string | null | undefined` — IsOptional, IsString, MaxLength — { type: 'string', nullable: true, maxLength: 1000, example: 'Không đồng ý Reviewer này.', }
- Header `idempotency-key` (optional): `string`
- Response: `ApiEnvelopeResponse(IndependentReviewerAssignmentResponseDto)` · `Promise<IndependentReviewerAssignmentResponseDto>`
    - `assignmentId`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reviewerUserId`: `string` — { type: 'string' }
    - `status`: `CommitmentIndependentReviewerAssignmentStatus` — { enum: CommitmentIndependentReviewerAssignmentStatus }
    - `pendingStage`: `"PRINCIPAL_APPROVAL" | "REVIEWER_ACCEPTANCE" | "ACTIVE" | null` — { enum: ['PRINCIPAL_APPROVAL', 'REVIEWER_ACCEPTANCE', 'ACTIVE'], nullable: true, }
    - `principalApprovalExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewerAcceptanceExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewDueAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reward`: `IndependentReviewerAssignmentRewardDto | null` — { type: IndependentReviewerAssignmentRewardDto, nullable: true, }

#### `POST /api/v1/web/commitments/:commitmentId/independent-reviewers/:assignmentId/cancel`
Cancel a pending independent reviewer invitation
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Path `assignmentId`: `string`
- Header `idempotency-key` (optional): `string`
- Response: `ApiEnvelopeResponse(IndependentReviewerAssignmentResponseDto)` · `Promise<IndependentReviewerAssignmentResponseDto>`
    - `assignmentId`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reviewerUserId`: `string` — { type: 'string' }
    - `status`: `CommitmentIndependentReviewerAssignmentStatus` — { enum: CommitmentIndependentReviewerAssignmentStatus }
    - `pendingStage`: `"PRINCIPAL_APPROVAL" | "REVIEWER_ACCEPTANCE" | "ACTIVE" | null` — { enum: ['PRINCIPAL_APPROVAL', 'REVIEWER_ACCEPTANCE', 'ACTIVE'], nullable: true, }
    - `principalApprovalExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewerAcceptanceExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reviewDueAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `reward`: `IndependentReviewerAssignmentRewardDto | null` — { type: IndependentReviewerAssignmentRewardDto, nullable: true, }

#### `GET /api/v1/web/commitments/:commitmentId/independent-reviews`
List independent advisory reviews for a commitment
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(IndependentReviewResponseDto)` · `Promise<CursorPaginatedResponse<IndependentReviewResponseDto>>`
    - `data`: `IndependentReviewResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/commitments/:commitmentId/missions/:missionId/independent-reviews`
List independent advisory reviews for a mission
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Path `missionId`: `string`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(IndependentReviewResponseDto)` · `Promise<CursorPaginatedResponse<IndependentReviewResponseDto>>`
    - `data`: `IndependentReviewResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/commitments/:commitmentId/missions/:missionId/independent-reviews/:reviewId`
Get one independent advisory review for a mission
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RateLimit(INDEPENDENT_REVIEWER_ASSIGNMENT_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Path `missionId`: `string`
- Path `reviewId`: `string`
- Response: `ApiEnvelopeResponse(IndependentReviewResponseDto)` · `Promise<IndependentReviewResponseDto>`
    - `reviewId`: `string` — { type: 'string' }
    - `assignmentId`: `string` — { type: 'string' }
    - `assignmentMissionId`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `missionId`: `string` — { type: 'string' }
    - `verdict`: `CommitmentIndependentReviewVerdict` — { enum: CommitmentIndependentReviewVerdict }
    - `reasonCode`: `string | null` — { type: 'string', nullable: true }
    - `status`: `CommitmentIndependentReviewStatus` — { enum: CommitmentIndependentReviewStatus }
    - `evidenceSetHash`: `string` — { type: 'string' }
    - `evidenceItemCount`: `number`
    - `createdAt`: `string` — { format: 'date-time' }

### WebCommitmentReportController  `/web`  — `src/modules/commitment/controllers/web.commitment-report.controller.ts`

#### `POST /api/v1/web/commitments/:commitmentId/report`
Report a purchased runtime commitment
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `HttpCode(HttpStatus.OK)` · `RateLimit(REPORT_CREATE_RATE_LIMIT)`
- Path `commitmentId`: `string`
- Body: `CreateCommitmentReportReqDto`
    - `reason`: `CommitmentReportReason` — IsEnum — { enum: CommitmentReportReason }
    - `description`: `string` — IsString, IsNotEmpty, MinLength, MaxLength — { minLength: COMMITMENT_REPORT_MIN_DESCRIPTION_LENGTH, maxLength: COMMITMENT_REPORT_MAX_DESCRIPTION_LENGTH, }
- Response: `ApiEnvelopeResponse(CommitmentReportUserResponseDto)` · `Promise<CommitmentReportUserResponseDto>`
    - `id`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reason`: `CommitmentReportReason` — { enum: CommitmentReportReason }
    - `description`: `string`
    - `status`: `CommitmentReportStatus` — { enum: CommitmentReportStatus }
    - `evidences`: `CommitmentReportEvidenceResponseDto[]` — { type: [CommitmentReportEvidenceResponseDto] }
    - `createdAt`: `string` — { format: 'date-time' }
    - `reviewedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }

#### `GET /api/v1/web/commitment-reports/my`
List my commitment reports
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated`
- Query: `CommitmentReportQueryDto`
    - `status?`: `CommitmentReportStatus | undefined` — IsOptional, IsEnum — { enum: CommitmentReportStatus }
    - `reason?`: `CommitmentReportReason | undefined` — IsOptional, IsEnum — { enum: CommitmentReportReason }
    - `from?`: `string | undefined` — IsOptional, IsISO8601 — { format: 'date-time' }
    - `to?`: `string | undefined` — IsOptional, IsISO8601 — { format: 'date-time' }
    - `page?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: DEFAULT_PAGE, default: DEFAULT_PAGE }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT, }
- Response: `Promise<PaginatedResponse<CommitmentReportUserResponseDto>>`
    - `data`: `CommitmentReportUserResponseDto[]`
    - `meta`: `{ total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; ha`

#### `GET /api/v1/web/commitment-reports/my/:reportId`
Get my commitment report detail
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated`
- Path `reportId`: `string`
- Response: `ApiEnvelopeResponse(CommitmentReportUserResponseDto)` · `Promise<CommitmentReportUserResponseDto>`
    - `id`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reason`: `CommitmentReportReason` — { enum: CommitmentReportReason }
    - `description`: `string`
    - `status`: `CommitmentReportStatus` — { enum: CommitmentReportStatus }
    - `evidences`: `CommitmentReportEvidenceResponseDto[]` — { type: [CommitmentReportEvidenceResponseDto] }
    - `createdAt`: `string` — { format: 'date-time' }
    - `reviewedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }

### WebCommitmentController  `/web/commitments`  — `src/modules/commitment/controllers/web.commitment.controller.ts`

#### `GET /api/v1/web/commitments/escalations`
[Admin] List pending commitment escalations (max_replays_exceeded cases)
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RequirePermissions(PERMISSION_KEYS.CommitmentEscalationsRead)`
- Query: `PaginationQueryDto`
    - `page?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: DEFAULT_PAGE, default: DEFAULT_PAGE }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT, }
- Response: `Promise<PaginatedResponse<CommitmentEscalationResponseDto>>`
    - `data`: `CommitmentEscalationResponseDto[]`
    - `meta`: `{ total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; ha`

#### `PATCH /api/v1/web/commitments/escalations/:escalationId/resolve`
[Admin] Resolve or dismiss an escalation
- Điều kiện: `RequireEkyc` · `RequireMembership` · `Authenticated` · `RequirePermissions(PERMISSION_KEYS.CommitmentEscalationsManage)` · `HttpCode(HttpStatus.OK)`
- Path `escalationId`: `string`
- Body: `ResolveEscalationReqDto`
    - `status`: `EscalationStatus.Resolved | EscalationStatus.Dismissed` — IsEnum — { enum: [EscalationStatus.Resolved, EscalationStatus.Dismissed], description: 'New status: resolved or dismissed', }
    - `adminNotes?`: `string | undefined` — IsString, IsOptional, MaxLength — { maxLength: 1000 }
- Response: `ApiEnvelopeResponse(CommitmentEscalationResponseDto, 'The escalation after review.')` · `Promise<CommitmentEscalationResponseDto>`
    - `id`: `string` — { type: 'string' }
    - `commitmentId`: `string` — { type: 'string' }
    - `reason`: `EscalationReason` — { enum: EscalationReason }
    - `status`: `EscalationStatus` — { enum: EscalationStatus }
    - `resolvedByUserId`: `string | null` — { nullable: true, type: 'string' }
    - `resolvedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `adminNotes`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `404: RESOURCE_NOT_FOUND (resource: 'COMMITMENT_ESCALATION')`

### WebCreatorCommitmentTemplateController  `/web/creator/commitment-templates`  — `src/modules/commitment/controllers/web.creator-commitment-template.controller.ts`

#### `GET /api/v1/web/creator/commitment-templates`
List my creator commitment templates
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.read)`
- Response: `Promise<RawCreatorCommitmentTemplateResult[]>`

#### `GET /api/v1/web/creator/commitment-templates/authoring-controls`
Get my creator commitment template authoring allowances
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.read)`
- Response: `ApiEnvelopeResponse(CreatorCommitmentTemplateAuthoringControlsResponseDto, 'Creator authoring allowances.')` · `Promise<CreatorCommitmentTemplateAuthoringControlsResponseDto>`
    - `draftQuota`: `CreatorCommitmentDraftQuotaDto` — { type: CreatorCommitmentDraftQuotaDto }
      - **CreatorCommitmentDraftQuotaDto**
        - `used`: `number` — { example: 7, description: 'Unpublished drafts that use a slot.', }
        - `limit`: `number` — { example: 10 }
        - `remaining`: `number` — { example: 3, description: 'max(0, limit - used). `used` may exceed `limit` for grandfathered drafts.', }
    - `createTemplateQuota`: `CreatorCommitmentCreateTemplateQuotaDto` — { type: CreatorCommitmentCreateTemplateQuotaDto }
      - **CreatorCommitmentCreateTemplateQuotaDto**
        - `used`: `number` — { example: 4, description: 'Templates created in the rolling window.', }
        - `limit`: `number` — { example: 20 }
        - `windowSeconds`: `number` — { example: 86400 }
        - `nextSlotAt`: `string | null` — { type: 'string', format: 'date-time', nullable: true, description: 'When the next creation slot frees up. Null while a slot is available.',

#### `POST /api/v1/web/creator/commitment-templates`
Create a creator commitment template draft
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.create)` · `HttpCode(HttpStatus.OK)`
- Body: `CreateCreatorCommitmentTemplateDto`
    - `title`: `string` — IsString, Length — { example: 'Run 5km for 7 days', maxLength: 255 }
    - `slug?`: `string | undefined` — IsString, MaxLength, IsOptional — { example: 'run-5km-7-days', maxLength: 160 }
    - `shortDescription?`: `string | null | undefined` — IsString, MaxLength, IsOptional — { type: String, maxLength: 500, nullable: true }
    - `description?`: `string | null | undefined` — IsString, IsOptional — { type: String, nullable: true }
    - `tags?`: `string[] | undefined` — IsArray, IsString, IsOptional — { type: [String], default: [] }
    - `allowRevivalCard?`: `boolean | undefined` — IsBoolean, IsOptional — { default: false }
    - `revivalCardLimit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 3, description: 'Per-commitment Revival Card usage limit. Required when allowRevivalCard=true.', }
    - `revivalPurchaseWindowSeconds?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 900, maximum: 900, example: 900, description: 'Fixed 15-minute Revival Card purchase window. Omit this field or send 900.', }
    - `revivalCardPriceAmount?`: `string | null | undefined` — Validate — { type: 'string', nullable: true, example: '20000', maximum: MAX_REVIVAL_CARD_PRICE_VND, description: 'Price per approved Revival Card usage
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentTemplateResponseDto, 'Created creator commitment template draft.')` · `Promise<RawCreatorCommitmentTemplateResult>`

#### `GET /api/v1/web/creator/commitment-templates/:templateId`
Get one of my creator commitment templates
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.read)`
- Path `templateId`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentTemplateDetailResponseDto, 'Creator commitment template detail with the complete Versio)` · `Promise<CreatorCommitmentTemplateDetailResponseDto>`
    - `root`: `CreatorCommitmentTemplateRootResponseDto` — { type: CreatorCommitmentTemplateRootResponseDto }
      - **CreatorCommitmentTemplateRootResponseDto**
        - `id`: `string` — { type: 'string', example: '321' }
        - `code`: `string` — { example: 'creator-88-abc123' }
        - `slug`: `string` — { example: 'run-5km' }
        - `createdBy`: `CreatorCommitmentTemplateCreatedByDto` — { type: CreatorCommitmentTemplateCreatedByDto }
          - **CreatorCommitmentTemplateCreatedByDto**
            - `id`: `string` — { type: 'string', example: '88' }
            - `username`: `string | null` — { type: String, nullable: true, example: 'runner_minh' }
            - `displayName`: `string | null` — { type: String, nullable: true, example: 'Runner Minh' }
            - `avatarUrl`: `string | null` — { type: String, nullable: true, example: 'https://cdn.example/avatar.jpg', }
        - `createdAt`: `string` — { format: 'date-time' }
        - `updatedAt`: `string` — { format: 'date-time' }
        - `controls`: `CreatorCommitmentTemplateControlsDto` — { type: CreatorCommitmentTemplateControlsDto }
          - **CreatorCommitmentTemplateControlsDto**
            - `draftExpiresAt`: `string | null` — { type: 'string', format: 'date-time', nullable: true, description: 'When the DRAFT Version is deleted automatically if it stays untouched (
            - `nextVersionAllowedAt`: `string | null` — { type: 'string', format: 'date-time', nullable: true, description: 'Earliest time the next Version may be created (latest activation + 24h)
            - `canCreateNextVersion`: `boolean` — { description: 'UX hint only: the family has a published release, no open DRAFT and the cooldown has passed.', }
    - `versions`: `CreatorCommitmentTemplateVersionResponseDto[]` — { type: [CreatorCommitmentTemplateVersionResponseDto] }

#### `PATCH /api/v1/web/creator/commitment-templates/:templateId/versions/:versionId`
Update a draft creator commitment template version
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.update)` · `HttpCode(HttpStatus.OK)`
- Path `templateId`: `string`
- Path `versionId`: `string`
- Body: `UpdateCreatorCommitmentTemplateVersionDto`
    - `expectedRevision`: `number` — IsInt, Min — { example: 1 }
    - `title?`: `string | undefined` — IsString, Length, IsOptional — { maxLength: 255 }
    - `shortDescription?`: `string | null | undefined` — IsString, MaxLength, IsOptional — { type: String, maxLength: 500, nullable: true }
    - `description?`: `string | null | undefined` — IsString, IsOptional — { type: String, nullable: true }
    - `tags?`: `string[] | undefined` — IsArray, ArrayMaxSize, IsString, IsOptional — { type: [String], default: [] }
    - `categoryId?`: `string | null | undefined` — IsOptional, IsBigIntId — { type: 'string', nullable: true, description: 'Active commitment category ID (bigint string). Omit to keep, null to clear.', }
    - `language?`: `string | undefined` — IsString, MaxLength, IsOptional — { maxLength: 10 }
    - `flowType?`: `CommitmentFlowType | null | undefined` — IsEnum, IsOptional — { enum: CommitmentFlowType, nullable: true }
    - `verificationMode?`: `CommitmentVerificationMode | null | undefined` — IsEnum, IsOptional — { enum: CommitmentVerificationMode, nullable: true, description: 'SYSTEM_PROOF_DETECTION is not supported yet: existing drafts keep it, but 
    - `productType?`: `CommitmentProductType | null | undefined` — IsEnum, IsOptional — { enum: CommitmentProductType, nullable: true }
    - `maxUsages?`: `number | null | undefined` — IsInt, Min, IsOptional — { type: Number, minimum: 1, nullable: true, description: 'Uses per purchased copy: 1 for SINGLE_USE, 2+ for LIMITED_USE. Must be null for UN
    - `maxParticipants?`: `number | null | undefined` — IsInt, Min, Max, IsOptional — { type: Number, minimum: 1, maximum: MAX_COMMITMENT_PARTICIPANTS, nullable: true, description: 'Roster ceiling of a participant aggregate co
    - `scheduleType?`: `CommitmentScheduleType | null | undefined` — IsEnum, IsOptional — { enum: CommitmentScheduleType, nullable: true }
    - `fixedStartAt?`: `string | null | undefined` — IsDateString, IsOptional — { type: String, format: 'date-time', nullable: true }
    - `inviteWindowSeconds?`: `number | null | undefined` — IsInt, Min, IsOptional — { type: Number, minimum: 1, nullable: true }
    - `scheduleDurationSeconds?`: `number | null | undefined` — IsInt, Min, IsOptional — { type: Number, minimum: 1, nullable: true }
    - `firstMissionStartOffsetSeconds?`: `number | null | undefined` — IsInt, Min, IsOptional — { type: Number, minimum: 0, nullable: true }
    - `replayEnabled?`: `boolean | undefined` — IsBoolean, IsOptional — { default: false }
    - `replayMax?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: 0 }
    - `allowRevivalCard?`: `boolean | undefined` — IsBoolean, IsOptional — { default: false }
    - `revivalCardLimit?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: 0 }
    - `revivalPurchaseWindowSeconds?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 900, maximum: 900, example: 900, description: 'Fixed 15-minute Revival Card purchase window. Omit this field or send 900.', }
    - `revivalCardPriceAmount?`: `string | null | undefined` — Validate — { type: 'string', example: '20000', maximum: MAX_REVIVAL_CARD_PRICE_VND, nullable: true, description: 'Price per approved Revival Card usage
    - `certificateWitnessRequired?`: `boolean | undefined` — IsBoolean, IsOptional — { default: false }
    - `certificateRequiredWitnessCount?`: `number | undefined` — IsInt, Min, IsOptional — { minimum: 0, default: 0 }
    - `certificateIndependentReviewerEnabled?`: `boolean | undefined` — IsBoolean, IsOptional — { default: false }
    - `allowedWitnessPermissions?`: `CommitmentWitnessPermission[] | undefined` — IsArray, ArrayMaxSize, ArrayUnique, IsEnum, IsOptional — { enum: CommitmentWitnessPermission, isArray: true, description: 'Ordinary witness permissions buyers may invite. Omit to keep the current v
    - `maxViewerWitnesses?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 100 }
    - `maxReviewerWitnesses?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 100 }
    - `independentReviewerAllowed?`: `boolean | undefined` — IsBoolean, IsOptional — { description: 'Whether buyers may invite friends as Independent Reviewers.', }
    - `maxIndependentReviewers?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 0, maximum: 10 }
    - `missions?`: `UpdateCreatorCommitmentTemplateMissionDto[] | undefined` — IsArray, ArrayMaxSize, IsOptional — { type: [UpdateCreatorCommitmentTemplateMissionDto] }
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentTemplateResponseDto, 'Updated creator commitment template draft.')` · `Promise<RawCreatorCommitmentTemplateResult>`

#### `POST /api/v1/web/creator/commitment-templates/:templateId/versions`
Create the next draft version for a creator commitment template
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.createNext)` · `HttpCode(HttpStatus.OK)`
- Path `templateId`: `string`
- Body: `CreateNextCreatorCommitmentTemplateVersionDto | undefined`
    - `baseVersionId?`: `string | undefined` — IsOptional, IsBigIntId — { type: 'string', example: '501', description: 'Activated Version in the same Product family whose definition is cloned. Defaults to the lat
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentTemplateResponseDto, 'Created next creator commitment template draft version.')` · `Promise<RawCreatorCommitmentTemplateResult>`

#### `GET /api/v1/web/creator/commitment-templates/:templateId/versions/:versionId/publish-readiness`
Inspect creator commitment template publish readiness
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.readiness)`
- Path `templateId`: `string`
- Path `versionId`: `string`
- Response: `ApiEnvelopeResponse(CreatorCommitmentTemplatePublishReadinessResponseDto, 'Creator commitment template publish readiness report.')` · `Promise<RawCreatorPublishReadinessResult>`

#### `DELETE /api/v1/web/creator/commitment-templates/:templateId/versions/:versionId`
Delete the latest draft creator commitment template version
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RateLimit(CREATOR_TEMPLATE_RATE_LIMITS.delete)` · `HttpCode(HttpStatus.OK)`
- Path `templateId`: `string`
- Path `versionId`: `string`
- Body: `DeleteCreatorCommitmentTemplateVersionDto`
    - `expectedRevision`: `number` — IsInt, Min — { example: 3, description: 'Optimistic Version revision the Creator last read. A mismatch is rejected with COMMITMENT_TEMPLATE_REVISION_CONF
- Header `idempotency-key`: `string`
- Response: `ApiEnvelopeResponse(DeletedCreatorCommitmentTemplateVersionResponseDto, 'Deleted creator commitment template version.')` · `Promise<DeletedCreatorCommitmentTemplateVersionResponseDto>`
    - `id`: `string` — { type: 'string', example: '103' }
    - `deleted`: `boolean` — { example: true, description: 'Always true on a successful delete.', }
    - `rootDeleted`: `boolean` — { example: false, description: 'True when the Version was the only Version of a never-published Root and the Root was physically deleted in 

## Module `payment`

### MobilePaymentController  `/mobile/payments`  — `src/modules/payment/controllers/mobile.payment.controller.ts`

#### `GET /api/v1/mobile/payments/orders`
List my VNPay orders (mobile)
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)`
- Query: `PaymentOrderQueryDto`
    - `status?`: `PaymentStatus | undefined` — IsOptional, IsEnum — { enum: PaymentStatus }
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(PaymentOrderResDto)` · `Promise<CursorPaginatedResponse<PaymentOrderResDto>>`
    - `data`: `PaymentOrderResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/mobile/payments/orders/:txnRef`
Get one of my VNPay orders by reference (mobile)
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)`
- Path `txnRef`: `string`
- Response: `ApiEnvelopeResponse(PaymentOrderResDto)` · `Promise<PaymentOrderResDto>`
    - `id`: `string` — { type: 'string' }
    - `txnRef`: `string` — { example: 'TW260712103000A1B2C3D4' }
    - `amountVnd`: `number` — { example: 100_000 }
    - `currency`: `string` — { example: 'VND' }
    - `purpose`: `PaymentPurpose` — { enum: PaymentPurpose, description: 'VOUCHER_PURCHASE grants a voucher; MEMBERSHIP_PURCHASE activates a membership after VNPay confirms.', 
    - `productId`: `string | null` — { nullable: true, type: 'string', description: 'Voucher product bought (VOUCHER_PURCHASE only).', }
    - `voucherId`: `string | null` — { nullable: true, type: 'string', description: 'Voucher granted to the buyer once the purchase succeeds (VOUCHER_PURCHASE). ' + 'Null while 
    - `provider`: `PaymentProvider` — { enum: PaymentProvider }
    - `status`: `PaymentStatus` — { enum: PaymentStatus }
    - `fulfillmentStatus`: `PaymentFulfillmentStatus` — { enum: PaymentFulfillmentStatus, description: 'Business delivery state. SUCCESS + PENDING/FAILED means money was captured and fulfillment i
    - `fulfillmentAttempts`: `number` — { description: 'How many fulfillment attempts have run.' }
    - `failCode`: `string | null` — { type: String, nullable: true, description: 'VNPay response code when the payment did not succeed.', example: '24', }
    - `confirmedSource`: `PaymentConfirmSource | null` — { enum: PaymentConfirmSource, nullable: true }
    - `transactionNo`: `string | null` — { type: String, nullable: true, description: 'VNPay transaction number.', }
    - `bankCode`: `string | null` — { type: String, nullable: true }
    - `paidAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `fulfilledAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `expiresAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }

### PublicVnpayController  `/public/payments/vnpay`  — `src/modules/payment/controllers/public.vnpay.controller.ts`

#### `GET /api/v1/public/payments/vnpay/ipn`
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 300 })` · `HttpCode(HttpStatus.OK)`
- Response: `Promise<void>`

#### `GET /api/v1/public/payments/vnpay/return`
- Điều kiện: `Public` · `CsrfExempt` · `RateLimit({ ipPerMin: 60 })`
- Response: `Promise<void>`

### WebAdminPaymentController  `/web/admin/payments`  — `src/modules/payment/controllers/web.admin.payment.controller.ts`

#### `GET /api/v1/web/admin/payments/reconciliation`
Money-integrity reconciliation report
- Điều kiện: `Authenticated` · `RequirePermissions(PERMISSION_KEYS.FinancePaymentsRead)` · `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(ReconciliationReportDto)` · `Promise<ReconciliationReportDto>`
    - `healthy`: `boolean` — { description: 'False when ANY money invariant is broken. Treat as an incident, not a metric.', }
    - `paidOrdersWithoutFulfillment`: `OrderRefDto[]` — { type: [OrderRefDto], description: 'Paid orders whose business fulfillment is still pending or failed.', }
    - `fulfilledOrdersWithoutPaidStatus`: `OrderRefDto[]` — { type: [OrderRefDto], description: 'Orders marked fulfilled without a paid payment state. This should always be empty.', }
    - `providerReversalsAfterSuccess`: `OrderRefDto[]` — { type: [OrderRefDto], description: 'Already-paid orders that later received a signed non-success provider callback.', }
    - `providerSuccessAfterFailedOrder`: `OrderRefDto[]` — { type: [OrderRefDto], description: 'Orders locally closed as failed that later received a signed success callback.', }
    - `successOrdersWithoutVoucherEvent`: `OrderRefDto[]` — { type: [OrderRefDto], description: 'Deprecated compatibility alias for voucher paid-orders without fulfillment.', }
    - `successMembershipOrdersWithoutActivation`: `OrderRefDto[]` — { type: [OrderRefDto], description: 'Deprecated compatibility alias for membership paid-orders without fulfillment.', }
    - `unsettledOrdersOlderThanOneHour`: `number` — { description: 'Orders still unsettled after an hour. A rising count means IPNs are not arriving.', }
    - `ordersByStatus`: `OrderStatusTotalDto[]` — { type: [OrderStatusTotalDto] }
    - `ordersByFulfillmentStatus`: `OrderStatusTotalDto[]` — { type: [OrderStatusTotalDto] }
    - `generatedAt`: `string` — { format: 'date-time' }

#### `GET /api/v1/web/admin/payments/ipn-logs`
Audit trail of every inbound VNPay callback
- Điều kiện: `Authenticated` · `RequirePermissions(PERMISSION_KEYS.FinancePaymentsRead)` · `HttpCode(HttpStatus.OK)`
- Query: `AdminIpnLogQueryDto`
    - `txnRef?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Filter by VNPay transaction reference.', }
    - `outcome?`: `VnpayIpnOutcome | undefined` — IsOptional, IsEnum — { enum: VnpayIpnOutcome }
    - `channel?`: `VnpayLogChannel | undefined` — IsOptional, IsEnum — { enum: VnpayLogChannel }
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(VnpayIpnLog)` · `Promise<CursorPaginatedResponse<VnpayIpnLog>>`
    - `data`: `VnpayIpnLog[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

### WebPaymentController  `/web/payments`  — `src/modules/payment/controllers/web.payment.controller.ts`

#### `GET /api/v1/web/payments/orders`
List my VNPay orders (web)
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)`
- Query: `PaymentOrderQueryDto`
    - `status?`: `PaymentStatus | undefined` — IsOptional, IsEnum — { enum: PaymentStatus }
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(PaymentOrderResDto)` · `Promise<CursorPaginatedResponse<PaymentOrderResDto>>`
    - `data`: `PaymentOrderResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/payments/orders/:txnRef`
Get one of my VNPay orders by reference (web)
- Điều kiện: `Authenticated` · `HttpCode(HttpStatus.OK)`
- Path `txnRef`: `string`
- Response: `ApiEnvelopeResponse(PaymentOrderResDto)` · `Promise<PaymentOrderResDto>`
    - `id`: `string` — { type: 'string' }
    - `txnRef`: `string` — { example: 'TW260712103000A1B2C3D4' }
    - `amountVnd`: `number` — { example: 100_000 }
    - `currency`: `string` — { example: 'VND' }
    - `purpose`: `PaymentPurpose` — { enum: PaymentPurpose, description: 'VOUCHER_PURCHASE grants a voucher; MEMBERSHIP_PURCHASE activates a membership after VNPay confirms.', 
    - `productId`: `string | null` — { nullable: true, type: 'string', description: 'Voucher product bought (VOUCHER_PURCHASE only).', }
    - `voucherId`: `string | null` — { nullable: true, type: 'string', description: 'Voucher granted to the buyer once the purchase succeeds (VOUCHER_PURCHASE). ' + 'Null while 
    - `provider`: `PaymentProvider` — { enum: PaymentProvider }
    - `status`: `PaymentStatus` — { enum: PaymentStatus }
    - `fulfillmentStatus`: `PaymentFulfillmentStatus` — { enum: PaymentFulfillmentStatus, description: 'Business delivery state. SUCCESS + PENDING/FAILED means money was captured and fulfillment i
    - `fulfillmentAttempts`: `number` — { description: 'How many fulfillment attempts have run.' }
    - `failCode`: `string | null` — { type: String, nullable: true, description: 'VNPay response code when the payment did not succeed.', example: '24', }
    - `confirmedSource`: `PaymentConfirmSource | null` — { enum: PaymentConfirmSource, nullable: true }
    - `transactionNo`: `string | null` — { type: String, nullable: true, description: 'VNPay transaction number.', }
    - `bankCode`: `string | null` — { type: String, nullable: true }
    - `paidAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `fulfilledAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `expiresAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }

## Module `payout`

### WebAdminPayoutController  `/web/admin/finance/payouts`  — `src/modules/payout/controllers/web.admin.payout.controller.ts`

#### `GET /api/v1/web/admin/finance/payouts`
List payout requests for accounting
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinancePayoutsRead)`
- Query: `AdminPayoutListReqDto`
    - `status?`: `PayoutStatus | undefined` — IsOptional, IsEnum — { enum: PayoutStatus }
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(PayoutResDto)` · `Promise<CursorPaginatedResponse<PayoutResDto>>`
    - `data`: `PayoutResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/admin/finance/payouts/:id`
Get payout allocation summary, actors and reconciliation evidence
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinancePayoutsRead)`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(AdminPayoutDetailResDto)` · `Promise<AdminPayoutDetailResDto>`
    - `reservationJournalId`: `string | null` — { type: 'string', nullable: true }
    - `actors`: `PayoutActorTrailResDto` — { type: PayoutActorTrailResDto }
      - **PayoutActorTrailResDto**
        - `approvedByUserId`: `string | null` — { type: 'string', nullable: true }
        - `rejectedByUserId`: `string | null` — { type: 'string', nullable: true }
        - `processingByUserId`: `string | null` — { type: 'string', nullable: true }
        - `bankDetailsAccessedByUserId`: `string | null` — { type: 'string', nullable: true }
        - `cancelledByUserId`: `string | null` — { type: 'string', nullable: true }
        - `reconciliationRequiredByUserId`: `string | null` — { type: 'string', nullable: true }
        - `reconciledByUserId`: `string | null` — { type: 'string', nullable: true }
    - `reconciliationEvidence`: `PayoutReconciliationEvidenceResDto` — { type: PayoutReconciliationEvidenceResDto }
      - **PayoutReconciliationEvidenceResDto**
        - `source`: `string | null` — { type: String, nullable: true }
        - `reference`: `string | null` — { type: String, nullable: true }
        - `bankOccurredAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
        - `note`: `string | null` — { type: String, nullable: true }
        - `pendingReason`: `string | null` — { type: String, nullable: true }
    - `allocationSummary`: `PayoutAllocationSummaryResDto` — { type: PayoutAllocationSummaryResDto }
      - **PayoutAllocationSummaryResDto**
        - `sourceCount`: `number`
        - `allocatedAmountVnd`: `string` — { type: 'string' }
        - `reservedAmountVnd`: `string` — { type: 'string' }
        - `settledAmountVnd`: `string` — { type: 'string' }
        - `releasedAmountVnd`: `string` — { type: 'string' }
    - `timeline`: `PayoutTimelineResDto` — { type: PayoutTimelineResDto }
      - **PayoutTimelineResDto**
        - `requestedAt`: `string` — { format: 'date-time' }
        - `approvedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
        - `processingAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
        - `submittedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
        - `reconciliationRequiredAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
        - `reconciledAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
        - `rejectedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
        - `cancelledAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
        - `completedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }
    - `requiresReconciliation`: `boolean`
    - `id`: `string` — { type: 'string' }
    - `partyType`: `string` — { enum: ['MERCHANT', 'CREATOR', 'AFFILIATE'] }
    - `partyId`: `string` — { type: 'string' }
    - `amountVnd`: `string` — { type: 'string' }
    - `currency`: `string` — { example: 'VND' }
    - `status`: `PayoutStatus` — { enum: PayoutStatus }
    - `bankName`: `string`
    - `accountNumberMasked`: `string`
    - `accountName`: `string`
    - `externalReference`: `string | null` — { type: String, nullable: true }
    - `failureReason`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `completedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }

#### `GET /api/v1/web/admin/finance/payouts/:id/allocations`
List the earning sources allocated to a payout
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinancePayoutsRead)`
- Path `id`: `string`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(PayoutAllocationBreakdownResDto)` · `Promise<CursorPaginatedResponse<PayoutAllocationBreakdownResDto>>`
    - `data`: `PayoutAllocationBreakdownResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/admin/finance/payouts/:id/bank-details`
View the immutable payout beneficiary snapshot
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinancePayoutsBankDetailsRead)` · `RateLimit({ userPerMin: 10, ipPerMin: 30 })`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(PayoutBankDetailsResDto)` · `Promise<PayoutBankDetailsResDto>`
    - `payoutId`: `string` — { type: 'string' }
    - `status`: `PayoutStatus` — { enum: PayoutStatus }
    - `amountVnd`: `string` — { type: 'string' }
    - `bankBin`: `string`
    - `bankCode`: `string`
    - `bankName`: `string`
    - `bankShortName`: `string`
    - `accountNumber`: `string`
    - `accountName`: `string`
    - `bankAccountId`: `string` — { type: 'string' }
    - `bankAccountVersion`: `number`
    - `verifiedAt`: `string` — { format: 'date-time' }

#### `PATCH /api/v1/web/admin/finance/payouts/:id/approve`
Approve and reserve a payout
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinancePayoutsApprove)` · `RateLimit({ userPerMin: 10, ipPerMin: 30 })` · `HttpCode(HttpStatus.OK)`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(PayoutResDto)` · `Promise<PayoutResDto>`
    - `id`: `string` — { type: 'string' }
    - `partyType`: `string` — { enum: ['MERCHANT', 'CREATOR', 'AFFILIATE'] }
    - `partyId`: `string` — { type: 'string' }
    - `amountVnd`: `string` — { type: 'string' }
    - `currency`: `string` — { example: 'VND' }
    - `status`: `PayoutStatus` — { enum: PayoutStatus }
    - `bankName`: `string`
    - `accountNumberMasked`: `string`
    - `accountName`: `string`
    - `externalReference`: `string | null` — { type: String, nullable: true }
    - `failureReason`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `completedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }

#### `PATCH /api/v1/web/admin/finance/payouts/:id/processing`
Claim an approved payout for bank execution
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinancePayoutsExecute)` · `RateLimit({ userPerMin: 10, ipPerMin: 30 })` · `HttpCode(HttpStatus.OK)`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(PayoutResDto)` · `Promise<PayoutResDto>`
    - `id`: `string` — { type: 'string' }
    - `partyType`: `string` — { enum: ['MERCHANT', 'CREATOR', 'AFFILIATE'] }
    - `partyId`: `string` — { type: 'string' }
    - `amountVnd`: `string` — { type: 'string' }
    - `currency`: `string` — { example: 'VND' }
    - `status`: `PayoutStatus` — { enum: PayoutStatus }
    - `bankName`: `string`
    - `accountNumberMasked`: `string`
    - `accountName`: `string`
    - `externalReference`: `string | null` — { type: String, nullable: true }
    - `failureReason`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `completedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }

#### `PATCH /api/v1/web/admin/finance/payouts/:id/submit`
Record payout submission to the bank
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinancePayoutsExecute)` · `RateLimit({ userPerMin: 10, ipPerMin: 30 })` · `HttpCode(HttpStatus.OK)`
- Path `id`: `string`
- Body: `SubmitPayoutReqDto`
    - `externalReference`: `string` — IsString, MinLength, MaxLength, Matches — { minLength: 3, maxLength: 255 }
- Response: `ApiEnvelopeResponse(PayoutResDto)` · `Promise<PayoutResDto>`
    - `id`: `string` — { type: 'string' }
    - `partyType`: `string` — { enum: ['MERCHANT', 'CREATOR', 'AFFILIATE'] }
    - `partyId`: `string` — { type: 'string' }
    - `amountVnd`: `string` — { type: 'string' }
    - `currency`: `string` — { example: 'VND' }
    - `status`: `PayoutStatus` — { enum: PayoutStatus }
    - `bankName`: `string`
    - `accountNumberMasked`: `string`
    - `accountName`: `string`
    - `externalReference`: `string | null` — { type: String, nullable: true }
    - `failureReason`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `completedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }

#### `PATCH /api/v1/web/admin/finance/payouts/:id/cancel`
Cancel a payout before bank submission
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinancePayoutsExecute)` · `RateLimit({ userPerMin: 10, ipPerMin: 30 })` · `HttpCode(HttpStatus.OK)`
- Path `id`: `string`
- Body: `CancelPayoutReqDto`
    - `reason`: `string` — IsString, MinLength, MaxLength, Matches — { minLength: 3, maxLength: 1000 }
- Response: `ApiEnvelopeResponse(PayoutResDto)` · `Promise<PayoutResDto>`
    - `id`: `string` — { type: 'string' }
    - `partyType`: `string` — { enum: ['MERCHANT', 'CREATOR', 'AFFILIATE'] }
    - `partyId`: `string` — { type: 'string' }
    - `amountVnd`: `string` — { type: 'string' }
    - `currency`: `string` — { example: 'VND' }
    - `status`: `PayoutStatus` — { enum: PayoutStatus }
    - `bankName`: `string`
    - `accountNumberMasked`: `string`
    - `accountName`: `string`
    - `externalReference`: `string | null` — { type: String, nullable: true }
    - `failureReason`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `completedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }

#### `PATCH /api/v1/web/admin/finance/payouts/:id/succeed`
Record a successful manual payout
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinancePayoutsReconcile)` · `RateLimit({ userPerMin: 10, ipPerMin: 30 })` · `HttpCode(HttpStatus.OK)`
- Path `id`: `string`
- Body: `ReconcilePayoutReqDto`
    - `evidenceSource`: `FinanceEvidenceSource` — IsEnum — { enum: FinanceEvidenceSource }
    - `evidenceReference`: `string` — IsString, MinLength, MaxLength, Matches — { minLength: 3, maxLength: 255 }
    - `bankOccurredAt`: `string` — IsISO8601 — { format: 'date-time' }
    - `note?`: `string | undefined` — IsOptional, IsString, MaxLength, Matches — { maxLength: 1000 }
    - `externalReference`: `string` — IsString, MinLength, MaxLength, Matches — { minLength: 3, maxLength: 255 }
- Response: `ApiEnvelopeResponse(PayoutResDto)` · `Promise<PayoutResDto>`
    - `id`: `string` — { type: 'string' }
    - `partyType`: `string` — { enum: ['MERCHANT', 'CREATOR', 'AFFILIATE'] }
    - `partyId`: `string` — { type: 'string' }
    - `amountVnd`: `string` — { type: 'string' }
    - `currency`: `string` — { example: 'VND' }
    - `status`: `PayoutStatus` — { enum: PayoutStatus }
    - `bankName`: `string`
    - `accountNumberMasked`: `string`
    - `accountName`: `string`
    - `externalReference`: `string | null` — { type: String, nullable: true }
    - `failureReason`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `completedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }

#### `PATCH /api/v1/web/admin/finance/payouts/:id/reconciliation-required`
Quarantine an ambiguous submitted payout
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinancePayoutsReconcile)` · `RateLimit({ userPerMin: 10, ipPerMin: 30 })` · `HttpCode(HttpStatus.OK)`
- Path `id`: `string`
- Body: `RequirePayoutReconciliationReqDto`
    - `reason`: `string` — IsString, MinLength, MaxLength, Matches — { minLength: 3, maxLength: 1000 }
    - `externalReference`: `string` — IsString, MinLength, MaxLength, Matches — { minLength: 3, maxLength: 255 }
- Response: `ApiEnvelopeResponse(PayoutResDto)` · `Promise<PayoutResDto>`
    - `id`: `string` — { type: 'string' }
    - `partyType`: `string` — { enum: ['MERCHANT', 'CREATOR', 'AFFILIATE'] }
    - `partyId`: `string` — { type: 'string' }
    - `amountVnd`: `string` — { type: 'string' }
    - `currency`: `string` — { example: 'VND' }
    - `status`: `PayoutStatus` — { enum: PayoutStatus }
    - `bankName`: `string`
    - `accountNumberMasked`: `string`
    - `accountName`: `string`
    - `externalReference`: `string | null` — { type: String, nullable: true }
    - `failureReason`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `completedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }

#### `PATCH /api/v1/web/admin/finance/payouts/:id/reject`
Reject a pending payout request
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinancePayoutsApprove)` · `RateLimit({ userPerMin: 10, ipPerMin: 30 })` · `HttpCode(HttpStatus.OK)`
- Path `id`: `string`
- Body: `FailPayoutReqDto`
    - `reason?`: `string | undefined` — IsOptional, IsString, MaxLength, Matches — { maxLength: 1000 }
- Response: `ApiEnvelopeResponse(PayoutResDto)` · `Promise<PayoutResDto>`
    - `id`: `string` — { type: 'string' }
    - `partyType`: `string` — { enum: ['MERCHANT', 'CREATOR', 'AFFILIATE'] }
    - `partyId`: `string` — { type: 'string' }
    - `amountVnd`: `string` — { type: 'string' }
    - `currency`: `string` — { example: 'VND' }
    - `status`: `PayoutStatus` — { enum: PayoutStatus }
    - `bankName`: `string`
    - `accountNumberMasked`: `string`
    - `accountName`: `string`
    - `externalReference`: `string | null` — { type: String, nullable: true }
    - `failureReason`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `completedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }

#### `PATCH /api/v1/web/admin/finance/payouts/:id/fail`
Record a bank-confirmed failed payout
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinancePayoutsReconcile)` · `RateLimit({ userPerMin: 10, ipPerMin: 30 })` · `HttpCode(HttpStatus.OK)`
- Path `id`: `string`
- Body: `ReconcileFailedPayoutReqDto`
    - `reason`: `string` — IsString, MinLength, MaxLength, Matches — { minLength: 3, maxLength: 1000 }
    - `evidenceSource`: `FinanceEvidenceSource` — IsEnum — { enum: FinanceEvidenceSource }
    - `evidenceReference`: `string` — IsString, MinLength, MaxLength, Matches — { minLength: 3, maxLength: 255 }
    - `bankOccurredAt`: `string` — IsISO8601 — { format: 'date-time' }
    - `note?`: `string | undefined` — IsOptional, IsString, MaxLength, Matches — { maxLength: 1000 }
    - `externalReference`: `string` — IsString, MinLength, MaxLength, Matches — { minLength: 3, maxLength: 255 }
- Response: `ApiEnvelopeResponse(PayoutResDto)` · `Promise<PayoutResDto>`
    - `id`: `string` — { type: 'string' }
    - `partyType`: `string` — { enum: ['MERCHANT', 'CREATOR', 'AFFILIATE'] }
    - `partyId`: `string` — { type: 'string' }
    - `amountVnd`: `string` — { type: 'string' }
    - `currency`: `string` — { example: 'VND' }
    - `status`: `PayoutStatus` — { enum: PayoutStatus }
    - `bankName`: `string`
    - `accountNumberMasked`: `string`
    - `accountName`: `string`
    - `externalReference`: `string | null` — { type: String, nullable: true }
    - `failureReason`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `completedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }

## Module `finance`

### WebAdminFinanceController  `/web/admin/finance`  — `src/modules/finance/controllers/web.admin.finance.controller.ts`

#### `GET /api/v1/web/admin/finance/seller-policy-groups`
List the five fixed seller groups and their current policies
- Điều kiện: `Authenticated` · `RequirePermissions(PERMISSION_KEYS.FinanceConfigRead)`
- Response: `Promise<SellerPolicyGroupResDto[]>`
    - `group`: `SellerPolicyGroup` — { enum: SellerPolicyGroup }
    - `current`: `SellerPolicyVersionResDto | null` — { type: SellerPolicyVersionResDto, nullable: true }

#### `GET /api/v1/web/admin/finance/seller-policy-groups/:group/versions`
List immutable seller tax and fee policy history
- Điều kiện: `Authenticated` · `RequirePermissions(PERMISSION_KEYS.FinanceConfigRead)`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Path `group`: `SellerPolicyGroup`
- Response: `ApiEnvelopeCursorResponse(SellerPolicyVersionResDto)` · `Promise<CursorPaginatedResponse<SellerPolicyVersionResDto>>`
    - `data`: `SellerPolicyVersionResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `POST /api/v1/web/admin/finance/seller-policy-groups/:group/versions`
Append a seller tax and fee policy version
- Điều kiện: `Authenticated` · `RequirePermissions(PERMISSION_KEYS.FinanceConfigManage)` · `HttpCode(HttpStatus.OK)`
- Path `group`: `SellerPolicyGroup`
- Body: `CreateSellerPolicyVersionReqDto`
    - `expectedVersionNo`: `number` — IsInt, Min, Max — { description: 'Latest version number read by the admin; 0 for initial configuration. Rejects stale edits.', }
    - `vatBps?`: `number | undefined` — IsOptional, IsInt, Min, Max — { description: 'Actual VAT withholding in bps, not a statutory base rate. 400 = 4%. Omitted copies the latest version. Company must be 0.', 
    - `pitBps?`: `number | undefined` — IsOptional, IsInt, Min, Max — { description: 'PIT withholding in bps. Omitted copies the latest version. Company must be 0.', }
    - `platformFeeBps?`: `number | undefined` — IsOptional, IsInt, Min, Max — { description: 'Platform fee in bps. Omitted copies the latest version.', }
    - `changeNote`: `string` — IsString, MinLength, MaxLength — { description: 'Reviewed reason / legal basis for this version.', maxLength: 1000, }
- Response: `ApiEnvelopeResponse(SellerPolicyVersionResDto)` · `Promise<SellerPolicyVersionResDto>`
    - `id`: `string` — { type: String }
    - `group`: `SellerPolicyGroup` — { enum: SellerPolicyGroup }
    - `versionNo`: `number`
    - `vatBps`: `number`
    - `pitBps`: `number`
    - `platformFeeBps`: `number`
    - `createdByUserId`: `string` — { type: String }
    - `changeNote`: `string`
    - `createdAt`: `Date` — { format: 'date-time' }
- Lỗi/Status: `409: FINANCE_SELLER_POLICY_VERSION_CONFLICT`

#### `GET /api/v1/web/admin/finance/revenue-sources`
List finance revenue sources
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceConfigRead)` · `HttpCode(HttpStatus.OK)`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(RevenueSourceResDto)` · `Promise<CursorPaginatedResponse<RevenueSourceResDto>>`
    - `data`: `RevenueSourceResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/admin/finance/revenue-sources/:id`
Get a finance revenue source
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceConfigRead)` · `HttpCode(HttpStatus.OK)`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(RevenueSourceResDto)` · `Promise<RevenueSourceResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `code`: `string` — { example: 'MEMBERSHIP' }
    - `name`: `string` — { example: 'Membership' }
    - `description`: `string | null` — { type: String, nullable: true }
    - `businessModel`: `FinanceBusinessModel` — { enum: FinanceBusinessModel }
    - `isActive`: `boolean` — { example: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/web/admin/finance/revenue-sources`
Create a finance revenue source
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceConfigManage)` · `HttpCode(HttpStatus.OK)`
- Body: `CreateRevenueSourceReqDto`
    - `code`: `string` — IsString, IsNotEmpty, MaxLength, Matches — { example: 'MEMBERSHIP', maxLength: 80, description: 'Stable uppercase system code for this revenue source.', }
    - `name`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'Membership', maxLength: 120 }
    - `description?`: `string | null | undefined` — IsOptional, IsString, MaxLength — { type: String, nullable: true, maxLength: 500 }
    - `businessModel`: `FinanceBusinessModel` — IsEnum — { enum: FinanceBusinessModel, description: 'PRINCIPAL means TrustWow owns the revenue; AGENT means TrustWow collects for a seller.', }
    - `isActive?`: `boolean | undefined` — IsOptional, IsBoolean — { example: true, default: true }
- Response: `ApiEnvelopeResponse(RevenueSourceResDto)` · `Promise<RevenueSourceResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `code`: `string` — { example: 'MEMBERSHIP' }
    - `name`: `string` — { example: 'Membership' }
    - `description`: `string | null` — { type: String, nullable: true }
    - `businessModel`: `FinanceBusinessModel` — { enum: FinanceBusinessModel }
    - `isActive`: `boolean` — { example: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `PATCH /api/v1/web/admin/finance/revenue-sources/:id`
Update a finance revenue source label or status
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceConfigManage)` · `HttpCode(HttpStatus.OK)`
- Path `id`: `string`
- Body: `UpdateRevenueSourceReqDto`
    - `name?`: `string | undefined` — IsOptional, IsString, MaxLength — { example: 'Membership', maxLength: 120 }
    - `description?`: `string | null | undefined` — IsOptional, ValidateIf, IsString, MaxLength — { type: String, nullable: true, maxLength: 500 }
    - `isActive?`: `boolean | undefined` — IsOptional, IsBoolean — { example: true }
- Response: `ApiEnvelopeResponse(RevenueSourceResDto)` · `Promise<RevenueSourceResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `code`: `string` — { example: 'MEMBERSHIP' }
    - `name`: `string` — { example: 'Membership' }
    - `description`: `string | null` — { type: String, nullable: true }
    - `businessModel`: `FinanceBusinessModel` — { enum: FinanceBusinessModel }
    - `isActive`: `boolean` — { example: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `GET /api/v1/web/admin/finance/charge-types`
List finance charge types
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceConfigRead)` · `HttpCode(HttpStatus.OK)`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(ChargeTypeResDto)` · `Promise<CursorPaginatedResponse<ChargeTypeResDto>>`
    - `data`: `ChargeTypeResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/admin/finance/charge-types/:id`
Get a finance charge type
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceConfigRead)` · `HttpCode(HttpStatus.OK)`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(ChargeTypeResDto)` · `Promise<ChargeTypeResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `code`: `string` — { example: 'VAT' }
    - `name`: `string` — { example: 'Value-added tax' }
    - `kind`: `FinanceChargeKind` — { enum: FinanceChargeKind }
    - `description`: `string | null` — { type: String, nullable: true }
    - `isActive`: `boolean` — { example: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/web/admin/finance/charge-types`
Create a finance charge type
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceConfigManage)` · `HttpCode(HttpStatus.OK)`
- Body: `CreateChargeTypeReqDto`
    - `code`: `string` — IsString, IsNotEmpty, MaxLength, Matches — { example: 'VAT', maxLength: 80, description: 'Stable uppercase system code for this fee or tax type.', }
    - `name`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'Value-added tax', maxLength: 120 }
    - `kind`: `FinanceChargeKind` — IsEnum — { enum: FinanceChargeKind }
    - `description?`: `string | null | undefined` — IsOptional, IsString, MaxLength — { type: String, nullable: true, maxLength: 500 }
    - `isActive?`: `boolean | undefined` — IsOptional, IsBoolean — { example: true, default: true }
- Response: `ApiEnvelopeResponse(ChargeTypeResDto)` · `Promise<ChargeTypeResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `code`: `string` — { example: 'VAT' }
    - `name`: `string` — { example: 'Value-added tax' }
    - `kind`: `FinanceChargeKind` — { enum: FinanceChargeKind }
    - `description`: `string | null` — { type: String, nullable: true }
    - `isActive`: `boolean` — { example: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `PATCH /api/v1/web/admin/finance/charge-types/:id`
Update a finance charge type label or status
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceConfigManage)` · `HttpCode(HttpStatus.OK)`
- Path `id`: `string`
- Body: `UpdateChargeTypeReqDto`
    - `name?`: `string | undefined` — IsOptional, IsString, MaxLength — { example: 'Value-added tax', maxLength: 120 }
    - `description?`: `string | null | undefined` — IsOptional, ValidateIf, IsString, MaxLength — { type: String, nullable: true, maxLength: 500 }
    - `isActive?`: `boolean | undefined` — IsOptional, IsBoolean — { example: true }
- Response: `ApiEnvelopeResponse(ChargeTypeResDto)` · `Promise<ChargeTypeResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `code`: `string` — { example: 'VAT' }
    - `name`: `string` — { example: 'Value-added tax' }
    - `kind`: `FinanceChargeKind` — { enum: FinanceChargeKind }
    - `description`: `string | null` — { type: String, nullable: true }
    - `isActive`: `boolean` — { example: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

#### `GET /api/v1/web/admin/finance/revenue-sources/:revenueSourceId/policy-versions`
List finance policy versions for a source
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceConfigRead)` · `HttpCode(HttpStatus.OK)`
- Path `revenueSourceId`: `string`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(PolicyVersionResDto)` · `Promise<CursorPaginatedResponse<PolicyVersionResDto>>`
    - `data`: `PolicyVersionResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `POST /api/v1/web/admin/finance/revenue-sources/:revenueSourceId/policy-versions`
Create an active finance policy version
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceConfigManage)` · `HttpCode(HttpStatus.OK)`
- Path `revenueSourceId`: `string`
- Body: `CreatePolicyVersionReqDto`
    - `effectiveFrom?`: `string | undefined` — IsOptional, IsISO8601 — { format: 'date-time', description: 'Defaults to the current server time. May be up to 180 days in the future and at most 5 minutes in the p
    - `changeNote?`: `string | undefined` — IsOptional, IsString, MaxLength — { maxLength: 1000 }
    - `lines`: `PolicyLineReqDto[]` — IsArray, ArrayMaxSize, ArrayUnique — { type: [PolicyLineReqDto], maxItems: MAX_POLICY_LINES_PER_VERSION, description: 'AGENT source versions prove the fulfillment path and may h
- Response: `ApiEnvelopeResponse(PolicyVersionResDto)` · `Promise<PolicyVersionResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `revenueSourceId`: `string` — { type: 'string', example: '1' }
    - `versionNo`: `number` — { example: 2 }
    - `status`: `FinancePolicyStatus` — { enum: FinancePolicyStatus }
    - `effectiveFrom`: `string` — { format: 'date-time' }
    - `effectiveTo`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `createdByUserId`: `string` — { type: 'string', example: '1' }
    - `changeNote`: `string | null` — { type: String, nullable: true }
    - `lines`: `PolicyLineResDto[]` — { type: [PolicyLineResDto] }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `400: FINANCE_POLICY_VERSION_EMPTY | FINANCE_POLICY_LINE_INVALID | FINANCE_POLICY_EFFECTIVE_WINDOW_INVALID | FINANCE_REVENUE_SOURCE_INACTIVE`

#### `GET /api/v1/web/admin/finance/policy-versions/:id`
Get a finance policy version
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceConfigRead)` · `HttpCode(HttpStatus.OK)`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(PolicyVersionResDto)` · `Promise<PolicyVersionResDto>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `revenueSourceId`: `string` — { type: 'string', example: '1' }
    - `versionNo`: `number` — { example: 2 }
    - `status`: `FinancePolicyStatus` — { enum: FinancePolicyStatus }
    - `effectiveFrom`: `string` — { format: 'date-time' }
    - `effectiveTo`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `createdByUserId`: `string` — { type: 'string', example: '1' }
    - `changeNote`: `string | null` — { type: String, nullable: true }
    - `lines`: `PolicyLineResDto[]` — { type: [PolicyLineResDto] }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }

## Module `double-entry`

### WebAdminDoubleEntryController  `/web/admin/finance/ledger`  — `src/modules/double-entry/controllers/web.admin.double-entry.controller.ts`

#### `GET /api/v1/web/admin/finance/ledger/accounts`
List the finance chart of accounts with VAS mappings
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceLedgerRead)`
- Response: `Promise<FinanceAccountResDto[]>`
    - `id`: `string` — { type: 'string', example: '1' }
    - `code`: `string` — { example: 'BANK_CASH' }
    - `name`: `string` — { example: 'Bank cash' }
    - `vasAccountCode`: `string` — { example: '1121' }
    - `vasAccountName`: `string` — { example: 'Tiền Việt Nam' }
    - `accountType`: `FinanceAccountType` — { enum: FinanceAccountType }
    - `normalSide`: `FinanceNormalSide` — { enum: FinanceNormalSide }
    - `currency`: `string | null` — { type: String, nullable: true, example: 'VND' }
    - `isActive`: `boolean` — { example: true }

#### `GET /api/v1/web/admin/finance/ledger/integrity`
Get finance ledger trial-balance integrity
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceLedgerRead)`
- Response: `ApiEnvelopeResponse(LedgerIntegrityResDto)` · `Promise<LedgerIntegrityResDto>`
    - `currency`: `string` — { example: 'VND' }
    - `totalDebits`: `string` — { type: 'string' }
    - `totalCredits`: `string` — { type: 'string' }
    - `balanced`: `boolean`
    - `staleDraftCount`: `number`
    - `orphanPayoutJournalCount`: `number`
    - `payoutStateJournalMismatchCount`: `number`
    - `payoutAllocationMismatchCount`: `number`
    - `treasurySettlementMismatchCount`: `number`
    - `paymentLedgerMismatchCount`: `number`
    - `earningLedgerMismatchCount`: `number`
    - `membershipLedgerMismatchCount`: `number` — { description: 'Membership sale / deferred-revenue journals that are missing, malformed or out of balance', }
    - `healthy`: `boolean`

#### `GET /api/v1/web/admin/finance/ledger/journals`
List recent posted finance journals
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceLedgerRead)`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(FinanceJournalResDto)` · `Promise<CursorPaginatedResponse<FinanceJournalResDto>>`
    - `data`: `FinanceJournalResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/admin/finance/ledger/vnpay-settlements`
List VNPay settlement review records
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceLedgerRead)`
- Query: `TreasurySettlementListReqDto`
    - `status?`: `FinanceTreasurySettlementStatus | undefined` — IsOptional, IsEnum — { enum: FinanceTreasurySettlementStatus }
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(TreasurySettlementResDto)` · `Promise<CursorPaginatedResponse<TreasurySettlementResDto>>`
    - `data`: `TreasurySettlementResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/admin/finance/ledger/vnpay-settlements/:id`
Get a VNPay settlement review record
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceLedgerRead)`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(TreasurySettlementResDto)` · `Promise<TreasurySettlementResDto>`
    - `id`: `string` — { type: 'string' }
    - `status`: `FinanceTreasurySettlementStatus` — { enum: FinanceTreasurySettlementStatus }
    - `grossAmountVnd`: `string` — { type: 'string' }
    - `gatewayFeeVnd`: `string` — { type: 'string' }
    - `netAmountVnd`: `string` — { type: 'string' }
    - `currency`: `string`
    - `externalReference`: `string`
    - `settledAt`: `string` — { format: 'date-time' }
    - `requestedByUserId`: `string` — { type: 'string' }
    - `reviewedByUserId`: `string | null` — { type: 'string', nullable: true }
    - `journalId`: `string | null` — { type: 'string', nullable: true }
    - `evidenceSource`: `string | null` — { type: String, nullable: true }
    - `evidenceReference`: `string | null` — { type: String, nullable: true }
    - `rejectionReason`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `reviewedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }

#### `POST /api/v1/web/admin/finance/ledger/vnpay-settlements`
Request a manually reconciled VNPay settlement
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceLedgerRead)` · `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.FinanceTreasurySettlementsCreate)` · `RateLimit({ userPerMin: 10, ipPerMin: 30 })`
- Body: `RecordVnpaySettlementReqDto`
    - `grossAmountVnd`: `string` — IsString, Matches — { example: '1000000', description: 'Gross settled VND' }
    - `gatewayFeeVnd`: `string` — IsString, Matches — { example: '10000', description: 'Gateway fee in whole VND' }
    - `externalReference`: `string` — IsString, MinLength, MaxLength, Matches — { minLength: 3, maxLength: 200 }
    - `settledAt`: `string` — IsISO8601 — { format: 'date-time' }
- Response: `ApiEnvelopeResponse(TreasurySettlementResDto)` · `Promise<TreasurySettlementResDto>`
    - `id`: `string` — { type: 'string' }
    - `status`: `FinanceTreasurySettlementStatus` — { enum: FinanceTreasurySettlementStatus }
    - `grossAmountVnd`: `string` — { type: 'string' }
    - `gatewayFeeVnd`: `string` — { type: 'string' }
    - `netAmountVnd`: `string` — { type: 'string' }
    - `currency`: `string`
    - `externalReference`: `string`
    - `settledAt`: `string` — { format: 'date-time' }
    - `requestedByUserId`: `string` — { type: 'string' }
    - `reviewedByUserId`: `string | null` — { type: 'string', nullable: true }
    - `journalId`: `string | null` — { type: 'string', nullable: true }
    - `evidenceSource`: `string | null` — { type: String, nullable: true }
    - `evidenceReference`: `string | null` — { type: String, nullable: true }
    - `rejectionReason`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `reviewedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }

#### `PATCH /api/v1/web/admin/finance/ledger/vnpay-settlements/:id/approve`
Approve and post a VNPay settlement request
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceLedgerRead)` · `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.FinanceTreasurySettlementsReview)` · `RateLimit({ userPerMin: 10, ipPerMin: 30 })`
- Path `id`: `string`
- Body: `ApproveVnpaySettlementReqDto`
    - `evidenceSource`: `FinanceEvidenceSource` — IsEnum — { enum: FinanceEvidenceSource }
    - `evidenceReference`: `string` — IsString, MinLength, MaxLength, Matches — { minLength: 3, maxLength: 255 }
- Response: `ApiEnvelopeResponse(TreasurySettlementResDto)` · `Promise<TreasurySettlementResDto>`
    - `id`: `string` — { type: 'string' }
    - `status`: `FinanceTreasurySettlementStatus` — { enum: FinanceTreasurySettlementStatus }
    - `grossAmountVnd`: `string` — { type: 'string' }
    - `gatewayFeeVnd`: `string` — { type: 'string' }
    - `netAmountVnd`: `string` — { type: 'string' }
    - `currency`: `string`
    - `externalReference`: `string`
    - `settledAt`: `string` — { format: 'date-time' }
    - `requestedByUserId`: `string` — { type: 'string' }
    - `reviewedByUserId`: `string | null` — { type: 'string', nullable: true }
    - `journalId`: `string | null` — { type: 'string', nullable: true }
    - `evidenceSource`: `string | null` — { type: String, nullable: true }
    - `evidenceReference`: `string | null` — { type: String, nullable: true }
    - `rejectionReason`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `reviewedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }

#### `PATCH /api/v1/web/admin/finance/ledger/vnpay-settlements/:id/reject`
Reject a VNPay settlement request
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceLedgerRead)` · `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.FinanceTreasurySettlementsReview)` · `RateLimit({ userPerMin: 10, ipPerMin: 30 })`
- Path `id`: `string`
- Body: `RejectVnpaySettlementReqDto`
    - `reason`: `string` — IsString, MinLength, MaxLength, Matches — { minLength: 3, maxLength: 1000 }
- Response: `ApiEnvelopeResponse(TreasurySettlementResDto)` · `Promise<TreasurySettlementResDto>`
    - `id`: `string` — { type: 'string' }
    - `status`: `FinanceTreasurySettlementStatus` — { enum: FinanceTreasurySettlementStatus }
    - `grossAmountVnd`: `string` — { type: 'string' }
    - `gatewayFeeVnd`: `string` — { type: 'string' }
    - `netAmountVnd`: `string` — { type: 'string' }
    - `currency`: `string`
    - `externalReference`: `string`
    - `settledAt`: `string` — { format: 'date-time' }
    - `requestedByUserId`: `string` — { type: 'string' }
    - `reviewedByUserId`: `string | null` — { type: 'string', nullable: true }
    - `journalId`: `string | null` — { type: 'string', nullable: true }
    - `evidenceSource`: `string | null` — { type: String, nullable: true }
    - `evidenceReference`: `string | null` — { type: String, nullable: true }
    - `rejectionReason`: `string | null` — { type: String, nullable: true }
    - `createdAt`: `string` — { format: 'date-time' }
    - `reviewedAt`: `string | null` — { type: String, format: 'date-time', nullable: true }

## Module `membership`

### MobileMembershipController  `/mobile/membership`  — `src/modules/membership/controllers/mobile.membership.controller.ts`

#### `GET /api/v1/mobile/membership/plans`
List active membership plans available to buy
- Điều kiện: `Authenticated` · `RateLimit(MEMBERSHIP_READ_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Response: `Promise<PlanResDto[]>`
    - `id`: `string` — { type: 'string' }
    - `code`: `string` — { example: 'monthly' }
    - `name`: `string` — { example: 'Gói 1 tháng' }
    - `description`: `string | null` — { type: String, nullable: true }
    - `durationDays`: `number` — { example: 30 }
    - `price`: `number` — { example: 99000 }
    - `isFree`: `boolean` — { example: false, deprecated: true, description: 'Compatibility field for existing clients. Derived from price === 0.', }
    - `freeOncePerUser`: `boolean` — { example: false, description: '0 VND plans can be claimed once per user lifetime; after claiming, every 0 VND plan is hidden from GET plans
    - `isActive`: `boolean` — { example: true }
    - `sortOrder`: `number` — { example: 0 }
    - `upgradedRoleId`: `string | null` — { type: String, nullable: true, example: '3', description: 'RBAC role granted while this plan is active; null = no upgrade', }

#### `GET /api/v1/mobile/membership/me`
My membership status
- Điều kiện: `Authenticated` · `RateLimit(MEMBERSHIP_READ_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(MyMembershipResDto)` · `Promise<MyMembershipResDto>`
    - `active`: `boolean` — { description: 'True while expiresAt is in the future. False when the user never had a membership or it has expired.', }
    - `startsAt`: `string | null` — { type: 'string', format: 'date-time', nullable: true, description: 'Start of the current uninterrupted coverage. Null when the user never h
    - `expiresAt`: `string | null` — { type: 'string', format: 'date-time', nullable: true, description: 'When coverage ends (every purchase extends it). Null when the user neve

#### `GET /api/v1/mobile/membership/me/history`
My membership purchase history
- Điều kiện: `Authenticated` · `RateLimit(MEMBERSHIP_READ_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(MembershipPurchaseHistoryItemResDto, 'Completed purchases, newest first. An empty history is 200 )` · `Promise<CursorPaginatedResponse<MembershipPurchaseHistoryItemResDto>>`
    - `data`: `MembershipPurchaseHistoryItemResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `400: CURSOR_INVALID | VALIDATION_FAILED (limit 1-50)`

#### `POST /api/v1/mobile/membership/me/checkout`
Acquire a plan. 0 VND plans activate instantly; paid plans return a signed VNPay checkout URL.
- Điều kiện: `Authenticated` · `RateLimit(MEMBERSHIP_CHECKOUT_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Body: `PurchaseMembershipReqDto`
    - `planId`: `string` — IsBigIntId — { type: 'string', example: '2', description: 'Plan id (BIGINT as string)', }
    - `bankCode?`: `"VNPAYQR" | "VNBANK" | "INTCARD" | undefined` — IsOptional, IsIn — { description: 'Pre-select a payment method on VNPay.', enum: VNPAY_BANK_CODES, }
    - `locale?`: `"vn" | "en" | undefined` — IsOptional, IsIn — { description: 'Language of the VNPay checkout page.', enum: ['vn', 'en'], default: 'vn', }
- Ip: `string`
- Header `idempotency-key` (optional): `string`
- Response: `ApiEnvelopeResponse(PurchaseMembershipResDto)` · `Promise<PurchaseMembershipResDto>`
    - `purchase`: `MembershipPurchaseResDto` — { type: MembershipPurchaseResDto, description: 'The purchase row of this checkout: PENDING for a paid plan until the payment is confirmed, C
      - **MembershipPurchaseResDto**
        - `id`: `string` — { type: 'string' }
        - `kind`: `MembershipPurchaseKind` — { enum: MembershipPurchaseKind }
        - `status`: `MembershipPurchaseStatus` — { enum: MembershipPurchaseStatus, description: 'PENDING until the verified payment arrives; only COMPLETED purchases have extended the membe
        - `plan`: `PlanResDto | null` — { type: PlanResDto, nullable: true }
        - `amountVnd`: `string` — { type: 'string', example: '99000' }
        - `durationDays`: `number` — { example: 30 }
        - `periodStartsAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
        - `periodEndsAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
        - `grantedByUserId`: `string | null` — { type: 'string', nullable: true, description: 'Admin who granted it (ADMIN_GRANT only).', }
        - `createdAt`: `string` — { format: 'date-time' }
        - `completedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `paymentUrl`: `string | null` — { type: String, nullable: true, description: 'VNPay checkout URL to redirect the user to. Null for 0 VND purchases, ' + 'or for an idempoten
    - `orderId`: `string | null` — { nullable: true, type: 'string', description: 'Payment order id for VNPay purchases.', }
    - `txnRef`: `string | null` — { type: String, nullable: true, description: 'VNPay merchant transaction reference for polling.', example: 'TW260712103000A1B2C3D4', }
    - `amountVnd`: `number | null` — { type: Number, nullable: true, example: 99_000, description: 'Amount charged by VNPay, in VND.', }
    - `expiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'When the VNPay checkout URL expires.', }
- Lỗi/Status: `400: PLAN_INACTIVE | PAYMENT_IDEMPOTENCY_KEY_REQUIRED | PAYMENT_IDEMPOTENCY_KEY_INVALID | PAYMENT_AMOUNT_OUT_OF_RANGE` | `409: MEMBERSHIP_FREE_ALREADY_CLAIMED | PAYMENT_IDEMPOTENCY_KEY_REUSED | PAYMENT_TOO_MANY_PENDING_ORDERS | FINANCE_POLICY_NOT_CONFIGURED` | `503: PAYMENT_GATEWAY_UNAVAILABLE`

### WebAdminMembershipController  `/web/admin/membership`  — `src/modules/membership/controllers/web.admin.membership.controller.ts`

#### `POST /api/v1/web/admin/membership/plans`
Create a membership plan
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.MembershipPlansManage)`
- Body: `CreatePlanReqDto`
    - `code`: `string` — IsString, IsNotEmpty, MaxLength, Matches — { example: 'monthly', maxLength: 40 }
    - `name`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'Gói 1 tháng', maxLength: 100 }
    - `description?`: `string | undefined` — IsOptional, IsString, MaxLength — { maxLength: 255 }
    - `durationDays`: `number` — IsInt, Min, Max — { example: 30, description: 'Duration in days (1-36500). Required; plans never last forever.', }
    - `price`: `number` — IsInt, Min — { example: 99000, description: 'Price in VND. Use 0 for no-charge; positive values must fit VNPay.', }
    - `isActive?`: `boolean | undefined` — IsOptional, IsBoolean — { example: true }
    - `sortOrder?`: `number | undefined` — IsOptional, IsInt, Min — { example: 0 }
    - `upgradedRoleId?`: `string | undefined` — IsOptional, IsString, Matches — { example: '3', description: 'RBAC role granted to holders while this plan is active; all active plans must grant the same role', }
- Response: `ApiEnvelopeResponse(PlanResDto)` · `Promise<PlanResDto>`
    - `id`: `string` — { type: 'string' }
    - `code`: `string` — { example: 'monthly' }
    - `name`: `string` — { example: 'Gói 1 tháng' }
    - `description`: `string | null` — { type: String, nullable: true }
    - `durationDays`: `number` — { example: 30 }
    - `price`: `number` — { example: 99000 }
    - `isFree`: `boolean` — { example: false, deprecated: true, description: 'Compatibility field for existing clients. Derived from price === 0.', }
    - `freeOncePerUser`: `boolean` — { example: false, description: '0 VND plans can be claimed once per user lifetime; after claiming, every 0 VND plan is hidden from GET plans
    - `isActive`: `boolean` — { example: true }
    - `sortOrder`: `number` — { example: 0 }
    - `upgradedRoleId`: `string | null` — { type: String, nullable: true, example: '3', description: 'RBAC role granted while this plan is active; null = no upgrade', }
- Lỗi/Status: `400: MEMBERSHIP_PLAN_ROLE_INCONSISTENT (all active plans must grant the same role)`

#### `GET /api/v1/web/admin/membership/plans`
List all plans (including inactive)
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.MembershipRead)`
- Response: `Promise<PlanResDto[]>`
    - `id`: `string` — { type: 'string' }
    - `code`: `string` — { example: 'monthly' }
    - `name`: `string` — { example: 'Gói 1 tháng' }
    - `description`: `string | null` — { type: String, nullable: true }
    - `durationDays`: `number` — { example: 30 }
    - `price`: `number` — { example: 99000 }
    - `isFree`: `boolean` — { example: false, deprecated: true, description: 'Compatibility field for existing clients. Derived from price === 0.', }
    - `freeOncePerUser`: `boolean` — { example: false, description: '0 VND plans can be claimed once per user lifetime; after claiming, every 0 VND plan is hidden from GET plans
    - `isActive`: `boolean` — { example: true }
    - `sortOrder`: `number` — { example: 0 }
    - `upgradedRoleId`: `string | null` — { type: String, nullable: true, example: '3', description: 'RBAC role granted while this plan is active; null = no upgrade', }

#### `GET /api/v1/web/admin/membership/plans/:id`
Get a membership plan
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.MembershipRead)`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(PlanResDto)` · `Promise<PlanResDto>`
    - `id`: `string` — { type: 'string' }
    - `code`: `string` — { example: 'monthly' }
    - `name`: `string` — { example: 'Gói 1 tháng' }
    - `description`: `string | null` — { type: String, nullable: true }
    - `durationDays`: `number` — { example: 30 }
    - `price`: `number` — { example: 99000 }
    - `isFree`: `boolean` — { example: false, deprecated: true, description: 'Compatibility field for existing clients. Derived from price === 0.', }
    - `freeOncePerUser`: `boolean` — { example: false, description: '0 VND plans can be claimed once per user lifetime; after claiming, every 0 VND plan is hidden from GET plans
    - `isActive`: `boolean` — { example: true }
    - `sortOrder`: `number` — { example: 0 }
    - `upgradedRoleId`: `string | null` — { type: String, nullable: true, example: '3', description: 'RBAC role granted while this plan is active; null = no upgrade', }

#### `PATCH /api/v1/web/admin/membership/plans/:id`
Update a membership plan
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.MembershipPlansManage)`
- Path `id`: `string`
- Body: `UpdatePlanReqDto`
    - `name?`: `string | undefined` — IsOptional, IsString, IsNotEmpty, MaxLength — { maxLength: 100 }
    - `description?`: `string | undefined` — IsOptional, IsString, MaxLength — { maxLength: 255 }
    - `durationDays?`: `number | undefined` — ValidateIf, IsInt, Min, Max — { example: 30, description: 'Duration in days (1-36500). Omit to keep; null is rejected.', }
    - `price?`: `number | undefined` — IsOptional, IsInt, Min — { example: 99000, description: 'Price in VND. Use 0 for no-charge; positive values must fit VNPay.', }
    - `isActive?`: `boolean | undefined` — IsOptional, IsBoolean
    - `sortOrder?`: `number | undefined` — IsOptional, IsInt, Min — { example: 0 }
    - `upgradedRoleId?`: `string | null | undefined` — IsOptional, ValidateIf, IsString, Matches — { type: String, nullable: true, example: '3', description: 'RBAC role granted while active; pass null to unlink (no upgrade). All active pla
- Response: `ApiEnvelopeResponse(PlanResDto)` · `Promise<PlanResDto>`
    - `id`: `string` — { type: 'string' }
    - `code`: `string` — { example: 'monthly' }
    - `name`: `string` — { example: 'Gói 1 tháng' }
    - `description`: `string | null` — { type: String, nullable: true }
    - `durationDays`: `number` — { example: 30 }
    - `price`: `number` — { example: 99000 }
    - `isFree`: `boolean` — { example: false, deprecated: true, description: 'Compatibility field for existing clients. Derived from price === 0.', }
    - `freeOncePerUser`: `boolean` — { example: false, description: '0 VND plans can be claimed once per user lifetime; after claiming, every 0 VND plan is hidden from GET plans
    - `isActive`: `boolean` — { example: true }
    - `sortOrder`: `number` — { example: 0 }
    - `upgradedRoleId`: `string | null` — { type: String, nullable: true, example: '3', description: 'RBAC role granted while this plan is active; null = no upgrade', }
- Lỗi/Status: `400: MEMBERSHIP_PLAN_ROLE_INCONSISTENT (all active plans must grant the same role)`

#### `DELETE /api/v1/web/admin/membership/plans/:id`
Delete a plan (blocked if referenced)
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.MembershipPlansManage)`
- Path `id`: `string`
- Response: `ApiOkResponse({
    description: 'The id of the deleted plan.',
    schema)` · `Promise<{ id: string; }>`

#### `POST /api/v1/web/admin/membership/grants`
Grant a membership to a user directly
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.MembershipGrantsManage)`
- Body: `GrantMembershipReqDto`
    - `userId`: `string` — IsBigIntId — { type: 'string', example: '10' }
    - `planId`: `string` — IsBigIntId — { type: 'string', example: '2' }
    - `durationDays?`: `number | undefined` — IsOptional, IsInt, Min, Max — { example: 90, description: 'Override plan duration (days); omit to use the plan default', }
- Response: `ApiEnvelopeResponse(UserMembershipResDto)` · `Promise<UserMembershipResDto>`
    - `id`: `string` — { type: 'string' }
    - `userId`: `string` — { type: 'string' }
    - `status`: `MembershipStatus` — { enum: MembershipStatus, description: "Stored label. 'active' only grants access while expiresAt is still in the future.", }
    - `startsAt`: `string` — { format: 'date-time', description: 'Start of the current uninterrupted coverage.', }
    - `expiresAt`: `string` — { format: 'date-time' }
    - `plan`: `PlanResDto | null` — { type: PlanResDto, nullable: true, description: 'Plan of the latest grant; it determines the granted role.', }
- Lỗi/Status: `404: USER_NOT_FOUND, or RESOURCE_NOT_FOUND (MEMBERSHIP_PLAN)`

#### `GET /api/v1/web/admin/membership/users/:userId/memberships`
Get a user's membership and purchase history
- Điều kiện: `HttpCode(HttpStatus.OK)` · `RequirePermissions(PERMISSION_KEYS.MembershipRead)`
- Path `userId`: `string`
- Response: `ApiEnvelopeResponse(AdminUserMembershipsResDto)` · `Promise<AdminUserMembershipsResDto>`
    - `membership`: `UserMembershipResDto | null` — { type: UserMembershipResDto, nullable: true }
    - `purchases`: `MembershipPurchaseResDto[]` — { type: [MembershipPurchaseResDto], description: 'Newest first, capped at 100.', }

### WebMembershipController  `/web/membership`  — `src/modules/membership/controllers/web.membership.controller.ts`

#### `GET /api/v1/web/membership/plans`
List active membership plans available to buy
- Điều kiện: `Authenticated` · `RateLimit(MEMBERSHIP_READ_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Response: `Promise<PlanResDto[]>`
    - `id`: `string` — { type: 'string' }
    - `code`: `string` — { example: 'monthly' }
    - `name`: `string` — { example: 'Gói 1 tháng' }
    - `description`: `string | null` — { type: String, nullable: true }
    - `durationDays`: `number` — { example: 30 }
    - `price`: `number` — { example: 99000 }
    - `isFree`: `boolean` — { example: false, deprecated: true, description: 'Compatibility field for existing clients. Derived from price === 0.', }
    - `freeOncePerUser`: `boolean` — { example: false, description: '0 VND plans can be claimed once per user lifetime; after claiming, every 0 VND plan is hidden from GET plans
    - `isActive`: `boolean` — { example: true }
    - `sortOrder`: `number` — { example: 0 }
    - `upgradedRoleId`: `string | null` — { type: String, nullable: true, example: '3', description: 'RBAC role granted while this plan is active; null = no upgrade', }

#### `GET /api/v1/web/membership/me`
My membership status
- Điều kiện: `Authenticated` · `RateLimit(MEMBERSHIP_READ_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(MyMembershipResDto)` · `Promise<MyMembershipResDto>`
    - `active`: `boolean` — { description: 'True while expiresAt is in the future. False when the user never had a membership or it has expired.', }
    - `startsAt`: `string | null` — { type: 'string', format: 'date-time', nullable: true, description: 'Start of the current uninterrupted coverage. Null when the user never h
    - `expiresAt`: `string | null` — { type: 'string', format: 'date-time', nullable: true, description: 'When coverage ends (every purchase extends it). Null when the user neve

#### `GET /api/v1/web/membership/me/history`
My membership purchase history
- Điều kiện: `Authenticated` · `RateLimit(MEMBERSHIP_READ_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(MembershipPurchaseHistoryItemResDto, 'Completed purchases, newest first. An empty history is 200 )` · `Promise<CursorPaginatedResponse<MembershipPurchaseHistoryItemResDto>>`
    - `data`: `MembershipPurchaseHistoryItemResDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `400: CURSOR_INVALID | VALIDATION_FAILED (limit 1-50)`

#### `POST /api/v1/web/membership/me/checkout`
Acquire a plan. 0 VND plans activate instantly; paid plans return a signed VNPay checkout URL.
- Điều kiện: `Authenticated` · `RateLimit(MEMBERSHIP_CHECKOUT_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Body: `PurchaseMembershipReqDto`
    - `planId`: `string` — IsBigIntId — { type: 'string', example: '2', description: 'Plan id (BIGINT as string)', }
    - `bankCode?`: `"VNPAYQR" | "VNBANK" | "INTCARD" | undefined` — IsOptional, IsIn — { description: 'Pre-select a payment method on VNPay.', enum: VNPAY_BANK_CODES, }
    - `locale?`: `"vn" | "en" | undefined` — IsOptional, IsIn — { description: 'Language of the VNPay checkout page.', enum: ['vn', 'en'], default: 'vn', }
- Ip: `string`
- Header `idempotency-key` (optional): `string`
- Response: `ApiEnvelopeResponse(PurchaseMembershipResDto)` · `Promise<PurchaseMembershipResDto>`
    - `purchase`: `MembershipPurchaseResDto` — { type: MembershipPurchaseResDto, description: 'The purchase row of this checkout: PENDING for a paid plan until the payment is confirmed, C
      - **MembershipPurchaseResDto**
        - `id`: `string` — { type: 'string' }
        - `kind`: `MembershipPurchaseKind` — { enum: MembershipPurchaseKind }
        - `status`: `MembershipPurchaseStatus` — { enum: MembershipPurchaseStatus, description: 'PENDING until the verified payment arrives; only COMPLETED purchases have extended the membe
        - `plan`: `PlanResDto | null` — { type: PlanResDto, nullable: true }
        - `amountVnd`: `string` — { type: 'string', example: '99000' }
        - `durationDays`: `number` — { example: 30 }
        - `periodStartsAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
        - `periodEndsAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
        - `grantedByUserId`: `string | null` — { type: 'string', nullable: true, description: 'Admin who granted it (ADMIN_GRANT only).', }
        - `createdAt`: `string` — { format: 'date-time' }
        - `completedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `paymentUrl`: `string | null` — { type: String, nullable: true, description: 'VNPay checkout URL to redirect the user to. Null for 0 VND purchases, ' + 'or for an idempoten
    - `orderId`: `string | null` — { nullable: true, type: 'string', description: 'Payment order id for VNPay purchases.', }
    - `txnRef`: `string | null` — { type: String, nullable: true, description: 'VNPay merchant transaction reference for polling.', example: 'TW260712103000A1B2C3D4', }
    - `amountVnd`: `number | null` — { type: Number, nullable: true, example: 99_000, description: 'Amount charged by VNPay, in VND.', }
    - `expiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'When the VNPay checkout URL expires.', }
- Lỗi/Status: `400: PLAN_INACTIVE | PAYMENT_IDEMPOTENCY_KEY_REQUIRED | PAYMENT_IDEMPOTENCY_KEY_INVALID | PAYMENT_AMOUNT_OUT_OF_RANGE` | `409: MEMBERSHIP_FREE_ALREADY_CLAIMED | PAYMENT_IDEMPOTENCY_KEY_REUSED | PAYMENT_TOO_MANY_PENDING_ORDERS | FINANCE_POLICY_NOT_CONFIGURED` | `503: PAYMENT_GATEWAY_UNAVAILABLE`

## Module `voucher`

### MobileVoucherController  `/mobile/vouchers`  — `src/modules/voucher/controllers/mobile.voucher.controller.ts`

#### `POST /api/v1/mobile/vouchers/my/:publicId/redemption-authorization`
Request Smart OTP to use a voucher
- Điều kiện: `HttpCode(HttpStatus.OK)` · `Authenticated` · `RateLimit({ userPerMin: 5 })`
- Path `publicId`: `string`
- Response: `ApiEnvelopeResponse(SmartOtpRequestResDto, 'Voucher Smart OTP request.')` · `Promise<SmartOtpRequestResDto>`
    - `requestId`: `string`
    - `purpose`: `SmartOtpPurpose` — { enum: SmartOtpPurpose }
    - `subjectType`: `SmartOtpSubjectType` — { enum: SmartOtpSubjectType }
    - `subjectId`: `string`
    - `status`: `SmartOtpRequestStatus` — { enum: SmartOtpRequestStatus }
    - `referenceCode`: `string | null` — { type: String, nullable: true }
    - `statusReason`: `string | null` — { type: String, nullable: true }
    - `displayContext`: `Record<string, unknown>` — { type: 'object', additionalProperties: true }
    - `expiresAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/mobile/vouchers/my/:publicId/redemption-token`
Create a short-lived voucher redemption token
- Điều kiện: `RequireSmartOtpProof({ purpose: SmartOtpPurpose.VoucherRevealRedeemCode, subjectT)` · `HttpCode(HttpStatus.OK)` · `Authenticated` · `RateLimit({ userPerMin: 5 })`
- Path `publicId`: `string`
- Body: `CreateVoucherRedemptionTokenDto`
    - `smartOtp`: `SmartOtpProofDto` — IsDefined — { type: SmartOtpProofDto }
      - **SmartOtpProofDto**
        - `requestId`: `string` — IsString, IsNotEmpty, IsBigIntId — { example: '1234' }
        - `code`: `string` — Matches — { example: '147258', pattern: '^\\d{6}$' }
- Response: `ApiEnvelopeResponse(VoucherRedemptionTokenResponseDto, 'Short-lived redemption token.')` · `Promise<VoucherRedemptionTokenResponseDto>`
    - `token`: `string` — { example: 'K7W3B9QH', description: 'Eight-character uppercase token. Display it only as a QR or for manual entry.', }
    - `expiresAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/mobile/vouchers/merchant/redemptions/preview`
Preview a voucher redemption token
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `HttpCode(HttpStatus.OK)` · `Authenticated` · `RateLimit({ ipPerMin: 30, userPerMin: 20 })`
- Body: `PreviewVoucherRedemptionDto`
    - `token`: `string` — IsString, IsNotEmpty, MinLength, MaxLength, Matches — { example: 'K7W3B9QH', description: '120-second token from the voucher owner QR or manual entry.', }
- Response: `ApiEnvelopeResponse(VoucherRedemptionPreviewResponseDto, 'Voucher redemption preview.')` · `Promise<VoucherRedemptionPreviewResponseDto>`
    - `voucherId`: `string` — { type: 'string', example: '5386', description: 'Persist with challengeId and the confirmation idempotency key for recovery.', }
    - `challengeId`: `string` — { type: 'string', example: '901' }
    - `expiresAt`: `string` — { format: 'date-time' }
    - `productName`: `string` — { example: 'Coffee 50k voucher' }
    - `amount`: `string` — { example: '50000.00' }
    - `currency`: `string` — { example: 'VND' }
    - `voucherExpiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `owner`: `VoucherRedemptionOwnerDto` — { type: VoucherRedemptionOwnerDto, description: 'The voucher owner who is presenting this voucher.', }
      - **VoucherRedemptionOwnerDto**
        - `id`: `string` — { type: 'string', example: '1024' }
        - `displayName`: `string | null` — { type: String, nullable: true, example: 'Nguyen Van A', }
        - `avatarUrl`: `string | null` — { type: String, nullable: true, example: 'https://cdn.example.com/avatar.jpg', }
- Lỗi/Status: `409: VOUCHER_REDEMPTION_CHALLENGE_EXPIRED | VOUCHER_REDEMPTION_CHALLENGE_USED | VOUCHER_REDEMPTION_CHALLENGE_REVOKED | VOUCHER_NOT_REDEEMABLE | VOUCHER_NOT_ACTIVE | VOUCHER_REDEMPTION_VOUCHER_EXPIRED | VOUCHER_ALREADY_REDEEME`

#### `POST /api/v1/mobile/vouchers/merchant/redemptions/:challengeId/confirm`
Confirm a voucher redemption preview
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `HttpCode(HttpStatus.OK)` · `Authenticated`
- Path `challengeId`: `string`
- Header `idempotency-key`: `string | undefined`
- Response: `ApiEnvelopeResponse(VoucherRedemptionResponseDto, 'Confirmed voucher redemption.')` · `Promise<VoucherRedemptionResponseDto>`
    - `redemptionId`: `string` — { type: 'string', example: '901' }
    - `voucherId`: `string` — { type: 'string', example: '5386' }
    - `status`: `"CONFIRMED"` — { enum: ['CONFIRMED'], example: 'CONFIRMED' }
    - `amount`: `string` — { example: '50000.00' }
    - `currency`: `string` — { example: 'VND' }
    - `redeemedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `409: Exact reason in `code` + `metadata`: VOUCHER_REDEMPTION_NOT_YET_VALID | VOUCHER_REDEMPTION_VOUCHER_EXPIRED | VOUCHER_ALREADY_REDEEMED | VOUCHER_NOT_ACTIVE | VOUCHER_REDEMPTION_CHALLENGE_EXPIRED | VOUCHER_REDEMPTION_CHALL`

#### `GET /api/v1/mobile/vouchers/merchant/categories`
List active voucher categories for merchant package creation
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `Authenticated`
- Response: `Promise<MerchantVoucherCategoryResponseDto[]>`
    - `id`: `string` — { type: String, example: '3', description: 'Active voucher category ID to send as categoryId when creating a package.', }
    - `nameVi`: `string` — { example: 'Ăn uống' }
    - `nameEn`: `string | null` — { type: String, nullable: true, example: 'Dining' }

#### `GET /api/v1/mobile/vouchers/merchant/redemptions/:challengeId`
Recover a merchant redemption after an interrupted confirmation
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `Authenticated`
- Path `challengeId`: `string`
- Response: `ApiEnvelopeResponse(VoucherRedemptionStatusResponseDto)` · `Promise<VoucherRedemptionStatusResponseDto>`
    - `challengeId`: `string` — { type: String, example: '901' }
    - `voucherId`: `string` — { type: String, example: '5386' }
    - `status`: `"CONFIRMED" | "PENDING" | "USED" | "EXPIRED" | "REVOKED"` — { enum: ['PENDING', 'CONFIRMED', 'USED', 'EXPIRED', 'REVOKED'], description: 'CONFIRMED remains available after QR expiry. USED means consum
    - `voucherStatus`: `string` — { type: String, description: 'Current voucher lifecycle status.', }
    - `expiresAt`: `string` — { format: 'date-time' }
    - `previewed`: `boolean` — { description: 'Whether this Merchant has previewed the challenge. A pending challenge is not a guarantee that confirmation will succeed.', 
    - `redemption`: `VoucherRedemptionResponseDto | null` — { type: VoucherRedemptionResponseDto, nullable: true }
- Lỗi/Status: `404: RESOURCE_NOT_FOUND: challenge or voucher is absent or belongs to another Merchant.`

#### `POST /api/v1/mobile/vouchers/merchant/voucher-packages`
Create a merchant voucher package in inventory
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `HttpCode(HttpStatus.OK)` · `Authenticated` · `RateLimit({ ipPerMin: 10, userPerMin: 2 })`
- Body: `CreateMerchantVoucherPackageDto`
    - `packageName`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'Vinamilk October voucher package', maxLength: 255, description: 'Merchant-visible package/campaign name that groups products.', 
    - `packageCode?`: `string | null | undefined` — IsOptional, IsString, MaxLength, Matches — { type: String, nullable: true, example: 'VINAMILK-2026-10', maxLength: 80, description: 'Optional merchant-visible package code unique per 
    - `description?`: `string | null | undefined` — IsOptional, IsString, MaxLength — { type: String, nullable: true, example: 'Milk, cake, and candy voucher products for October.', maxLength: 5000, }
    - `products`: `CreateMerchantVoucherPackageProductDto[]` — IsArray, ArrayMinSize, ArrayMaxSize — { type: [CreateMerchantVoucherPackageProductDto], minItems: 1, maxItems: MAX_MERCHANT_VOUCHER_PACKAGE_PRODUCTS, }
- Response: `ApiEnvelopeResponse(MerchantVoucherPackageResponseDto, 'The created merchant voucher package.')` · `Promise<MerchantVoucherPackageResponseDto>`
    - `id`: `string` — { type: 'string', example: '12' }
    - `publicId`: `string` — { type: 'string', format: 'uuid', example: '911bdd07-88c5-46c4-a66c-8c912958a5ab', }
    - `issuerId`: `string` — { type: 'string', example: '7' }
    - `merchantUserId`: `string` — { type: 'string', example: '19' }
    - `createdByUserId`: `string` — { type: 'string', example: '19' }
    - `packageCode`: `string | null` — { type: String, nullable: true, example: 'VINAMILK-2026-10', }
    - `packageName`: `string` — { example: 'Vinamilk October voucher package' }
    - `slug`: `string` — { example: 'vinamilk-2026-10' }
    - `description`: `string | null` — { type: String, nullable: true }
    - `status`: `VoucherPackageStatus` — { enum: ['DRAFT', 'ACTIVE', 'INACTIVE'] }
    - `reviewStatus`: `VoucherPackageReviewStatus` — { enum: ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'], }
    - `rejectionReason`: `string | null` — { type: String, nullable: true, example: 'RULE_01_CONTENT_REASONABLENESS: Contains threatening, hateful, or discriminatory language at produ
    - `totalProducts`: `number` — { example: 3 }
    - `totalRequestedQuantity`: `number` — { example: 450 }
    - `totalMintedQuantity`: `number` — { example: 450 }
    - `metadata`: `VoucherPackageMetadata` — { example: { inventoryMode: 'PACKAGE_PRODUCTS' } }
    - `products`: `MerchantVoucherPackageProductResponseDto[]` — { type: [MerchantVoucherPackageProductResponseDto] }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `403: VOUCHER_MERCHANT_ROLE_REQUIRED` | `404: VOUCHER_CATEGORY_NOT_FOUND` | `400: VOUCHER_PRODUCT_INVALID_ECONOMICS | VOUCHER_MERCHANT_TAX_CODE_REQUIRED | VOUCHER_MERCHANT_TAX_CODE_INVALID` | `409: VOUCHER_MERCHANT_ISSUER_NOT_READY | VOUCHER_ISSUER_NOT_ACTIVE | VOUCHER_CATEGORY_INACTIVE | VOUCHER_PACKAGE_CODE_CONFLICT | VOUCHER_PACKAGE_SLUG_CONFLICT | VOUCHER_PRODUCT_SLUG_CONFLICT | VOUCHER_PRODUCT_PUBLIC_CODE_CONF`

#### `POST /api/v1/mobile/vouchers/merchant/voucher-products/:productId/clone`
Clone a published merchant voucher product
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `HttpCode(HttpStatus.OK)` · `Authenticated`
- Path `productId`: `string`
- Body: `CloneMerchantVoucherProductDto`
    - `name?`: `string | undefined` — IsOptional, IsString, MaxLength — { example: 'Coffee 50K v2', maxLength: 255 }
    - `title?`: `string | undefined` — IsOptional, IsString, MaxLength — { example: 'Coffee 50K v2', maxLength: 255 }
    - `slug?`: `string | undefined` — IsOptional, IsString, MaxLength, Matches — { example: 'coffee-50k-v2', maxLength: 120 }
    - `affiliateShareBps?`: `number | undefined` — IsOptional, IsInt, Min, Max — { minimum: 0, maximum: 5000, example: 500, description: "Basis points of the gross sale price paid by the seller to the buyer's referrer. 50
- Response: `ApiEnvelopeResponse(MerchantVoucherPackageProductResponseDto, 'The new draft voucher product.')` · `Promise<MerchantVoucherPackageProductResponseDto>`
    - `id`: `string` — { type: 'string', example: '88' }
    - `publicId`: `string` — { type: 'string', format: 'uuid', example: 'e35f9df6-b63a-4ff1-b54e-6718a76330e0', }
    - `packageId`: `string` — { type: 'string', example: '12' }
    - `issuerId`: `string` — { type: 'string', example: '7' }
    - `merchantUserId`: `string` — { type: 'string', example: '19' }
    - `categoryId`: `string` — { type: 'string', example: '3' }
    - `categoryName`: `string | null` — { type: String, nullable: true, example: 'Food and beverage', }
    - `title`: `string` — { example: 'Vinamilk milk voucher' }
    - `slug`: `string` — { example: 'vinamilk-milk-voucher' }
    - `subtitle`: `string | null` — { type: String, nullable: true }
    - `description`: `string | null` — { type: String, nullable: true }
    - `termsAndConditions`: `string | null` — { type: String, nullable: true }
    - `usageInstructions`: `string | null` — { type: String, nullable: true }
    - `thumbnailUrl`: `string | null` — { type: String, nullable: true }
    - `bannerUrl`: `string | null` — { type: String, nullable: true }
    - `voucherType`: `VoucherProductType` — { enum: ['DISCOUNT_AMOUNT', 'DISCOUNT_PERCENT'] }
    - `discount`: `VoucherProductDiscount` — { example: { percentage: 20, maxAmount: 80000 } }
    - `faceValue`: `number` — { example: 80000 }
    - `salePrice`: `number` — { example: 1000 }
    - `currency`: `string` — { example: 'VND' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points of the gross sale price paid by the seller to the buyer's referrer. 50
    - `isTransferable`: `boolean` — { example: true }
    - `maxSupply`: `number` — { example: 200 }
    - `issuedCount`: `number` — { example: 0 }
    - `remainingSupply`: `number` — { example: 200 }
    - `validFrom`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `validUntil`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `purchaseStartsAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `purchaseEndsAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `perUserLimit`: `number` — { example: 1 }
    - `publicCode`: `string | null` — { type: String, nullable: true, example: 'MILK20' }
    - `status`: `VoucherProductStatus` — { enum: ['DRAFT', 'ACTIVE', 'INACTIVE'] }
    - `reviewStatus`: `VoucherProductReviewStatus` — { enum: ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'], }
    - `rejectionReason`: `string | null` — { type: String, nullable: true, example: 'RULE_01_CONTENT_REASONABLENESS: Contains threatening, hateful, or discriminatory language at produ
    - `publicationStatus`: `VoucherProductPublicationStatus` — { enum: ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'] }
    - `metadata`: `VoucherProductMetadata` — { example: { inventoryMode: 'PACKAGE_PRODUCT' } }
- Lỗi/Status: `404: VOUCHER_PRODUCT_NOT_FOUND` | `409: VOUCHER_MERCHANT_ISSUER_NOT_READY | VOUCHER_ISSUER_NOT_ACTIVE` | `409: VOUCHER_PRODUCT_NOT_PUBLISHED` | `400: VOUCHER_MERCHANT_TAX_CODE_REQUIRED | VOUCHER_MERCHANT_TAX_CODE_INVALID`

#### `GET /api/v1/mobile/vouchers/merchant/voucher-packages`
List merchant voucher packages in inventory
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `Authenticated`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(MerchantVoucherPackageResponseDto, 'Merchant voucher packages, newest first.')` · `Promise<CursorPaginatedResponse<MerchantVoucherPackageResponseDto>>`
    - `data`: `MerchantVoucherPackageResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `403: VOUCHER_MERCHANT_ROLE_REQUIRED` | `409: VOUCHER_ISSUER_NOT_ACTIVE`

#### `GET /api/v1/mobile/vouchers/merchant/voucher-packages/:id`
Get a merchant voucher package from inventory
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `Authenticated`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(MerchantVoucherPackageResponseDto, 'The merchant voucher package.')` · `Promise<MerchantVoucherPackageResponseDto>`
    - `id`: `string` — { type: 'string', example: '12' }
    - `publicId`: `string` — { type: 'string', format: 'uuid', example: '911bdd07-88c5-46c4-a66c-8c912958a5ab', }
    - `issuerId`: `string` — { type: 'string', example: '7' }
    - `merchantUserId`: `string` — { type: 'string', example: '19' }
    - `createdByUserId`: `string` — { type: 'string', example: '19' }
    - `packageCode`: `string | null` — { type: String, nullable: true, example: 'VINAMILK-2026-10', }
    - `packageName`: `string` — { example: 'Vinamilk October voucher package' }
    - `slug`: `string` — { example: 'vinamilk-2026-10' }
    - `description`: `string | null` — { type: String, nullable: true }
    - `status`: `VoucherPackageStatus` — { enum: ['DRAFT', 'ACTIVE', 'INACTIVE'] }
    - `reviewStatus`: `VoucherPackageReviewStatus` — { enum: ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'], }
    - `rejectionReason`: `string | null` — { type: String, nullable: true, example: 'RULE_01_CONTENT_REASONABLENESS: Contains threatening, hateful, or discriminatory language at produ
    - `totalProducts`: `number` — { example: 3 }
    - `totalRequestedQuantity`: `number` — { example: 450 }
    - `totalMintedQuantity`: `number` — { example: 450 }
    - `metadata`: `VoucherPackageMetadata` — { example: { inventoryMode: 'PACKAGE_PRODUCTS' } }
    - `products`: `MerchantVoucherPackageProductResponseDto[]` — { type: [MerchantVoucherPackageProductResponseDto] }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `403: VOUCHER_MERCHANT_ROLE_REQUIRED` | `404: VOUCHER_PACKAGE_NOT_FOUND` | `409: VOUCHER_MERCHANT_ISSUER_NOT_READY | VOUCHER_ISSUER_NOT_ACTIVE`

#### `GET /api/v1/mobile/vouchers/merchant/voucher-products/:productId/vouchers`
List voucher instances under a merchant voucher product
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `Authenticated`
- Path `productId`: `string`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(MerchantVoucherResponseDto, 'Voucher instances for the merchant voucher product, newest )` · `Promise<CursorPaginatedResponse<MerchantVoucherResponseDto>>`
    - `data`: `MerchantVoucherResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `403: VOUCHER_MERCHANT_ROLE_REQUIRED` | `404: VOUCHER_PRODUCT_NOT_FOUND` | `409: VOUCHER_MERCHANT_ISSUER_NOT_READY | VOUCHER_ISSUER_NOT_ACTIVE`

#### `GET /api/v1/mobile/vouchers/merchant/vouchers/:id`
Get a merchant voucher instance
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `Authenticated`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(MerchantVoucherResponseDto, 'The merchant voucher instance.')` · `Promise<MerchantVoucherResponseDto>`
    - `id`: `string` — { type: 'string', example: '5386' }
    - `publicId`: `string` — { type: 'string', format: 'uuid', example: '1b8f8b37-1bbd-46a4-b91e-62fd83a8b2a7', description: 'Unguesable voucher instance identifier. Pre
    - `productId`: `string` — { type: 'string', example: '88' }
    - `packageId`: `string | null` — { nullable: true, type: 'string', example: '12' }
    - `issuerId`: `string` — { type: 'string', example: '7' }
    - `merchantUserId`: `string | null` — { nullable: true, type: 'string', example: '19' }
    - `ownerId`: `string | null` — { nullable: true, type: 'string', example: '4' }
    - `productTitle`: `string | null` — { type: String, nullable: true, example: 'Vinamilk milk voucher', description: 'Source voucher product title.', }
    - `serialNo`: `string` — { example: 'VC-2026-88-000010' }
    - `codeLast4`: `string | null` — { type: String, nullable: true, example: '8024', description: 'Last 4 characters only. The full code/hash is never returned by merchant inve
    - `faceValue`: `number` — { example: 80000 }
    - `currency`: `string | null` — { type: String, nullable: true, example: 'VND' }
    - `status`: `string` — { enum: VOUCHER_STATUS_VALUES, enumName: 'VoucherStatus', example: 'ISSUED', }
    - `expiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `redeemedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `lockedByCommitmentId`: `string | null` — { nullable: true, type: 'string', example: null }
    - `version`: `number` — { example: 0, description: 'Optimistic version counter bumped on voucher mutation.', }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `403: VOUCHER_MERCHANT_ROLE_REQUIRED` | `404: VOUCHER_NOT_FOUND` | `409: VOUCHER_MERCHANT_ISSUER_NOT_READY | VOUCHER_ISSUER_NOT_ACTIVE`

#### `GET /api/v1/mobile/vouchers/my`
List my vouchers
- Điều kiện: `Authenticated`
- Query: `MyVoucherQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned in `meta.nextCursor` of the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20, example: 20, description: 'Page size. Values above 50 are rejected with 400.', }
    - `status?`: `VoucherStatus | undefined` — IsOptional, IsIn — { enum: MY_VOUCHER_STATUSES, enumName: 'VoucherStatus', example: 'ACTIVE', description: 'Filter by voucher status. Omit to return every vouc
    - `q?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Case-insensitive partial match on the product name or the issuer name.', example: 'Voucher A', }
- Response: `ApiEnvelopeCursorResponse(MyVoucherResponseDto, 'Vouchers owned by the current user, newest first.')` · `Promise<CursorPaginatedResponse<MyVoucherResponseDto>>`
    - `data`: `MyVoucherResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/mobile/vouchers/purchase-history`
List my voucher purchases
- Điều kiện: `Authenticated`
- Query: `VoucherPurchaseHistoryQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned in `meta.nextCursor` of the previous page. Omit for the first page. A malformed cursor is rejected wi
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20, example: 20, description: 'Page size. Values above 50 are rejected with 400.', }
    - `status?`: `VoucherStatus | undefined` — IsOptional, IsIn — { enum: PURCHASE_HISTORY_STATUSES, enumName: 'VoucherPurchaseHistoryStatus', example: 'ACTIVE', description: 'Filter by the CURRENT status o
    - `q?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Case-insensitive partial match on the product name or the issuer name.', example: 'Voucher A', }
    - `purchasedFrom?`: `string | undefined` — IsOptional, IsISO8601 — { format: 'date-time', example: '2026-06-01T00:00:00.000Z', description: 'Purchased on or after this timestamp (inclusive). No default — omi
    - `purchasedTo?`: `string | undefined` — IsOptional, IsISO8601 — { format: 'date-time', example: '2026-07-31T23:59:59.999Z', description: 'Purchased on or before this timestamp (inclusive). When BOTH bound
    - `expiresFrom?`: `string | undefined` — IsOptional, IsISO8601 — { format: 'date-time', example: '2026-01-01T00:00:00.000Z', description: 'Voucher expires on or after this timestamp.', }
    - `expiresTo?`: `string | undefined` — IsOptional, IsISO8601 — { format: 'date-time', example: '2026-12-31T23:59:59.000Z', description: 'Voucher expires on or before this timestamp.', }
- Response: `ApiEnvelopeCursorResponse(VoucherPurchaseHistoryItemDto, 'Voucher purchase history, newest purchase first.')` · `Promise<CursorPaginatedResponse<VoucherPurchaseHistoryItemDto>>`
    - `data`: `VoucherPurchaseHistoryItemDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `400: VOUCHER_HISTORY_DATE_RANGE_TOO_LARGE | VOUCHER_INVALID_CURSOR`

#### `GET /api/v1/mobile/vouchers/my/:id`
Get one of my vouchers
- Điều kiện: `Authenticated`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(MyVoucherDetailResponseDto, 'The owned voucher.')` · `Promise<MyVoucherDetailResponseDto>`
    - `id`: `string` — { type: 'string', example: '5386', description: 'Voucher instance id (bigint serialized as a string).', }
    - `publicId`: `string` — { type: 'string', format: 'uuid', example: '1b8f8b37-1bbd-46a4-b91e-62fd83a8b2a7', description: 'Unguesable voucher instance identifier. New
    - `productId`: `string` — { type: 'string', example: '8', description: 'Product id.' }
    - `issuerId`: `string` — { type: 'string', example: '1', description: 'Issuer id.' }
    - `serialNo`: `string` — { example: 'VC-2026-8-000010', description: 'Unique serial, format VC-<year>-<productId>-<sequence>.', }
    - `codeLast4`: `string | null` — { type: String, nullable: true, example: '8024', description: 'Last 4 characters of the voucher code — a display hint only. The full code is
    - `faceValue`: `number` — { example: 50000, description: 'Face value in whole currency units (VND).', }
    - `status`: `string` — { enum: VOUCHER_STATUS_VALUES, enumName: 'VoucherStatus', example: 'ACTIVE', description: 'ISSUED = unsold stock. ACTIVE = owned and usable.
    - `expiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time', example: '2026-12-31T23:59:59.000Z', description: 'Expiry timestamp. Null = no expiry.'
    - `redeemedAt`: `string | null` — { type: String, nullable: true, format: 'date-time', example: null, description: 'When it was redeemed. Null unless status is REDEEMED.', }
    - `product`: `VoucherProductEmbedDto | null` — { nullable: true, type: () => VoucherProductEmbedDto, description: 'Source voucher product. Null only if the product row was deleted.', }
    - `createdAt`: `string` — { format: 'date-time', example: '2026-06-23T06:47:30.065Z', description: 'When the voucher was minted — not when it was bought.', }
    - `updatedAt`: `string` — { format: 'date-time', example: '2026-07-10T07:32:46.175Z' }
- Lỗi/Status: `404: VOUCHER_NOT_FOUND`

#### `GET /api/v1/mobile/vouchers/my/:id/ledger`
Get the ledger of a merchant-issued voucher
- Điều kiện: `Authenticated`
- Path `id`: `string`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(UserVoucherEventResponseDto, 'Voucher ledger, newest first.')` · `Promise<CursorPaginatedResponse<UserVoucherEventResponseDto>>`
    - `data`: `UserVoucherEventResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `404: VOUCHER_NOT_FOUND` | `403: VOUCHER_MERCHANT_ROLE_REQUIRED | VOUCHER_MERCHANT_USER_INACTIVE` | `409: VOUCHER_MERCHANT_ISSUER_NOT_READY | VOUCHER_ISSUER_NOT_ACTIVE`

### WebVoucherController  `/web/vouchers`  — `src/modules/voucher/controllers/web.voucher.controller.ts`

#### `POST /api/v1/web/vouchers/my/:publicId/redemption-authorization`
Request Smart OTP to use a voucher
- Điều kiện: `HttpCode(HttpStatus.OK)` · `Authenticated` · `RateLimit({ userPerMin: 5 })`
- Path `publicId`: `string`
- Response: `ApiEnvelopeResponse(SmartOtpRequestResDto, 'Voucher Smart OTP request.')` · `Promise<SmartOtpRequestResDto>`
    - `requestId`: `string`
    - `purpose`: `SmartOtpPurpose` — { enum: SmartOtpPurpose }
    - `subjectType`: `SmartOtpSubjectType` — { enum: SmartOtpSubjectType }
    - `subjectId`: `string`
    - `status`: `SmartOtpRequestStatus` — { enum: SmartOtpRequestStatus }
    - `referenceCode`: `string | null` — { type: String, nullable: true }
    - `statusReason`: `string | null` — { type: String, nullable: true }
    - `displayContext`: `Record<string, unknown>` — { type: 'object', additionalProperties: true }
    - `expiresAt`: `string` — { format: 'date-time' }
    - `createdAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/web/vouchers/my/:publicId/redemption-token`
Create a short-lived voucher redemption token
- Điều kiện: `RequireSmartOtpProof({ purpose: SmartOtpPurpose.VoucherRevealRedeemCode, subjectT)` · `HttpCode(HttpStatus.OK)` · `Authenticated` · `RateLimit({ userPerMin: 5 })`
- Path `publicId`: `string`
- Body: `CreateVoucherRedemptionTokenDto`
    - `smartOtp`: `SmartOtpProofDto` — IsDefined — { type: SmartOtpProofDto }
      - **SmartOtpProofDto**
        - `requestId`: `string` — IsString, IsNotEmpty, IsBigIntId — { example: '1234' }
        - `code`: `string` — Matches — { example: '147258', pattern: '^\\d{6}$' }
- Response: `ApiEnvelopeResponse(VoucherRedemptionTokenResponseDto, 'Short-lived redemption token.')` · `Promise<VoucherRedemptionTokenResponseDto>`
    - `token`: `string` — { example: 'K7W3B9QH', description: 'Eight-character uppercase token. Display it only as a QR or for manual entry.', }
    - `expiresAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/web/vouchers/merchant/voucher-packages`
Create a merchant voucher package in inventory
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `HttpCode(HttpStatus.OK)` · `Authenticated` · `RateLimit({ ipPerMin: 10, userPerMin: 2 })`
- Body: `CreateMerchantVoucherPackageDto`
    - `packageName`: `string` — IsString, IsNotEmpty, MaxLength — { example: 'Vinamilk October voucher package', maxLength: 255, description: 'Merchant-visible package/campaign name that groups products.', 
    - `packageCode?`: `string | null | undefined` — IsOptional, IsString, MaxLength, Matches — { type: String, nullable: true, example: 'VINAMILK-2026-10', maxLength: 80, description: 'Optional merchant-visible package code unique per 
    - `description?`: `string | null | undefined` — IsOptional, IsString, MaxLength — { type: String, nullable: true, example: 'Milk, cake, and candy voucher products for October.', maxLength: 5000, }
    - `products`: `CreateMerchantVoucherPackageProductDto[]` — IsArray, ArrayMinSize, ArrayMaxSize — { type: [CreateMerchantVoucherPackageProductDto], minItems: 1, maxItems: MAX_MERCHANT_VOUCHER_PACKAGE_PRODUCTS, }
- Response: `ApiEnvelopeResponse(MerchantVoucherPackageResponseDto, 'The created merchant voucher package.')` · `Promise<MerchantVoucherPackageResponseDto>`
    - `id`: `string` — { type: 'string', example: '12' }
    - `publicId`: `string` — { type: 'string', format: 'uuid', example: '911bdd07-88c5-46c4-a66c-8c912958a5ab', }
    - `issuerId`: `string` — { type: 'string', example: '7' }
    - `merchantUserId`: `string` — { type: 'string', example: '19' }
    - `createdByUserId`: `string` — { type: 'string', example: '19' }
    - `packageCode`: `string | null` — { type: String, nullable: true, example: 'VINAMILK-2026-10', }
    - `packageName`: `string` — { example: 'Vinamilk October voucher package' }
    - `slug`: `string` — { example: 'vinamilk-2026-10' }
    - `description`: `string | null` — { type: String, nullable: true }
    - `status`: `VoucherPackageStatus` — { enum: ['DRAFT', 'ACTIVE', 'INACTIVE'] }
    - `reviewStatus`: `VoucherPackageReviewStatus` — { enum: ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'], }
    - `rejectionReason`: `string | null` — { type: String, nullable: true, example: 'RULE_01_CONTENT_REASONABLENESS: Contains threatening, hateful, or discriminatory language at produ
    - `totalProducts`: `number` — { example: 3 }
    - `totalRequestedQuantity`: `number` — { example: 450 }
    - `totalMintedQuantity`: `number` — { example: 450 }
    - `metadata`: `VoucherPackageMetadata` — { example: { inventoryMode: 'PACKAGE_PRODUCTS' } }
    - `products`: `MerchantVoucherPackageProductResponseDto[]` — { type: [MerchantVoucherPackageProductResponseDto] }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `403: VOUCHER_MERCHANT_ROLE_REQUIRED` | `404: VOUCHER_CATEGORY_NOT_FOUND` | `400: VOUCHER_PRODUCT_INVALID_ECONOMICS | VOUCHER_MERCHANT_TAX_CODE_REQUIRED | VOUCHER_MERCHANT_TAX_CODE_INVALID` | `409: VOUCHER_MERCHANT_ISSUER_NOT_READY | VOUCHER_ISSUER_NOT_ACTIVE | VOUCHER_CATEGORY_INACTIVE | VOUCHER_PACKAGE_CODE_CONFLICT | VOUCHER_PACKAGE_SLUG_CONFLICT | VOUCHER_PRODUCT_SLUG_CONFLICT | VOUCHER_PRODUCT_PUBLIC_CODE_CONF`

#### `POST /api/v1/web/vouchers/merchant/voucher-products/:productId/clone`
Clone a published merchant voucher product
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `HttpCode(HttpStatus.OK)` · `Authenticated`
- Path `productId`: `string`
- Body: `CloneMerchantVoucherProductDto`
    - `name?`: `string | undefined` — IsOptional, IsString, MaxLength — { example: 'Coffee 50K v2', maxLength: 255 }
    - `title?`: `string | undefined` — IsOptional, IsString, MaxLength — { example: 'Coffee 50K v2', maxLength: 255 }
    - `slug?`: `string | undefined` — IsOptional, IsString, MaxLength, Matches — { example: 'coffee-50k-v2', maxLength: 120 }
    - `affiliateShareBps?`: `number | undefined` — IsOptional, IsInt, Min, Max — { minimum: 0, maximum: 5000, example: 500, description: "Basis points of the gross sale price paid by the seller to the buyer's referrer. 50
- Response: `ApiEnvelopeResponse(MerchantVoucherPackageProductResponseDto, 'The new draft voucher product.')` · `Promise<MerchantVoucherPackageProductResponseDto>`
    - `id`: `string` — { type: 'string', example: '88' }
    - `publicId`: `string` — { type: 'string', format: 'uuid', example: 'e35f9df6-b63a-4ff1-b54e-6718a76330e0', }
    - `packageId`: `string` — { type: 'string', example: '12' }
    - `issuerId`: `string` — { type: 'string', example: '7' }
    - `merchantUserId`: `string` — { type: 'string', example: '19' }
    - `categoryId`: `string` — { type: 'string', example: '3' }
    - `categoryName`: `string | null` — { type: String, nullable: true, example: 'Food and beverage', }
    - `title`: `string` — { example: 'Vinamilk milk voucher' }
    - `slug`: `string` — { example: 'vinamilk-milk-voucher' }
    - `subtitle`: `string | null` — { type: String, nullable: true }
    - `description`: `string | null` — { type: String, nullable: true }
    - `termsAndConditions`: `string | null` — { type: String, nullable: true }
    - `usageInstructions`: `string | null` — { type: String, nullable: true }
    - `thumbnailUrl`: `string | null` — { type: String, nullable: true }
    - `bannerUrl`: `string | null` — { type: String, nullable: true }
    - `voucherType`: `VoucherProductType` — { enum: ['DISCOUNT_AMOUNT', 'DISCOUNT_PERCENT'] }
    - `discount`: `VoucherProductDiscount` — { example: { percentage: 20, maxAmount: 80000 } }
    - `faceValue`: `number` — { example: 80000 }
    - `salePrice`: `number` — { example: 1000 }
    - `currency`: `string` — { example: 'VND' }
    - `affiliateShareBps`: `number` — { example: 500, minimum: 0, maximum: 5000, description: "Basis points of the gross sale price paid by the seller to the buyer's referrer. 50
    - `isTransferable`: `boolean` — { example: true }
    - `maxSupply`: `number` — { example: 200 }
    - `issuedCount`: `number` — { example: 0 }
    - `remainingSupply`: `number` — { example: 200 }
    - `validFrom`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `validUntil`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `purchaseStartsAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `purchaseEndsAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `perUserLimit`: `number` — { example: 1 }
    - `publicCode`: `string | null` — { type: String, nullable: true, example: 'MILK20' }
    - `status`: `VoucherProductStatus` — { enum: ['DRAFT', 'ACTIVE', 'INACTIVE'] }
    - `reviewStatus`: `VoucherProductReviewStatus` — { enum: ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'], }
    - `rejectionReason`: `string | null` — { type: String, nullable: true, example: 'RULE_01_CONTENT_REASONABLENESS: Contains threatening, hateful, or discriminatory language at produ
    - `publicationStatus`: `VoucherProductPublicationStatus` — { enum: ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'] }
    - `metadata`: `VoucherProductMetadata` — { example: { inventoryMode: 'PACKAGE_PRODUCT' } }
- Lỗi/Status: `404: VOUCHER_PRODUCT_NOT_FOUND` | `409: VOUCHER_MERCHANT_ISSUER_NOT_READY | VOUCHER_ISSUER_NOT_ACTIVE` | `409: VOUCHER_PRODUCT_NOT_PUBLISHED` | `400: VOUCHER_MERCHANT_TAX_CODE_REQUIRED | VOUCHER_MERCHANT_TAX_CODE_INVALID`

#### `GET /api/v1/web/vouchers/merchant/voucher-packages`
List merchant voucher packages in inventory
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `Authenticated`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(MerchantVoucherPackageResponseDto, 'Merchant voucher packages, newest first.')` · `Promise<CursorPaginatedResponse<MerchantVoucherPackageResponseDto>>`
    - `data`: `MerchantVoucherPackageResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `403: VOUCHER_MERCHANT_ROLE_REQUIRED` | `409: VOUCHER_ISSUER_NOT_ACTIVE`

#### `GET /api/v1/web/vouchers/merchant/voucher-packages/:id`
Get a merchant voucher package from inventory
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `Authenticated`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(MerchantVoucherPackageResponseDto, 'The merchant voucher package.')` · `Promise<MerchantVoucherPackageResponseDto>`
    - `id`: `string` — { type: 'string', example: '12' }
    - `publicId`: `string` — { type: 'string', format: 'uuid', example: '911bdd07-88c5-46c4-a66c-8c912958a5ab', }
    - `issuerId`: `string` — { type: 'string', example: '7' }
    - `merchantUserId`: `string` — { type: 'string', example: '19' }
    - `createdByUserId`: `string` — { type: 'string', example: '19' }
    - `packageCode`: `string | null` — { type: String, nullable: true, example: 'VINAMILK-2026-10', }
    - `packageName`: `string` — { example: 'Vinamilk October voucher package' }
    - `slug`: `string` — { example: 'vinamilk-2026-10' }
    - `description`: `string | null` — { type: String, nullable: true }
    - `status`: `VoucherPackageStatus` — { enum: ['DRAFT', 'ACTIVE', 'INACTIVE'] }
    - `reviewStatus`: `VoucherPackageReviewStatus` — { enum: ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'], }
    - `rejectionReason`: `string | null` — { type: String, nullable: true, example: 'RULE_01_CONTENT_REASONABLENESS: Contains threatening, hateful, or discriminatory language at produ
    - `totalProducts`: `number` — { example: 3 }
    - `totalRequestedQuantity`: `number` — { example: 450 }
    - `totalMintedQuantity`: `number` — { example: 450 }
    - `metadata`: `VoucherPackageMetadata` — { example: { inventoryMode: 'PACKAGE_PRODUCTS' } }
    - `products`: `MerchantVoucherPackageProductResponseDto[]` — { type: [MerchantVoucherPackageProductResponseDto] }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `403: VOUCHER_MERCHANT_ROLE_REQUIRED` | `404: VOUCHER_PACKAGE_NOT_FOUND` | `409: VOUCHER_MERCHANT_ISSUER_NOT_READY | VOUCHER_ISSUER_NOT_ACTIVE`

#### `GET /api/v1/web/vouchers/merchant/voucher-products/:productId/vouchers`
List voucher instances under a merchant voucher product
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `Authenticated`
- Path `productId`: `string`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(MerchantVoucherResponseDto, 'Voucher instances for the merchant voucher product, newest )` · `Promise<CursorPaginatedResponse<MerchantVoucherResponseDto>>`
    - `data`: `MerchantVoucherResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `403: VOUCHER_MERCHANT_ROLE_REQUIRED` | `404: VOUCHER_PRODUCT_NOT_FOUND` | `409: VOUCHER_MERCHANT_ISSUER_NOT_READY | VOUCHER_ISSUER_NOT_ACTIVE`

#### `GET /api/v1/web/vouchers/merchant/vouchers/:id`
Get a merchant voucher instance
- Điều kiện: `RequireEkyc` · `RequireMembership` · `RequireContextPermissions(PERMISSION_KEYS.VouchersSubAccountManage)` · `Authenticated`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(MerchantVoucherResponseDto, 'The merchant voucher instance.')` · `Promise<MerchantVoucherResponseDto>`
    - `id`: `string` — { type: 'string', example: '5386' }
    - `publicId`: `string` — { type: 'string', format: 'uuid', example: '1b8f8b37-1bbd-46a4-b91e-62fd83a8b2a7', description: 'Unguesable voucher instance identifier. Pre
    - `productId`: `string` — { type: 'string', example: '88' }
    - `packageId`: `string | null` — { nullable: true, type: 'string', example: '12' }
    - `issuerId`: `string` — { type: 'string', example: '7' }
    - `merchantUserId`: `string | null` — { nullable: true, type: 'string', example: '19' }
    - `ownerId`: `string | null` — { nullable: true, type: 'string', example: '4' }
    - `productTitle`: `string | null` — { type: String, nullable: true, example: 'Vinamilk milk voucher', description: 'Source voucher product title.', }
    - `serialNo`: `string` — { example: 'VC-2026-88-000010' }
    - `codeLast4`: `string | null` — { type: String, nullable: true, example: '8024', description: 'Last 4 characters only. The full code/hash is never returned by merchant inve
    - `faceValue`: `number` — { example: 80000 }
    - `currency`: `string | null` — { type: String, nullable: true, example: 'VND' }
    - `status`: `string` — { enum: VOUCHER_STATUS_VALUES, enumName: 'VoucherStatus', example: 'ISSUED', }
    - `expiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `redeemedAt`: `string | null` — { type: String, nullable: true, format: 'date-time' }
    - `lockedByCommitmentId`: `string | null` — { nullable: true, type: 'string', example: null }
    - `version`: `number` — { example: 0, description: 'Optimistic version counter bumped on voucher mutation.', }
    - `createdAt`: `string` — { format: 'date-time' }
    - `updatedAt`: `string` — { format: 'date-time' }
- Lỗi/Status: `403: VOUCHER_MERCHANT_ROLE_REQUIRED` | `404: VOUCHER_NOT_FOUND` | `409: VOUCHER_MERCHANT_ISSUER_NOT_READY | VOUCHER_ISSUER_NOT_ACTIVE`

#### `GET /api/v1/web/vouchers/my`
List my vouchers
- Điều kiện: `Authenticated`
- Query: `MyVoucherQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned in `meta.nextCursor` of the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20, example: 20, description: 'Page size. Values above 50 are rejected with 400.', }
    - `status?`: `VoucherStatus | undefined` — IsOptional, IsIn — { enum: MY_VOUCHER_STATUSES, enumName: 'VoucherStatus', example: 'ACTIVE', description: 'Filter by voucher status. Omit to return every vouc
    - `q?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Case-insensitive partial match on the product name or the issuer name.', example: 'Voucher A', }
- Response: `ApiEnvelopeCursorResponse(MyVoucherResponseDto, 'Vouchers owned by the current user, newest first.')` · `Promise<CursorPaginatedResponse<MyVoucherResponseDto>>`
    - `data`: `MyVoucherResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`

#### `GET /api/v1/web/vouchers/purchase-history`
List my voucher purchases
- Điều kiện: `Authenticated`
- Query: `VoucherPurchaseHistoryQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned in `meta.nextCursor` of the previous page. Omit for the first page. A malformed cursor is rejected wi
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20, example: 20, description: 'Page size. Values above 50 are rejected with 400.', }
    - `status?`: `VoucherStatus | undefined` — IsOptional, IsIn — { enum: PURCHASE_HISTORY_STATUSES, enumName: 'VoucherPurchaseHistoryStatus', example: 'ACTIVE', description: 'Filter by the CURRENT status o
    - `q?`: `string | undefined` — IsOptional, IsString, MaxLength — { description: 'Case-insensitive partial match on the product name or the issuer name.', example: 'Voucher A', }
    - `purchasedFrom?`: `string | undefined` — IsOptional, IsISO8601 — { format: 'date-time', example: '2026-06-01T00:00:00.000Z', description: 'Purchased on or after this timestamp (inclusive). No default — omi
    - `purchasedTo?`: `string | undefined` — IsOptional, IsISO8601 — { format: 'date-time', example: '2026-07-31T23:59:59.999Z', description: 'Purchased on or before this timestamp (inclusive). When BOTH bound
    - `expiresFrom?`: `string | undefined` — IsOptional, IsISO8601 — { format: 'date-time', example: '2026-01-01T00:00:00.000Z', description: 'Voucher expires on or after this timestamp.', }
    - `expiresTo?`: `string | undefined` — IsOptional, IsISO8601 — { format: 'date-time', example: '2026-12-31T23:59:59.000Z', description: 'Voucher expires on or before this timestamp.', }
- Response: `ApiEnvelopeCursorResponse(VoucherPurchaseHistoryItemDto, 'Voucher purchase history, newest purchase first.')` · `Promise<CursorPaginatedResponse<VoucherPurchaseHistoryItemDto>>`
    - `data`: `VoucherPurchaseHistoryItemDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `400: VOUCHER_HISTORY_DATE_RANGE_TOO_LARGE | VOUCHER_INVALID_CURSOR`

#### `GET /api/v1/web/vouchers/my/:id`
Get one of my vouchers
- Điều kiện: `Authenticated`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(MyVoucherDetailResponseDto, 'The owned voucher.')` · `Promise<MyVoucherDetailResponseDto>`
    - `id`: `string` — { type: 'string', example: '5386', description: 'Voucher instance id (bigint serialized as a string).', }
    - `publicId`: `string` — { type: 'string', format: 'uuid', example: '1b8f8b37-1bbd-46a4-b91e-62fd83a8b2a7', description: 'Unguesable voucher instance identifier. New
    - `productId`: `string` — { type: 'string', example: '8', description: 'Product id.' }
    - `issuerId`: `string` — { type: 'string', example: '1', description: 'Issuer id.' }
    - `serialNo`: `string` — { example: 'VC-2026-8-000010', description: 'Unique serial, format VC-<year>-<productId>-<sequence>.', }
    - `codeLast4`: `string | null` — { type: String, nullable: true, example: '8024', description: 'Last 4 characters of the voucher code — a display hint only. The full code is
    - `faceValue`: `number` — { example: 50000, description: 'Face value in whole currency units (VND).', }
    - `status`: `string` — { enum: VOUCHER_STATUS_VALUES, enumName: 'VoucherStatus', example: 'ACTIVE', description: 'ISSUED = unsold stock. ACTIVE = owned and usable.
    - `expiresAt`: `string | null` — { type: String, nullable: true, format: 'date-time', example: '2026-12-31T23:59:59.000Z', description: 'Expiry timestamp. Null = no expiry.'
    - `redeemedAt`: `string | null` — { type: String, nullable: true, format: 'date-time', example: null, description: 'When it was redeemed. Null unless status is REDEEMED.', }
    - `product`: `VoucherProductEmbedDto | null` — { nullable: true, type: () => VoucherProductEmbedDto, description: 'Source voucher product. Null only if the product row was deleted.', }
    - `createdAt`: `string` — { format: 'date-time', example: '2026-06-23T06:47:30.065Z', description: 'When the voucher was minted — not when it was bought.', }
    - `updatedAt`: `string` — { format: 'date-time', example: '2026-07-10T07:32:46.175Z' }
- Lỗi/Status: `404: VOUCHER_NOT_FOUND`

#### `GET /api/v1/web/vouchers/my/:id/ledger`
Get the ledger of a merchant-issued voucher
- Điều kiện: `Authenticated`
- Path `id`: `string`
- Query: `CursorQueryDto`
    - `cursor?`: `string | undefined` — IsOptional, IsString — { description: 'Opaque cursor returned from the previous page. Omit for the first page.', }
    - `limit?`: `number | undefined` — IsInt, Min, Max, IsOptional — { minimum: 1, maximum: 50, default: 20 }
- Response: `ApiEnvelopeCursorResponse(UserVoucherEventResponseDto, 'Voucher ledger, newest first.')` · `Promise<CursorPaginatedResponse<UserVoucherEventResponseDto>>`
    - `data`: `UserVoucherEventResponseDto[]`
    - `meta`: `{ nextCursor: string | null; hasMore: boolean; asOf?: string | undefined; total?: number |`
- Lỗi/Status: `404: VOUCHER_NOT_FOUND` | `403: VOUCHER_MERCHANT_ROLE_REQUIRED | VOUCHER_MERCHANT_USER_INACTIVE` | `409: VOUCHER_MERCHANT_ISSUER_NOT_READY | VOUCHER_ISSUER_NOT_ACTIVE`

## Module `cart`

### MobileCartController  `/mobile/cart`  — `src/modules/cart/controllers/mobile.cart.controller.ts`

#### `GET /api/v1/mobile/cart`
Get my marketplace cart (mobile)
- Response: `ApiEnvelopeResponse(CartResponseDto, 'Current marketplace cart.')` · `Promise<CartResponseDto>`
    - `id`: `string | null` — { nullable: true, type: 'string', example: '7', description: 'Cart id (bigint serialized as a string). Null when the user has no cart yet.',
    - `items`: `CartItemResponseDto[]` — { type: () => [CartItemResponseDto] }
    - `totalItems`: `number` — { example: 0, minimum: 0 }
    - `totalQuantity`: `number` — { example: 0, minimum: 0 }
    - `updatedAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Cart update timestamp. Null when the user has no cart yet.', }

#### `GET /api/v1/mobile/cart/checkout-preview`
Preview my mobile cart checkout
- Response: `ApiEnvelopeResponse(CartCheckoutPreviewResponseDto, 'Checkout eligibility and voucher total for my mobile cart.')` · `Promise<CartCheckoutPreviewResponseDto>`
    - `items`: `CartItemResponseDto[]` — { type: () => [CartItemResponseDto] }
    - `totalAmountVnd`: `string` — { type: 'string', example: '210000' }
    - `voucherAmountVnd`: `string` — { type: 'string', example: '90000' }
    - `checkoutRevision`: `string` — { type: 'string', example: 'a'.repeat(64) }
    - `checkoutEligible`: `boolean`
    - `checkoutBlockedReason`: `CartCheckoutBlockedReason | null` — { nullable: true }
    - `limits`: `CartCheckoutLimitsDto` — { type: () => CartCheckoutLimitsDto, description: 'Per-checkout unit limits. A cart above them is not blocked: select a part of it.', }
      - **CartCheckoutLimitsDto**
        - `maxCommitmentUnits`: `number` — { example: 10, description: 'Most commitment copies (sum of quantities) one checkout may buy.', }
        - `maxVoucherUnits`: `number` — { example: 10, description: 'Most voucher units (sum of quantities) one checkout may buy.', }

#### `POST /api/v1/mobile/cart/checkout`
Checkout selected voucher cart items with VNPay (mobile)
- Điều kiện: `RateLimit(CART_CHECKOUT_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Body: `CheckoutCartDto`
    - `idempotencyKey`: `string` — IsUUID — { type: 'string', description: 'UUID v4 for checkout idempotency.', }
    - `checkoutRevision`: `string` — Matches — { type: 'string', description: 'SHA-256 revision returned by checkout preview.', }
    - `cartItemIds?`: `string[] | undefined` — IsOptional, IsArray, ArrayMaxSize, ArrayUnique, IsString, Matches — { type: [String], description: 'Cart item IDs to buy; omit for the full cart.', }
    - `locale?`: `"vn" | "en" | undefined` — IsOptional, IsIn — { enum: ['vn', 'en'], default: 'vn' }
    - `bankCode?`: `"VNPAYQR" | "VNBANK" | "INTCARD" | undefined` — IsOptional, IsIn — { enum: VNPAY_BANK_CODES }
- Ip: `string`
- Response: `ApiEnvelopeResponse(CartCheckoutOrderResponseDto, 'Pending cart payment order and VNPay URL.')` · `Promise<CartCheckoutOrderResponseDto>`
    - `orderId`: `string` — { type: 'string' }
    - `txnRef`: `string` — { type: 'string' }
    - `amountVnd`: `string` — { type: 'string', example: '100000' }
    - `paymentUrl`: `string | null` — { type: 'string', nullable: true }
    - `expiresAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/mobile/cart/items`
Add a marketplace item to my cart (mobile)
- Điều kiện: `HttpCode(HttpStatus.OK)`
- Body: `AddCartItemDto`
    - `productType`: `MarketplaceProductType` — IsEnum — { enum: MarketplaceProductType, enumName: 'MarketplaceProductType', example: MarketplaceProductType.Voucher, }
    - `productId`: `string` — IsBigIntId — { type: 'string', example: '8', description: 'Marketplace product id (bigint serialized as a string).', }
    - `quantity`: `number` — IsInt, Min, Max — { example: 1, minimum: 1, maximum: 99, description: 'Cart item quantity. Finite-use COMMITMENT_TEMPLATE products accept 1..99 (bounded by re
- Response: `ApiEnvelopeResponse(CartResponseDto, 'Cart after adding the item.')` · `Promise<CartResponseDto>`
    - `id`: `string | null` — { nullable: true, type: 'string', example: '7', description: 'Cart id (bigint serialized as a string). Null when the user has no cart yet.',
    - `items`: `CartItemResponseDto[]` — { type: () => [CartItemResponseDto] }
    - `totalItems`: `number` — { example: 0, minimum: 0 }
    - `totalQuantity`: `number` — { example: 0, minimum: 0 }
    - `updatedAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Cart update timestamp. Null when the user has no cart yet.', }

#### `PATCH /api/v1/mobile/cart/items/:cartItemId`
Update a marketplace cart item quantity (mobile)
- Điều kiện: `HttpCode(HttpStatus.OK)`
- Path `cartItemId`: `string`
- Body: `UpdateCartItemDto`
    - `quantity`: `number` — IsInt, Min, Max — { example: 1, minimum: 1, maximum: 99, description: 'Updated cart item quantity. Use the delete endpoint to remove an item; quantity=0 is re
- Response: `ApiEnvelopeResponse(CartResponseDto, 'Cart after updating the item.')` · `Promise<CartResponseDto>`
    - `id`: `string | null` — { nullable: true, type: 'string', example: '7', description: 'Cart id (bigint serialized as a string). Null when the user has no cart yet.',
    - `items`: `CartItemResponseDto[]` — { type: () => [CartItemResponseDto] }
    - `totalItems`: `number` — { example: 0, minimum: 0 }
    - `totalQuantity`: `number` — { example: 0, minimum: 0 }
    - `updatedAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Cart update timestamp. Null when the user has no cart yet.', }

#### `DELETE /api/v1/mobile/cart/items/:cartItemId`
Remove a marketplace item from my cart (mobile)
- Điều kiện: `HttpCode(HttpStatus.OK)`
- Path `cartItemId`: `string`
- Response: `ApiEnvelopeResponse(CartResponseDto, 'Cart after removing the item.')` · `Promise<CartResponseDto>`
    - `id`: `string | null` — { nullable: true, type: 'string', example: '7', description: 'Cart id (bigint serialized as a string). Null when the user has no cart yet.',
    - `items`: `CartItemResponseDto[]` — { type: () => [CartItemResponseDto] }
    - `totalItems`: `number` — { example: 0, minimum: 0 }
    - `totalQuantity`: `number` — { example: 0, minimum: 0 }
    - `updatedAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Cart update timestamp. Null when the user has no cart yet.', }

#### `DELETE /api/v1/mobile/cart/items`
Clear my marketplace cart (mobile)
- Điều kiện: `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(CartResponseDto, 'Empty cart after clearing items.')` · `Promise<CartResponseDto>`
    - `id`: `string | null` — { nullable: true, type: 'string', example: '7', description: 'Cart id (bigint serialized as a string). Null when the user has no cart yet.',
    - `items`: `CartItemResponseDto[]` — { type: () => [CartItemResponseDto] }
    - `totalItems`: `number` — { example: 0, minimum: 0 }
    - `totalQuantity`: `number` — { example: 0, minimum: 0 }
    - `updatedAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Cart update timestamp. Null when the user has no cart yet.', }

### WebCartController  `/web/cart`  — `src/modules/cart/controllers/web.cart.controller.ts`

#### `GET /api/v1/web/cart`
Get my marketplace cart (web)
- Response: `ApiEnvelopeResponse(CartResponseDto, 'Current marketplace cart.')` · `Promise<CartResponseDto>`
    - `id`: `string | null` — { nullable: true, type: 'string', example: '7', description: 'Cart id (bigint serialized as a string). Null when the user has no cart yet.',
    - `items`: `CartItemResponseDto[]` — { type: () => [CartItemResponseDto] }
    - `totalItems`: `number` — { example: 0, minimum: 0 }
    - `totalQuantity`: `number` — { example: 0, minimum: 0 }
    - `updatedAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Cart update timestamp. Null when the user has no cart yet.', }

#### `GET /api/v1/web/cart/checkout-preview`
Preview my web cart checkout
- Response: `ApiEnvelopeResponse(CartCheckoutPreviewResponseDto, 'Checkout eligibility and total for my web cart.')` · `Promise<CartCheckoutPreviewResponseDto>`
    - `items`: `CartItemResponseDto[]` — { type: () => [CartItemResponseDto] }
    - `totalAmountVnd`: `string` — { type: 'string', example: '210000' }
    - `voucherAmountVnd`: `string` — { type: 'string', example: '90000' }
    - `checkoutRevision`: `string` — { type: 'string', example: 'a'.repeat(64) }
    - `checkoutEligible`: `boolean`
    - `checkoutBlockedReason`: `CartCheckoutBlockedReason | null` — { nullable: true }
    - `limits`: `CartCheckoutLimitsDto` — { type: () => CartCheckoutLimitsDto, description: 'Per-checkout unit limits. A cart above them is not blocked: select a part of it.', }
      - **CartCheckoutLimitsDto**
        - `maxCommitmentUnits`: `number` — { example: 10, description: 'Most commitment copies (sum of quantities) one checkout may buy.', }
        - `maxVoucherUnits`: `number` — { example: 10, description: 'Most voucher units (sum of quantities) one checkout may buy.', }

#### `POST /api/v1/web/cart/checkout`
Checkout selected voucher and commitment cart items with VNPay (web)
- Điều kiện: `RateLimit(CART_CHECKOUT_RATE_LIMIT)` · `HttpCode(HttpStatus.OK)`
- Body: `CheckoutCartDto`
    - `idempotencyKey`: `string` — IsUUID — { type: 'string', description: 'UUID v4 for checkout idempotency.', }
    - `checkoutRevision`: `string` — Matches — { type: 'string', description: 'SHA-256 revision returned by checkout preview.', }
    - `cartItemIds?`: `string[] | undefined` — IsOptional, IsArray, ArrayMaxSize, ArrayUnique, IsString, Matches — { type: [String], description: 'Cart item IDs to buy; omit for the full cart.', }
    - `locale?`: `"vn" | "en" | undefined` — IsOptional, IsIn — { enum: ['vn', 'en'], default: 'vn' }
    - `bankCode?`: `"VNPAYQR" | "VNBANK" | "INTCARD" | undefined` — IsOptional, IsIn — { enum: VNPAY_BANK_CODES }
- Ip: `string`
- Response: `ApiEnvelopeResponse(CartCheckoutOrderResponseDto, 'Pending cart payment order and VNPay URL.')` · `Promise<CartCheckoutOrderResponseDto>`
    - `orderId`: `string` — { type: 'string' }
    - `txnRef`: `string` — { type: 'string' }
    - `amountVnd`: `string` — { type: 'string', example: '100000' }
    - `paymentUrl`: `string | null` — { type: 'string', nullable: true }
    - `expiresAt`: `string` — { format: 'date-time' }

#### `POST /api/v1/web/cart/items`
Add a marketplace item to my cart (web)
- Điều kiện: `HttpCode(HttpStatus.OK)`
- Body: `AddCartItemDto`
    - `productType`: `MarketplaceProductType` — IsEnum — { enum: MarketplaceProductType, enumName: 'MarketplaceProductType', example: MarketplaceProductType.Voucher, }
    - `productId`: `string` — IsBigIntId — { type: 'string', example: '8', description: 'Marketplace product id (bigint serialized as a string).', }
    - `quantity`: `number` — IsInt, Min, Max — { example: 1, minimum: 1, maximum: 99, description: 'Cart item quantity. Finite-use COMMITMENT_TEMPLATE products accept 1..99 (bounded by re
- Response: `ApiEnvelopeResponse(CartResponseDto, 'Cart after adding the item.')` · `Promise<CartResponseDto>`
    - `id`: `string | null` — { nullable: true, type: 'string', example: '7', description: 'Cart id (bigint serialized as a string). Null when the user has no cart yet.',
    - `items`: `CartItemResponseDto[]` — { type: () => [CartItemResponseDto] }
    - `totalItems`: `number` — { example: 0, minimum: 0 }
    - `totalQuantity`: `number` — { example: 0, minimum: 0 }
    - `updatedAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Cart update timestamp. Null when the user has no cart yet.', }

#### `PATCH /api/v1/web/cart/items/:cartItemId`
Update a marketplace cart item quantity (web)
- Điều kiện: `HttpCode(HttpStatus.OK)`
- Path `cartItemId`: `string`
- Body: `UpdateCartItemDto`
    - `quantity`: `number` — IsInt, Min, Max — { example: 1, minimum: 1, maximum: 99, description: 'Updated cart item quantity. Use the delete endpoint to remove an item; quantity=0 is re
- Response: `ApiEnvelopeResponse(CartResponseDto, 'Cart after updating the item.')` · `Promise<CartResponseDto>`
    - `id`: `string | null` — { nullable: true, type: 'string', example: '7', description: 'Cart id (bigint serialized as a string). Null when the user has no cart yet.',
    - `items`: `CartItemResponseDto[]` — { type: () => [CartItemResponseDto] }
    - `totalItems`: `number` — { example: 0, minimum: 0 }
    - `totalQuantity`: `number` — { example: 0, minimum: 0 }
    - `updatedAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Cart update timestamp. Null when the user has no cart yet.', }

#### `DELETE /api/v1/web/cart/items/:cartItemId`
Remove a marketplace item from my cart (web)
- Điều kiện: `HttpCode(HttpStatus.OK)`
- Path `cartItemId`: `string`
- Response: `ApiEnvelopeResponse(CartResponseDto, 'Cart after removing the item.')` · `Promise<CartResponseDto>`
    - `id`: `string | null` — { nullable: true, type: 'string', example: '7', description: 'Cart id (bigint serialized as a string). Null when the user has no cart yet.',
    - `items`: `CartItemResponseDto[]` — { type: () => [CartItemResponseDto] }
    - `totalItems`: `number` — { example: 0, minimum: 0 }
    - `totalQuantity`: `number` — { example: 0, minimum: 0 }
    - `updatedAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Cart update timestamp. Null when the user has no cart yet.', }

#### `DELETE /api/v1/web/cart/items`
Clear my marketplace cart (web)
- Điều kiện: `HttpCode(HttpStatus.OK)`
- Response: `ApiEnvelopeResponse(CartResponseDto, 'Empty cart after clearing items.')` · `Promise<CartResponseDto>`
    - `id`: `string | null` — { nullable: true, type: 'string', example: '7', description: 'Cart id (bigint serialized as a string). Null when the user has no cart yet.',
    - `items`: `CartItemResponseDto[]` — { type: () => [CartItemResponseDto] }
    - `totalItems`: `number` — { example: 0, minimum: 0 }
    - `totalQuantity`: `number` — { example: 0, minimum: 0 }
    - `updatedAt`: `string | null` — { type: String, nullable: true, format: 'date-time', description: 'Cart update timestamp. Null when the user has no cart yet.', }

## Module `referral`

### MobileReferralController  `/mobile/referrals`  — `src/modules/referral/controllers/mobile.referral.controller.ts`

#### `GET /api/v1/mobile/referrals/my-code`
Get my invitation code (mobile) — created + persisted on first call, returned thereafter
- Điều kiện: `Authenticated` · `RateLimit(REFERRAL_MUTATION_RATE_LIMIT)`
- Response: `ApiEnvelopeResponse(InvitationCodeResDto)` · `Promise<InvitationCodeResDto>`
    - `invitationCode`: `string` — { example: 'TRW7K9F2QX', description: "The current user's invitation code. Share it so an invitee can attach " + 'it at sign-up; you earn tr

#### `GET /api/v1/mobile/referrals`
List users who registered using my invitation code (mobile)
- Điều kiện: `Authenticated` · `RateLimit(REFERRAL_READ_RATE_LIMIT)`
- Response: `Promise<ReferredUserResDto[]>`
    - `userId`: `string` — { description: 'Referred user UUID.', example: '42', type: 'string', }
    - `username`: `string | null` — { type: String, description: 'Display username.', example: 'trustwow_user', nullable: true, }
    - `fullName`: `string | null` — { type: String, description: 'Full name.', example: 'Trustwow User', nullable: true, }
    - `avatarUrl`: `string | null` — { type: String, description: 'Avatar image URL.', example: 'https://example.com/avatar.png', nullable: true, }
    - `referredAt`: `string` — { description: 'When this user signed up with the invitation code.', example: '2026-06-16T04:00:00.000Z', format: 'date-time', }

### WebReferralController  `/web/referrals`  — `src/modules/referral/controllers/web.referral.controller.ts`

#### `GET /api/v1/web/referrals/my-code`
Get my invitation code (web) — created + persisted on first call, returned thereafter
- Điều kiện: `Authenticated` · `RateLimit(REFERRAL_MUTATION_RATE_LIMIT)`
- Response: `ApiEnvelopeResponse(InvitationCodeResDto)` · `Promise<InvitationCodeResDto>`
    - `invitationCode`: `string` — { example: 'TRW7K9F2QX', description: "The current user's invitation code. Share it so an invitee can attach " + 'it at sign-up; you earn tr

#### `GET /api/v1/web/referrals`
List users who registered using my invitation code (web)
- Điều kiện: `Authenticated` · `RateLimit(REFERRAL_READ_RATE_LIMIT)`
- Response: `Promise<ReferredUserResDto[]>`
    - `userId`: `string` — { description: 'Referred user UUID.', example: '42', type: 'string', }
    - `username`: `string | null` — { type: String, description: 'Display username.', example: 'trustwow_user', nullable: true, }
    - `fullName`: `string | null` — { type: String, description: 'Full name.', example: 'Trustwow User', nullable: true, }
    - `avatarUrl`: `string | null` — { type: String, description: 'Avatar image URL.', example: 'https://example.com/avatar.png', nullable: true, }
    - `referredAt`: `string` — { description: 'When this user signed up with the invitation code.', example: '2026-06-16T04:00:00.000Z', format: 'date-time', }

## Module `tax-report`

### WebAdminTaxReportController  `/web/admin/finance/tax-reports/withholding/exports`  — `src/modules/tax-report/controllers/web.admin.tax-report.controller.ts`

#### `POST /api/v1/web/admin/finance/tax-reports/withholding/exports`
Queue a withholding tax Excel export for a period
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceTaxReportsExport)` · `HttpCode(HttpStatus.OK)` · `RateLimit({ userPerMin: 5, ipPerMin: 20, sustained: { limit: 30, ttlMs)`
- Body: `CreateTaxWithholdingExportReqDto`
    - `preset`: `DateRangePreset` — IsEnum — { enum: DateRangePreset, enumName: 'DateRangePreset', example: DateRangePreset.LastMonth, description: [ 'Period to report on, resolved on t
    - `from?`: `string | undefined` — ValidateIf, IsString, Matches — { example: '2026-09-01', description: 'First day of the period (inclusive, Vietnam time, YYYY-MM-DD). Required when preset is CUSTOM; must b
    - `to?`: `string | undefined` — ValidateIf, IsString, Matches — { example: '2026-09-30', description: 'Last day of the period (inclusive, Vietnam time, YYYY-MM-DD). Required when preset is CUSTOM; must be
- Response: `ApiEnvelopeResponse(TaxWithholdingExportResDto)` · `Promise<TaxWithholdingExportResDto>`
    - `exportId`: `string` — { example: '4611686018427387904', type: String }
    - `status`: `TaxExportStatus` — { enum: TaxExportStatus, example: TaxExportStatus.Queued }
    - `preset`: `DateRangePreset` — { enum: DateRangePreset, enumName: 'DateRangePreset', example: DateRangePreset.LastMonth, description: 'Preset the caller sent. CUSTOM when 
    - `from`: `string` — { example: '2026-09-01', description: 'First day of the period (inclusive, Vietnam time). Already resolved from the preset at request time: 
    - `to`: `string` — { example: '2026-09-30', description: 'Last day of the period (inclusive, Vietnam time). Already resolved from the preset at request time.',
    - `createdAt`: `string` — { format: 'date-time' }
    - `completedAt`: `string | null` — { format: 'date-time', nullable: true, type: String }
    - `expiresAt`: `string` — { format: 'date-time', description: 'The status and the file are deleted after this instant.', }
    - `rowCount`: `number | null` — { nullable: true, type: Number, example: 120 }
    - `sellerCount`: `number | null` — { nullable: true, type: Number, example: 12 }
    - `fileName`: `string | null` — { nullable: true, type: String, example: 'thue-khau-tru_2026-09-01_2026-09-30.xlsx', }
    - `errorCode`: `string | null` — { nullable: true, type: String, description: 'Set when status is FAILED.', }

#### `GET /api/v1/web/admin/finance/tax-reports/withholding/exports/:id`
Get the status of my withholding tax export
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceTaxReportsExport)` · `RateLimit({ userPerMin: 60, ipPerMin: 120 })`
- Path `id`: `string`
- Response: `ApiEnvelopeResponse(TaxWithholdingExportResDto)` · `Promise<TaxWithholdingExportResDto>`
    - `exportId`: `string` — { example: '4611686018427387904', type: String }
    - `status`: `TaxExportStatus` — { enum: TaxExportStatus, example: TaxExportStatus.Queued }
    - `preset`: `DateRangePreset` — { enum: DateRangePreset, enumName: 'DateRangePreset', example: DateRangePreset.LastMonth, description: 'Preset the caller sent. CUSTOM when 
    - `from`: `string` — { example: '2026-09-01', description: 'First day of the period (inclusive, Vietnam time). Already resolved from the preset at request time: 
    - `to`: `string` — { example: '2026-09-30', description: 'Last day of the period (inclusive, Vietnam time). Already resolved from the preset at request time.',
    - `createdAt`: `string` — { format: 'date-time' }
    - `completedAt`: `string | null` — { format: 'date-time', nullable: true, type: String }
    - `expiresAt`: `string` — { format: 'date-time', description: 'The status and the file are deleted after this instant.', }
    - `rowCount`: `number | null` — { nullable: true, type: Number, example: 120 }
    - `sellerCount`: `number | null` — { nullable: true, type: Number, example: 12 }
    - `fileName`: `string | null` — { nullable: true, type: String, example: 'thue-khau-tru_2026-09-01_2026-09-30.xlsx', }
    - `errorCode`: `string | null` — { nullable: true, type: String, description: 'Set when status is FAILED.', }

#### `GET /api/v1/web/admin/finance/tax-reports/withholding/exports/:id/file`
Download my finished withholding tax workbook
- Điều kiện: `RequirePermissions(PERMISSION_KEYS.FinanceTaxReportsExport)` · `RateLimit({ userPerMin: 10, ipPerMin: 30 })`
- Path `id`: `string`
- Response: `ApiOkResponse({ schema: { type: 'string', format: 'binary' } })` · `Promise<void>`

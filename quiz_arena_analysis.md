# Quiz Arena — Full Codebase Analysis

> **Platform Goal:** Host free and paid quizzes. Users can create quizzes, take them with anti-cheat enforcement, win prizes automatically (prize pool), get refunds if a paid quiz is cancelled, and manage wallet funds through add/withdraw.

---

## 1. ✅ What Is Fully Implemented

### Backend

| Feature | Where | Status |
|---|---|---|
| User auth (JWT) | `middlewares/verifyUser.js` | ✅ |
| Quiz CRUD (create, read, update, delete) | `controllers/main/quizController.js` | ✅ |
| AI quiz generation (Gemini) | `services/aiService.js` | ✅ |
| AI-based auto-moderation on create | `controllers/main/quizController.js` L195–217 | ✅ |
| One-by-one question serving (no answer leakage) | `quizController.js → startAttempt, submitSingleAnswer` | ✅ |
| Server-side question ordering + Fisher-Yates shuffle | `quizController.js` L624–636 | ✅ |
| Registration + escrow payment for paid quizzes | `quizController.js → registerForQuiz` | ✅ |
| Auto-cancel quiz if < 5 participants | `services/cronScheduler.js` | ✅ |
| Full refund on cancellation (MongoDB session) | `services/prizeDistributionService.js → cancelQuizAndRefund` | ✅ |
| Prize pool distribution (creator 30%, platform 20%, winners 50%) | `services/prizeDistributionService.js → processQuizResults` | ✅ |
| Cron jobs: start-time check + end-time prize distribution | `services/cronScheduler.js` | ✅ |
| Anti-cheat middleware (tab-switch, suspicious activity, device fingerprint) | `middlewares/antiCheatMiddleware.js` | ✅ |
| Violation recording on QuizAttempt | `services/antiCheatService.js` + `quizController.js → recordViolation` | ✅ |
| Wallet add-funds (admin-approval flow) | `controllers/main/walletController.js → addFunds` | ✅ |
| Wallet withdrawal (admin-approval flow) | `walletController.js → requestWithdrawal` | ✅ |
| Transaction history with pagination + aggregates | `walletController.js → getTransactions, getEarningsSummary` | ✅ |
| Dashboard routes (quiz approval, user management, stats) | `routes/dashboard/*`, `controllers/dashboard/*` | ✅ |
| Input validation (Joi schemas) | `validation/quizValidation.js`, `walletSchema.js` | ✅ |
| Indexes on all major query fields | `models/Quiz.js`, `models/QuizAttempt.js`, `models/Transaction.js` | ✅ |
| Rate limiting (quiz creation, wallet, attempts) | `routes/main/quizRoutes.js`, `walletRoutes.js` | ✅ |
| Centralized error handler + request logger | `index.js` | ✅ |
| Public leaderboard | `quizController.js → getQuizLeaderboard` | ✅ |

### Frontend

| Feature | Where | Status |
|---|---|---|
| Quiz attempt UI (one-by-one flow) | `Pages/QuizAttempt.jsx` | ✅ |
| Fullscreen enforcement on attempt | `QuizAttempt.jsx` L51–90 | ✅ |
| Tab-switch detection + auto-submit at 3 violations | `QuizAttempt.jsx` L92–135 | ✅ |
| Copy/paste/right-click/devtools blocking | `QuizAttempt.jsx` L137–180 | ✅ |
| Global quiz timer + per-question timer | `QuizAttempt.jsx` L206–245 | ✅ |
| Violations panel (live anti-cheat log) | `QuizAttempt.jsx` L568–596 | ✅ |
| Quiz creation with AI generation | `Pages/CreateQuiz.jsx` | ✅ |
| Quiz registration + prize pool display | `Components/QuizRegistration.jsx`, `Components/PrizePoolDisplay.jsx` | ✅ |
| My attempts page | `Pages/MyAttempts.jsx` | ✅ |
| My quizzes page | `Pages/MyQuizzes.jsx` | ✅ |
| Wallet page | `Pages/Wallet.jsx` | ✅ |
| Quiz results page | `Pages/QuizResult.jsx` | ✅ |
| Quiz detail page | `Pages/QuizDetails.jsx` | ✅ |
| Profile page | `Pages/Profile.jsx` | ✅ |
| Contact page | `Pages/ContactUs.jsx` | ✅ |

---

## 2. 🐛 Bugs & Critical Issues

### Bug 1 — `app.listen()` Called Twice in `index.js`
**Severity: 🔴 Critical**

```js
// index.js — two app.listen() calls
async function main() {
    await mongoose.connect(MONGODB_URI);
    app.listen(5000, () => {}); // ← First call (inside main, after DB)
}
main();

app.listen(5000, () => {}); // ← Second call (outside main, before DB!)
```

**Effect:** The server starts twice on port 5000. The second call fires before the DB connection is ready, meaning some requests can arrive before the DB is connected. This also causes an `EADDRINUSE` error in many environments.

**Fix:** Remove the `app.listen()` at line 118–120. Only keep the one inside `main()`.

---

### Bug 2 — Field Name Mismatch in `antiCheatMiddleware.js`
**Severity: 🟠 High**

In `checkQuizAccess()`:
```js
// antiCheatMiddleware.js L31
QuizAttempt.countDocuments({
    userId,
    'violations.timestamp': { $gte: ... } // ← WRONG FIELD NAME
})
```

The `QuizAttempt` model uses `antiCheatViolations`, not `violations`. This query always returns 0, meaning the "too many violations" access restriction never triggers.

**Fix:** Change `'violations.timestamp'` → `'antiCheatViolations.timestamp'`

---

### Bug 3 — Violation Rate Limiter Uses In-Memory `Map` (Not Scalable)
**Severity: 🟡 Medium**

```js
// antiCheatMiddleware.js — violationRateLimit()
const violationCounts = new Map(); // ← Lives only in process memory
```

This map is reset on every deploy/restart, never cleaned up for completed attempts, and doesn't work if you run multiple server processes (Vercel, PM2 cluster, etc.).

**Fix:** Use Redis or MongoDB to track violation counts with TTL.

---

### Bug 4 — `validateAttemptSession` References Wrong Fields
**Severity: 🟠 High**

```js
// antiCheatMiddleware.js L105–107
const timeLimit = attempt.quizId.timeLimit * 1000; // ← 'timeLimit' doesn't exist on Quiz model
const timeElapsed = Date.now() - new Date(attempt.startedAt).getTime(); // ← should be attempt.startTime
```

The Quiz model uses `duration` (not `timeLimit`) and `QuizAttempt` uses `startTime` (not `startedAt`). This middleware will always use `undefined * 1000 = NaN` and crash silently.

---

### Bug 5 — `registerForQuiz`: Dead Code for "Cancelled" Check
**Severity: 🟡 Low**

```js
// quizController.js L380 + L396
if (!quiz || quiz.status !== 'approved') { // ← This already covers 'cancelled'
    return res.status(404).json(...)
}

// L396 — This block is never reached
if (quiz.status === 'cancelled') {
    return res.status(400).json(...)
}
```

The second cancelled check is dead code because a cancelled quiz will already fail the first `status !== 'approved'` check above it.

---

### Bug 6 — `getQuiz` `hasAccess` Logic Is Incomplete for Paid Registered Users
**Severity: 🟡 Medium**

```js
// quizController.js L312–315
hasAccess: !quiz.isPaid || userAttempt || quiz.creatorId._id.toString() === userId
```

A user who **registered** (paid) but hasn't attempted yet gets `hasAccess: false` because they have no `userAttempt`. This could cause the frontend to block them. Should also check if the user is in `quiz.participantManagement.registeredUsers`.

---

## 3. 🔧 What Needs to Be Improved

### Improvement 1 — `addFunds` Is Manual/Admin Only (No Payment Gateway)
**Status: 🟡 Incomplete**

Currently `addFunds` just creates a `pending` transaction record and waits for admin to manually approve it. There is no Razorpay/Stripe/UPI integration. For a quiz platform built around paid quizzes, this is a major gap.

**Recommendation:** Integrate Razorpay (ideal for Indian market with UPI support) to auto-credit wallet on successful payment. Keep admin-approval only as a fallback for manual transfers.

---

### Improvement 2 — Cron Jobs Use `console.log` Instead of Logger
**Status: 🟡 Minor**

`cronScheduler.js` uses raw `console.log`/`console.error` while the rest of the app uses `utils/logger.js` (Winston). Inconsistent log format makes debugging harder in production.

**Fix:** Replace all `console.log/error` in `cronScheduler.js` (and `prizeDistributionService.js`) with `logger.info/error`.

---

### Improvement 3 — Prize Distribution Doesn't Handle Tie-Breaking Fairly
**Status: 🟡 Medium**

In `prizeDistributionService.processQuizResults()`:
```js
const attempts = await QuizAttempt.find({...}).sort({ score: -1, duration: 1 });
```

This is a good start (score desc, time asc), but there's no handling for the case where 2 users have **identical score and duration**. The winner is random based on DB insertion order.

**Recommendation:** Add a tertiary sort on submission timestamp, and consider documenting the tie-breaking rules to users.

---

### Improvement 4 — No Email Notifications
**Status: 🔴 Missing**

There's no email service wired up anywhere. Users don't receive any notifications for:
- Quiz approved/rejected
- Quiz cancelled + refunded
- Prize won
- Withdrawal approved/rejected

**Recommendation:** Integrate Nodemailer + an SMTP provider (Resend, SendGrid) and trigger emails from the cron jobs and admin approval handlers.

---

### Improvement 5 — `Leaderboard.jsx` Is Essentially a Placeholder
**Status: 🔴 Stub Page**

```
Pages/Leaderboard.jsx  →  265 bytes (likely empty or placeholder)
```

A leaderboard backend route exists (`GET /quizzes/public/:quizId/leaderboard`) but the dedicated Leaderboard page in the frontend appears to be unimplemented.

---

### Improvement 6 — Anti-Cheat Settings in Quiz Are Not Enforced Per-Quiz in Frontend
**Status: 🟠 Missing Link**

The `Quiz` model has per-quiz anti-cheat settings:
```js
settings.antiCheat.enableTabSwitchDetection  // could be false
settings.antiCheat.enableFullScreen          // default false
settings.antiCheat.preventCopyPaste         // default true
```

But `QuizAttempt.jsx` applies all anti-cheat measures unconditionally to every quiz. It doesn't read `quiz.settings.antiCheat` to decide which rules to enforce.

**Fix:** In `startQuizAttempt()` read `quizData.settings.antiCheat` and conditionally register/skip event listeners based on those flags.

---

### Improvement 7 — `Question.js` Saves Inside a Loop (N+1 Queries)
**Status: 🟡 Performance**

```js
// quizController.js L150–158
for (const qData of aiResult.questions) {
    const question = new Question({...});
    await question.save(); // ← One DB write per question
}
```

For a quiz with 20 questions, this makes 20 sequential DB writes. Use `Question.insertMany()` instead.

---

### Improvement 8 — Withdrawal Deducts Balance Before Admin Approval
**Status: 🟡 UX Risk**

```js
// walletController.js L211
user.wallet.balance -= amount; // ← Immediately deducted
// status: 'pending'  ← But not yet processed
```

If admin rejects the withdrawal, the balance is deducted until the rejection is processed. There's no automated reversal logic visible in this controller. The dashboard admin wallet controller should have an explicit "reject withdrawal → refund balance" flow.

---

### Improvement 9 — No Notification/WebSocket for Real-Time Quiz Status
**Status: 🟡 Missing**

Paid quizzes have a scheduled `startTime`. Users waiting for the quiz to start have no real-time mechanism to know the quiz began. Currently they must poll manually.

**Recommendation:** Add a simple long-poll or SSE endpoint for the quiz start event, or use Socket.io for real-time participant count and quiz status updates.

---

### Improvement 10 — `DashboardUser.js` Model Is Minimal (700 bytes)
**Status: 🟡 Review Needed**

The dashboard user model is very thin. Consider whether it needs: roles (admin vs moderator), action audit logs, and whether the `cancelledBy` / `approvedBy` references in `Quiz.js` are being populated correctly.

---

## 4. 🗑️ What Is Unnecessary / Should Be Removed or Cleaned Up

| Item | Location | Reason |
|---|---|---|
| Duplicate `app.listen()` at the bottom | `index.js` L118–120 | **Bug** — starts server before DB is ready |
| Dead `if (quiz.status === 'cancelled')` check | `quizController.js → registerForQuiz` L396 | Unreachable code, covered by earlier check |
| `AntiCheatMiddleware.validateApiKey()` | `antiCheatMiddleware.js` L272–286 | References `/api/external/` which doesn't exist, never used |
| `AntiCheatMiddleware.checkQuizAccess()` violation query | `antiCheatMiddleware.js` L31 | Wrong field name (`violations` vs `antiCheatViolations`), broken query |
| `user.suspended` check in `checkQuizAccess()` | `antiCheatMiddleware.js` L20 | `User.js` model has `blocked`, not `suspended` — will always be `undefined` |
| `retakeData` field in `QuizAttempt.js` | `models/QuizAttempt.js` L235–248 | No retake logic exists anywhere in codebase |
| `subscription` field in `User.js` | `models/User.js` L47–62 | No subscription logic implemented anywhere — unused schema bloat |
| `QuizAttempt.analytics.questionsRevisited` | `models/QuizAttempt.js` L154 | Question revisiting is impossible in one-by-one flow |
| `publishedAt` field in `Quiz.js` | `models/Quiz.js` L76 | Never populated anywhere in the codebase |
| Dual `getQuiz` fallback in `QuizService.js` | `frontend/service/QuizService.js` L12–18 | Silent catch-and-retry is unpredictable; should be one explicit endpoint |

---

## 5. 📋 Feature Implementation Status Summary

```
✅ Fully Built
  - Quiz CRUD
  - AI question generation + auto-moderation
  - One-by-one question serving (no answer leakage)
  - Anti-cheat (frontend: fullscreen, tab-switch, copy-paste, devtools)
  - Paid quiz registration with escrow
  - Auto-cancel + full refund (< 5 participants)
  - Auto prize distribution (cron, MongoDB sessions)
  - Prize pool display + leaderboard backend
  - Wallet (balance, transactions, earnings, withdrawal request)
  - Dashboard admin routes for quiz approval, wallet, stats

🟡 Partially Built / Needs Work
  - Wallet add-funds (manual only, no payment gateway)
  - Anti-cheat per-quiz settings enforcement (hardcoded in frontend)
  - Withdrawal rejection reversal flow
  - Leaderboard page (frontend stub)
  - Email notifications (0% implemented)

🔴 Not Built / Missing
  - Payment gateway integration (Razorpay/Stripe)
  - Real-time quiz start notification (WebSocket/SSE)
  - Email notifications (approval, prize won, refund, rejection)
  - Actual subscription/premium tier logic
  - Retake logic (schema exists, no implementation)
```

---

## 6. Recommended Next Steps (Priority Order)

1. **[Fix Now]** Remove duplicate `app.listen()` in `index.js`
2. **[Fix Now]** Fix field name bug in `antiCheatMiddleware.js` (`violations` → `antiCheatViolations`, `suspended` → `blocked`, `startedAt` → `startTime`, `timeLimit` → `duration`)
3. **[Fix Now]** Fix `hasAccess` logic in `getQuiz` to include registered-but-not-yet-attempted users
4. **[Important]** Integrate Razorpay for `addFunds` (critical for paid quiz flow)
5. **[Important]** Read `quiz.settings.antiCheat` in `QuizAttempt.jsx` and conditionally apply rules
6. **[Important]** Add email notifications for quiz approval, prizes, and refunds
7. **[Improvement]** Replace `Question.save()` loop with `Question.insertMany()`
8. **[Improvement]** Replace `console.log` in cron/prize service with Winston logger
9. **[Cleanup]** Remove: `retakeData`, `subscription`, unused `validateApiKey` middleware, dead cancelled check
10. **[Future]** Add WebSocket/SSE for real-time quiz countdown and participant count

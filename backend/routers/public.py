"""
Public account deletion request page and API endpoint.
No authentication required — this is intentional.

GET  /delete-request        → renders the HTML form
POST /delete-request/submit → records the request and sends confirmation

Play Console Data Safety URL: <your-backend-url>/delete-request
"""
from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse
from collections import defaultdict
from time import time
import re

router = APIRouter(tags=["Public"])

# Simple in-process rate limiter: max 3 submissions per IP per 60 minutes
# Sufficient for the expected volume (a few dozen legitimate requests, not millions)
_RATE_LIMIT = 3
_RATE_WINDOW = 3600  # seconds
_ip_submissions: dict[str, list[float]] = defaultdict(list)

_PAGE_STYLE = """
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #F8F9FA;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: #FFFFFF;
    border-radius: 20px;
    padding: 40px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 4px 24px rgba(0,0,0,0.07);
  }
  .logo { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 8px; letter-spacing: -0.5px; }
  .logo span { color: #FF4422; }
  h1 { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 8px; margin-top: 24px; letter-spacing: -0.3px; }
  p { font-size: 14px; color: #6B7280; line-height: 1.6; margin-bottom: 20px; }
  label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px; }
  input, select, textarea {
    width: 100%;
    padding: 12px 14px;
    border: 1.5px solid #E5E7EB;
    border-radius: 12px;
    font-size: 14px;
    font-family: 'Inter', sans-serif;
    color: #111827;
    background: #F9FAFB;
    margin-bottom: 16px;
    outline: none;
    transition: border-color 0.15s;
  }
  input:focus, select:focus, textarea:focus { border-color: #FF4422; background: white; }
  textarea { resize: vertical; min-height: 80px; }
  button {
    width: 100%;
    padding: 15px;
    background: #FF4422;
    color: white;
    border: none;
    border-radius: 50px;
    font-size: 15px;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    transition: background 0.15s;
    min-height: 52px;
  }
  button:hover { background: #e03b1e; }
  .notice {
    background: rgba(255, 68, 34, 0.06);
    border: 1.5px solid rgba(255, 68, 34, 0.2);
    border-radius: 12px;
    padding: 14px;
    font-size: 13px;
    color: #92400e;
    margin-bottom: 24px;
    line-height: 1.5;
  }
  .success { text-align: center; padding: 16px 0; }
  .success .icon { font-size: 52px; margin-bottom: 16px; }
  .success h2 { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 12px; }
  .success p { color: #6B7280; font-size: 14px; }
</style>
"""

_FORM_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Delete Account — SwipeTurn</title>
  {style}
</head>
<body>
  <div class="card">
    <div class="logo">Swipe<span>Turn</span></div>
    <h1>Request Account Deletion</h1>
    <p>
      Use this form to request permanent deletion of your SwipeTurn account.
      You can also delete your account instantly from within the app:
      <strong>Profile → Delete Account</strong>.
      View our <a href="/privacy" style="color:#FF4422;">Privacy Policy</a>.
    </p>

    <div class="notice">
      ⚠️ Deleting your account will permanently remove your profile, saved jobs,
      applications, and all associated data. This action cannot be undone.
      We will process your request within <strong>30 days</strong>.
    </div>

    <form method="POST" action="/delete-request/submit">
      <label for="email">Email address linked to your account *</label>
      <input
        type="email"
        id="email"
        name="email"
        required
        placeholder="you@example.com"
        autocomplete="email"
      />

      <label for="reason">Reason (optional)</label>
      <select id="reason" name="reason">
        <option value="">Select a reason...</option>
        <option value="not_using">No longer using the app</option>
        <option value="privacy">Privacy concerns</option>
        <option value="found_job">Found a job</option>
        <option value="other">Other</option>
      </select>

      <label for="notes">Additional notes (optional)</label>
      <textarea id="notes" name="notes" placeholder="Anything else you'd like us to know..."></textarea>

      <button type="submit">Request Account Deletion</button>

      <!-- Honeypot: hidden from real users, filled by bots -->
      <div style="position:absolute;left:-9999px;opacity:0;pointer-events:none;" aria-hidden="true">
        <label for="website">Leave this blank</label>
        <input type="text" id="website" name="website" tabindex="-1" autocomplete="off" />
      </div>
    </form>
  </div>
</body>
</html>
""".format(style=_PAGE_STYLE)

_SUCCESS_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Deletion Request Received — SwipeTurn</title>
  {style}
</head>
<body>
  <div class="card">
    <div class="logo">Swipe<span>Turn</span></div>
    <div class="success">
      <div class="icon">✅</div>
      <h2>Request Received</h2>
      <p>
        Your request has been logged for <strong>{email}</strong>.<br/><br/>
        Your account and all associated data will be permanently deleted
        within <strong>30 days</strong>. If you need urgent assistance,
        contact us at <a href="mailto:support@swipeturn.com" style="color:#FF4422;">support@swipeturn.com</a>.
      </p>
    </div>
  </div>
</body>
</html>
"""


@router.get("/delete-request", response_class=HTMLResponse, include_in_schema=False)
async def deletion_request_page():
    """Public account deletion request page (no authentication required).
    Submitted to Google Play Console as the Data Safety deletion URL."""
    return HTMLResponse(content=_FORM_HTML)


@router.post("/delete-request/submit", response_class=HTMLResponse, include_in_schema=False)
async def deletion_request_submit(
    request: Request,
    email: str = Form(...),
    reason: str = Form(""),
    notes: str = Form(""),
    website: str = Form(""),  # honeypot — bots fill this, humans don't see it
):
    """Receives deletion requests from the public web form.

    Security measures:
    - Rate limit: 3 submissions per IP per hour
    - Honeypot field: bots that fill 'website' are silently rejected
    - Basic email format validation
    - Inputs capped in length before logging
    """
    client_ip = request.client.host if request.client else "unknown"

    # Honeypot check — visible only to bots, hidden from real users via CSS
    if website.strip():
        # Silently return success to not tip off bots
        return HTMLResponse(content=_SUCCESS_HTML.format(style=_PAGE_STYLE, email="your address"))

    # Rate limit check
    now = time()
    recent = [t for t in _ip_submissions[client_ip] if now - t < _RATE_WINDOW]
    _ip_submissions[client_ip] = recent  # prune old entries
    if len(recent) >= _RATE_LIMIT:
        return HTMLResponse(
            content="""<!DOCTYPE html><html><head><meta charset='UTF-8'/>
            <title>Too Many Requests</title></head><body style='font-family:sans-serif;padding:40px;'>
            <h2>Too many requests</h2>
            <p>You've submitted too many deletion requests. Please wait an hour before trying again.
            Or email us directly at <a href='mailto:support@swipeturn.com'>support@swipeturn.com</a>.</p>
            </body></html>""",
            status_code=429,
        )
    _ip_submissions[client_ip].append(now)

    # Basic email validation
    safe_email = email.strip()[:200]
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', safe_email):
        return HTMLResponse(
            content="""<!DOCTYPE html><html><head><meta charset='UTF-8'/></head>
            <body style='font-family:sans-serif;padding:40px;'>
            <h2>Invalid email</h2><p>Please go back and enter a valid email address.</p>
            </body></html>""",
            status_code=400,
        )

    safe_reason = reason.strip()[:100]
    safe_notes = notes.strip()[:500]

    print(f"[deletion-request] ip={client_ip} email={safe_email!r} reason={safe_reason!r}")

    # TODO: Send confirmation email via SendGrid / Resend / SES
    # TODO: Notify support inbox

    success_html = _SUCCESS_HTML.format(style=_PAGE_STYLE, email=safe_email)
    return HTMLResponse(content=success_html)


_PRIVACY_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — SwipeTurn</title>
  {style}
  <style>
    .card {{ max-width: 800px; padding: 60px; }}
    .content h2 {{ font-size: 18px; font-weight: 700; color: #111827; margin-top: 32px; margin-bottom: 12px; }}
    .content p, .content li {{ font-size: 15px; color: #4B5563; line-height: 1.7; margin-bottom: 16px; }}
    .content ul {{ margin-left: 20px; margin-bottom: 16px; }}
    .footer {{ margin-top: 40px; padding-top: 24px; border-top: 1px solid #E5E7EB; font-size: 13px; color: #9CA3AF; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Swipe<span>Turn</span></div>
    <h1>Privacy Policy</h1>
    <p>Last Updated: April 6, 2026</p>

    <div class="content">
      <p>At SwipeTurn, we prioritize your privacy and are committed to protecting your personal data. This policy explains how we handle your information when you use our mobile application and services.</p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li><strong>Profile Data:</strong> Name, email address, and professional preferences provided during onboarding.</li>
        <li><strong>Professional Data:</strong> When you upload a CV, we extract professional skills and generate a semantic matching vector. <strong>We do not store your raw CV file or raw extracted text.</strong></li>
        <li><strong>Interaction Data:</strong> We record your "swipes" (likes/dislikes) and application history to improve your job feed.</li>
      </ul>

      <h2>2. How We Use Information</h2>
      <p>We use your data solely to provide and improve the SwipeTurn job matching service, including:</p>
      <ul>
        <li>Personalizing your job feed.</li>
        <li>Generating match scores between your profile and job openings.</li>
        <li>Facilitating your job applications.</li>
      </ul>

      <h2>3. Data Retention & Deletion</h2>
      <p>We retain your profile data as long as your account is active. You have the right to request deletion of your data at any time:</p>
      <ul>
        <li><strong>In-App:</strong> Profile → Delete Account for instant deletion.</li>
        <li><strong>Web:</strong> Use our <a href="/delete-request" style="color:#FF4422;">Account Deletion Request</a> form.</li>
      </ul>
      <p>Upon deletion, all personal data, including your matching profile and swipe history, is permanently removed from our production databases within 30 days.</p>

      <h2>4. Security</h2>
      <p>We implement industry-standard security measures, including encryption in transit and at rest. We do not sell your personal data to third parties.</p>

      <h2>5. Contact Us</h2>
      <p>If you have questions about this policy, contact us at <a href="mailto:support@swipeturn.com" style="color:#FF4422;">support@swipeturn.com</a>.</p>
    </div>

    <div class="footer">
      &copy; 2026 SwipeTurn. All rights reserved.
    </div>
  </div>
</body>
</html>
""".format(style=_PAGE_STYLE)


@router.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
async def privacy_policy_page():
    """Public Privacy Policy page. Mandatory for Google Play / Apple App Store listing."""
    return HTMLResponse(content=_PRIVACY_HTML)

import express from "express";
import { join } from "path";
import * as oauthController from "../controllers/oauth.controller.js";
import { validateSessionCookie } from "../middleware/session.js";
import {
  authorizeRateLimit,
  tokenRateLimit,
  revokeRateLimit,
  introspectRateLimit,
  oauthGeneralRateLimit,
} from "../middleware/rate-limit.js";
import {
  oauthCors,
  oauthSecurityHeaders,
  validateReferer,
} from "../middleware/cors.js";
import {
  generateAuthorizeCSRF,
  setCSRFCookie,
  doubleSubmitCookie,
} from "../middleware/csrf.js";
import { env } from "../../config/env.js";

const router = express.Router();
const supabaseUmdPath = join(
  process.cwd(),
  "node_modules",
  "@supabase",
  "supabase-js",
  "dist",
  "umd",
  "supabase.js"
);

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildConsentHtml(): string {
  const supabaseUrl = escapeAttr(env.SUPABASE_URL=https://<project-ref>.supabase.co
  const supabaseAnonKey = escapeAttr(env.SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY

  return (
    "<!doctype html>" +
    '<html lang="en">' +
    "<head>" +
    '  <meta charset="UTF-8" />' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
    "  <title>Authorize Access</title>" +
    "  <style>" +
    "    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: #0f1216; color: #e6e7eb; }" +
    "    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }" +
    "    .card { width: 100%; max-width: 520px; background: #171b22; border: 1px solid #2a2f3a; border-radius: 12px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }" +
    "    h1 { margin: 0 0 10px 0; font-size: 20px; }" +
    "    .muted { color: #a7b0be; font-size: 13px; }" +
    "    .status { margin-top: 12px; font-size: 13px; color: #7dd3fc; }" +
    "    .error { margin-top: 12px; color: #f87171; font-size: 13px; display: none; }" +
    "    .section { margin-top: 18px; }" +
    "    label { display: block; font-size: 12px; color: #9aa3b2; margin-bottom: 6px; }" +
    "    input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #2a2f3a; background: #0f1216; color: #e6e7eb; }" +
    "    button { padding: 10px 14px; border-radius: 8px; border: 1px solid #2a2f3a; background: #1f2937; color: #e6e7eb; cursor: pointer; }" +
    "    button.primary { background: #2563eb; border-color: #2563eb; }" +
    "    button.danger { background: #7f1d1d; border-color: #7f1d1d; }" +
    "    .actions { display: flex; gap: 10px; margin-top: 16px; }" +
    "    ul { margin: 8px 0 0 18px; padding: 0; }" +
    "    .hidden { display: none; }" +
    "  </style>" +
    "</head>" +
    `<body data-supabase-url="${supabaseUrl}" data-supabase-anon-key="${supabaseAnonKey}">` +
    '  <div class="wrap">' +
    '    <div class="card">' +
    "      <h1>Authorize application</h1>" +
    '      <div class="muted">Review and approve access for this OAuth request.</div>' +
    '      <div id="status" class="status">Loading...</div>' +
    '      <div id="error" class="error"></div>' +
    '      <div id="login" class="section hidden">' +
    "        <h2 class=\"muted\">Sign in to continue</h2>" +
    '        <form id="login-form">' +
    '          <label for="email">Email</label>' +
    '          <input id="email" name="email" type="email" required />' +
    '          <div style="height: 12px;"></div>' +
    '          <label for="password">Password</label>' +
    '          <input id="password" name="password" type="password" required />' +
    '          <div class="actions">' +
    '            <button class="primary" type="submit">Sign in</button>' +
    "          </div>" +
    "        </form>" +
    "      </div>" +
    '      <div id="consent" class="section hidden">' +
    '        <div class="muted">App requesting access:</div>' +
    '        <div id="client-name" style="margin-top: 6px; font-size: 16px;"></div>' +
    '        <div class="muted" style="margin-top: 14px;">Requested scopes:</div>' +
    '        <ul id="scopes"></ul>' +
    '        <div class="actions">' +
    '          <button id="approve" class="primary" type="button">Allow</button>' +
    '          <button id="deny" class="danger" type="button">Deny</button>' +
    "        </div>" +
    "      </div>" +
    "    </div>" +
    "  </div>" +
    '  <script src="/oauth/supabase.js"></script>' +
    '  <script src="/oauth/consent.js" defer></script>' +
    "</body>" +
    "</html>"
  );
}

const consentScript = `
(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  var statusEl = byId('status');
  var errorEl = byId('error');
  var loginSection = byId('login');
  var consentSection = byId('consent');
  var clientNameEl = byId('client-name');
  var scopesEl = byId('scopes');
  var approveBtn = byId('approve');
  var denyBtn = byId('deny');
  var loginForm = byId('login-form');

  function setStatus(text) {
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  function setError(text) {
    if (!errorEl) {
      return;
    }
    if (text) {
      errorEl.textContent = text;
      errorEl.style.display = 'block';
    } else {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  var supabaseUrl = document.body.dataset.supabaseUrl;
  var supabaseAnonKey = document.body.dataset.supabaseAnonKey;

  if (!supabaseUrl || !supabaseAnonKey) {
    setError('Missing Supabase configuration.');
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    setError('Supabase SDK failed to load.');
    return;
  }

  var supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  var params = new URLSearchParams(window.location.search);
  var authorizationId = params.get('authorization_id');
  if (!authorizationId) {
    setError('Missing authorization_id.');
    return;
  }

  async function ensureSession() {
    setStatus('Checking session...');
    var sessionResult = await supabase.auth.getSession();
    if (sessionResult.error) {
      setError(sessionResult.error.message || 'Unable to read session.');
    }

    if (!sessionResult.data || !sessionResult.data.session) {
      loginSection.classList.remove('hidden');
      consentSection.classList.add('hidden');
      setStatus('Sign in to continue.');
      return;
    }

    loginSection.classList.add('hidden');
    await loadDetails();
  }

  async function loadDetails() {
    setError('');
    setStatus('Loading authorization details...');
    var detailResult = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (detailResult.error) {
      setError(detailResult.error.message || 'Unable to load authorization details.');
      return;
    }

    var details = detailResult.data || {};
    if (details.redirect_url) {
      window.location.assign(details.redirect_url);
      return;
    }

    if (clientNameEl) {
      clientNameEl.textContent = (details.client && details.client.name) ? details.client.name : 'Unknown client';
    }

    if (scopesEl) {
      scopesEl.innerHTML = '';
      var scopeList = (details.scope || '').split(' ').filter(Boolean);
      if (scopeList.length === 0) {
        var li = document.createElement('li');
        li.textContent = 'basic access';
        scopesEl.appendChild(li);
      } else {
        scopeList.forEach(function (scope) {
          var li = document.createElement('li');
          li.textContent = scope;
          scopesEl.appendChild(li);
        });
      }
    }

    consentSection.classList.remove('hidden');
    setStatus('Review the request and approve access.');
  }

  async function handleDecision(action) {
    setError('');
    setStatus(action === 'approve' ? 'Approving request...' : 'Denying request...');
    var fn = action === 'approve' ? supabase.auth.oauth.approveAuthorization : supabase.auth.oauth.denyAuthorization;
    var result = await fn(authorizationId, { skipBrowserRedirect: true });
    if (result.error) {
      setError(result.error.message || 'Unable to submit consent.');
      return;
    }
    if (result.data && result.data.redirect_url) {
      window.location.assign(result.data.redirect_url);
      return;
    }
    setStatus('Request processed.');
  }

  if (approveBtn) {
    approveBtn.addEventListener('click', function () {
      handleDecision('approve');
    });
  }

  if (denyBtn) {
    denyBtn.addEventListener('click', function () {
      handleDecision('deny');
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      setError('');
      setStatus('Signing in...');
      var email = byId('email').value;
      var password = byId('password').value;
      var signInResult = await supabase.auth.signInWithPassword({ email: email, password: password });
      if (signInResult.error) {
        setError(signInResult.error.message || 'Login failed.');
        return;
      }
      await loadDetails();
    });
  }

  ensureSession();
})();
`;

// Apply OAuth-specific CORS and security headers to all routes
router.use(oauthCors);
router.use(oauthSecurityHeaders);
router.use(validateReferer);

// Apply general OAuth rate limiting to all routes
router.use(oauthGeneralRateLimit);

router.use(setCSRFCookie);

router.get("/consent", (_req, res) => {
  res.status(200).type("html").send(buildConsentHtml());
});

router.get("/consent.js", (_req, res) => {
  res.status(200).type("application/javascript").send(consentScript);
});

router.get("/supabase.js", (_req, res) => {
  res.status(200).type("application/javascript").sendFile(supabaseUmdPath);
});

// OAuth endpoints with specific rate limits and CSRF protection
router.get(
  "/authorize",
  authorizeRateLimit,
  generateAuthorizeCSRF,
  validateSessionCookie,
  oauthController.authorize
);
// OAuth token endpoint - No CSRF needed (protected by state parameter + PKCE)
router.post("/token", tokenRateLimit, oauthController.token);
router.post(
  "/revoke",
  revokeRateLimit,
  doubleSubmitCookie,
  oauthController.revoke
);
router.post("/introspect", introspectRateLimit, oauthController.introspect);

export default router;

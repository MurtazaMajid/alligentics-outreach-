const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/') {
        return htmlResponse(renderApp());
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        return json({ ok: true, service: 'alligentics-outreach' });
      }

      if (request.method === 'GET' && url.pathname === '/api/senders') {
        const senders = readSenders(env);
        return json(Object.entries(senders).map(([id, value]) => ({ id, ...value })));
      }

      if (request.method === 'POST' && url.pathname === '/api/send') {
        return await sendNewMessage(request, env);
      }

      if (request.method === 'GET' && url.pathname === '/api/conversations') {
        return await listConversations(env);
      }

      const conversationMatch = url.pathname.match(/^\/api\/conversations\/(\d+)$/);
      if (request.method === 'GET' && conversationMatch) {
        return await getConversation(Number(conversationMatch[1]), env);
      }

      const replyMatch = url.pathname.match(/^\/api\/conversations\/(\d+)\/reply$/);
      if (request.method === 'POST' && replyMatch) {
        return await replyToConversation(Number(replyMatch[1]), request, env);
      }

      if (request.method === 'POST' && url.pathname === '/mailgun/inbound') {
        return await handleInbound(request, env);
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: error?.message || 'Unexpected error' }, 500);
    }
  },
};

function readSenders(env) {
  if (!env.SENDER_IDENTITIES) return {};

  let parsed;
  try {
    parsed = JSON.parse(env.SENDER_IDENTITIES);
  } catch {
    throw new Error('SENDER_IDENTITIES must be valid JSON');
  }

  const clean = {};
  for (const [id, sender] of Object.entries(parsed || {})) {
    const name = String(sender?.name || '').trim();
    const email = normalizeEmail(sender?.email);
    if (id && name && email) clean[id] = { name, email };
  }
  return clean;
}

async function sendNewMessage(request, env) {
  const payload = await readJson(request);
  const sender = readSenders(env)[payload.sender_id];
  if (!sender) return json({ error: 'Invalid sender_id' }, 400);

  const to = normalizeEmail(payload.to);
  const subject = String(payload.subject || '').trim();
  const message = String(payload.message || '').trim();

  if (!to || !subject || !message) {
    return json({ error: 'to, subject and message are required' }, 400);
  }

  const mailgun = await sendViaMailgun(env, {
    from: formatFrom(sender),
    to,
    subject,
    text: message,
    html: textToEmailHtml(message),
  });

  const conversationId = await upsertConversation(env, to, subject);
  await insertMessage(env, {
    conversationId,
    direction: 'outbound',
    senderEmail: sender.email,
    recipientEmail: to,
    subject,
    bodyText: message,
    mailgunMessageId: mailgun.id || null,
  });

  return json({ ok: true, conversation_id: conversationId, mailgun_id: mailgun.id || null });
}

async function replyToConversation(id, request, env) {
  const payload = await readJson(request);
  const sender = readSenders(env)[payload.sender_id];
  if (!sender) return json({ error: 'Invalid sender_id' }, 400);

  const message = String(payload.message || '').trim();
  if (!message) return json({ error: 'message is required' }, 400);

  const conversation = await env.DB.prepare(
    'SELECT * FROM conversations WHERE id = ?'
  ).bind(id).first();

  if (!conversation) return json({ error: 'Conversation not found' }, 404);

  const subject = makeReplySubject(conversation.subject || 'Your message');

  const mailgun = await sendViaMailgun(env, {
    from: formatFrom(sender),
    to: conversation.contact_email,
    subject,
    text: message,
    html: textToEmailHtml(message),
  });

  await insertMessage(env, {
    conversationId: id,
    direction: 'outbound',
    senderEmail: sender.email,
    recipientEmail: conversation.contact_email,
    subject,
    bodyText: message,
    mailgunMessageId: mailgun.id || null,
  });

  await touchConversation(env, id);
  return json({ ok: true, mailgun_id: mailgun.id || null });
}

async function handleInbound(request, env) {
  const form = await request.formData();

  const verified = await verifyMailgunSignature(form, env.MAILGUN_WEBHOOK_SIGNING_KEY);
  if (!verified) return json({ error: 'Invalid Mailgun signature' }, 401);

  const sender = normalizeEmail(form.get('sender') || extractEmail(form.get('From')));
  const recipient = normalizeEmail(form.get('recipient') || extractEmail(form.get('To')));
  const subject = String(form.get('subject') || '').trim();
  const bodyText = String(
    form.get('stripped-text') || form.get('body-plain') || form.get('body-html') || ''
  ).trim();
  const messageId = String(
    form.get('Message-Id') || form.get('message-id') || form.get('Message-ID') || ''
  ).trim() || null;

  if (!sender) return json({ error: 'Missing or invalid sender' }, 400);

  const conversationId = await upsertConversation(env, sender, subject);

  try {
    await insertMessage(env, {
      conversationId,
      direction: 'inbound',
      senderEmail: sender,
      recipientEmail: recipient || '',
      subject,
      bodyText,
      mailgunMessageId: messageId,
    });
  } catch (error) {
    const text = String(error?.message || '').toLowerCase();
    if (!text.includes('unique') && !text.includes('constraint')) throw error;
  }

  await touchConversation(env, conversationId);
  return json({ ok: true });
}

async function verifyMailgunSignature(form, signingKey) {
  const timestamp = String(form.get('timestamp') || '');
  const token = String(form.get('token') || '');
  const signature = String(form.get('signature') || '').toLowerCase();

  if (!timestamp || !token || !signature || !signingKey) return false;

  // Reject obviously stale replay attempts. Five minutes is intentionally tight for this app.
  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(timestamp + token)
  );

  const expected = bytesToHex(new Uint8Array(digest));
  return timingSafeEqualHex(expected, signature);
}

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendViaMailgun(env, payload) {
  if (!env.MAILGUN_API_KEY) throw new Error('MAILGUN_API_KEY is not configured');
  if (!env.MAILGUN_DOMAIN) throw new Error('MAILGUN_DOMAIN is not configured');

  const base = String(env.MAILGUN_BASE_URL || 'https://api.mailgun.net').replace(/\/$/, '');
  const form = new FormData();
  form.set('from', payload.from);
  form.set('to', payload.to);
  form.set('subject', payload.subject);
  form.set('text', payload.text);
  if (payload.html) form.set('html', payload.html);

  const authorization = 'Basic ' + btoa(`api:${env.MAILGUN_API_KEY}`);
  const response = await fetch(`${base}/v3/${env.MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: authorization },
    body: form,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `Mailgun request failed with HTTP ${response.status}`);
  }
  return data;
}

async function upsertConversation(env, email, subject) {
  const existing = await env.DB.prepare(
    'SELECT id FROM conversations WHERE contact_email = ?'
  ).bind(email).first();

  if (existing) {
    await env.DB.prepare(
      `UPDATE conversations
       SET subject = CASE WHEN ? <> '' THEN ? ELSE subject END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(subject || '', subject || '', existing.id).run();
    return Number(existing.id);
  }

  const result = await env.DB.prepare(
    'INSERT INTO conversations (contact_email, subject) VALUES (?, ?)'
  ).bind(email, subject || null).run();

  return Number(result.meta.last_row_id);
}

async function insertMessage(env, message) {
  return env.DB.prepare(
    `INSERT INTO messages
      (conversation_id, direction, sender_email, recipient_email, subject, body_text, mailgun_message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    message.conversationId,
    message.direction,
    message.senderEmail,
    message.recipientEmail,
    message.subject || null,
    message.bodyText || '',
    message.mailgunMessageId || null
  ).run();
}

async function touchConversation(env, id) {
  await env.DB.prepare(
    'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(id).run();
}

async function listConversations(env) {
  const result = await env.DB.prepare(
    `SELECT c.*,
       (SELECT body_text FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
       (SELECT direction FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_direction
     FROM conversations c
     ORDER BY datetime(c.updated_at) DESC, c.id DESC`
  ).all();

  return json(result.results || []);
}

async function getConversation(id, env) {
  const conversation = await env.DB.prepare(
    'SELECT * FROM conversations WHERE id = ?'
  ).bind(id).first();

  if (!conversation) return json({ error: 'Conversation not found' }, 404);

  const messages = await env.DB.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC'
  ).bind(id).all();

  return json({ conversation, messages: messages.results || [] });
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : '';
}

function extractEmail(value) {
  const text = String(value || '');
  const angle = text.match(/<([^>]+)>/);
  return angle ? angle[1] : text;
}

function formatFrom(sender) {
  return `${sender.name} <${sender.email}>`;
}

function textToEmailHtml(text) {
  const safe = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ffffff;color:#17212b;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:24px;font-size:16px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;">${safe}</div>
  </body>
</html>`;
}

function makeReplySubject(subject) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error('Request body must be valid JSON');
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function htmlResponse(content) {
  return new Response(content, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function renderApp() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Alligentics Outreach</title>
  <style>
    :root{--bg:#061726;--card:#0b2334;--line:#173e55;--text:#f4fbff;--muted:#9ab4c3;--accent:#23c6d6;--accent2:#43e5c2;--danger:#ff8b8b}
    *{box-sizing:border-box} body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Arial,sans-serif;background:linear-gradient(180deg,#061726,#071d2d);color:var(--text)}
    .shell{max-width:1440px;margin:0 auto;padding:30px 22px 60px;overflow-x:hidden}.brand{display:flex;align-items:center;gap:12px;margin-bottom:24px}.logo{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:grid;place-items:center;color:#04202b;font-weight:900}.tag{color:var(--muted);margin-top:3px}
    .grid{display:grid;grid-template-columns:minmax(340px,400px) minmax(0,1fr);gap:18px;align-items:start}.card{min-width:0;background:rgba(11,35,52,.94);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:0 16px 40px rgba(0,0,0,.18)}h1,h2{margin:0 0 12px}h1{font-size:24px}h2{font-size:18px}.full{grid-column:1/-1}
    label{display:block;font-size:13px;color:var(--muted);margin:14px 0 6px}input,textarea,select,button{width:100%;min-width:0;font:inherit;border-radius:11px}input,textarea,select{background:#071d2a;color:var(--text);border:1px solid #25516a;padding:11px 12px;outline:none}textarea{resize:vertical;min-height:150px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}#message{min-height:280px}#reply{min-height:180px}input:focus,textarea:focus,select:focus{border-color:var(--accent)}button{border:0;padding:11px 14px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#03202a;font-weight:800;cursor:pointer}button.secondary{background:#102f42;color:var(--text);border:1px solid #29566c}.toolbar{display:flex;gap:10px;align-items:center;min-width:0}.toolbar h2{min-width:0}.toolbar button{width:auto;flex:0 0 auto}.status{font-size:13px;margin-top:10px;white-space:pre-wrap;color:var(--muted)}.error{color:var(--danger)}
    .list{border-top:1px solid var(--line);margin-top:10px;min-width:0}.item{min-width:0;padding:14px 8px;border-bottom:1px solid var(--line);cursor:pointer;border-radius:10px}.item:hover{background:#0d293c}.email{font-weight:800;overflow-wrap:anywhere}.subject{margin-top:5px;overflow-wrap:anywhere}.preview{color:var(--muted);font-size:13px;line-height:1.45;margin-top:6px;white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow-wrap:anywhere}.badge{display:inline-block;font-size:11px;padding:3px 7px;border-radius:999px;background:#113a49;color:#bdf7ef;margin-left:6px;vertical-align:middle}.message{min-width:0;border:1px solid var(--line);background:#071d2a;border-radius:13px;padding:14px;margin:10px 0}.message.inbound{border-left:3px solid var(--accent2)}.message.outbound{border-left:3px solid var(--accent)}.message .meta{font-size:12px;color:var(--muted);margin-bottom:8px;overflow-wrap:anywhere}.message .body{white-space:pre-wrap;line-height:1.6;overflow-wrap:anywhere}.empty{color:var(--muted);padding:14px 0}.small{font-size:12px;color:var(--muted)}
    @media(max-width:900px){.shell{padding:22px 14px 48px}.grid{grid-template-columns:1fr}.full{grid-column:auto}#message{min-height:220px}.card[style*="position:sticky"]{position:static!important}}
  </style>
</head>
<body>
  <main class="shell">
    <div class="brand"><div class="logo">A</div><div><h1>Alligentics Outreach</h1><div class="tag">Automate the work. Accelerate the business.</div></div></div>

    <div class="grid">
      <section class="card" style="position:sticky;top:18px">
        <h2>Compose</h2>
        <label>Sender</label><select id="sender"></select>
        <label>Customer email</label><input id="to" type="email" placeholder="name@company.com" />
        <label>Subject</label><input id="subject" placeholder="Quick question" />
        <label>Message</label><textarea id="message" placeholder="Write your outreach message...&#10;&#10;Blank lines and paragraph spacing are preserved in the email."></textarea>
        <div class="small" style="margin-top:7px">Tip: press Enter twice between paragraphs. Your spacing will be preserved in the delivered email.</div>
        <div style="margin-top:12px"><button id="sendBtn">Send email</button></div>
        <div id="sendStatus" class="status"></div>
      </section>

      <section class="card">
        <div class="toolbar" style="justify-content:space-between"><h2>Conversations</h2><button class="secondary" id="refreshBtn">Refresh</button></div>
        <div id="conversations" class="list"><div class="empty">Loading...</div></div>
      </section>

      <section id="threadCard" class="card full" hidden>
        <h2 id="threadTitle">Conversation</h2>
        <div id="thread"></div>
        <label>Reply from selected sender</label>
        <textarea id="reply" placeholder="Write a reply..."></textarea>
        <div style="margin-top:12px"><button id="replyBtn">Send reply</button></div>
        <div id="replyStatus" class="status"></div>
      </section>
    </div>
    <p class="small" style="margin-top:18px">Prototype note: add authentication before using this as a publicly reachable production inbox.</p>
  </main>
<script>
let currentConversationId = null;
const $ = (id) => document.getElementById(id);

$('sendBtn').addEventListener('click', sendMessage);
$('replyBtn').addEventListener('click', sendReply);
$('refreshBtn').addEventListener('click', loadConversations);

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadSenders() {
  try {
    const senders = await api('/api/senders');
    $('sender').innerHTML = senders.length
      ? senders.map(s => '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name) + ' &lt;' + escapeHtml(s.email) + '&gt;</option>').join('')
      : '<option value="">No sender identities configured</option>';
  } catch (e) {
    $('sender').innerHTML = '<option value="">Could not load senders</option>';
  }
}

async function sendMessage() {
  setStatus('sendStatus', 'Sending...');
  try {
    const data = await api('/api/send', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({
        sender_id: $('sender').value,
        to: $('to').value,
        subject: $('subject').value,
        message: $('message').value
      })
    });
    setStatus('sendStatus', 'Sent successfully.');
    $('message').value = '';
    await loadConversations();
    if (data.conversation_id) await openConversation(data.conversation_id);
  } catch (e) { setStatus('sendStatus', e.message, true); }
}

async function loadConversations() {
  $('conversations').innerHTML = '<div class="empty">Loading...</div>';
  try {
    const rows = await api('/api/conversations');
    if (!rows.length) {
      $('conversations').innerHTML = '<div class="empty">No conversations yet.</div>';
      return;
    }
    $('conversations').innerHTML = rows.map(c =>
      '<div class="item" data-id="' + c.id + '">' +
      '<div class="email">' + escapeHtml(c.contact_email) + (c.last_direction ? '<span class="badge">' + escapeHtml(c.last_direction) + '</span>' : '') + '</div>' +
      '<div class="subject">' + escapeHtml(c.subject || '(no subject)') + '</div>' +
      '<div class="preview">' + escapeHtml(c.last_message || '') + '</div>' +
      '</div>'
    ).join('');
    document.querySelectorAll('.item[data-id]').forEach(el => el.addEventListener('click', () => openConversation(Number(el.dataset.id))));
  } catch (e) {
    $('conversations').innerHTML = '<div class="empty error">' + escapeHtml(e.message) + '</div>';
  }
}

async function openConversation(id) {
  currentConversationId = id;
  $('threadCard').hidden = false;
  $('thread').innerHTML = '<div class="empty">Loading...</div>';
  try {
    const data = await api('/api/conversations/' + id);
    $('threadTitle').textContent = data.conversation.contact_email + ' · ' + (data.conversation.subject || '(no subject)');
    $('thread').innerHTML = data.messages.length ? data.messages.map(m =>
      '<div class="message ' + escapeHtml(m.direction) + '">' +
      '<div class="meta">' + escapeHtml(m.direction) + ' · ' + escapeHtml(m.sender_email) + ' → ' + escapeHtml(m.recipient_email) + ' · ' + escapeHtml(m.created_at || '') + '</div>' +
      '<div><strong>' + escapeHtml(m.subject || '') + '</strong></div>' +
      '<div class="body">' + escapeHtml(m.body_text || '') + '</div>' +
      '</div>'
    ).join('') : '<div class="empty">No messages.</div>';
    $('threadCard').scrollIntoView({behavior:'smooth', block:'start'});
  } catch (e) {
    $('thread').innerHTML = '<div class="empty error">' + escapeHtml(e.message) + '</div>';
  }
}

async function sendReply() {
  if (!currentConversationId) return;
  setStatus('replyStatus', 'Sending...');
  try {
    await api('/api/conversations/' + currentConversationId + '/reply', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({sender_id: $('sender').value, message: $('reply').value})
    });
    $('reply').value = '';
    setStatus('replyStatus', 'Reply sent successfully.');
    await openConversation(currentConversationId);
    await loadConversations();
  } catch (e) { setStatus('replyStatus', e.message, true); }
}

function setStatus(id, message, error = false) {
  const el = $(id); el.textContent = message; el.className = 'status' + (error ? ' error' : '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

loadSenders();
loadConversations();
</script>
</body>
</html>`;
}

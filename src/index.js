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

        return json(
          Object.entries(senders).map(([id, value]) => ({
            id,
            ...value
          }))
        );
      }

      if (request.method === 'GET' && url.pathname === '/api/templates') {
        return json(getTemplates());
      }

      if (request.method === 'POST' && url.pathname === '/api/send') {
        return await sendNewMessage(request, env);
      }

      if (request.method === 'GET' && url.pathname === '/api/conversations') {
        return await listConversations(env);
      }

      const conversationMatch =
        url.pathname.match(/^\/api\/conversations\/(\d+)$/);

      if (request.method === 'GET' && conversationMatch) {
        return await getConversation(
          Number(conversationMatch[1]),
          env
        );
      }

      const replyMatch =
        url.pathname.match(/^\/api\/conversations\/(\d+)\/reply$/);

      if (request.method === 'POST' && replyMatch) {
        return await replyToConversation(
          Number(replyMatch[1]),
          request,
          env
        );
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/mailgun/inbound'
      ) {
        return await handleInbound(request, env);
      }

      return json(
        { error: 'Not found' },
        404
      );
    } catch (error) {
      console.error(error);

      return json(
        {
          error:
            error?.message ||
            'Unexpected error'
        },
        500
      );
    }
  }
};


/* =========================================================
   OUTREACH TEMPLATES
   ========================================================= */

const OUTREACH_TEMPLATES = [
  {
    id: "plumbing",
    business_type: "plumbing",
    name: "Plumbing · Customer communication",
    subject: "An idea for {{business_name}}",
    body:
`Hi {{contact_name}} Team,

I came across {{business_name}} and wanted to reach out with an idea.

At Alligentics, we help businesses reduce repetitive communication and admin work. For a plumbing business, this could include handling common customer questions, collecting job details, booking visits, sending appointment reminders, following up on missed inquiries, and routing urgent requests to the right person.

I’d be happy to look at how you currently handle customer inquiries and suggest 1 or 2 areas that may be worth simplifying.

Would you be open to hearing the ideas?

Best,
{{owner_name}}
{{owner_position}}
Alligentics
https://alligentics.com/`,
    variables: [
      "business_name",
      "contact_name",
      "city",
      "service",
      "owner_name",
      "owner_position"
    ]
  },

  {
    id: "restaurant",
    business_type: "restaurant",
    name: "Restaurant · Customer communication",
    subject: "An idea for {{business_name}}",
    body:
`Hi {{contact_name}} Team,

I came across {{business_name}} and thought there may be a few areas where repetitive customer communication could be made easier.

At Alligentics, we help businesses streamline workflows such as reservation requests, repeated menu and timing questions, booking confirmations, event inquiries, customer follow ups, and feedback collection.

We’d be happy to understand how your team currently handles these interactions and suggest 1 or 2 practical improvements based on your existing setup.

Would you be open to hearing them?

Best,
{{owner_name}}
{{owner_position}}
Alligentics
https://alligentics.com/`,
    variables: [
      "business_name",
      "contact_name",
      "city",
      "service",
      "owner_name",
      "owner_position"
    ]
  },

  {
    id: "salon",
    business_type: "salon",
    name: "Salon · Bookings & follow-up",
    subject: "A small idea for {{business_name}}",
    body:
`Hi {{contact_name}} Team,

I came across {{business_name}} and wanted to share an idea that may be useful.

At Alligentics, we help businesses reduce repetitive work around customer communication. For salons, this can include appointment requests, rescheduling, service questions, reminders, follow-ups, rebooking, and handling inquiries coming through different channels.

Rather than suggesting a completely new system, we’d first look at how your current process works and identify 1 or 2 areas that could be made easier.

Would you be open to hearing the ideas?

Best,
{{owner_name}}
{{owner_position}}
Alligentics
https://alligentics.com/`,
    variables: [
      "business_name",
      "contact_name",
      "city",
      "service",
      "owner_name",
      "owner_position"
    ]
  },

  {
    id: "hr-services",
    business_type: "hr_services",
    name: "HR services · Recruitment workflow",
    subject: "An idea for {{business_name}}",
    body:
`Hi {{contact_name}} Team,

I came across {{business_name}} and noticed that recruitment and HR teams often spend a lot of time on repetitive coordination.

At Alligentics, we help businesses streamline workflows such as candidate intake, application sorting, interview scheduling, status updates, client communication, follow ups, and moving information between different systems.

We’d be happy to take a look at your current recruitment workflow and suggest 1 or 2 areas where repetitive work could potentially be reduced.

Would you be open to hearing the ideas?

Best,
{{owner_name}}
{{owner_position}}
Alligentics
https://alligentics.com/`,
    variables: [
      "business_name",
      "contact_name",
      "city",
      "service",
      "owner_name",
      "owner_position"
    ]
  },

  {
    id: "clinic",
    business_type: "clinic_hospital",
    name: "Clinic / Hospital · Patient communication",
    subject: "An idea for {{business_name}}",
    body:
`Hi {{contact_name}} Team,

I came across {{business_name}} and wanted to reach out with an idea.

Clinics often receive appointment requests, repeated patient questions, rescheduling requests, reminders, and follow ups throughout the day.

At Alligentics, we help businesses reduce repetitive communication while keeping staff involved whenever personal attention is required.

We’d be happy to understand how your clinic currently handles patient inquiries and suggest 1 or 2 areas that may be worth simplifying.

Would you be open to hearing the ideas?

Best,
{{owner_name}}
{{owner_position}}
Alligentics
https://alligentics.com/`,
    variables: [
      "business_name",
      "contact_name",
      "city",
      "service",
      "owner_name",
      "owner_position"
    ]
  },

  {
    id: "dental",
    business_type: "dental_clinic",
    name: "Dental clinic · Appointments & inquiries",
    subject: "A small idea for {{business_name}}",
    body:
`Hi {{contact_name}} Team,

I came across {{business_name}} and thought there may be a useful opportunity to make some of the patient communication around appointments easier.

At Alligentics, we help businesses streamline repetitive workflows such as appointment requests, confirmations, reminders, rescheduling, common treatment questions, post visit follow ups, and routing inquiries to staff when needed.

We’d be happy to look at your current process and suggest 1 or 2 practical areas that could potentially save your team time.

Would you be open to hearing the ideas?

Best,
{{owner_name}}
{{owner_position}}
Alligentics
https://alligentics.com/`,
    variables: [
      "business_name",
      "contact_name",
      "city",
      "service",
      "owner_name",
      "owner_position"
    ]
  },

  {
    id: "real-estate",
    business_type: "real_estate",
    name: "Real estate · Lead response & follow-up",
    subject: "An idea for {{business_name}}",
    body:
`Hi {{contact_name}} Team,

I came across {{business_name}} and wanted to reach out with an idea.

Real estate teams often receive leads through calls, WhatsApp, websites, social media, and ads at the same time, which can make it difficult to respond and follow up with every prospect consistently.

At Alligentics, we help businesses streamline areas such as initial inquiries, buyer requirements, lead qualification, site visit scheduling, follow ups, and CRM updates.

We’d be happy to review your current lead workflow and suggest 1 or 2 practical areas that may be worth simplifying.

Would you be open to hearing the ideas?

Best,
{{owner_name}}
{{owner_position}}
Alligentics
https://alligentics.com/`,
    variables: [
      "business_name",
      "contact_name",
      "city",
      "service",
      "owner_name",
      "owner_position"
    ]
  },

  {
    id: "auto-services",
    business_type: "auto_services",
    name: "Auto services · Booking & communication",
    subject: "An idea for {{business_name}}",
    body:
`Hi {{contact_name}} Team,

I came across {{business_name}} and thought there may be a few areas where customer communication could be made easier.

At Alligentics, we help businesses streamline repetitive workflows. For auto service businesses, this could include service inquiries, appointment requests, vehicle information collection, booking confirmations, maintenance reminders, job status updates, and customer follow ups.

We’d be happy to understand how your current process works and suggest 1 or 2 areas that could potentially save your team time.

Would you be open to hearing the ideas?

Best,
{{owner_name}}
{{owner_position}}
Alligentics
https://alligentics.com/`,
    variables: [
      "business_name",
      "contact_name",
      "city",
      "service",
      "owner_name",
      "owner_position"
    ]
  }
];


function getTemplates() {
  return OUTREACH_TEMPLATES.map(
    template => ({
      ...template,

      variables:
        template.variables.map(
          key => ({
            key,
            label: variableLabel(key)
          })
        )
    })
  );
}


function variableLabel(key) {
  return ({
    business_name: "Business name",
    contact_name: "Contact name",
    city: "City",
    service: "Service / focus",
    owner_name: "Owner name",
    owner_position: "Owner position"
  })[key] || key;
}


/* =========================================================
   SENDERS
   ========================================================= */

function readSenders(env) {
  if (!env.SENDER_IDENTITIES) {
    return {};
  }

  let parsed;

  try {
    parsed =
      JSON.parse(env.SENDER_IDENTITIES);
  } catch {
    throw new Error(
      "SENDER_IDENTITIES must be valid JSON"
    );
  }

  const clean = {};

  for (
    const [id, sender]
    of Object.entries(parsed || {})
  ) {
    const name =
      String(
        sender?.name || ""
      ).trim();

    const email =
      normalizeEmail(
        sender?.email
      );

    if (
      id &&
      name &&
      email
    ) {
      clean[id] = {
        name,
        email
      };
    }
  }

  return clean;
}


/* =========================================================
   SEND NEW EMAIL
   ========================================================= */

async function sendNewMessage(
  request,
  env
) {
  const payload =
    await readJson(request);

  const sender =
    readSenders(env)[
      payload.sender_id
    ];

  if (!sender) {
    return json(
      {
        error:
          "Invalid sender_id"
      },
      400
    );
  }

  const to =
    normalizeEmail(
      payload.to
    );

  const subject =
    String(
      payload.subject || ""
    ).trim();

  const message =
    String(
      payload.message || ""
    ).trim();

  if (
    !to ||
    !subject ||
    !message
  ) {
    return json(
      {
        error:
          "to, subject and message are required"
      },
      400
    );
  }

  const threadHeaders =
    await getConversationReplyHeaders(
      env,
      id
    );

  const mailgun =
    await sendViaMailgun(
      env,
      {
        from:
          formatFrom(sender),

        to,

        subject,

        text:
          message,

        html:
          textToEmailHtml(
            message
          )
      }
    );

  const conversationId =
    await upsertConversation(
      env,
      to,
      subject
    );

  await insertMessage(
    env,
    {
      conversationId,

      direction:
        "outbound",

      senderEmail:
        sender.email,

      recipientEmail:
        to,

      subject,

      bodyText:
        message,

      mailgunMessageId:
        mailgun.id ||
        null
    }
  );

  return json({
    ok: true,

    conversation_id:
      conversationId,

    mailgun_id:
      mailgun.id ||
      null
  });
}


/* =========================================================
   REPLY
   ========================================================= */

async function getConversationReplyHeaders(
  env,
  conversationId
) {
  const result =
    await env.DB.prepare(
      `SELECT mailgun_message_id
       FROM messages
       WHERE conversation_id = ?
         AND mailgun_message_id IS NOT NULL
         AND mailgun_message_id <> ''
       ORDER BY id ASC`
    )
      .bind(conversationId)
      .all();

  const ids =
    (result.results || [])
      .map(row => String(row.mailgun_message_id || "").trim())
      .filter(Boolean);

  return {
    inReplyTo: ids.length ? ids[ids.length - 1] : null,
    references: ids.join(" ")
  };
}


async function replyToConversation(
  id,
  request,
  env
) {
  const payload =
    await readJson(request);

  const sender =
    readSenders(env)[
      payload.sender_id
    ];

  if (!sender) {
    return json(
      {
        error:
          "Invalid sender_id"
      },
      400
    );
  }

  const message =
    String(
      payload.message || ""
    ).trim();

  if (!message) {
    return json(
      {
        error:
          "message is required"
      },
      400
    );
  }

  const conversation =
    await env.DB.prepare(
      "SELECT * FROM conversations WHERE id = ?"
    )
      .bind(id)
      .first();

  if (!conversation) {
    return json(
      {
        error:
          "Conversation not found"
      },
      404
    );
  }

  const subject =
    makeReplySubject(
      conversation.subject ||
      "Your message"
    );

  const mailgun =
    await sendViaMailgun(
      env,
      {
        from:
          formatFrom(sender),

        to:
          conversation.contact_email,

        subject,

        text:
          message,

        html:
          textToEmailHtml(
            message
          ),
        inReplyTo:
          threadHeaders.inReplyTo,
        references:
          threadHeaders.references
      }
    );

  await insertMessage(
    env,
    {
      conversationId:
        id,

      direction:
        "outbound",

      senderEmail:
        sender.email,

      recipientEmail:
        conversation.contact_email,

      subject,

      bodyText:
        message,

      mailgunMessageId:
        mailgun.id ||
        null
    }
  );

  await touchConversation(
    env,
    id
  );

  return json({
    ok: true,

    mailgun_id:
      mailgun.id ||
      null
  });
}


/* =========================================================
   MAILGUN INBOUND
   ========================================================= */

async function handleInbound(
  request,
  env
) {
  const form =
    await request.formData();

  const verified =
    await verifyMailgunSignature(
      form,
      env.MAILGUN_WEBHOOK_SIGNING_KEY
    );

  if (!verified) {
    return json(
      {
        error:
          "Invalid Mailgun signature"
      },
      401
    );
  }

  const sender =
    normalizeEmail(
      form.get("sender") ||
      extractEmail(
        form.get("From")
      )
    );

  const recipient =
    normalizeEmail(
      form.get("recipient") ||
      extractEmail(
        form.get("To")
      )
    );

  const subject =
    String(
      form.get("subject") ||
      ""
    ).trim();

  const bodyText =
    String(
      form.get("stripped-text") ||
      form.get("body-plain") ||
      form.get("body-html") ||
      ""
    ).trim();

  const messageId =
    String(
      form.get("Message-Id") ||
      form.get("message-id") ||
      form.get("Message-ID") ||
      ""
    ).trim() ||
    null;

  const inReplyTo =
    String(
      form.get("In-Reply-To") ||
      form.get("in-reply-to") ||
      ""
    ).trim() ||
    null;

  const references =
    String(
      form.get("References") ||
      form.get("references") ||
      ""
    ).trim();

  if (!sender) {
    return json(
      {
        error:
          "Missing or invalid sender"
      },
      400
    );
  }

  const threadMessageIds = [
    ...(inReplyTo ? [inReplyTo] : []),
    ...references.split(/\s+/).map(value => value.trim()).filter(Boolean)
  ];

  let conversationId = null;

  for (const messageIdCandidate of threadMessageIds) {
    const match =
      await env.DB.prepare(
        `SELECT conversation_id
         FROM messages
         WHERE mailgun_message_id = ?
         LIMIT 1`
      )
        .bind(messageIdCandidate)
        .first();

    if (match) {
      conversationId = Number(match.conversation_id);
      break;
    }
  }

  if (!conversationId) {
    conversationId =
      await upsertConversation(
        env,
        sender,
        subject
      );
  }

  try {
    await insertMessage(
      env,
      {
        conversationId,

        direction:
          "inbound",

        senderEmail:
          sender,

        recipientEmail:
          recipient || "",

        subject,

        bodyText,

        mailgunMessageId:
          messageId
      }
    );
  } catch (error) {
    const text =
      String(
        error?.message || ""
      ).toLowerCase();

    if (
      !text.includes("unique") &&
      !text.includes("constraint")
    ) {
      throw error;
    }
  }

  await touchConversation(
    env,
    conversationId
  );

  return json({
    ok: true
  });
}


/* =========================================================
   MAILGUN SIGNATURE
   ========================================================= */

async function verifyMailgunSignature(
  form,
  signingKey
) {
  const timestamp =
    String(
      form.get("timestamp") ||
      ""
    );

  const token =
    String(
      form.get("token") ||
      ""
    );

  const signature =
    String(
      form.get("signature") ||
      ""
    ).toLowerCase();

  if (
    !timestamp ||
    !token ||
    !signature ||
    !signingKey
  ) {
    return false;
  }

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const ts =
    Number(timestamp);

  if (
    !Number.isFinite(ts) ||
    Math.abs(now - ts) > 300
  ) {
    return false;
  }

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(
        signingKey
      ),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

  const digest =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(
        timestamp + token
      )
    );

  const expected =
    bytesToHex(
      new Uint8Array(
        digest
      )
    );

  return timingSafeEqualHex(
    expected,
    signature
  );
}


function timingSafeEqualHex(
  a,
  b
) {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    diff |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }

  return diff === 0;
}


function bytesToHex(bytes) {
  return [...bytes]
    .map(
      b =>
        b
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}


/* =========================================================
   MAILGUN SEND
   ========================================================= */

async function sendViaMailgun(
  env,
  payload
) {
  if (!env.MAILGUN_API_KEY) {
    throw new Error(
      "MAILGUN_API_KEY is not configured"
    );
  }

  if (!env.MAILGUN_DOMAIN) {
    throw new Error(
      "MAILGUN_DOMAIN is not configured"
    );
  }

  const base =
    String(
      env.MAILGUN_BASE_URL ||
      "https://api.mailgun.net"
    ).replace(
      /\/$/,
      ""
    );

  const form =
    new FormData();

  form.set(
    "from",
    payload.from
  );

  form.set(
    "to",
    payload.to
  );

  form.set(
    "subject",
    payload.subject
  );

  form.set(
    "text",
    payload.text
  );

  form.set(
    "h:Reply-To",
    "replies@alligentics.com"
  );

  if (payload.html) {
    form.set(
      "html",
      payload.html
    );
  }

  if (payload.inReplyTo) {
    form.set(
      "h:In-Reply-To",
      payload.inReplyTo
    );
  }

  if (payload.references) {
    form.set(
      "h:References",
      payload.references
    );
  }

  const authorization =
    "Basic " +
    btoa(
      `api:${env.MAILGUN_API_KEY}`
    );

  const response =
    await fetch(
      `${base}/v3/${env.MAILGUN_DOMAIN}/messages`,
      {
        method: "POST",

        headers: {
          Authorization:
            authorization
        },

        body: form
      }
    );

  const data =
    await response
      .json()
      .catch(
        () => ({})
      );

  if (!response.ok) {
    throw new Error(
      data?.message ||
      `Mailgun request failed with HTTP ${response.status}`
    );
  }

  return data;
}


/* =========================================================
   DATABASE
   ========================================================= */

async function upsertConversation(
  env,
  email,
  subject
) {
  const existing =
    await env.DB.prepare(
      "SELECT id FROM conversations WHERE contact_email = ?"
    )
      .bind(email)
      .first();

  if (existing) {
    await env.DB.prepare(
      `UPDATE conversations
       SET subject = CASE
         WHEN ? <> '' THEN ?
         ELSE subject
       END,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(
        subject || "",
        subject || "",
        existing.id
      )
      .run();

    return Number(
      existing.id
    );
  }

  const result =
    await env.DB.prepare(
      `INSERT INTO conversations
       (contact_email, subject)
       VALUES (?, ?)`
    )
      .bind(
        email,
        subject || null
      )
      .run();

  return Number(
    result.meta.last_row_id
  );
}


async function insertMessage(
  env,
  message
) {
  return env.DB.prepare(
    `INSERT INTO messages
      (
        conversation_id,
        direction,
        sender_email,
        recipient_email,
        subject,
        body_text,
        mailgun_message_id
      )
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      message.conversationId,
      message.direction,
      message.senderEmail,
      message.recipientEmail,
      message.subject || null,
      message.bodyText || "",
      message.mailgunMessageId || null
    )
    .run();
}


async function touchConversation(
  env,
  id
) {
  await env.DB.prepare(
    `UPDATE conversations
     SET updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(id)
    .run();
}


async function listConversations(
  env
) {
  const result =
    await env.DB.prepare(
      `SELECT c.*,
       (
         SELECT body_text
         FROM messages m
         WHERE m.conversation_id = c.id
         ORDER BY m.id DESC
         LIMIT 1
       ) AS last_message,
       (
         SELECT direction
         FROM messages m
         WHERE m.conversation_id = c.id
         ORDER BY m.id DESC
         LIMIT 1
       ) AS last_direction,
       (
         SELECT COUNT(*)
         FROM messages m
         WHERE m.conversation_id = c.id
           AND m.direction = 'inbound'
           AND m.id = (
             SELECT MAX(m2.id)
             FROM messages m2
             WHERE m2.conversation_id = c.id
           )
       ) AS reply_waiting
       FROM conversations c
       ORDER BY datetime(c.updated_at) DESC,
                c.id DESC`
    )
      .all();

  return json(
    result.results || []
  );
}


async function getConversation(
  id,
  env
) {
  const conversation =
    await env.DB.prepare(
      "SELECT * FROM conversations WHERE id = ?"
    )
      .bind(id)
      .first();

  if (!conversation) {
    return json(
      {
        error:
          "Conversation not found"
      },
      404
    );
  }

  const messages =
    await env.DB.prepare(
      `SELECT *
       FROM messages
       WHERE conversation_id = ?
       ORDER BY id ASC`
    )
      .bind(id)
      .all();

  return json({
    conversation,

    messages:
      messages.results || []
  });
}


/* =========================================================
   HELPERS
   ========================================================= */

function normalizeEmail(
  value
) {
  const email =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(
    email
  )
    ? email
    : "";
}


function extractEmail(
  value
) {
  const text =
    String(
      value || ""
    );

  const angle =
    text.match(
      /<([^>]+)>/
    );

  return angle
    ? angle[1]
    : text;
}


function formatFrom(
  sender
) {
  return `Alligentics <${sender.email}>`;
}


function textToEmailHtml(
  text
) {
  const safe =
    String(
      text || ""
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      );

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ffffff;color:#17212b;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:24px;font-size:16px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;">${safe}</div>
  </body>
</html>`;
}


function makeReplySubject(
  subject
) {
  return /^re:/i.test(
    subject
  )
    ? subject
    : `Re: ${subject}`;
}


async function readJson(
  request
) {
  try {
    return await request.json();
  } catch {
    throw new Error(
      "Request body must be valid JSON"
    );
  }
}


function json(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {
        "content-type":
          "application/json; charset=utf-8",

        "cache-control":
          "no-store"
      }
    }
  );
}


function htmlResponse(
  content
) {
  return new Response(
    content,
    {
      headers: {
        "content-type":
          "text/html; charset=utf-8",

        "cache-control":
          "no-store"
      }
    }
  );
}


/* =========================================================
   FRONTEND
   ========================================================= */

function renderApp() {
  return `<!doctype html>
<html lang="en">

<head>

  <meta charset="utf-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  />

  <title>Alligentics Outreach</title>

  <style>

    :root {
      --bg:#061726;
      --card:#0b2334;
      --line:#173e55;
      --text:#f4fbff;
      --muted:#9ab4c3;
      --accent:#23c6d6;
      --accent2:#43e5c2;
      --danger:#ff8b8b;
    }

    * {
      box-sizing:border-box;
    }

    body {
      margin:0;
      font-family:
        Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Arial,
        sans-serif;

      background:
        linear-gradient(
          180deg,
          #061726,
          #071d2d
        );

      color:var(--text);
    }

    .shell {
      max-width:1440px;
      margin:0 auto;
      padding:30px 22px 60px;
      overflow-x:hidden;
    }

    .brand {
      display:flex;
      align-items:center;
      gap:12px;
      margin-bottom:24px;
    }

    .logo {
      width:42px;
      height:42px;
      border-radius:12px;

      background:
        linear-gradient(
          135deg,
          var(--accent),
          var(--accent2)
        );

      display:grid;
      place-items:center;
      color:#04202b;
      font-weight:900;
    }

    h1 {
      margin:0;
      font-size:25px;
    }

    h2 {
      margin-top:0;
    }

    .tag {
      color:var(--muted);
      margin-top:3px;
    }

    .grid {
      display:grid;
      grid-template-columns:
        minmax(0, 1fr)
        minmax(0, 1fr);

      gap:18px;
      align-items:start;
    }

    .card {
      min-width:0;

      background:
        linear-gradient(
          180deg,
          rgba(11,35,52,.98),
          rgba(8,29,43,.98)
        );

      border:1px solid var(--line);
      border-radius:16px;
      padding:20px;

      box-shadow:
        0 18px 45px
        rgba(0,0,0,.16);
    }

    .full {
      grid-column:1/-1;
    }

    label {
      display:block;
      font-size:13px;
      font-weight:700;
      color:#cfe6ef;
      margin:14px 0 7px;
    }

    input,
    select,
    textarea {
      width:100%;

      border:
        1px solid
        #245169;

      border-radius:10px;

      background:#061a29;
      color:var(--text);

      padding:11px 12px;
      font:inherit;
      outline:none;
    }

    input:focus,
    select:focus,
    textarea:focus {
      border-color:var(--accent);
      box-shadow:
        0 0 0 3px
        rgba(35,198,214,.10);
    }

    textarea {
      min-height:220px;
      resize:vertical;
    }

    button {
      border:0;
      border-radius:10px;

      padding:11px 15px;

      background:
        linear-gradient(
          135deg,
          var(--accent),
          var(--accent2)
        );

      color:#04202b;

      font-weight:800;
      cursor:pointer;
    }

    button:hover {
      filter:brightness(1.05);
    }

    button.secondary {
      background:#102f42;
      color:var(--text);
      border:1px solid #29566c;
    }

    .toolbar {
      display:flex;
      gap:10px;
      align-items:center;
      flex-wrap:wrap;
    }

    .status {
      margin-top:10px;
      color:#9fe8dc;
      font-size:13px;
      min-height:18px;
    }

    .status.error,
    .error {
      color:var(--danger);
    }

    .list {
      margin-top:15px;
    }

    .item {
      min-width:0;
      padding:14px 8px;

      border-bottom:
        1px solid
        var(--line);

      cursor:pointer;
      border-radius:10px;
    }

    .item:hover {
      background:#0d293c;
    }

    .email {
      font-weight:800;
      overflow-wrap:anywhere;
    }

    .subject {
      margin-top:5px;
      overflow-wrap:anywhere;
    }

    .preview {
      color:var(--muted);
      font-size:13px;
      line-height:1.45;
      margin-top:6px;

      white-space:pre-wrap;

      overflow:hidden;

      display:-webkit-box;
      -webkit-line-clamp:3;
      -webkit-box-orient:vertical;

      overflow-wrap:anywhere;
    }

    .replySummary {
      margin-top:8px;
      color:#bdf7ef;
      font-size:12px;
      font-weight:700;
    }

    .replySummary.empty {
      display:none;
    }

    .item.hasReply {
      background:rgba(67,229,194,.055);
      border-left:3px solid var(--accent2);
      padding-left:10px;
    }

    .item.active {
      background:#0d293c;
      outline:1px solid #245169;
    }

    .badge {
      display:inline-block;
      font-size:11px;
      padding:3px 7px;

      border-radius:999px;

      background:#113a49;
      color:#bdf7ef;

      margin-left:6px;
      vertical-align:middle;
    }

    .message {
      min-width:0;

      border:
        1px solid
        var(--line);

      background:#071d2a;

      border-radius:13px;

      padding:15px;
      margin:12px 0;
    }

    .message.inbound {
      border-left:
        3px solid
        var(--accent2);
    }

    .message.outbound {
      border-left:
        3px solid
        var(--accent);
    }

    .message .meta {
      font-size:12px;
      color:var(--muted);
      margin-bottom:8px;
      overflow-wrap:anywhere;
    }

    .message .body {
      white-space:pre-wrap;
      line-height:1.65;
      overflow-wrap:anywhere;
    }

    .messageHead {
      display:flex;
      justify-content:space-between;
      gap:12px;
      align-items:center;
      margin-bottom:8px;
    }

    .messageRole {
      font-weight:800;
    }

    .messageTime {
      font-size:11px;
      color:var(--muted);
      white-space:nowrap;
    }

    .replyInline {
      width:auto;
      margin-top:12px;
      padding:7px 10px;
      font-size:12px;

      background:#102f42;
      color:var(--text);

      border:
        1px solid
        #29566c;
    }

    .replyBox {
      margin-top:18px;
      padding-top:18px;

      border-top:
        1px solid
        var(--line);
    }

    .empty {
      color:var(--muted);
      padding:14px 0;
    }

    .small {
      font-size:12px;
      color:var(--muted);
    }

    .templateGrid {
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px;
    }

    .templateGrid .wide {
      grid-column:1/-1;
    }

    .templateHint {
      font-size:12px;
      color:var(--muted);
      line-height:1.5;
      margin-top:7px;
    }

    .pill {
      display:inline-block;
      font-size:11px;
      padding:4px 8px;

      border-radius:999px;

      background:#113a49;
      color:#bdf7ef;

      margin:4px 4px 0 0;
    }

    .ownerCard {
      margin-top:10px;
      padding:10px 12px;

      border:
        1px solid
        #173e55;

      background:#071d2a;
      border-radius:10px;

      font-size:12px;
      color:var(--muted);
    }

    .ownerCard strong {
      color:var(--text);
    }

    @media(max-width:900px) {

      .shell {
        padding:
          22px 14px 48px;
      }

      .grid {
        grid-template-columns:1fr;
      }

      .full {
        grid-column:auto;
      }

      #message {
        min-height:220px;
      }

      .card[style*="position:sticky"] {
        position:static!important;
      }

      .templateGrid {
        grid-template-columns:1fr;
      }

      .templateGrid .wide {
        grid-column:auto;
      }
    }

  </style>

</head>

<body>

<main class="shell">

  <div class="brand">

    <div class="logo">
      A
    </div>

    <div>

      <h1>
        Alligentics Outreach
      </h1>

      <div class="tag">
        Automate the work. Accelerate the business.
      </div>

    </div>

  </div>


  <div class="grid">


    <!-- =================================================
         COMPOSE
         ================================================= -->

    <section
      class="card"
      style="position:sticky;top:18px"
    >

      <h2>
        Compose
      </h2>


      <label>
        Sender
      </label>

      <select id="sender"></select>


      <!-- NEW OWNER SELECTOR -->

      <label>
        Owner / Sender Name
      </label>

      <select id="owner">

        <option value="murtaza">
          Murtaza — CTO & Co-Founder
        </option>

        <option value="omar">
          Omar — CEO & Co-Founder
        </option>

        <option value="hassan">
          Hassan — CRO & Co-Founder
        </option>

      </select>


      <div
        id="ownerInfo"
        class="ownerCard"
      >
        Signature:
        <strong>
          Murtaza
        </strong>
        ·
        CTO & Co-Founder
      </div>


      <div class="templateGrid">


        <div>

          <label>
            Business type
          </label>

          <select
            id="businessType"
          ></select>

        </div>


        <div>

          <label>
            Template
          </label>

          <select
            id="template"
          ></select>

        </div>


        <div>

          <label>
            Business name
          </label>

          <input
            id="businessName"
            placeholder="e.g. ABC Plumbing"
          />

        </div>


        <div>

          <label>
            Contact name
            <span class="small">
              (optional)
            </span>
          </label>

          <input
            id="contactName"
            placeholder="e.g. Hassan"
          />

        </div>


        <div>

          <label>
            City
            <span class="small">
              (optional)
            </span>
          </label>

          <input
            id="city"
            placeholder="e.g. Islamabad"
          />

        </div>


        <div>

          <label>
            Service / focus
            <span class="small">
              (optional)
            </span>
          </label>

          <input
            id="service"
            placeholder="e.g. Plumbing services"
          />

        </div>


        <div class="wide">

          <div class="templateHint">
            Templates use simple variables.
            Fill what you know and the email
            will be rendered automatically.
          </div>

          <div
            id="variablePills"
          ></div>

        </div>

      </div>


      <label>
        Customer email
      </label>

      <input
        id="to"
        type="email"
        placeholder="name@company.com"
      />


      <label>
        Subject
      </label>

      <input
        id="subject"
        placeholder="An idea for your business"
      />


      <label>
        Message
      </label>

      <textarea
        id="message"
        placeholder="Select a template to load the message..."
      ></textarea>


      <div
        class="small"
        style="margin-top:7px"
      >
        Keep outreach concise and personalized.
      </div>


      <div
        style="margin-top:12px"
      >

        <button id="sendBtn">
          Send email
        </button>

      </div>


      <div
        id="sendStatus"
        class="status"
      ></div>

    </section>


    <!-- =================================================
         CONVERSATIONS
         ================================================= -->

    <section class="card">

      <div
        class="toolbar"
        style="justify-content:space-between"
      >

        <div>

          <h2
            style="margin-bottom:4px"
          >
            Conversations
          </h2>

          <div class="small">
            Full email threads, including customer replies.
          </div>

          <div
            id="replySummary"
            class="replySummary"
          ></div>

        </div>


        <button
          class="secondary"
          id="refreshBtn"
        >
          Refresh
        </button>

      </div>


      <div
        id="conversations"
        class="list"
      >

        <div class="empty">
          Loading...
        </div>

      </div>

    </section>


    <!-- =================================================
         THREAD
         ================================================= -->

    <section
      id="threadCard"
      class="card full"
      hidden
    >

      <div
        class="toolbar"
        style="justify-content:space-between"
      >

        <div>

          <h2 id="threadTitle">
            Conversation
          </h2>

          <div
            id="threadSubtitle"
            class="small"
          >
            Messages appear here in chronological order.
          </div>

        </div>


        <button
          class="secondary"
          id="threadRefreshBtn"
        >
          Refresh thread
        </button>

      </div>


      <div id="thread"></div>


      <div class="replyBox">

        <label>
          Reply
        </label>

        <div
          class="small"
          style="margin-bottom:7px"
        >
          The customer will receive this from
          Alligentics.
        </div>


        <textarea
          id="reply"
          placeholder="Write your reply..."
        ></textarea>


        <div
          class="toolbar"
          style="margin-top:12px"
        >

          <button id="replyBtn">
            Send reply
          </button>

          <button
            class="secondary"
            id="replyClearBtn"
          >
            Clear
          </button>

        </div>


        <div
          id="replyStatus"
          class="status"
        ></div>

      </div>

    </section>

  </div>


  <p
    class="small"
    style="margin-top:18px"
  >
    Prototype note: add authentication before
    using this as a publicly reachable production inbox.
  </p>

</main>


<script>

/* =========================================================
   OWNER CONFIGURATION
   ========================================================= */

const OWNERS = {

  murtaza: {
    name: "Murtaza",
    position: "CTO & Co-Founder"
  },

  omar: {
    name: "Omar",
    position: "CEO & Co-Founder"
  },

  hassan: {
    name: "Hassan",
    position: "CRO & Co-Founder"
  }

};


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let currentConversationId = null;

let allTemplates = [];

let conversationListSignature = "";

let currentThreadSignature = "";


const $ =
  id =>
    document.getElementById(id);


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

$('sendBtn')
  .addEventListener(
    'click',
    sendMessage
  );


$('replyBtn')
  .addEventListener(
    'click',
    sendReply
  );


$('replyClearBtn')
  .addEventListener(
    'click',
    () => {

      $('reply').value = '';

      $('replyStatus').textContent = '';

    }
  );


$('refreshBtn')
  .addEventListener(
    'click',
    loadConversations
  );


$('threadRefreshBtn')
  .addEventListener(
    'click',
    () => {

      if (
        currentConversationId
      ) {

        openConversation(
          currentConversationId
        );

      }

    }
  );


/* =========================================================
   OWNER EVENTS
   ========================================================= */

$('owner')
  .addEventListener(
    'change',
    () => {

      updateOwnerInfo();

      renderCurrentTemplate();

    }
  );


function updateOwnerInfo() {

  const owner =
    OWNERS[
      $('owner').value
    ] ||
    OWNERS.murtaza;


  $('ownerInfo').innerHTML =
    'Signature: <strong>' +
    escapeHtml(
      owner.name
    ) +
    '</strong> · ' +
    escapeHtml(
      owner.position
    );

}


/* =========================================================
   API HELPER
   ========================================================= */

async function api(
  path,
  options = {}
) {

  const response =
    await fetch(
      path,
      options
    );


  const data =
    await response
      .json()
      .catch(
        () => ({})
      );


  if (!response.ok) {

    throw new Error(
      data.error ||
      'Request failed'
    );

  }


  return data;

}


/* =========================================================
   SENDERS
   ========================================================= */

async function loadSenders() {

  try {

    const senders =
      await api(
        '/api/senders'
      );


    $('sender').innerHTML =
      senders.length

        ? senders
            .map(
              sender =>
                '<option value="' +
                escapeHtml(
                  sender.id
                ) +
                '">' +

                escapeHtml(
                  sender.name
                ) +

                ' &lt;' +

                escapeHtml(
                  sender.email
                ) +

                '&gt;</option>'
            )
            .join('')

        : '<option value="">No sender identities configured</option>';

  } catch (error) {

    $('sender').innerHTML =
      '<option value="">Could not load senders</option>';

  }

}


/* =========================================================
   TEMPLATES
   ========================================================= */

async function loadTemplates() {

  try {

    allTemplates =
      await api(
        '/api/templates'
      );


    const types =
      [
        ...new Map(
          allTemplates.map(
            template =>
              [
                template.business_type,
                template
              ]
          )
        ).values()
      ];


    $('businessType').innerHTML =
      types
        .map(
          template =>
            '<option value="' +
            escapeHtml(
              template.business_type
            ) +
            '">' +

            escapeHtml(
              formatBusinessType(
                template.business_type
              )
            ) +

            '</option>'
        )
        .join('');


    $('businessType')
      .addEventListener(
        'change',
        refreshTemplateChoices
      );


    $('template')
      .addEventListener(
        'change',
        applySelectedTemplate
      );


    [
      'businessName',
      'contactName',
      'city',
      'service'
    ].forEach(
      id => {

        $(id)
          .addEventListener(
            'input',
            renderCurrentTemplate
          );

      }
    );


    refreshTemplateChoices();

  } catch (error) {

    $('businessType').innerHTML =
      '<option value="">Could not load templates</option>';

  }

}


function refreshTemplateChoices() {

  const matches =
    allTemplates.filter(
      template =>
        template.business_type ===
        $('businessType').value
    );


  $('template').innerHTML =
    matches
      .map(
        template =>
          '<option value="' +
          escapeHtml(
            template.id
          ) +
          '">' +

          escapeHtml(
            template.name
          ) +

          '</option>'
      )
      .join('');


  applySelectedTemplate();

}


function applySelectedTemplate() {

  const template =
    allTemplates.find(
      item =>
        item.id ===
        $('template').value
    );


  if (!template) {
    return;
  }


  $('subject').value =
    renderText(
      template.subject
    );


  $('message').value =
    renderText(
      template.body
    );


  $('variablePills').innerHTML =
    (
      template.variables ||
      []
    )
      .map(
        variable =>
          '<span class="pill">{{' +
          escapeHtml(
            variable.key
          ) +
          '}}</span>'
      )
      .join('');

}


function renderCurrentTemplate() {

  const template =
    allTemplates.find(
      item =>
        item.id ===
        $('template').value
    );


  if (!template) {
    return;
  }


  $('subject').value =
    renderText(
      template.subject
    );


  $('message').value =
    renderText(
      template.body
    );

}


/* =========================================================
   TEMPLATE VARIABLE RENDERING

   IMPORTANT:
   This code is inside the outer HTML template literal.

   Therefore regex backslashes are escaped as \\.
   ========================================================= */

function renderText(
  value
) {

  const business =
    $('businessName')
      .value
      .trim() ||
    'your business';


  const contact =
    $('contactName')
      .value
      .trim() ||
    'there';


  const city =
    $('city')
      .value
      .trim();


  const service =
    $('service')
      .value
      .trim() ||
    'your services';


  const ownerKey =
    $('owner')
      .value ||
    'murtaza';


  const owner =
    OWNERS[
      ownerKey
    ] ||
    OWNERS.murtaza;


  return String(
    value || ''
  )

    .replace(
      /\\{\\{business_name\\}\\}/g,
      business
    )

    .replace(
      /\\{\\{contact_name\\}\\}/g,
      contact
    )

    .replace(
      /\\{\\{city\\}\\}/g,
      city
    )

    .replace(
      /\\{\\{service\\}\\}/g,
      service
    )

    .replace(
      /\\{\\{owner_name\\}\\}/g,
      owner.name
    )

    .replace(
      /\\{\\{owner_position\\}\\}/g,
      owner.position
    )

    .replace(
      /[ \\t]+\\n/g,
      '\\n'
    )

    .replace(
      /\\n{3,}/g,
      '\\n\\n'
    )

    .trim();

}


function formatBusinessType(
  type
) {

  return String(
    type || ''
  )

    .replace(
      /_/g,
      ' '
    )

    .replace(
      /\\b\\w/g,
      character =>
        character.toUpperCase()
    );

}


/* =========================================================
   SEND EMAIL
   ========================================================= */

async function sendMessage() {

  setStatus(
    'sendStatus',
    'Sending...'
  );


  try {

    const data =
      await api(
        '/api/send',
        {
          method: 'POST',

          headers: {
            'content-type':
              'application/json'
          },

          body:
            JSON.stringify(
              {
                sender_id:
                  $('sender').value,

                to:
                  $('to').value,

                subject:
                  $('subject').value,

                message:
                  $('message').value
              }
            )
        }
      );


    setStatus(
      'sendStatus',
      'Sent successfully.'
    );


    await loadConversations();


    if (
      data.conversation_id
    ) {

      await openConversation(
        data.conversation_id
      );

    }

  } catch (error) {

    setStatus(
      'sendStatus',
      error.message,
      true
    );

  }

}


/* =========================================================
   CONVERSATIONS
   ========================================================= */

async function loadConversations() {

  $('conversations').innerHTML =
    '<div class="empty">Loading...</div>';


  try {

    const rows =
      await api(
        '/api/conversations'
      );


    if (!rows.length) {

      $('conversations').innerHTML =
        '<div class="empty">No conversations yet.</div>';

      return;

    }


    $('conversations').innerHTML =
      rows
        .map(
          conversation =>

            '<div class="item" data-id="' +
            conversation.id +
            '">' +

            '<div class="email">' +

            escapeHtml(
              conversation.contact_email
            ) +

            (
              conversation.last_direction

                ? '<span class="badge">' +
                  escapeHtml(
                    conversation.last_direction
                  ) +
                  '</span>'

                : ''
            ) +

            '</div>' +


            '<div class="subject">' +

            escapeHtml(
              conversation.subject ||
              '(no subject)'
            ) +

            '</div>' +


            '<div class="preview">' +

            escapeHtml(
              conversation.last_message ||
              ''
            ) +

            '</div>' +

            '</div>'
        )
        .join('');


    document
      .querySelectorAll(
        '.item[data-id]'
      )
      .forEach(
        element => {

          element.addEventListener(
            'click',
            () =>
              openConversation(
                Number(
                  element.dataset.id
                )
              )
          );

        }
      );

  } catch (error) {

    $('conversations').innerHTML =
      '<div class="empty error">' +
      escapeHtml(
        error.message
      ) +
      '</div>';

  }

}


/* =========================================================
   OPEN CONVERSATION
   ========================================================= */

async function openConversation(
  id
) {

  currentConversationId =
    id;


  $('threadCard').hidden =
    false;


  $('thread').innerHTML =
    '<div class="empty">Loading...</div>';


  try {

    const data =
      await api(
        '/api/conversations/' +
        id
      );


    $('threadTitle').textContent =
      data
        .conversation
        .contact_email;


    $('threadSubtitle').textContent =
      (
        data
          .conversation
          .subject ||
        '(no subject)'
      ) +

      ' · ' +

      data.messages.length +

      ' message' +

      (
        data.messages.length === 1
          ? ''
          : 's'
      );


    $('thread').innerHTML =
      data.messages.length

        ? data.messages
            .map(
              message => {

                const inbound =
                  message.direction ===
                  'inbound';


                const role =
                  inbound
                    ? 'Customer'
                    : 'Alligentics';


                const replyButton =
                  inbound

                    ? '<button class="replyInline" data-reply-message="' +
                      escapeHtml(
                        message.id
                      ) +
                      '">Reply to this</button>'

                    : '';


                return (

                  '<div class="message ' +

                  escapeHtml(
                    message.direction
                  ) +

                  '">' +


                  '<div class="messageHead">' +

                  '<div class="messageRole">' +
                  role +
                  '</div>' +

                  '<div class="messageTime">' +

                  escapeHtml(
                    message.created_at ||
                    ''
                  ) +

                  '</div>' +

                  '</div>' +


                  '<div class="meta">' +

                  escapeHtml(
                    message.sender_email
                  ) +

                  ' → ' +

                  escapeHtml(
                    message.recipient_email
                  ) +

                  '</div>' +


                  '<div>' +

                  '<strong>' +

                  escapeHtml(
                    message.subject ||
                    ''
                  ) +

                  '</strong>' +

                  '</div>' +


                  '<div class="body">' +

                  escapeHtml(
                    message.body_text ||
                    ''
                  ) +

                  '</div>' +


                  replyButton +

                  '</div>'

                );

              }
            )
            .join('')

        : '<div class="empty">No messages.</div>';


    document
      .querySelectorAll(
        '.replyInline'
      )
      .forEach(
        button => {

          button.addEventListener(
            'click',
            () => {

              $('reply').focus();

              $('reply').scrollIntoView(
                {
                  behavior:
                    'smooth',

                  block:
                    'center'
                }
              );

            }
          );

        }
      );


    $('threadCard')
      .scrollIntoView(
        {
          behavior:
            'smooth',

          block:
            'start'
        }
      );

  } catch (error) {

    $('thread').innerHTML =
      '<div class="empty error">' +
      escapeHtml(
        error.message
      ) +
      '</div>';

  }

}


/* =========================================================
   SEND REPLY
   ========================================================= */

async function sendReply() {

  if (
    !currentConversationId
  ) {
    return;
  }


  setStatus(
    'replyStatus',
    'Sending...'
  );


  try {

    await api(
      '/api/conversations/' +
      currentConversationId +
      '/reply',
      {
        method: 'POST',

        headers: {
          'content-type':
            'application/json'
        },

        body:
          JSON.stringify(
            {
              sender_id:
                $('sender').value,

              message:
                $('reply').value
            }
          )
      }
    );


    $('reply').value =
      '';


    setStatus(
      'replyStatus',
      'Reply sent successfully.'
    );


    await openConversation(
      currentConversationId
    );


    await loadConversations();

  } catch (error) {

    setStatus(
      'replyStatus',
      error.message,
      true
    );

  }

}


/* =========================================================
   UI HELPERS
   ========================================================= */

function setStatus(
  id,
  message,
  error = false
) {

  const element =
    $(id);


  element.textContent =
    message;


  element.className =
    'status' +
    (
      error
        ? ' error'
        : ''
    );

}


function escapeHtml(
  value
) {

  return String(
    value ?? ''
  ).replace(
    /[&<>"']/g,
    character =>
      ({
        '&':
          '&amp;',

        '<':
          '&lt;',

        '>':
          '&gt;',

        '"':
          '&quot;',

        "'":
          '&#039;'

      })[character]
  );

}


/* =========================================================
   INITIAL LOAD
   ========================================================= */

updateOwnerInfo();

loadSenders();

loadTemplates();

loadConversations();


/* Refresh conversations every 15 seconds */

setInterval(
  loadConversations,
  15000
);


/* Refresh currently open thread every 15 seconds */

setInterval(
  () => {

    if (
      currentConversationId &&
      !$('threadCard').hidden
    ) {

      openConversation(
        currentConversationId
      );

    }

  },
  15000
);

</script>

</body>
</html>`;
}

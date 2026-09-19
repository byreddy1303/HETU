// Meta WhatsApp Business Cloud API adapter.
// Requires the following env vars on the Supabase project:
//   META_ACCESS_TOKEN     — permanent access token from your Meta app
//   META_PHONE_NUMBER_ID  — phone_number_id from your WABA phone
//   META_WA_API_VERSION   — optional, defaults to v18.0
//   META_WA_TEMPLATE_NAME — optional, defaults to 'daily_digest'
//   META_WA_LANGUAGE      — optional, defaults to 'en'
//
// Templates must be pre-approved by Meta. Each daily digest uses one
// template with N text-body parameters ({{1}} greeting, {{2}} lines, …).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

export interface WaSendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export function waConfigured(): boolean {
  return !!Deno.env.get('META_ACCESS_TOKEN') && !!Deno.env.get('META_PHONE_NUMBER_ID');
}

export async function sendWhatsAppTemplate(args: {
  to: string; // E.164 without '+', e.g. '919xxxxxxxxx'
  parameters: string[];
  template?: string;
  language?: string;
}): Promise<WaSendResult> {
  const token = Deno.env.get('META_ACCESS_TOKEN');
  const phoneId = Deno.env.get('META_PHONE_NUMBER_ID');
  const version = Deno.env.get('META_WA_API_VERSION') ?? 'v18.0';
  const templateName = args.template ?? Deno.env.get('META_WA_TEMPLATE_NAME') ?? 'daily_digest';
  const language = args.language ?? Deno.env.get('META_WA_LANGUAGE') ?? 'en';

  if (!token || !phoneId) return { ok: false, error: 'META credentials missing' };
  const cleanedTo = args.to.replace(/^\+/, '').replace(/[^\d]/g, '');
  if (cleanedTo.length < 8) return { ok: false, error: 'invalid phone number' };

  const body = {
    messaging_product: 'whatsapp',
    to: cleanedTo,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components: [
        {
          type: 'body',
          parameters: args.parameters.map((text) => ({ type: 'text', text }))
        }
      ]
    }
  };

  const res = await fetch(
    `https://graph.facebook.com/${version}/${phoneId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `meta ${res.status}: ${text.slice(0, 300)}` };
  }
  const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[] };
  return { ok: true, id: data.messages?.[0]?.id };
}

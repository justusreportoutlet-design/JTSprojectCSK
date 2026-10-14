import { getWorkspaceAccessToken } from './workspaceAuth';

export interface EmailMessageSummary {
  id: string;
  threadId: string;
  snippet?: string;
  subject?: string;
  from?: string;
  date?: string;
}

export interface SendEmailPayload {
  to: string;
  cc?: string;
  subject: string;
  bodyHtml: string;
}

const getAuthHeaders = async () => {
  const token = await getWorkspaceAccessToken();
  if (!token) {
    throw new Error('Akses token Google Workspace tidak tersedia. Silakan hubungkan akun Google terlebih dahulu.');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

// Base64URL encoding helper
function toBase64Url(str: string): string {
  // Convert utf-8 string to base64 safely in browser
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendEmail({ to, cc, subject, bodyHtml }: SendEmailPayload): Promise<{ id: string; threadId: string }> {
  const headers = await getAuthHeaders();

  // Construct RFC 2822 formatted email
  const emailLines: string[] = [
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    bodyHtml
  ];

  const rawMessage = emailLines.join('\r\n');
  const encodedRaw = toBase64Url(rawMessage);

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers,
    body: JSON.stringify({ raw: encodedRaw })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal mengirim email: ${res.statusText}`);
  }

  return await res.json();
}

export async function listMessages(query?: string, maxResults: number = 15): Promise<EmailMessageSummary[]> {
  const headers = await getAuthHeaders();
  let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`;
  if (query && query.trim()) {
    url += `&q=${encodeURIComponent(query.trim())}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal memuat pesan Gmail: ${res.statusText}`);
  }

  const data = await res.json();
  const rawList: Array<{ id: string; threadId: string }> = data.messages || [];

  // Fetch snippets & headers for top results
  const detailedList: EmailMessageSummary[] = await Promise.all(
    rawList.slice(0, 10).map(async (m) => {
      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers }
        );
        if (detailRes.ok) {
          const detail = await detailRes.json();
          const headersList = detail.payload?.headers || [];
          const subjectHeader = headersList.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '(Tanpa Subjek)';
          const fromHeader = headersList.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'Unknown';
          const dateHeader = headersList.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';
          return {
            id: m.id,
            threadId: m.threadId,
            snippet: detail.snippet || '',
            subject: subjectHeader,
            from: fromHeader,
            date: dateHeader
          };
        }
      } catch (e) {
        // Fallback to basic summary
      }
      return { id: m.id, threadId: m.threadId };
    })
  );

  return detailedList;
}

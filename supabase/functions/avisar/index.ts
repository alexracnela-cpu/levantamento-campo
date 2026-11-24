// RondaLuz — função "avisar" (Supabase Edge Function).
// Chamada pelo banco (gatilho em public.tarefas, ver supabase/push.sql) quando uma demanda
// é enviada, devolvida ou terminada. Busca quem deve ser avisado e manda a notificação push.
//
// Segredos (Edge Functions > Secrets):
//   RONDALUZ_SEGREDO   mesmo valor gravado em public.push_config (chave 'segredo')
//   VAPID_PUBLICA      chave pública (a mesma de js/config.js)
//   VAPID_PRIVADA      chave privada (nunca no código do app)
//   VAPID_CONTATO      ex.: mailto:voce@empresa.com
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem nas funções do Supabase.
// Na configuração da função, deixe "Verify JWT" DESLIGADO (quem chama é o banco, com o segredo).
// Arquivo único de propósito: dá para colar inteiro no editor de funções do painel do Supabase.

// ---------------------------------------------------------------------
// Web Push sem biblioteca (só WebCrypto): criptografia aes128gcm (RFC 8291) + VAPID (RFC 8292).

const te = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deB64url(txt: string): Uint8Array {
  const b = atob(txt.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (txt.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function juntar(...partes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(partes.reduce((t, p) => t + p.length, 0));
  let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
}

async function hmac(chave: Uint8Array, dados: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', chave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, dados));
}

// HKDF com uma rodada (basta para tamanhos até 32 bytes)
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, tam: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, juntar(info, new Uint8Array([1])))).slice(0, tam);
}

export async function cifrar(p256dh: string, authSecret: string, texto: string): Promise<Uint8Array> {
  const uaPub = deB64url(p256dh);
  const auth = deB64url(authSecret);
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const uaChave = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const segredo = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaChave }, par.privateKey, 256));

  const ikm = await hkdf(auth, segredo, juntar(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const claro = juntar(te.encode(texto), new Uint8Array([2])); // 2 = último registro
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, k, claro));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return juntar(salt, rs, new Uint8Array([asPub.length]), asPub, cifrado);
}

export async function jwtVapid(endpoint: string, publica: string, privada: string, contato: string): Promise<string> {
  const pub = deB64url(publica);
  const jwk = { kty: 'EC', crv: 'P-256', d: privada, x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), ext: true };
  const chave = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const cab = b64url(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corpo = b64url(te.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: contato,
  })));
  const ass = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chave, te.encode(`${cab}.${corpo}`)));
  return `${cab}.${corpo}.${b64url(ass)}`;
}

export async function enviarPush(
  s: { endpoint: string; p256dh: string; auth: string },
  texto: string,
  vapid: { publica: string; privada: string; contato: string },
): Promise<Response> {
  const corpo = await cifrar(s.p256dh, s.auth, texto);
  const jwt = await jwtVapid(s.endpoint, vapid.publica, vapid.privada, vapid.contato);
  return fetch(s.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
      Authorization: `vapid t=${jwt}, k=${vapid.publica}`,
    },
    body: corpo,
  });
}
// ---------------------------------------------------------------------

const env = (k: string) => Deno.env.get(k) ?? '';

// Chave de serviço: a antiga (service_role) ou a nova (sb_secret_...), o que o projeto tiver.
function chaveServico(): string {
  const antiga = env('SUPABASE_SERVICE_ROLE_KEY');
  if (antiga) return antiga;
  try { return Object.values(JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}'))[0] as string || ''; } catch { return ''; }
}

async function rest(caminho: string, init: RequestInit = {}) {
  const chave = chaveServico();
  const auth: Record<string, string> = chave.startsWith('sb_') ? {} : { Authorization: `Bearer ${chave}` };
  const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: chave, ...auth, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

function dataBR(iso: string | null) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('use POST', { status: 405 });
  const segredo = env('RONDALUZ_SEGREDO');
  if (!segredo || req.headers.get('x-rondaluz-segredo') !== segredo) return new Response('negado', { status: 401 });

  try {
    const { tipo, tarefa_id } = await req.json();
    const [t] = await rest(`tarefas?id=eq.${encodeURIComponent(tarefa_id)}&select=id,titulo,prazo,motoqueiro_id,status`);
    if (!t) return Response.json({ enviados: 0, motivo: 'demanda não encontrada' });

    let destino: string[] = [];
    let msg: { titulo: string; texto: string; href: string };
    if (tipo === 'novo') {
      destino = [t.motoqueiro_id];
      msg = { titulo: 'Novo levantamento para você', texto: `${t.titulo}${t.prazo ? ` · prazo ${dataBR(t.prazo)}` : ''}`, href: `#/campo/${t.id}` };
    } else if (tipo === 'devolvido') {
      destino = [t.motoqueiro_id];
      msg = { titulo: 'Levantamento devolvido pelo líder', texto: `${t.titulo} · confira e toque em Terminei de novo`, href: `#/campo/${t.id}` };
    } else if (tipo === 'terminou') {
      const lideres = await rest('perfis?papel=eq.lider&select=id');
      destino = lideres.map((l: { id: string }) => l.id).filter((id: string) => id !== t.motoqueiro_id);
      const [quem] = t.motoqueiro_id ? await rest(`perfis?id=eq.${t.motoqueiro_id}&select=nome,email`) : [];
      msg = { titulo: `${quem?.nome || quem?.email || 'O motoqueiro'} terminou um levantamento`, texto: t.titulo, href: `#/tarefa/${t.id}` };
    } else {
      return Response.json({ enviados: 0, motivo: 'tipo desconhecido' });
    }
    destino = destino.filter(Boolean);
    if (!destino.length) return Response.json({ enviados: 0 });

    const inscricoes = await rest(`push_inscricoes?perfil_id=in.(${destino.join(',')})&select=id,endpoint,p256dh,auth`);
    const vapid = { publica: env('VAPID_PUBLICA'), privada: env('VAPID_PRIVADA'), contato: env('VAPID_CONTATO') || 'mailto:contato@rondaluz.app' };
    const corpo = JSON.stringify(msg);

    let enviados = 0;
    const erros: string[] = [];
    await Promise.all(inscricoes.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        const r = await enviarPush(s, corpo, vapid);
        if (r.status === 404 || r.status === 410) {
          await rest(`push_inscricoes?id=eq.${s.id}`, { method: 'DELETE' }); // aparelho desinstalou ou bloqueou
        } else if (r.ok) {
          enviados++;
        } else {
          erros.push(`${r.status} ${await r.text()}`);
        }
      } catch (e) {
        erros.push(String(e));
      }
    }));
    if (erros.length) console.warn('Falhas no push:', erros);
    return Response.json({ enviados, falhas: erros.length });
  } catch (e) {
    console.error(e);
    return Response.json({ erro: String(e) }, { status: 500 });
  }
});

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostnameOf(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * Panel wieszaka nie ma logowania, więc działa tylko w trybie deweloperskim i tylko pod adresem lokalnym.
 * `next dev` nasłuchuje też w sieci lokalnej, a obca strona otwarta w przeglądarce właściciela mogłaby
 * wysłać zapytanie do jego serwera, dlatego zapis wymaga jeszcze nagłówka `Origin` z tego samego adresu.
 * Zwraca odpowiedź odmowną albo null, gdy można kontynuować.
 */
export function rejectUnlessLocalDev(request: Request, nodeEnv: string | undefined = process.env.NODE_ENV): Response | null {
  // Poza trybem deweloperskim panel ma wyglądać tak, jakby w ogóle nie istniał.
  if (nodeEnv !== 'development') return new Response(null, { status: 404 });

  const host = request.headers.get('host') ?? '';
  const hostname = hostnameOf(host);
  if (!hostname || !LOCAL_HOSTNAMES.has(hostname)) {
    return Response.json({ error: 'Panel wieszaka działa tylko pod adresem localhost.' }, { status: 403 });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin');
    if (!origin || originHost(origin) !== host) {
      return Response.json({ error: 'Zapytanie nie pochodzi z panelu wieszaka.' }, { status: 403 });
    }
  }
  return null;
}

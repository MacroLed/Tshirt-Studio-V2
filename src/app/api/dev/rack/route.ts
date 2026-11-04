import { z } from 'zod';
import { PLACEMENT_IDS, type PlacementId } from '@/core/design/schema';
import { toPublishedTemplate } from '@/core/templates/repository';
import type { RackManifest } from '@/core/templates/schema';
import { rackPublicBase, rackPublisher } from '@/server/templates';
import { rejectUnlessLocalDev } from '@/server/templates/devGuard';
import { RackPublishError, type TemplateUpload } from '@/server/templates/rackPublisher';

const uploadMetaSchema = z.object({
  name: z.string().min(1),
  productId: z.string().min(1),
  sourceProjectId: z.string().min(1),
  document: z.unknown(),
});
const removeSchema = z.object({ id: z.string().min(1) });
const moveSchema = z.object({ id: z.string().min(1), offset: z.number().int() });

function rackResponse(manifest: RackManifest): Response {
  return Response.json({
    templates: manifest.templates.map((template) => {
      const published = toPublishedTemplate(template, rackPublicBase);
      return {
        id: published.id,
        name: published.name,
        productId: published.productId,
        sourceProjectId: published.sourceProjectId ?? null,
        thumbnail: published.thumbnail,
      };
    }),
  });
}

async function fileBytes(form: FormData, key: string): Promise<Uint8Array | null> {
  const value = form.get(key);
  return value instanceof File ? new Uint8Array(await value.arrayBuffer()) : null;
}

async function parseUpload(form: FormData): Promise<TemplateUpload> {
  const rawMeta = form.get('meta');
  if (typeof rawMeta !== 'string') throw new RackPublishError('Brak danych projektu.');
  let json: unknown;
  try {
    json = JSON.parse(rawMeta);
  } catch {
    throw new RackPublishError('Błędne dane projektu.');
  }
  const parsed = uploadMetaSchema.safeParse(json);
  if (!parsed.success) throw new RackPublishError('Błędne dane projektu.');
  const meta = parsed.data;

  const prints: Partial<Record<PlacementId, Uint8Array>> = {};
  for (const placementId of PLACEMENT_IDS) {
    const bytes = await fileBytes(form, `print:${placementId}`);
    if (bytes) prints[placementId] = bytes;
  }
  return {
    name: meta.name,
    productId: meta.productId,
    sourceProjectId: meta.sourceProjectId,
    document: meta.document,
    prints,
    thumbnail: await fileBytes(form, 'thumbnail'),
  };
}

/** Wspólna obsługa: najpierw blokada, a błąd właściciela nie może wyglądać jak awaria serwera. */
async function handle(request: Request, operation: () => Promise<RackManifest>): Promise<Response> {
  const rejected = rejectUnlessLocalDev(request);
  if (rejected) return rejected;
  try {
    return rackResponse(await operation());
  } catch (error) {
    if (error instanceof RackPublishError) return Response.json({ error: error.message }, { status: 400 });
    console.error('Nie udało się zmienić wieszaka', error);
    return Response.json({ error: 'Nie udało się zmienić wieszaka. Szczegóły są w konsoli serwera.' }, { status: 500 });
  }
}

async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new RackPublishError('Błędne dane zapytania.');
  return parsed.data;
}

async function readForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new RackPublishError('Błędne dane zapytania.');
  }
}

export function GET(request: Request) {
  return handle(request, () => rackPublisher.read());
}

/** Dodaje projekt na wieszak. */
export function POST(request: Request) {
  return handle(request, async () => rackPublisher.add(await parseUpload(await readForm(request))));
}

/** Podmienia szablon na aktualną wersję projektu. */
export function PUT(request: Request) {
  return handle(request, async () => {
    const form = await readForm(request);
    const id = form.get('id');
    if (typeof id !== 'string') throw new RackPublishError('Brak identyfikatora szablonu.');
    return rackPublisher.update(id, await parseUpload(form));
  });
}

/** Zmienia kolejność na stojaku. */
export function PATCH(request: Request) {
  return handle(request, async () => {
    const { id, offset } = await parseJson(request, moveSchema);
    return rackPublisher.move(id, offset);
  });
}

/** Zdejmuje szablon z wieszaka. */
export function DELETE(request: Request) {
  return handle(request, async () => rackPublisher.remove((await parseJson(request, removeSchema)).id));
}

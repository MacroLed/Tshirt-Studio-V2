import { RackFallback } from '@/features/rack/RackFallback';
import { catalogRepository } from '@/server/catalog';
import { PrototypeNotice } from '@/ui/PrototypeNotice';

export default async function HomePage() {
  const products = await catalogRepository.listProducts();

  return (
    <>
      <header className="flex items-baseline justify-between px-4 py-5 sm:px-8">
        <span className="font-display text-2xl">3D T-Shirt Studio</span>
      </header>
      <main>
        <section className="px-4 pb-10 pt-6 sm:px-8 sm:pb-16 sm:pt-12">
          <p className="text-eyebrow uppercase tracking-eyebrow text-muted">Kolekcja</p>
          <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[1.05] sm:text-7xl">
            Wybierz koszulkę. Zaprojektuj ją po swojemu.
          </h1>
          <div className="mt-6 max-w-xl">
            <PrototypeNotice>
              Produkty i ceny są przykładowe, a zakup nie jest jeszcze możliwy. Kliknij nazwę produktu, aby zobaczyć
              koszulkę 3D. Wieszak 3D zastąpi ten widok w kolejnych krokach.
            </PrototypeNotice>
          </div>
        </section>
        <RackFallback products={products} />
      </main>
    </>
  );
}

/** TYMCZASOWE dane biblioteki; w ETAPIE 6 z tabeli library_items, którą zarządza administrator. */

const OWN = 'Oryginalna grafika projektu';

const item = (id: string, name: string, category: string, tags: string[]) => ({
  id,
  name,
  category,
  tags,
  path: `/library/${id}.svg`,
  license: OWN,
});

export const librarySeed: unknown[] = [
  item('logo-ring-star', 'Pierścień z gwiazdą', 'logo', ['emblemat', 'znak', 'gwiazda', 'koło']),
  item('logo-shield', 'Tarcza', 'logo', ['emblemat', 'herb', 'klub', 'odznaka']),
  item('logo-hexagon', 'Sześciokąt', 'logo', ['emblemat', 'znak', 'geometria', 'trójkąt']),

  item('symbol-star', 'Gwiazda', 'symbols', ['ikona', 'nagroda']),
  item('symbol-bolt', 'Piorun', 'symbols', ['ikona', 'błyskawica', 'energia', 'moc']),
  item('symbol-heart', 'Serce', 'symbols', ['ikona', 'miłość']),

  item('type-start', 'Napis START', 'typography', ['słowo', 'litery', 'hasło']),
  item('type-team', 'Napis TEAM', 'typography', ['słowo', 'litery', 'drużyna', 'zespół']),
  item('type-no-1', 'Napis NO 1', 'typography', ['słowo', 'litery', 'numer', 'pierwszy']),

  item('decor-flower', 'Kwiat', 'decorative', ['roślina', 'płatki', 'ornament']),
  item('decor-waves', 'Fale', 'decorative', ['woda', 'linie', 'morze']),
  item('decor-diamond', 'Romb z kropkami', 'decorative', ['ornament', 'geometria', 'diament']),

  item('sport-stripes', 'Pasy', 'sport', ['biegi', 'skos', 'dynamika']),
  item('sport-number-10', 'Numer 10', 'sport', ['koszulka', 'piłka nożna', 'liczba']),
  item('sport-ball', 'Piłka', 'sport', ['piłka nożna', 'mecz', 'gra']),

  item('minimal-circle', 'Okrąg', 'minimal', ['koło', 'linia', 'prosty']),
  item('minimal-dots', 'Trzy kropki', 'minimal', ['punkty', 'prosty']),
  item('minimal-arches', 'Łuki', 'minimal', ['linie', 'tęcza', 'prosty']),

  item('vintage-sunburst', 'Promienie', 'vintage', ['retro', 'słońce', 'gwiazda', 'odznaka']),
  item('vintage-sun-stripes', 'Słońce z pasami', 'vintage', ['retro', 'zachód słońca', 'lata 70']),
  item('vintage-stamp', 'Pieczęć', 'vintage', ['retro', 'stempel', 'gwiazdy', 'odznaka']),

  item('abstract-circles', 'Nakładające się koła', 'abstract', ['geometria', 'kształty']),
  item('abstract-blob', 'Plama', 'abstract', ['organiczny', 'kształty']),
  item('abstract-triangles', 'Trójkąty', 'abstract', ['geometria', 'piramida', 'kształty']),
];

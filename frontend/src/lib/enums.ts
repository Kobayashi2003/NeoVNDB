/** VNDB short-code dictionaries used to render human-readable labels. */

/* ─── Dictionaries ─────────────────────────────────────────────────────────── */

export const ENUMS = {
  /* Staff roles (VNDB `staff.role`) */
  STAFF_ROLE: {
    scenario: 'Scenario',
    director: 'Director',
    chardesign: 'Character design',
    art: 'Artist',
    music: 'Composer',
    songs: 'Vocals',
    translator: 'Translator',
    editor: 'Editor',
    qa: 'Quality assurance',
    staff: 'Staff',
  },

  /* What an anime adaptation is (VNDB `anime.type`).
     `mv` is the older spelling of `mov` and survives on a couple of rows, so
     both are here rather than one of them showing as a code. */
  ANIME_TYPE: {
    tv: 'TV series',
    ova: 'OVA',
    mov: 'Movie',
    mv: 'Movie',
    web: 'Web',
    spe: 'Special',
    oth: 'Other',
  },

  /* VN-to-VN relationship kinds (VNDB `relations.relation`) */
  RELATION: {
    ser: 'Same series',
    char: 'Shares characters',
    alt: 'Alternative version',
    preq: 'Prequel',
    seq: 'Sequel',
    side: 'Side story',
    par: 'Parent story',
    set: 'Same setting',
    fan: 'Fandisc',
    orig: 'Original game',
  },

  /* Physical media (VNDB `release.media.medium`) */
  MEDIUM: {
    blr: 'Blu-ray disc',
    mrt: 'Cartridge',
    cas: 'Cassette tape',
    cd: 'CD',
    dc: 'Download card',
    dvd: 'DVD',
    flp: 'Floppy',
    gdr: 'GD-ROM',
    in: 'Internet download',
    mem: 'Memory card',
    nod: 'Nintendo Optical Disc',
    umd: 'UMD',
    otc: 'Other',
  },

  /* Languages (VNDB ISO-ish language codes) */
  LANGUAGE: {
    ar: 'Arabic',
    eu: 'Basque',
    be: 'Belarusian',
    bg: 'Bulgarian',
    ca: 'Catalan',
    ck: 'Cherokee',
    zh: 'Chinese',
    'zh-Hans': 'Chinese (simplified)',
    'zh-Hant': 'Chinese (traditional)',
    hr: 'Croatian',
    cs: 'Czech',
    da: 'Danish',
    nl: 'Dutch',
    en: 'English',
    eo: 'Esperanto',
    fi: 'Finnish',
    fr: 'French',
    gl: 'Galician',
    de: 'German',
    el: 'Greek',
    he: 'Hebrew',
    hi: 'Hindi',
    hu: 'Hungarian',
    ga: 'Irish',
    id: 'Indonesian',
    it: 'Italian',
    iu: 'Inuktitut',
    ja: 'Japanese',
    kk: 'Kazakh',
    ko: 'Korean',
    la: 'Latin',
    lv: 'Latvian',
    lt: 'Lithuanian',
    mk: 'Macedonian',
    ms: 'Malay',
    ne: 'Nepali',
    no: 'Norwegian',
    fa: 'Persian',
    pl: 'Polish',
    'pt-br': 'Portuguese (Brazil)',
    'pt-pt': 'Portuguese (Portugal)',
    ro: 'Romanian',
    ru: 'Russian',
    gd: 'Scottish Gaelic',
    sr: 'Serbian',
    sk: 'Slovak',
    sl: 'Slovene',
    es: 'Spanish',
    sv: 'Swedish',
    ta: 'Tagalog',
    th: 'Thai',
    tr: 'Turkish',
    uk: 'Ukrainian',
    ur: 'Urdu',
    vi: 'Vietnamese',
  },

  /* Platforms (VNDB `release.platforms`) */
  PLATFORM: {
    win: 'Windows',
    lin: 'Linux',
    mac: 'Mac OS',
    web: 'Website',
    tdo: '3DO',
    ios: 'Apple iProduct',
    and: 'Android',
    bdp: 'Blu-ray Player',
    dos: 'DOS',
    dvd: 'DVD Player',
    drc: 'Dreamcast',
    nes: 'Famicom',
    sfc: 'Super Famicom',
    fm7: 'FM-7',
    fm8: 'FM-8',
    fmt: 'FM Towns',
    gba: 'Game Boy Advance',
    gbc: 'Game Boy Color',
    msx: 'MSX',
    nds: 'Nintendo DS',
    swi: 'Nintendo Switch',
    wii: 'Nintendo Wii',
    wiu: 'Nintendo Wii U',
    n3d: 'Nintendo 3DS',
    p88: 'PC-88',
    p98: 'PC-98',
    pce: 'PC Engine',
    pcf: 'PC-FX',
    psp: 'PlayStation Portable',
    ps1: 'PlayStation 1',
    ps2: 'PlayStation 2',
    ps3: 'PlayStation 3',
    ps4: 'PlayStation 4',
    ps5: 'PlayStation 5',
    psv: 'PlayStation Vita',
    smd: 'Sega Mega Drive',
    scd: 'Sega Mega-CD',
    sat: 'Sega Saturn',
    vnd: 'VNDS',
    x1s: 'Sharp X1',
    x68: 'Sharp X68000',
    xb1: 'Xbox',
    xb3: 'Xbox 360',
    xbo: 'Xbox One',
    xxs: 'Xbox X/S',
    mob: 'Other (mobile)',
    oth: 'Other',
  },

  /* VN length buckets (VNDB `vn.length`) */
  LENGTH: {
    1: 'Very Short',
    2: 'Short',
    3: 'Medium',
    4: 'Long',
    5: 'Very Long',
  },

  /* Development status (VNDB `vn.devstatus`) */
  DEVSTATUS: {
    0: 'Finished',
    1: 'In Development',
    2: 'Cancelled',
  },

  /* Voice acting coverage (VNDB `release.voiced`) */
  VOICED: {
    1: 'Not voiced',
    2: 'Only ero scenes voiced',
    3: 'Partially voiced',
    4: 'Fully voiced',
  },

  /* Release scope (VNDB `release.rtype`) */
  RTYPE: {
    trial: 'Trial',
    partial: 'Partial',
    complete: 'Complete',
  },

  /* What a release image is a picture of (VNDB `release.images.itype`) */
  IMAGE_TYPE: {
    dig: 'Digital',
    pkgfront: 'Package front',
    pkgback: 'Package back',
    pkgcontent: 'Package contents',
    pkgside: 'Package spine',
    pkgmed: 'Package media',
  },

  /* Character role within a VN (VNDB `character.vns.role`) */
  CHARACTER_ROLE: {
    main: 'Protagonist',
    primary: 'Main Character',
    side: 'Side Character',
    appears: 'Appears',
  },

  /* How one producer relates to another (VNDB `producer.relations.relation`).
     Stored as symmetric pairs -- each row has a mirror on the other company. */
  PRODUCER_RELATION: {
    old: 'Formerly',
    new: 'Succeeded by',
    spa: 'Spawned',
    ori: 'Originated from',
    sub: 'Subsidiary',
    par: 'Parent producer',
    imp: 'Imprint',
    ipa: 'Parent brand',
  },

  /* Producer type (VNDB `producer.type`) */
  TYPE: {
    co: 'Company',
    in: 'Individual',
    ng: 'Amateur Group',
  },

  /* Tag category (VNDB `tag.category`) */
  CATEGORY: {
    cont: 'Content',
    ero: 'Sexual Content',
    tech: 'Technical',
  },

  /* Character sex (VNDB `chars.sex` / `spoil_sex`) */
  CHARACTER_SEX: {
    m: 'Male',
    f: 'Female',
    b: 'Both',
    n: 'Sexless',
  },

  /* Gender identity (VNDB `chars.gender` / `spoil_gender`; staff use m and f) */
  GENDER: {
    m: 'Male',
    f: 'Female',
    o: 'Non-binary',
    a: 'Ambiguous',
  },
} as const;

/* ─── UI badge classes ─────────────────────────────────────────────────────── */
// Tailwind classes for the character-role badge, shared by every place that
// renders one (VN character cards, the character page's VN list) so a role
// always carries the same color.

export const CHARACTER_ROLE_CLASS: Record<string, string> = {
  main: 'bg-green-500/15 text-green-400',
  primary: 'bg-blue-500/15 text-blue-400',
  side: 'bg-white/10 text-white/60',
  appears: 'bg-white/5 text-white/40',
};

// The same colours as text alone, for a role written over an image on a dark
// badge of its own.
export const CHARACTER_ROLE_TEXT: Record<string, string> = {
  main: 'text-green-400',
  primary: 'text-blue-400',
  side: 'text-white/70',
  appears: 'text-white/50',
};

/* ─── Per-group type aliases ───────────────────────────────────────────────── */
// The group key, used by the enum accessors below to constrain their argument.
type EnumGroup = keyof typeof ENUMS;

/* ─── Accessors ────────────────────────────────────────────────────────────── */

// Return a dictionary as a plain object keyed by string / number, suitable for
// direct subscript lookups in JSX (`MAP[value]`).
function enumMap<G extends EnumGroup>(group: G): Record<string | number, string> {
  return ENUMS[group] as Record<string | number, string>;
}

// Lookup with a safe fallback: returns the label for `key` in `group`, or the
// stringified key when the value isn't in the dictionary.
export function enumLabel<G extends EnumGroup>(group: G, key: string | number): string {
  return enumMap(group)[key] ?? String(key);
}

/** How one visual novel relates to another. Not in the shared enum table
 *  because the dump stores the code and nothing else. */
export const VN_RELATION: Record<string, string> = {
  seq: 'Sequel',
  preq: 'Prequel',
  set: 'Same setting',
  alt: 'Alternative version',
  char: 'Shares characters',
  side: 'Side story',
  par: 'Parent story',
  ser: 'Same series',
  fan: 'Fandisc',
  orig: 'Original game',
};

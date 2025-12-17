/**
 * English Stenotype System
 * 
 * This module defines the English Stenotype steno system configuration.
 */

export const KEYS = [
  '#',
  'S-', 'T-', 'K-', 'P-', 'W-', 'H-', 'R-',
  'A-', 'O-',
  '*',
  '-E', '-U',
  '-F', '-R', '-P', '-B', '-L', '-G', '-T', '-S', '-D', '-Z',
] as const;

export const IMPLICIT_HYPHEN_KEYS = ['A-', 'O-', '-E', '-U', '*'] as const;

export const SUFFIX_KEYS = ['-Z', '-D', '-S', '-G'] as const;

export const NUMBER_KEY = '#';

export const NUMBERS: Record<string, string> = {
  'S-': '1-',
  'T-': '2-',
  'P-': '3-',
  'H-': '4-',
  'A-': '5-',
  'O-': '0-',
  '-F': '-6',
  '-P': '-7',
  '-L': '-8',
  '-T': '-9',
};

// For RTF/CRE support: the number sign may be anywhere within the stroke
export const FERAL_NUMBER_KEY = true;

export const UNDO_STROKE_STENO = '*';

export const ORTHOGRAPHY_RULES: Array<[string, string]> = [
  // == +ly ==
  // artistic + ly = artistically
  ['^(.*[aeiou]c) \\^ ly$', '$1ally'],
  // humble + ly = humbly (*humblely)
  ['^(.+[aeioubmnp])le \\^ ly$', '$1ly'],
  // == +ry ==
  // statute + ry = statutory
  ['^(.*t)e \\^ (ry|ary)$', '$1ory'],
  // confirm +tory = confirmatory (*confirmtory)
  ['^(.+)m \\^ tor(y|ily)$', '$1mator$2'],
  // supervise +ary = supervisory (*supervisary)
  ['^(.+)se \\^ ar(y|ies)$', '$1sor$2'],
  // == t +cy ==
  // frequent + cy = frequency (tcy/tecy removal)
  ['^(.*[naeiou])te? \\^ cy$', '$1cy'],
  // == +s ==
  // establish + s = establishes (sibilant pluralization)
  ['^(.*(?:s|sh|x|z|zh)) \\^ s$', '$1es'],
  // speech + s = speeches (soft ch pluralization)
  ['^(.*(?:oa|ea|i|ee|oo|au|ou|l|n|(?<![gin]a)r|t)ch) \\^ s$', '$1es'],
  // cherry + s = cherries (consonant + y pluralization)
  ['^(.+[bcdfghjklmnpqrstvwxz])y \\^ s$', '$1ies'],
  // == y ==
  // die+ing = dying
  ['^(.+)ie \\^ ing$', '$1ying'],
  // metallurgy + ist = metallurgist
  ['^(.+[cdfghlmnpr])y \\^ ist$', '$1ist'],
  // beauty + ful = beautiful (y -> i)
  ['^(.+[bcdfghjklmnpqrstvwxz])y \\^ ([a-hj-xz].*)$', '$1i$2'],
  // == +en ==
  // write + en = written
  ['^(.+)te \\^ en$', '$1tten'],
  // Minnesota +en = Minnesotan (*Minnesotaen)
  ['^(.+[ae]) \\^ e(n|ns)$', '$1$2'],
  // == +ial ==
  // ceremony +ial = ceremonial (*ceremonyial)
  ['^(.+)y \\^ (ial|ially)$', '$1$2'],
  // == +if ==
  // spaghetti +ification = spaghettification (*spaghettiification)
  ['^(.+i) \\^ if(y|ying|ied|ies|ication|ications)$', '$1f$2'],
  ['^(.*[^aeiou])y \\^ if(y|ying|ied|ies|ication|ications)$', '$1if$2'],
  // == +ical ==
  // fantastic +ical = fantastical (*fantasticcal)
  ['^(.+)ic \\^ (ical|ically)$', '$1$2'],
  // epistemology +ical = epistemological
  ['^(.+)ology \\^ ic(al|ally)$', '$1ologic$2'],
  // oratory +ical = oratorical (*oratoryical)
  ['^(.*)ry \\^ ica(l|lly|lity)$', '$1rica$2'],
  // == +ist ==
  // radical +ist = radicalist (*radicallist)
  ['^(.*[l]) \\^ is(t|ts)$', '$1is$2'],
  // == +ity ==
  // complementary +ity = complementarity (*complementaryity)
  ['^(.*)ry \\^ ity$', '$1rity'],
  // disproportional +ity = disproportionality (*disproportionallity)
  ['^(.*)l \\^ ity$', '$1lity'],
  // == +ive, +tive ==
  // perform +tive = performative (*performtive)
  ['^(.+)rm \\^ tiv(e|ity|ities)$', '$1rmativ$2'],
  // restore +tive = restorative
  ['^(.+)e \\^ tiv(e|ity|ities)$', '$1ativ$2'],
  // == +ize ==
  // token +ize = tokenize (*tokennize)
  ['^(.+)y \\^ iz(e|es|ing|ed|er|ers|ation|ations|able|ability)$', '$1iz$2'],
  ['^(.+)y \\^ is(e|es|ing|ed|er|ers|ation|ations|able|ability)$', '$1is$2'],
  // conditional +ize = conditionalize (*conditionallize)
  ['^(.+)al \\^ iz(e|ed|es|ing|er|ers|ation|ations|m|ms|able|ability|abilities)$', '$1aliz$2'],
  ['^(.+)al \\^ is(e|ed|es|ing|er|ers|ation|ations|m|ms|able|ability|abilities)$', '$1alis$2'],
  // spectacular +ization = spectacularization (*spectacularrization)
  ['^(.+)ar \\^ iz(e|ed|es|ing|er|ers|ation|ations|m|ms)$', '$1ariz$2'],
  ['^(.+)ar \\^ is(e|ed|es|ing|er|ers|ation|ations|m|ms)$', '$1aris$2'],
  // category +ize/+ise = categorize/categorise (*categoryize/*categoryise)
  ['^(.*[lmnty]) \\^ iz(e|es|ing|ed|er|ers|ation|ations|m|ms|able|ability|abilities)$', '$1iz$2'],
  ['^(.*[lmnty]) \\^ is(e|es|ing|ed|er|ers|ation|ations|m|ms|able|ability|abilities)$', '$1is$2'],
  // == +olog ==
  // criminal + ology = criminology
  ['^(.+)al \\^ olog(y|ist|ists|ical|ically)$', '$1olog$2'],
  // == +ish ==
  // similar +ish = similarish (*similarrish)
  ['^(.+)(ar|er|or) \\^ ish$', '$1$2ish'],
  // free + ed = freed
  ['^(.+e)e \\^ (e.+)$', '$1$2'],
  // narrate + ing = narrating (silent e)
  ['^(.+[bcdfghjklmnpqrstuvwxz])e \\^ ([aeiouy].*)$', '$1$2'],
  // == misc ==
  // defer + ed = deferred (consonant doubling)
  ['^(.*(?:[bcdfghjklmnprstvwxyz]|qu)[aeiou])([bcdfgklmnprtvz]) \\^ ([aeiouy].*)$', '$1$2$2$3'],
];

export const ORTHOGRAPHY_RULES_ALIASES: Record<string, string> = {
  'able': 'ible',
  'ability': 'ibility',
};

export const ORTHOGRAPHY_WORDLIST = 'american_english_words.txt';

export const DICTIONARIES_ROOT = 'asset:plover:assets';
export const DEFAULT_DICTIONARIES = ['user.json', 'commands.json', 'main.json'];

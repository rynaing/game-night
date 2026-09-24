/* ============================================================
   COMMON THREADS — puzzle bank (36 original puzzles).
   Each puzzle: 4 groups x 4 words. Tier 1 (yellow) = most
   straightforward, tier 4 (purple) = trickiest. Every puzzle
   plants red herrings: words that tempt a different group.
   All puzzles and categories are original — not NYT's.
   ============================================================ */
const CX_PUZZLES = [
  { groups: [
    { tier: 1, name: "ROUND THINGS", words: ["BALL", "COIN", "PLATE", "WHEEL"] },
    { tier: 2, name: "PASTA SHAPES", words: ["PENNE", "FUSILLI", "RIGATONI", "LINGUINE"] },
    { tier: 3, name: "WORDS BEFORE \u201cCAKE\u201d", words: ["PAN", "CUP", "CHEESE", "BIRTHDAY"] },
    { tier: 4, name: "___ FLOWER", words: ["SUN", "CAULI", "WALL", "PASSION"] },
  ]},
  { groups: [
    { tier: 1, name: "THINGS WITH TEETH", words: ["COMB", "SAW", "ZIPPER", "SHARK"] },
    { tier: 2, name: "CARD GAMES", words: ["POKER", "BRIDGE", "HEARTS", "RUMMY"] },
    { tier: 3, name: "___ SEA", words: ["HORSE", "SHELL", "FOOD", "SICK"] },
    { tier: 4, name: "___ CLUB", words: ["BOOK", "COUNTRY", "SANDWICH", "NIGHT"] },
  ]},
  { groups: [
    { tier: 1, name: "BREAKFAST FOODS", words: ["PANCAKE", "WAFFLE", "OMELET", "BACON"] },
    { tier: 2, name: "DOG BREEDS", words: ["BEAGLE", "POODLE", "HUSKY", "DALMATIAN"] },
    { tier: 3, name: "___ TICKET", words: ["MEAL", "SEASON", "LOTTERY", "SPEEDING"] },
    { tier: 4, name: "HETERONYMS (SAID TWO WAYS)", words: ["TEAR", "WOUND", "BASS", "LEAD"] },
  ]},
  { groups: [
    { tier: 1, name: "PLANETS", words: ["MERCURY", "VENUS", "MARS", "JUPITER"] },
    { tier: 2, name: "CHESS PIECES", words: ["PAWN", "ROOK", "KNIGHT", "BISHOP"] },
    { tier: 3, name: "___ PAPER", words: ["TOILET", "SAND", "WRAPPING", "WALL"] },
    { tier: 4, name: "THINGS YOU CAN CRACK", words: ["CODE", "JOKE", "EGG", "WHIP"] },
  ]},
  { groups: [
    { tier: 1, name: "FRUITS", words: ["APPLE", "ORANGE", "PEACH", "MANGO"] },
    { tier: 2, name: "SOCIAL APPS", words: ["INSTAGRAM", "TIKTOK", "SNAPCHAT", "REDDIT"] },
    { tier: 3, name: "WORDS AFTER \u201cBABY\u201d", words: ["SHOWER", "TEETH", "BOOMER", "STEPS"] },
    { tier: 4, name: "___ BREAD", words: ["BANANA", "PITA", "GARLIC", "CORN"] },
  ]},
  { groups: [
    { tier: 1, name: "KITCHEN APPLIANCES", words: ["BLENDER", "TOASTER", "MICROWAVE", "MIXER"] },
    { tier: 2, name: "FAMOUS DETECTIVES", words: ["HOLMES", "POIROT", "MARLOWE", "SPADE"] },
    { tier: 3, name: "___ SCHOOL", words: ["HIGH", "MEDICAL", "CHARTER", "TRADE"] },
    { tier: 4, name: "NOUN/VERB STRESS SHIFT", words: ["RECORD", "PERMIT", "CONFLICT", "PROJECT"] },
  ]},
  { groups: [
    { tier: 1, name: "U.S. STATES", words: ["TEXAS", "OHIO", "MAINE", "IDAHO"] },
    { tier: 2, name: "PIZZA TOPPINGS", words: ["PEPPERONI", "MUSHROOM", "ONION", "OLIVE"] },
    { tier: 3, name: "MOUNTAIN RANGES", words: ["ANDES", "ALPS", "HIMALAYAS", "ROCKIES"] },
    { tier: 4, name: "STATE NICKNAMES + \u201cSTATE\u201d", words: ["EMPIRE", "BAY", "GRANITE", "SUNSHINE"] },
  ]},
  { groups: [
    { tier: 1, name: "OCEANS", words: ["PACIFIC", "ATLANTIC", "INDIAN", "ARCTIC"] },
    { tier: 2, name: "INSTRUMENTS", words: ["GUITAR", "PIANO", "TRUMPET", "DRUM"] },
    { tier: 3, name: "___ JAM", words: ["TRAFFIC", "JELLY", "SPACE", "PEARL"] },
    { tier: 4, name: "___ WAVE", words: ["HEAT", "SOUND", "NEW", "TIDAL"] },
  ]},
  { groups: [
    { tier: 1, name: "EMOTIONS", words: ["HAPPY", "SAD", "ANGRY", "AFRAID"] },
    { tier: 2, name: "BIG CATS", words: ["LION", "TIGER", "LEOPARD", "JAGUAR"] },
    { tier: 3, name: "WORDS AFTER \u201cMODEL\u201d", words: ["ROLE", "FASHION", "SCALE", "BUSINESS"] },
    { tier: 4, name: "\u201cCAT\u201d + WORD", words: ["NAP", "FISH", "CALL", "WALK"] },
  ]},
  { groups: [
    { tier: 1, name: "WEEKDAYS", words: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"] },
    { tier: 2, name: "TREES", words: ["OAK", "MAPLE", "PINE", "BIRCH"] },
    { tier: 3, name: "___ STREET", words: ["WALL", "MAIN", "SESAME", "EASY"] },
    { tier: 4, name: "\u201cSWEET\u201d ___", words: ["SIXTEEN", "POTATO", "TALK", "TOOTH"] },
  ]},
  { groups: [
    { tier: 1, name: "METALS", words: ["GOLD", "COPPER", "IRON", "TIN"] },
    { tier: 2, name: "FAMOUS PAINTERS", words: ["PICASSO", "MONET", "DALI", "WARHOL"] },
    { tier: 3, name: "___ AGE", words: ["GOLDEN", "SILVER", "BRONZE", "STONE"] },
    { tier: 4, name: "___ SALE", words: ["YARD", "GARAGE", "BAKE", "SIDEWALK"] },
  ]},
  { groups: [
    { tier: 1, name: "ORGANS", words: ["HEART", "LUNG", "LIVER", "KIDNEY"] },
    { tier: 2, name: "DANCES", words: ["TANGO", "WALTZ", "SALSA", "RUMBA"] },
    { tier: 3, name: "___ BEAN", words: ["JELLY", "COFFEE", "GREEN", "LIMA"] },
    { tier: 4, name: "___ DANCE", words: ["RAIN", "BREAK", "SLOW", "TAP"] },
  ]},
  { groups: [
    { tier: 1, name: "VEGETABLES", words: ["CARROT", "BROCCOLI", "SPINACH", "PEPPER"] },
    { tier: 2, name: "ANCIENT LANDMARKS", words: ["COLOSSEUM", "PYRAMIDS", "TAJMAHAL", "SPHINX"] },
    { tier: 3, name: "___ PEPPER", words: ["BELL", "CHILI", "BLACK", "GHOST"] },
    { tier: 4, name: "___ TOWER", words: ["EIFFEL", "IVORY", "CELL", "CLOCK"] },
  ]},
  { groups: [
    { tier: 1, name: "FARM ANIMALS", words: ["COW", "PIG", "GOAT", "DONKEY"] },
    { tier: 2, name: "BOARD GAMES", words: ["CHESS", "CHECKERS", "MONOPOLY", "CLUE"] },
    { tier: 3, name: "___ RACE", words: ["RAT", "ARMS", "DRAG", "HORSE"] },
    { tier: 4, name: "SINGULAR AND PLURAL ALIKE", words: ["SHEEP", "DEER", "MOOSE", "FISH"] },
  ]},
  { groups: [
    { tier: 1, name: "WRITING TOOLS", words: ["PEN", "PENCIL", "MARKER", "CRAYON"] },
    { tier: 2, name: "GREEK LETTERS", words: ["BETA", "GAMMA", "THETA", "OMEGA"] },
    { tier: 3, name: "___ PEN", words: ["BALLPOINT", "FOUNTAIN", "GEL", "QUILL"] },
    { tier: 4, name: "NATO PHONETIC ALPHABET", words: ["ALPHA", "BRAVO", "CHARLIE", "DELTA"] },
  ]},
  { groups: [
    { tier: 1, name: "WEATHER WORDS", words: ["RAIN", "SNOW", "SLEET", "HAIL"] },
    { tier: 2, name: "GEMSTONES", words: ["DIAMOND", "RUBY", "EMERALD", "SAPPHIRE"] },
    { tier: 3, name: "___ STORM", words: ["PERFECT", "BRAIN", "SAND", "FIRE"] },
    { tier: 4, name: "___ DIAMOND", words: ["ROUGH", "BLOOD", "BASEBALL", "NEIL"] },
  ]},
  { groups: [
    { tier: 1, name: "TOOLS", words: ["HAMMER", "WRENCH", "SCREWDRIVER", "SAW"] },
    { tier: 2, name: "FABRICS", words: ["COTTON", "SILK", "DENIM", "WOOL"] },
    { tier: 3, name: "___ SAW", words: ["JIG", "HACK", "CHAIN", "BUZZ"] },
    { tier: 4, name: "___ COTTON", words: ["CANDY", "EGYPTIAN", "ABSORBENT", "ORGANIC"] },
  ]},
  { groups: [
    { tier: 1, name: "SPICES", words: ["CINNAMON", "CUMIN", "PAPRIKA", "TURMERIC"] },
    { tier: 2, name: "WINE VARIETALS", words: ["MERLOT", "CHARDONNAY", "PINOT", "CABERNET"] },
    { tier: 3, name: "___ WINE", words: ["RED", "WHITE", "BOXED", "MULLED"] },
    { tier: 4, name: "\u201cHOT\u201d ___", words: ["POTATO", "MESS", "TICKET", "ROD"] },
  ]},
  { groups: [
    { tier: 1, name: "INSECTS", words: ["ANT", "BEE", "WASP", "BEETLE"] },
    { tier: 2, name: "SHOES", words: ["SNEAKER", "LOAFER", "BOOT", "SANDAL"] },
    { tier: 3, name: "___ BEE", words: ["SPELLING", "HONEY", "QUEEN", "BUMBLE"] },
    { tier: 4, name: "___ ANT", words: ["FIRE", "ARMY", "CARPENTER", "PHARAOH"] },
  ]},
  { groups: [
    { tier: 1, name: "NUTS", words: ["ALMOND", "WALNUT", "CASHEW", "PECAN"] },
    { tier: 2, name: "COUNTRIES IN EUROPE", words: ["FRANCE", "SPAIN", "ITALY", "GREECE"] },
    { tier: 3, name: "___ NUT", words: ["HEX", "WING", "DOUGH", "CHEST"] },
    { tier: 4, name: "NAMED AFTER PLACES", words: ["CHEDDAR", "BIKINI", "CHAMPAGNE", "DENIM"] },
  ]},
  { groups: [
    { tier: 1, name: "FRUITS", words: ["MANGO", "KIWI", "PAPAYA", "GUAVA"] },
    { tier: 2, name: "LANGUAGES", words: ["SPANISH", "FRENCH", "MANDARIN", "ARABIC"] },
    { tier: 3, name: "___ JUICE", words: ["ORANGE", "APPLE", "GRAPE", "PRUNE"] },
    { tier: 4, name: "WORDS AFTER \u201cFRENCH\u201d", words: ["KISS", "FRY", "BRAID", "DOOR"] },
  ]},
  { groups: [
    { tier: 1, name: "GEMSTONES", words: ["OPAL", "JADE", "TOPAZ", "AMBER"] },
    { tier: 2, name: "ZODIAC SIGNS", words: ["ARIES", "TAURUS", "GEMINI", "LEO"] },
    { tier: 3, name: "___ SIGN", words: ["DOLLAR", "STOP", "PEACE", "VITAL"] },
    { tier: 4, name: "___ STONE", words: ["ROSETTA", "KIDNEY", "PUMICE", "STEPPING"] },
  ]},
  { groups: [
    { tier: 1, name: "CLEANING SUPPLIES", words: ["BLEACH", "MOP", "BROOM", "SPONGE"] },
    { tier: 2, name: "COMPOSERS", words: ["MOZART", "BEETHOVEN", "BACH", "CHOPIN"] },
    { tier: 3, name: "___ PARTY", words: ["DINNER", "BIRTHDAY", "SLUMBER", "TAILGATE"] },
    { tier: 4, name: "TEMPO MARKINGS", words: ["ADAGIO", "ALLEGRO", "LARGO", "PRESTO"] },
  ]},
  { groups: [
    { tier: 1, name: "SANDWICH TYPES", words: ["CLUB", "REUBEN", "BLT", "HOAGIE"] },
    { tier: 2, name: "FISH", words: ["SALMON", "TUNA", "TROUT", "BASS"] },
    { tier: 3, name: "___ CLUB", words: ["BOOK", "COUNTRY", "NIGHT", "GLEE"] },
    { tier: 4, name: "___ BASS", words: ["SEA", "STRIPED", "SMALLMOUTH", "LARGEMOUTH"] },
  ]},
  { groups: [
    { tier: 1, name: "BIRDS", words: ["ROBIN", "SPARROW", "BLUEJAY", "CARDINAL"] },
    { tier: 2, name: "FLOWERS", words: ["ROSE", "TULIP", "DAISY", "LILY"] },
    { tier: 3, name: "___ LILY", words: ["WATER", "TIGER", "EASTER", "CALLA"] },
    { tier: 4, name: "WORDS BEFORE \u201cBIRD\u201d", words: ["JAY", "EARLY", "SNOW", "MOCKING"] },
  ]},
  { groups: [
    { tier: 1, name: "TRANSIT", words: ["TRAIN", "BUS", "FERRY", "SUBWAY"] },
    { tier: 2, name: "FONTS", words: ["ARIAL", "HELVETICA", "VERDANA", "GEORGIA"] },
    { tier: 3, name: "___ SQUARE", words: ["TIMES", "UNION", "HERALD", "MADISON"] },
    { tier: 4, name: "___ TRAIN", words: ["SOUL", "GRAVY", "THOUGHT", "FREIGHT"] },
  ]},
  { groups: [
    { tier: 1, name: "SPORTS", words: ["SOCCER", "TENNIS", "GOLF", "RUGBY"] },
    { tier: 2, name: "COCKTAILS", words: ["MARTINI", "MOJITO", "MARGARITA", "DAIQUIRI"] },
    { tier: 3, name: "GOLF ___", words: ["CART", "CLUB", "COURSE", "BAG"] },
    { tier: 4, name: "TENNIS ___", words: ["TABLE", "ELBOW", "SHOE", "BRACELET"] },
  ]},
  { groups: [
    { tier: 1, name: "HERBS", words: ["BASIL", "THYME", "ROSEMARY", "OREGANO"] },
    { tier: 2, name: "SCIENTISTS", words: ["EINSTEIN", "CURIE", "DARWIN", "GALILEO"] },
    { tier: 3, name: "TEA TYPES", words: ["GREEN", "BLACK", "HERBAL", "OOLONG"] },
    { tier: 4, name: "UNITS NAMED AFTER SCIENTISTS", words: ["JOULE", "WATT", "HERTZ", "NEWTON"] },
  ]},
  { groups: [
    { tier: 1, name: "COOKING METHODS", words: ["FRY", "BAKE", "GRILL", "ROAST"] },
    { tier: 2, name: "CIRCUS ACTS", words: ["CLOWN", "ACROBAT", "JUGGLER", "MAGICIAN"] },
    { tier: 3, name: "___ FRY", words: ["FRENCH", "STIR", "DEEP", "SMALL"] },
    { tier: 4, name: "___ ACT", words: ["BALANCING", "JUGGLING", "CLEANUP", "MAGIC"] },
  ]},
  { groups: [
    { tier: 1, name: "REPTILES", words: ["SNAKE", "LIZARD", "TURTLE", "CROCODILE"] },
    { tier: 2, name: "INVENTORS", words: ["EDISON", "TESLA", "BELL", "MARCONI"] },
    { tier: 3, name: "___ SNAKE", words: ["GARDEN", "RATTLE", "GRASS", "SOLID"] },
    { tier: 4, name: "___ BELL", words: ["TACO", "LIBERTY", "DIVING", "DOOR"] },
  ]},
  { groups: [
    { tier: 1, name: "MUSIC GENRES", words: ["JAZZ", "ROCK", "HIPHOP", "COUNTRY"] },
    { tier: 2, name: "CHEESES", words: ["CHEDDAR", "BRIE", "GOUDA", "SWISS"] },
    { tier: 3, name: "___ ROCK", words: ["PUNK", "CLASSIC", "ALT", "HARD"] },
    { tier: 4, name: "___ CHEESE", words: ["CREAM", "STRING", "BLUE", "COTTAGE"] },
  ]},
  { groups: [
    { tier: 1, name: "PREPOSITIONS", words: ["UNDER", "BETWEEN", "THROUGH", "AGAINST"] },
    { tier: 2, name: "CARD SUITS", words: ["HEARTS", "DIAMONDS", "CLUBS", "SPADES"] },
    { tier: 3, name: "HEART ___", words: ["BLEEDING", "PURPLE", "ARTICHOKE", "LONELY"] },
    { tier: 4, name: "___ OVER", words: ["GET", "RUN", "BEND", "TAKE"] },
  ]},
  { groups: [
    { tier: 1, name: "ROCKS", words: ["GRANITE", "MARBLE", "SLATE", "LIMESTONE"] },
    { tier: 2, name: "AUTHORS", words: ["HEMINGWAY", "AUSTEN", "DICKENS", "TWAIN"] },
    { tier: 3, name: "MARK ___", words: ["MARK", "ZUCKERBERG", "CUBAN", "RUFFALO"] },
    { tier: 4, name: "\u201cGRAND\u201d ___", words: ["CANYON", "PIANO", "THEFT", "SLAM"] },
  ]},
  { groups: [
    { tier: 1, name: "COLORS", words: ["RED", "BLUE", "GREEN", "YELLOW"] },
    { tier: 2, name: "PRESIDENTS", words: ["WASHINGTON", "LINCOLN", "JEFFERSON", "ROOSEVELT"] },
    { tier: 3, name: "___ WASHINGTON", words: ["POST", "STATE", "MONUMENT", "CAPITALS"] },
    { tier: 4, name: "___ GREEN", words: ["BEAN", "ROOM", "CARD", "EYED"] },
  ]},
  { groups: [
    { tier: 1, name: "BABY ANIMALS", words: ["CALF", "PUPPY", "KITTEN", "CUB"] },
    { tier: 2, name: "PLANETS", words: ["MERCURY", "VENUS", "EARTH", "SATURN"] },
    { tier: 3, name: "DOG ___", words: ["DAYS", "TIRED", "POUND", "WHISTLE"] },
    { tier: 4, name: "___ RING", words: ["ENGAGEMENT", "BOXING", "KEY", "ONION"] },
  ]},
  { groups: [
    { tier: 1, name: "SEASONS", words: ["SPRING", "SUMMER", "FALL", "WINTER"] },
    { tier: 2, name: "ELEMENTS", words: ["HYDROGEN", "OXYGEN", "CARBON", "HELIUM"] },
    { tier: 3, name: "___ SPRING", words: ["BREAK", "ROLL", "TRAINING", "FEVER"] },
    { tier: 4, name: "NOBLE GASES", words: ["NEON", "ARGON", "KRYPTON", "XENON"] },
  ]},
];

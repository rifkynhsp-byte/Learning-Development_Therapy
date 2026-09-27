/**
 * Learning adventures: the runner teaches something while the child moves.
 *
 * Each adventure is a list of steps. A step is one idea (a stage of a cycle,
 * or one animal) paired with one whole-body movement that acts it out:
 *
 *   jump    both feet off the floor      (a leaping dolphin, a wave)
 *   duck    squat low and hold           (rain falling, a tiger crouching)
 *   dodge   step sideways into a lane    (a crab, the wind pushing a cloud)
 *   reach   both arms stretched overhead (vapour rising, a giraffe)
 *   letter  make a body letter           (a starfish X, an eagle T)
 *
 * So the movement is not decoration: doing it is how the idea is remembered.
 *
 * Cycles are taught in order, one step per stop, and the last step leads back
 * to the first. Once the whole loop has been run once, every stop is preceded
 * by a question ("after evaporation, what comes next?") answered by stepping
 * into the lane with the right picture. Animal adventures ask about the facts
 * instead ("who walks sideways?").
 *
 * All text is in Bahasa Indonesia and English; the app picks which to show and
 * say. Keep sentences short: they are spoken to a five-year-old mid-run.
 */

export const MOVES = ['jump', 'duck', 'dodge', 'reach', 'letter'];

/** Movement names, for the prompt chip. */
export const MOVE_WORDS = {
  jump:   { id: 'Lompat!', en: 'Jump!', emoji: '\u{1F998}' },
  duck:   { id: 'Jongkok!', en: 'Squat!', emoji: '\u{1F986}' },
  dodge:  { id: 'Geser ke samping!', en: 'Step aside!', emoji: '\u{1F980}' },
  reach:  { id: 'Rentangkan ke atas!', en: 'Stretch up!', emoji: '⭐' },
  letter: { id: 'Buat hurufnya!', en: 'Make the letter!', emoji: '\u{1F520}' },
};

export const ADVENTURES = [
  {
    key: 'water',
    icon: '\u{1F4A7}',
    id: 'Siklus Air',
    en: 'The Water Cycle',
    kind: 'cycle',
    zones: ['ocean-shore', 'sky', 'mountain', 'river'],
    intro: {
      id: 'Kita ikut perjalanan setetes air. Dari laut, ke langit, lalu kembali lagi!',
      en: 'Let us follow one drop of water. From the sea, up to the sky, and back again!',
    },
    steps: [
      { emoji: '\u{1F30A}', id: 'Laut', en: 'The sea', move: 'jump',
        do: { id: 'Lompati ombaknya!', en: 'Jump over the wave!' },
        fact: { id: 'Air menunggu di laut, sungai dan danau.',
                en: 'Water waits in the sea, the rivers and the lakes.' } },
      { emoji: '☀️', id: 'Penguapan', en: 'Evaporation', move: 'reach',
        do: { id: 'Rentangkan tangan ke atas, naik seperti uap!',
              en: 'Stretch up high and rise like vapour!' },
        fact: { id: 'Matahari memanaskan air. Air berubah jadi uap dan naik ke langit.',
                en: 'The sun warms the water. It turns into vapour and rises into the sky.' } },
      { emoji: '☁️', id: 'Pengembunan', en: 'Condensation', move: 'letter', letter: 'O',
        do: { id: 'Buat huruf O, berkumpul jadi awan!', en: 'Make an O and gather into a cloud!' },
        fact: { id: 'Di atas udaranya dingin. Uap berkumpul jadi titik air kecil, lalu jadi awan.',
                en: 'High up it is cold. The vapour gathers into tiny drops and makes a cloud.' } },
      { emoji: '\u{1F32C}️', id: 'Angin', en: 'Wind', move: 'dodge',
        do: { id: 'Geser ke samping, angin meniup awan!', en: 'Step aside, the wind blows the cloud!' },
        fact: { id: 'Angin membawa awan jauh, sampai ke atas gunung.',
                en: 'The wind carries the clouds far away, up over the mountains.' } },
      { emoji: '\u{1F327}️', id: 'Hujan', en: 'Rain', move: 'duck',
        do: { id: 'Jongkok, hujan turun!', en: 'Squat down, here comes the rain!' },
        fact: { id: 'Titik air di awan jadi berat, lalu jatuh sebagai hujan.',
                en: 'The drops in the cloud get heavy and fall down as rain.' } },
      { emoji: '\u{1F3DE}️', id: 'Mengalir', en: 'Flowing back', move: 'dodge',
        do: { id: 'Geser, ikuti sungai yang berkelok!', en: 'Step aside and follow the winding river!' },
        fact: { id: 'Air hujan meresap ke tanah dan mengalir di sungai, kembali ke laut.',
                en: 'Rain soaks into the ground and flows down the river, back to the sea.' } },
    ],
    ethic: {
      id: 'Air itu berharga. Matikan keran saat menggosok gigi, ya!',
      en: 'Water is precious. Turn off the tap while you brush your teeth!',
    },
  },

  {
    key: 'butterfly',
    icon: '\u{1F98B}',
    id: 'Siklus Kupu-kupu',
    en: 'The Butterfly Life Cycle',
    kind: 'cycle',
    zones: ['garden', 'jungle'],
    intro: {
      id: 'Kupu-kupu tidak lahir langsung bisa terbang. Ayo lihat perjalanannya!',
      en: 'A butterfly is not born with wings. Let us see how it grows!',
    },
    steps: [
      { emoji: '\u{1F95A}', id: 'Telur', en: 'Egg', move: 'duck',
        do: { id: 'Jongkok kecil seperti telur!', en: 'Squat down small like an egg!' },
        fact: { id: 'Ibu kupu-kupu menaruh telur kecil di bawah daun.',
                en: 'Mother butterfly lays tiny eggs under a leaf.' } },
      { emoji: '\u{1F41B}', id: 'Ulat', en: 'Caterpillar', move: 'dodge',
        do: { id: 'Geser ke samping, merayap seperti ulat!', en: 'Step aside and crawl like a caterpillar!' },
        fact: { id: 'Ulat keluar dari telur dan makan daun terus sampai gemuk.',
                en: 'The caterpillar hatches and eats and eats leaves until it is big.' } },
      { emoji: '\u{1FADB}', id: 'Kepompong', en: 'Chrysalis', move: 'letter', letter: 'O',
        do: { id: 'Buat huruf O, bungkus diri jadi kepompong!', en: 'Make an O and wrap up in a chrysalis!' },
        fact: { id: 'Ulat membungkus dirinya jadi kepompong dan diam lama sekali.',
                en: 'The caterpillar wraps itself in a chrysalis and stays very still.' } },
      { emoji: '\u{1F98B}', id: 'Kupu-kupu', en: 'Butterfly', move: 'letter', letter: 'T',
        do: { id: 'Buat huruf T, bentangkan sayapmu!', en: 'Make a T and spread your wings!' },
        fact: { id: 'Keluarlah kupu-kupu! Ia minum madu bunga dan membantu bunga berbuah.',
                en: 'Out comes a butterfly! It drinks nectar and helps flowers make fruit.' } },
    ],
    ethic: {
      id: 'Jangan tangkap kupu-kupu. Tanam bunga supaya mereka datang!',
      en: 'Do not catch butterflies. Plant flowers so they come to visit!',
    },
  },

  {
    key: 'sea',
    icon: '\u{1F420}',
    id: 'Kehidupan Laut',
    en: 'Sea Life',
    kind: 'animals',
    zones: ['reef', 'deep-sea'],
    intro: {
      id: 'Kita menyelam ke laut! Bergerak seperti hewan-hewan laut.',
      en: 'We are diving into the sea! Move like the sea animals.',
    },
    steps: [
      { emoji: '\u{1F980}', id: 'Kepiting', en: 'Crab', move: 'dodge',
        do: { id: 'Jalan ke samping seperti kepiting!', en: 'Walk sideways like a crab!' },
        fact: { id: 'Kepiting berjalan ke samping, karena kakinya menekuk ke samping.',
                en: 'Crabs walk sideways, because their legs bend out to the side.' },
        q: { id: 'Siapa yang berjalan ke samping?', en: 'Who walks sideways?' } },
      { emoji: '\u{1F42C}', id: 'Lumba-lumba', en: 'Dolphin', move: 'jump',
        do: { id: 'Melompat seperti lumba-lumba!', en: 'Leap like a dolphin!' },
        fact: { id: 'Lumba-lumba melompat ke atas air untuk bernapas. Ia bernapas dengan paru-paru.',
                en: 'Dolphins leap up out of the water to breathe air, just like us.' },
        q: { id: 'Siapa yang melompat keluar air untuk bernapas?', en: 'Who leaps out of the water to breathe?' } },
      { emoji: '\u{1F422}', id: 'Penyu', en: 'Sea turtle', move: 'duck',
        do: { id: 'Jongkok, berenang rendah seperti penyu!', en: 'Squat and swim low like a sea turtle!' },
        fact: { id: 'Penyu kembali ke pantai tempat ia menetas untuk bertelur.',
                en: 'Sea turtles swim back to the beach where they hatched to lay their eggs.' },
        q: { id: 'Siapa yang kembali ke pantai untuk bertelur?', en: 'Who goes back to the beach to lay eggs?' } },
      { emoji: '⭐', id: 'Bintang laut', en: 'Starfish', move: 'letter', letter: 'X',
        do: { id: 'Buat huruf X, jadi bintang laut!', en: 'Make an X and be a starfish!' },
        fact: { id: 'Bintang laut punya lima lengan. Lengan yang putus bisa tumbuh lagi!',
                en: 'A starfish has five arms. If it loses one, it can grow it back!' },
        q: { id: 'Siapa yang lengannya bisa tumbuh lagi?', en: 'Who can grow a new arm?' } },
      { emoji: '\u{1FABC}', id: 'Ubur-ubur', en: 'Jellyfish', move: 'reach',
        do: { id: 'Rentangkan tangan ke atas, melayang seperti ubur-ubur!', en: 'Stretch up and float like a jellyfish!' },
        fact: { id: 'Ubur-ubur tidak punya tulang dan tidak punya otak. Jangan disentuh, bisa menyengat!',
                en: 'A jellyfish has no bones and no brain. Do not touch, it can sting!' },
        q: { id: 'Siapa yang tidak punya tulang dan otak?', en: 'Who has no bones and no brain?' } },
      { emoji: '\u{1F421}', id: 'Ikan buntal', en: 'Pufferfish', move: 'letter', letter: 'O',
        do: { id: 'Buat huruf O, menggembung seperti ikan buntal!', en: 'Make an O and puff up like a pufferfish!' },
        fact: { id: 'Kalau takut, ikan buntal menggembung jadi bulat seperti bola.',
                en: 'When it is scared, a pufferfish puffs up round like a ball.' },
        q: { id: 'Siapa yang menggembung jadi bulat?', en: 'Who puffs up round like a ball?' } },
      { emoji: '\u{1F419}', id: 'Gurita', en: 'Octopus', move: 'dodge',
        do: { id: 'Geser cepat seperti gurita!', en: 'Zoom to the side like an octopus!' },
        fact: { id: 'Gurita punya delapan lengan dan tiga jantung. Ia bisa berubah warna!',
                en: 'An octopus has eight arms and three hearts. It can change colour!' },
        q: { id: 'Siapa yang punya delapan lengan?', en: 'Who has eight arms?' } },
    ],
    ethic: {
      id: 'Jangan buang plastik ke laut. Penyu mengira plastik itu ubur-ubur.',
      en: 'Never throw plastic in the sea. Turtles think it is a jellyfish.',
    },
  },

  {
    key: 'wild',
    icon: '\u{1F42F}',
    id: 'Satwa Liar',
    en: 'Wildlife',
    kind: 'animals',
    zones: ['jungle', 'savanna'],
    intro: {
      id: 'Kita menjelajah hutan dan padang rumput. Bergerak seperti satwa liar!',
      en: 'We are exploring the forest and the grassland. Move like the wild animals!',
    },
    steps: [
      { emoji: '\u{1F998}', id: 'Kanguru', en: 'Kangaroo', move: 'jump',
        do: { id: 'Lompat seperti kanguru!', en: 'Hop like a kangaroo!' },
        fact: { id: 'Kanguru dari Australia melompat dengan dua kaki. Bayinya tinggal di kantong.',
                en: 'Kangaroos from Australia hop on two legs. The baby lives in a pouch.' },
        q: { id: 'Siapa yang bayinya tinggal di kantong?', en: 'Whose baby lives in a pouch?' } },
      { emoji: '\u{1F405}', id: 'Harimau Sumatra', en: 'Sumatran tiger', move: 'duck',
        do: { id: 'Jongkok diam seperti harimau mengintai!', en: 'Crouch low like a tiger on the prowl!' },
        fact: { id: 'Harimau Sumatra hanya ada di Indonesia. Belangnya tidak ada yang sama.',
                en: 'Sumatran tigers live only in Indonesia. No two have the same stripes.' },
        q: { id: 'Siapa yang belangnya tidak ada yang sama?', en: 'Whose stripes are never the same?' } },
      { emoji: '\u{1F985}', id: 'Elang Jawa', en: 'Javan hawk-eagle', move: 'letter', letter: 'T',
        do: { id: 'Buat huruf T, bentangkan sayap seperti elang!', en: 'Make a T and spread your wings like an eagle!' },
        fact: { id: 'Elang Jawa melayang tinggi tanpa mengepakkan sayap. Ia burung nasional kita.',
                en: 'The Javan hawk-eagle glides high without flapping. It is our national bird.' },
        q: { id: 'Siapa burung nasional Indonesia?', en: 'Who is the national bird of Indonesia?' } },
      { emoji: '\u{1F992}', id: 'Jerapah', en: 'Giraffe', move: 'reach',
        do: { id: 'Rentangkan tangan tinggi seperti leher jerapah!', en: 'Stretch up tall like a giraffe!' },
        fact: { id: 'Jerapah hewan paling tinggi. Ia makan daun di pucuk pohon.',
                en: 'The giraffe is the tallest animal. It eats leaves from the tops of trees.' },
        q: { id: 'Siapa hewan paling tinggi?', en: 'Who is the tallest animal?' } },
      { emoji: '\u{1F9A7}', id: 'Orangutan', en: 'Orangutan', move: 'letter', letter: 'Y',
        do: { id: 'Buat huruf Y, bergelantungan seperti orangutan!', en: 'Make a Y and swing like an orangutan!' },
        fact: { id: 'Tangan orangutan lebih panjang dari kakinya. Ia menanam pohon lewat biji buah.',
                en: 'An orangutan’s arms are longer than its legs. It plants trees by dropping fruit seeds.' },
        q: { id: 'Siapa yang tangannya lebih panjang dari kakinya?', en: 'Whose arms are longer than its legs?' } },
      { emoji: '\u{1F418}', id: 'Gajah Sumatra', en: 'Sumatran elephant', move: 'dodge',
        do: { id: 'Geser, beri jalan untuk gajah!', en: 'Step aside and let the elephant pass!' },
        fact: { id: 'Gajah berjalan jauh bersama keluarganya dan tidak pernah lupa jalan pulang.',
                en: 'Elephants walk far with their family and never forget the way home.' },
        q: { id: 'Siapa yang tidak pernah lupa jalan pulang?', en: 'Who never forgets the way home?' } },
      { emoji: '\u{1F98E}', id: 'Komodo', en: 'Komodo dragon', move: 'duck',
        do: { id: 'Jongkok rendah, merayap seperti komodo!', en: 'Squat low and creep like a Komodo!' },
        fact: { id: 'Komodo kadal terbesar di dunia. Ia hanya ada di Pulau Komodo dan sekitarnya.',
                en: 'The Komodo is the biggest lizard in the world. It lives only around Komodo Island.' },
        q: { id: 'Siapa kadal terbesar di dunia?', en: 'Who is the biggest lizard in the world?' } },
    ],
    ethic: {
      id: 'Jangan pernah membeli satwa liar. Lihat mereka dari jauh, di rumahnya.',
      en: 'Never buy wild animals. Watch them from far away, in their home.',
    },
  },

  {
    key: 'food',
    icon: '\u{1F33E}',
    id: 'Rantai Makanan',
    en: 'The Food Chain',
    kind: 'cycle',
    zones: ['ricefield', 'jungle'],
    intro: {
      id: 'Siapa makan siapa di sawah? Ayo ikuti rantai makanan!',
      en: 'Who eats whom in the rice field? Let us follow the food chain!',
    },
    steps: [
      { emoji: '\u{1F33E}', id: 'Padi', en: 'Rice plant', move: 'reach',
        do: { id: 'Rentangkan tangan ke atas, tumbuh ke arah matahari!', en: 'Stretch up and grow towards the sun!' },
        fact: { id: 'Padi membuat makanannya sendiri dari sinar matahari, air dan udara.',
                en: 'The rice plant makes its own food from sunlight, water and air.' } },
      { emoji: '\u{1F997}', id: 'Belalang', en: 'Grasshopper', move: 'jump',
        do: { id: 'Lompat seperti belalang!', en: 'Jump like a grasshopper!' },
        fact: { id: 'Belalang memakan daun padi.', en: 'The grasshopper eats the rice leaves.' } },
      { emoji: '\u{1F438}', id: 'Katak', en: 'Frog', move: 'duck',
        do: { id: 'Jongkok seperti katak siap menangkap!', en: 'Squat like a frog ready to catch!' },
        fact: { id: 'Katak menangkap belalang dengan lidahnya yang panjang.',
                en: 'The frog catches the grasshopper with its long tongue.' } },
      { emoji: '\u{1F40D}', id: 'Ular', en: 'Snake', move: 'dodge',
        do: { id: 'Geser ke samping, meliuk seperti ular!', en: 'Step aside and slither like a snake!' },
        fact: { id: 'Ular sawah memakan katak dan tikus.', en: 'The rice-field snake eats frogs and rats.' } },
      { emoji: '\u{1F985}', id: 'Elang', en: 'Eagle', move: 'letter', letter: 'T',
        do: { id: 'Buat huruf T, terbang seperti elang!', en: 'Make a T and fly like an eagle!' },
        fact: { id: 'Elang terbang tinggi dan menangkap ular.', en: 'The eagle soars high and catches the snake.' } },
      { emoji: '\u{1F344}', id: 'Pengurai', en: 'Decomposers', move: 'duck',
        do: { id: 'Jongkok ke tanah seperti jamur!', en: 'Squat down to the soil like a mushroom!' },
        fact: { id: 'Jamur dan cacing mengubah yang mati jadi tanah subur untuk padi lagi.',
                en: 'Fungi and worms turn dead things into rich soil for the rice again.' } },
    ],
    ethic: {
      id: 'Semua hewan penting. Kalau satu hilang, rantainya putus.',
      en: 'Every animal matters. If one goes missing, the chain breaks.',
    },
  },
];

export function adventureByKey(key) {
  return ADVENTURES.find((a) => a.key === key) || null;
}

/**
 * The question asked before a step, once the adventure has been run through
 * once. Returns the prompt and three options, exactly one of them correct.
 * Distractors always come from the same adventure, so the pictures are
 * plausible and the choice is about the idea, not about which one looks odd.
 */
export function makeQuestion(adventure, stepIndex, rand = Math.random) {
  const steps = adventure.steps;
  const target = steps[stepIndex];
  let prompt;
  if (adventure.kind === 'cycle') {
    const prev = steps[(stepIndex - 1 + steps.length) % steps.length];
    prompt = {
      id: `Setelah ${prev.id.toLowerCase()}, apa selanjutnya?`,
      en: `After ${lowerFirst(prev.en)}, what comes next?`,
    };
  } else {
    prompt = target.q || { id: `Mana ${target.id.toLowerCase()}?`, en: `Which one is the ${lowerFirst(target.en)}?` };
  }
  const others = steps.filter((s, i) => i !== stepIndex && s.emoji !== target.emoji);
  const picks = shuffle(others, rand).slice(0, 2);
  const options = shuffle([target, ...picks], rand).map((s) => ({
    emoji: s.emoji, id: s.id, en: s.en, correct: s === target,
  }));
  return { prompt, options };
}

function lowerFirst(s) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick the text for the chosen language: 'id', 'en' or 'both'. */
export function say(pair, lang) {
  if (!pair) return '';
  if (lang === 'en') return pair.en;
  if (lang === 'id') return pair.id;
  return `${pair.id} · ${pair.en}`;
}

// Edit this list to change the roster. Order is the rotation order.
// `card` is the reference art (thumbnail beside the nameplate, operator panel); it is never sent to Lucy.
// Every prompt leads with identity preservation and keeps the live person's own pose: describing poses or
// gestures the person isn't doing made Lucy add extra figures.
const LIKENESS =
  "Keep the person in frame exactly as they are: the same face, facial structure, skin tone, hair color, age, and gender, and their own pose. Only the one person in frame; add no other people or figures. Change only their costume, props, and background.";

export const characters = [
  {
    id: "ravenette-bridesmaid",
    name: "The Ravenette Bridesmaid",
    card: "/cards/01.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: a black feathered gothic bridesmaid gown with gold chains and crescent moons, and a crown of black feathers and dried roses. A raven perches on their shoulder. Background: crimson twilight forest, gold full moon, parchment tarot engraving, ornate gold border.`,
  },
  {
    id: "satans-priest",
    name: "Satan’s Priest",
    card: "/cards/02.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: heavy black and crimson ritual vestments embroidered with gold moons and stars, a large inverted-pentagram medallion, and a small red mark on the brow. Background: candlelit gothic cathedral, smoke, horned altar, skulls, deep red and black.`,
  },
  {
    id: "saval-the-seer",
    name: "Saval the Seer",
    card: "/cards/03.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: a wide burgundy fortune teller hat, a red rose blouse, layered coin necklaces, and a black wrap embroidered with huge flowers. A clear crystal ball floats in front of them. Background: night market lanterns, a raven, a skull with red roses, full moon, etched tarot print.`,
  },
  {
    id: "bloody-bride",
    name: "The Bloody Bride",
    card: "/cards/04.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: an ivory lace wedding gown and veil spattered with blood, and a crown of red roses. Their face stays clean and unchanged. Background: moonlit cathedral, banks of candles, red roses and thorns, dark romantic lighting, antique tarot card.`,
  },
  {
    id: "broken-toy",
    name: "The Broken Toy",
    card: "/cards/05.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: a torn ivory lace dress with clockwork gold gears at the shoulders and elbows, and a spiked gold crown. Background: red velvet, scattered pearls, a cracked porcelain mask on the ground, a blood moon over ruined arches and the sea.`,
  },
  {
    id: "dark-priestess",
    name: "The Dark Priestess",
    card: "/cards/06.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: replace their clothing with a flowing black and burgundy priestess robe with a high embroidered collar, and add a headdress of crescent moons and hanging chains. A black crystal ball glows in front of them. Background: an empty scene of stone columns carved with snakes, a starry sky, red drapery, engraved tarot linework.`,
  },
  {
    id: "the-devil",
    name: "The Devil",
    card: "/cards/07.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: an open crimson velvet coat with gold embroidery, small horns, and a pentagram pendant. Background: an ornate infernal throne behind them, warm hellfire light, skulls and roses at its base.`,
  },
  {
    id: "devils-mistress",
    name: "The Devil’s Mistress",
    card: "/cards/08.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: a deep red robe wrapped in gold chains and pentagram charms, small horns, and a rose crown. Background: a black goat statue with a pentagram, a raven, a snake, candles, and a burning castle across a red river.`,
  },
  {
    id: "drowned-butler",
    name: "The Drowned Butler",
    card: "/cards/09.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: a soaked black tailcoat, cream waistcoat, and bow tie, draped in wet gold chains and roses, water dripping from the sleeves. Background: black water, a full moon, a distant mansion, floating candles and roses.`,
  },
  {
    id: "executioner",
    name: "The Executioner",
    card: "/cards/10.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: a black executioner cloak with chainmail and a hood pulled back so the whole face stays visible. A huge axe leans beside them. Background: stone gate, red sky, a raven, a hanging cage, woodcut tarot texture.`,
  },
  {
    id: "fallen-angel",
    name: "The Fallen Angel",
    card: "/cards/11.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: large black feathered wings on their back, a tattered off-white robe, and a crown of twigs. Their own expression is kept. Background: red sunset, a distant city on the water, a discarded gold crown on a rock, gold engraved border.`,
  },
  {
    id: "the-fool",
    name: "The Fool",
    card: "/cards/12.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: a medieval tunic of flowers and fruit, a feathered cap, a white rose pinned at the chest, and a bindle over the shoulder. Background: cliff edge, flat bright yellow sky, white sun, simple mountains, a small white dog, vintage chromolithograph tarot with bold black outlines.`,
  },
  {
    id: "grim-reaper",
    name: "The Grim Reaper",
    card: "/cards/13.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: replace their clothing with a tattered black hooded robe, the hood resting back on the shoulders so the whole face stays visible. A tall scythe stands beside them. Background: full moon, night landscape, distant castle, lilies and skulls on the ground, gold stars and crescent moons in the border.`,
  },
  {
    id: "high-priestess",
    name: "The High Priestess",
    card: "/cards/14.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: a midnight-blue robe of gold stars and moons and a crescent diadem. Background: two pillars marked B and J, a starry veil, an open book, a raven, a skull, a pomegranate, deep blue and gold engraving.`,
  },
  {
    id: "raven-queen",
    name: "The Raven Queen",
    card: "/cards/15.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: black feathered armor and a headdress of feathers, gold moons, and a bird skull, with a raven on their shoulder. Background: a dark throne, red sunset, bare trees, a distant castle, an antlered skull and gold chains in the foreground.`,
  },
  {
    id: "witch-priestess",
    name: "The Witch Priestess",
    card: "/cards/16.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: a red and black witch robe, coin chains, and a crescent crown. A bronze cauldron marked with a pentagram steams in front of them. Background: black cat, raven, skull, candles, crystal ball, incense smoke, red curtains, gold moon.`,
  },
  {
    id: "zoltar",
    name: "Zoltar",
    card: "/cards/17.jpg",
    seconds: 30,
    prompt: `${LIKENESS} Costume: a jeweled turban with a red stone and purple feather, and ornate red and gold fortune teller robes. A glowing crystal ball sits in front of them. Background: black cat, tarot cards, skull, lanterns lettered Past, Present, Future.`,
  },
];

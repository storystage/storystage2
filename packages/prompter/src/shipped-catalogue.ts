/**
 * The shipped Backstage catalogue: `prompter-catalogue.txt` from storystage/backstage-assets
 * at the commit `backstage.lock.json` pins. Made by `pnpm prompter:pins --fetch`; don't edit it
 * by hand.
 */
export const SHIPPED_CATALOGUE_COMMIT = '67abbe85751d16ba57f197273645514cadcad5c3';

export const SHIPPED_CATALOGUE = `Every model shipped in Backstage, by section and class. Add one with its id exactly as written.
Each line: id: name, what it looks like [themes] height at scale 1, and its joints.
A model with no joints can move and turn, but not walk or gesture. Use only the joints in its set.

Joint sets
  J1: hips, spine, chest, head, leftUpperArm, leftLowerArm, leftHand, rightUpperArm, rightLowerArm, rightHand, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J2: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbMetacarpal, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftRingProximal, leftRingIntermediate, leftRingDistal, leftLittleProximal, leftLittleIntermediate, leftLittleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbMetacarpal, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightRingProximal, rightRingIntermediate, rightRingDistal, rightLittleProximal, rightLittleIntermediate, rightLittleDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J3: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftRingProximal, leftRingIntermediate, leftRingDistal, leftLittleProximal, leftLittleIntermediate, leftLittleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightRingProximal, rightRingIntermediate, rightRingDistal, rightLittleProximal, rightLittleIntermediate, rightLittleDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J4: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftIndexProximal, leftMiddleProximal, leftRingProximal, leftLittleProximal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightIndexProximal, rightMiddleProximal, rightRingProximal, rightLittleProximal, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot, rightToes

Cast
  Biped
    kaykit/Biped/barbarian: Barbarian, a bearded barbarian in a bear hood and furs [fantasy, adventure] 2.4 m, joints J1
    kaykit/Biped/knight: Knight, a knight in a silver helmet and armour, with a red cape [fantasy, adventure, history] 2.47 m, joints J1
    kaykit/Biped/mage: Mage, a young mage with black hair, in a tall purple pointed hat and robe [fantasy, adventure] 2.72 m, joints J1
    kaykit/Biped/rogue: Rogue, a rogue with brown hair, in a green tunic and cloak [fantasy, adventure] 2.19 m, joints J1
    kaykit/Biped/rogue-hooded: Hooded rogue, a rogue in a green hood and cloak [fantasy, adventure] 2.25 m, joints J1
    kaykit/Biped/skeleton-mage: Skeleton mage, a skeleton in a red wizard's hat and robe [fantasy, spooky] 2.63 m, joints J1
    kaykit/Biped/skeleton-minion: Skeleton minion, a small skeleton in a brown scarf and belt [fantasy, spooky] 2.17 m, joints J1
    kaykit/Biped/skeleton-rogue: Skeleton rogue, a skeleton in a dark red hood and cloak [fantasy, spooky] 2.31 m, joints J1
    kaykit/Biped/skeleton-warrior: Skeleton warrior, a skeleton in a horned helmet and armour [fantasy, spooky] 2.59 m, joints J1
    makehuman/Biped/p01: Alfie, a boy of 6 with short brown hair, in a blue shirt and jeans [everyday, children] 1 m, joints J2
    makehuman/Biped/p02: Amara, a girl of 7 with short curly black hair, in a yellow jacket and jeans [everyday, children] 1.07 m, joints J2
    makehuman/Biped/p03: Kai, a child of 8 with a brown side fringe and red glasses, in a teal striped shirt and jeans [everyday, children] 1.1 m, joints J2
    makehuman/Biped/p04: Aisha, a girl of 9 with short black hair, in a purple striped shirt and jeans [everyday, children] 1.16 m, joints J2
    makehuman/Biped/p05: Rhys, a boy of 10 with short dark hair, in a dark red striped shirt and jeans [everyday, children] 1.27 m, joints J2
    makehuman/Biped/p06: Niamh, a tall girl of 11 with short light brown hair, in a green jacket and jeans [everyday, children] 1.53 m, joints J2
    makehuman/Biped/p07: Zain, a boy of 12 with short black hair, in a teal jacket and jeans [everyday, children] 1.44 m, joints J2
    makehuman/Biped/p08: Mei, a girl of 6 with a black bob and a long fringe, in a coral striped shirt and jeans [everyday, children] 0.92 m, joints J2
    makehuman/Biped/p09: Kofi, a boy of 11 with short black hair, in a khaki jacket and jeans [everyday, children] 1.44 m, joints J2
    makehuman/Biped/p10: Isla, a girl of 9 with long brown hair, in a green striped shirt and jeans [everyday, children] 1.17 m, joints J2
    makehuman/Biped/p11: Jayden, a tall boy of 14 with short brown hair, in a coral jacket and jeans [everyday, teenagers] 1.68 m, joints J2
    makehuman/Biped/p12: Priya, a girl of 15 with long brown hair, in a purple jacket and jeans [everyday, teenagers] 1.36 m, joints J2
    makehuman/Biped/p13: Oskar, a boy of 13 with short dark hair and black glasses, in a blue shirt and grey jeans [everyday, teenagers] 1.4 m, joints J2
    makehuman/Biped/p14: Leah, a girl of 16 with short brown hair, in a pink striped shirt and jeans [everyday, teenagers] 1.44 m, joints J2
    makehuman/Biped/p15: Hamza, a boy of 17 with short brown hair, in an orange jacket and jeans [everyday, teenagers] 1.6 m, joints J2
    makehuman/Biped/p16: Sam, a teenager of 15 with short black hair, in a yellow striped shirt and jeans [everyday, teenagers] 1.41 m, joints J2
    makehuman/Biped/p17: Grace, a woman of 28 with short curly black hair, in a striped blouse, grey skirt and white socks [everyday, adults] 1.79 m, joints J2
    makehuman/Biped/p18: Tom, a tall man of 32 with short brown hair, in blue dungarees and a white T-shirt [everyday, adults] 2.1 m, joints J2
    makehuman/Biped/p19: Yusuf, a man of 40 with short black hair, in a dark suit and striped tie [everyday, adults] 1.7 m, joints J2
    makehuman/Biped/p20: Hannah, a woman of 36 with a black bob and rimless glasses, in a teal striped shirt and jeans [everyday, adults] 1.64 m, joints J2
    makehuman/Biped/p21: Chen, a man of 45 with a brown side fringe and thin metal glasses, in a green striped shirt and jeans [everyday, adults] 1.6 m, joints J2
    makehuman/Biped/p22: Tunde, a bald man of 50, in a khaki jacket and jeans [everyday, adults] 1.89 m, joints J2
    makehuman/Biped/p23: Fatima, a woman of 30 with a short black bob, in a purple striped blouse and purple skirt [everyday, adults] 1.58 m, joints J2
    makehuman/Biped/p24: Morgan, an adult of 26 with short dark hair, in a purple striped shirt and jeans [everyday, adults] 1.76 m, joints J2
    makehuman/Biped/p25: Siân, a woman of 55 with a silver-blonde bob, in a dark red striped blouse and grey skirt [everyday, adults] 1.59 m, joints J2
    makehuman/Biped/p26: Margaret, an older woman of 72 with a grey bob and glasses, in a pink striped blouse and pink skirt [everyday, older people] 1.58 m, joints J2
    makehuman/Biped/p27: Winston, an older man of 78 in a grey hat, dark suit and striped tie [everyday, older people] 1.86 m, joints J2
    makehuman/Biped/p28: Lin, an older woman of 68 with a grey bob, in a teal striped blouse and teal skirt [everyday, older people] 1.44 m, joints J2
    makehuman/Biped/p29: Ravi, an older man of 70 with short grey hair, in an orange striped shirt and jeans [everyday, older people] 1.68 m, joints J2
    makehuman/Biped/p30: Eileen, an older woman of 85 with a white bob, in a lilac striped blouse and lilac skirt [everyday, older people] 1.5 m, joints J2
    osa/Biped/astronaut: Astronaut, an astronaut in a yellow spacesuit and a round orange helmet with an aerial [everyday, space] 1.36 m, joints J3
    osa/Biped/david: David, a garden gnome with a red pointed hat and a white beard, in a blue shirt [everyday] 1.58 m, joints J3
    osa/Biped/dino-kid: Dino kid, a child in a green dinosaur costume [everyday, dinosaurs] 1.24 m, joints J3
    osa/Biped/erika: Erika, a woman with long lilac hair and sunglasses, in a green top and grey trousers [everyday] 1.66 m, joints J3
    osa/Biped/kyle: Kyle, a man with a red quiff, in a navy T-shirt and blue trousers [everyday] 1.67 m, joints J3
    osa/Biped/olivia: Olivia, a woman in a gold hood and a black and gold costume [everyday] 1.67 m, joints J3
    osa/Biped/polybot: Polybot, a green robot with a boxy head [everyday, robots] 1.06 m, joints J4
    osa/Biped/robert: Robert, a man with a pink beard, in a dark green T-shirt and turquoise trousers [everyday] 1.61 m, joints J3
    osa/Biped/rose: Rose, a pirate in a black three-cornered hat, a striped top, red shorts and tall boots [everyday] 1.66 m, joints J3
    osa/Biped/teddy: Teddy, a brown teddy bear [everyday, toys] 1.65 m, joints J3

Props
  Prop
    kaykit/Prop/mug: Mug, a big wooden mug with metal bands, full to the top with froth [fantasy, food] 0.55 m, no joints
    polypizza/Prop/alarm-clock: Alarm clock, a red alarm clock with two bells on top [home] 0.15 m, no joints
    polypizza/Prop/apple: Apple, a shiny red apple with a stalk and a leaf [food] 0.08 m, no joints
    polypizza/Prop/backpack: Backpack, a brown backpack with pockets [school] 0.45 m, no joints
    polypizza/Prop/basketball: Basketball, an orange basketball with black lines [sport, toys] 0.24 m, no joints
    polypizza/Prop/beach-ball: Beach ball, a ball with blue, white, red and yellow panels [toys, beach] 0.5 m, no joints
    polypizza/Prop/bed: Bed, a single bed with a wooden frame, a red cover and a white pillow [home] 0.61 m, no joints
    polypizza/Prop/birthday-cake: Birthday cake, a pink layered cake with lit candles on top [food, party] 0.25 m, no joints
    polypizza/Prop/books: Pile of books, a stack of coloured books lying flat [school, library] 0.15 m, no joints
    polypizza/Prop/bookshelf: Bookshelf, a tall wooden bookshelf full of coloured books [home, school, library] 1.8 m, no joints
    polypizza/Prop/computer: Computer, an old beige computer with its screen and keyboard [school, office, history] 0.45 m, no joints
    polypizza/Prop/cooker: Cooker, a white cooker with four rings on top and an oven below [home, kitchen] 0.9 m, no joints
    polypizza/Prop/crutches: Crutches, a pair of grey forearm crutches [everyday, health] 1.15 m, no joints
    polypizza/Prop/cup-of-tea: Cup of tea, a white teacup on a saucer [kitchen, food] 0.08 m, no joints
    polypizza/Prop/cupboard: Cupboard, a tall wooden cupboard with two closed doors [home] 1.9 m, no joints
    polypizza/Prop/desk: Desk, a light wooden desk with drawers [home, school, office] 0.77 m, no joints
    polypizza/Prop/desk-chair: Desk chair, a red office chair on wheels with grey armrests [home, school, office] 1 m, no joints
    polypizza/Prop/floor-lamp: Floor lamp, a tall lamp with a yellow shade on a thin pole [home] 1.6 m, no joints
    polypizza/Prop/fridge: Fridge, a tall white fridge with two doors [home, kitchen] 1.8 m, no joints
    polypizza/Prop/globe: Globe, a world globe on a wooden stand [school, geography] 0.4 m, no joints
    polypizza/Prop/grand-piano: Grand piano, a light wooden grand piano with its lid open [music] 1 m, no joints
    polypizza/Prop/guitar: Guitar, a light wooden acoustic guitar [music] 1 m, no joints
    polypizza/Prop/kettle: Kettle, a green kettle with a black handle [kitchen] 0.25 m, no joints
    polypizza/Prop/kite: Kite, a rainbow-coloured kite with a long tail [toys, outdoors] 1.2 m, no joints
    polypizza/Prop/lantern: Lantern, a dark metal lantern with a glowing light inside [night, adventure] 0.3 m, no joints
    polypizza/Prop/loaf: Loaf of bread, a round brown loaf with cuts across the top [food] 0.12 m, no joints
    polypizza/Prop/pizza: Pizza, a whole pepperoni pizza [food] 0.03 m, no joints
    polypizza/Prop/plates: Stack of plates, a pile of white plates [kitchen] 0.1 m, no joints
    polypizza/Prop/pot-plant: Pot plant, a green leafy plant in a clay pot [home, garden] 0.5 m, no joints
    polypizza/Prop/rubber-duck: Rubber duck, a yellow rubber duck with an orange beak [toys] 0.1 m, no joints
    polypizza/Prop/school-desk: School desk, a pupil's desk and chair in light blue metal [school] 0.8 m, no joints
    polypizza/Prop/sofa: Sofa, a red three-seat sofa with low arms [home] 0.85 m, no joints
    polypizza/Prop/table: Table, a plain dark wooden table with four legs [home] 0.75 m, no joints
    polypizza/Prop/teapot: Teapot, a round pale blue teapot with a lid [kitchen] 0.15 m, no joints
    polypizza/Prop/teddy-bear: Teddy bear, a light brown teddy bear with a red ribbon, sitting down [toys] 0.35 m, no joints
    polypizza/Prop/telephone: Telephone, an old orange telephone with a dial [home, history] 0.12 m, no joints
    polypizza/Prop/television: Television, an old boxy television with a grey screen [home, history] 0.5 m, no joints
    polypizza/Prop/toy-block: Toy block, a red and white wooden toy block with the letter A [toys] 0.08 m, no joints
    polypizza/Prop/umbrella: Umbrella, an open dark blue umbrella [weather] 1 m, no joints
    polypizza/Prop/watering-can: Watering can, a yellow watering can [garden] 0.3 m, no joints
    polypizza/Prop/wheelchair: Wheelchair, a manual wheelchair with a dark blue seat and big spoked wheels [everyday, health] 0.9 m, no joints
  Transport
    polypizza/Transport/aeroplane: Aeroplane, a white passenger aeroplane [transport] 11.83 m, no joints
    polypizza/Transport/bicycle: Bicycle, an orange bicycle [transport] 1 m, no joints
    polypizza/Transport/bus: Bus, a white and blue coach [transport, town] 3.2 m, no joints
    polypizza/Transport/car: Car, a small blue car [transport, town] 1.5 m, no joints
    polypizza/Transport/rocket: Rocket, a white rocket with red fins and a round window [space] 11.95 m, no joints
    polypizza/Transport/rowing-boat: Rowing boat, a small white rowing boat [transport, sea] 0.6 m, no joints
    polypizza/Transport/steam-train: Steam train, a small steam engine with its coal wagon [transport, history] 4 m, no joints

Set
  Prop
    polypizza/Prop/barn: Barn, a red barn with white doors [farm] 8 m, no joints
    polypizza/Prop/bench: Bench, a wooden bench with black legs [park] 0.85 m, no joints
    polypizza/Prop/castle: Castle, a grey stone castle with towers [fairy tale, history] 15 m, no joints
    polypizza/Prop/corner-shop: Corner shop, a small shop with a striped awning on a street corner [town] 5 m, no joints
    polypizza/Prop/farmhouse: Farmhouse, a big white wooden farmhouse with a porch [farm, countryside] 9 m, no joints
    polypizza/Prop/fir-tree: Fir tree, a tall green fir tree [nature, winter] 8 m, no joints
    polypizza/Prop/footbridge: Footbridge, a small dark wooden footbridge [nature] 1.5 m, no joints
    polypizza/Prop/fountain: Fountain, a white stone fountain with three bowls [park, town] 1.5 m, no joints
    polypizza/Prop/house: House, a small brown house with a chimney [town, home] 6.02 m, no joints
    polypizza/Prop/lighthouse: Lighthouse, a red and white striped lighthouse beside a cottage [sea] 20 m, no joints
    polypizza/Prop/palm-tree: Palm tree, a palm tree with coconuts [beach] 8 m, no joints
    polypizza/Prop/picket-fence: Picket fence, a white picket fence [town, garden] 1 m, no joints
    polypizza/Prop/picnic-table: Picnic table, a wooden picnic table with benches [park] 0.75 m, no joints
    polypizza/Prop/rock: Rock, a tall grey rock [nature] 1.5 m, no joints
    polypizza/Prop/schoolhouse: Schoolhouse, a red schoolhouse with a bell tower [school, history] 8 m, no joints
    polypizza/Prop/stones: Stones, a few small grey stones [nature] 0.29 m, no joints
    polypizza/Prop/tent: Tent, a green tent [camping] 1.6 m, no joints
    polypizza/Prop/tower: Tower, a round white stone tower with a wooden door [fairy tale] 10 m, no joints
    polypizza/Prop/town-building: Town building, a red brick building with shops below and flats above [town] 10 m, no joints
    polypizza/Prop/tree: Tree, a tree with a twisty trunk and round green leaves [nature] 6 m, no joints
    polypizza/Prop/well: Well, a stone well with a red roof and a bucket [fairy tale, countryside] 2.2 m, no joints
    polypizza/Prop/wooden-fence: Wooden fence, a short wooden rail fence [farm, countryside] 1.11 m, no joints

Backdrops
  (none yet)
`;

/**
 * The shipped Backstage catalogue: `prompter-catalogue.txt` from storystage/backstage-assets
 * at the commit `backstage.lock.json` pins. Made by `pnpm prompter:pins --fetch`; don't edit it
 * by hand.
 */
export const SHIPPED_CATALOGUE_COMMIT = '303437818646127113a552c91246391c0734796e';

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
    makehuman/Biped/p03: Kai, a child of 8 with a brown side fringe, in a teal striped shirt and jeans [everyday, children] 1.1 m, joints J2
    makehuman/Biped/p04: Aisha, a girl of 9 with short black hair, in a purple striped shirt and jeans [everyday, children] 1.16 m, joints J2
    makehuman/Biped/p05: Rhys, a boy of 10 with short dark hair, in a dark red striped shirt and jeans [everyday, children] 1.27 m, joints J2
    makehuman/Biped/p06: Niamh, a tall girl of 11 with short light brown hair, in a green jacket and jeans [everyday, children] 1.53 m, joints J2
    makehuman/Biped/p07: Zain, a boy of 12 with short black hair, in a teal jacket and jeans [everyday, children] 1.44 m, joints J2
    makehuman/Biped/p08: Mei, a girl of 6 with a black bob and a long fringe, in a coral striped shirt and jeans [everyday, children] 0.92 m, joints J2
    makehuman/Biped/p09: Kofi, a boy of 11 with short black hair, in a khaki jacket and jeans [everyday, children] 1.44 m, joints J2
    makehuman/Biped/p10: Isla, a girl of 9 with long brown hair, in a green striped shirt and jeans [everyday, children] 1.17 m, joints J2
    makehuman/Biped/p11: Jayden, a tall boy of 14 with short brown hair, in a coral jacket and jeans [everyday, teenagers] 1.68 m, joints J2
    makehuman/Biped/p12: Priya, a girl of 15 with long brown hair, in a purple jacket and jeans [everyday, teenagers] 1.36 m, joints J2
    makehuman/Biped/p13: Oskar, a boy of 13 with short dark hair, in a blue shirt and grey jeans [everyday, teenagers] 1.4 m, joints J2
    makehuman/Biped/p14: Leah, a girl of 16 with short brown hair, in a pink striped shirt and jeans [everyday, teenagers] 1.44 m, joints J2
    makehuman/Biped/p15: Hamza, a boy of 17 with short brown hair, in an orange jacket and jeans [everyday, teenagers] 1.6 m, joints J2
    makehuman/Biped/p16: Sam, a teenager of 15 with short black hair, in a yellow striped shirt and jeans [everyday, teenagers] 1.41 m, joints J2
    makehuman/Biped/p17: Grace, a woman of 28 with short curly black hair, in a striped blouse, grey skirt and white socks [everyday, adults] 1.79 m, joints J2
    makehuman/Biped/p18: Tom, a tall man of 32 with short brown hair, in blue dungarees and a white T-shirt [everyday, adults] 2.1 m, joints J2
    makehuman/Biped/p19: Yusuf, a man of 40 with short black hair, in a dark suit and striped tie [everyday, adults] 1.7 m, joints J2
    makehuman/Biped/p20: Hannah, a woman of 36 with a black bob, in a teal striped shirt and jeans [everyday, adults] 1.64 m, joints J2
    makehuman/Biped/p21: Chen, a man of 45 with a brown side fringe, in a green striped shirt and jeans [everyday, adults] 1.6 m, joints J2
    makehuman/Biped/p22: Tunde, a bald man of 50, in a khaki jacket and jeans [everyday, adults] 1.89 m, joints J2
    makehuman/Biped/p23: Fatima, a woman of 30 with a short black bob, in a purple striped blouse and purple skirt [everyday, adults] 1.58 m, joints J2
    makehuman/Biped/p24: Morgan, an adult of 26 with short dark hair, in a purple striped shirt and jeans [everyday, adults] 1.76 m, joints J2
    makehuman/Biped/p25: Siân, a woman of 55 with a silver-blonde bob, in a dark red striped blouse and grey skirt [everyday, adults] 1.59 m, joints J2
    makehuman/Biped/p26: Margaret, an older woman of 72 with a grey bob, in a pink striped blouse and pink skirt [everyday, older people] 1.58 m, joints J2
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

Set
  (none yet)

Backdrops
  (none yet)
`;

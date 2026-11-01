# 02 Story api

- **Covers:** Classes, procedures, functions, details, joints, events, new StoryStage blocks
- **Work package:** WP4.1, 4.2, 4.7
- **Owner:** S6 (spec and types); S3 (procedures)
- **Status:** written 1 Nov 2026. The tables are generated from the metadata in `packages/story-api/src/catalog/`; change them there and run `pnpm --filter @storystage/story-api spec`. A test fails if they differ.

## 0. Decisions this spec relies on

[0007 3D](../decisions/0007-3d.md), [0008 Models](../decisions/0008-models.md), [0009 Blocks](../decisions/0009-blocks.md), [0010 Language](../decisions/0010-language.md), [0013 Backstage](../decisions/0013-backstage.md), [0030 Age range](../decisions/0030-age-range.md), [0036 Languages](../decisions/0036-languages.md). `10-crosswalk.md` is the background to sections 7 and 10; `01-ast.md` fixes how a program refers to everything here; `17-backstage.md`, section 2a, is the joint map (in pull request #57).

### How this spec was made

The workplan asks for this spec to be generated from Alice's `PRIME_TIME` methods, using StoryStage 1's `ApiCatalog` output. It comes from the same place by a different route, and the difference matters:

- **Read from source, not reflection.** `ApiCatalog` needs a compiled Alice. `packages/story-api/scripts/inventory-cli.ts` reads the Java source of `org.lgna.story`, and writes the result to `src/alice/palette.json`: names, types and values only, so no Alice code comes into this repository. StoryStage 1 and upstream Alice give the same list.
- **Alice's palette rule, not `ApiCatalog`'s.** Alice shows a public method when its visibility is `PRIME_TIME` **or it has no `@MethodTemplate`** (`MemberTabComposite`). `ApiCatalog.isPrimeTime` requires the annotation, so it misses 183 of the 309 members, among them `straightenOutJoints`, `isFacing`, every joint getter and Text's `setValue`. So StoryStage 1's Prompter can't see those blocks. That is worth knowing, but it isn't changed here.

**Every one of the 309 is accounted for.** A test fails if a palette member is neither in the catalog nor in section 8. Of them, 136 are joint getters (section 5).

## 1. Classes

<!-- catalog:classes -->
| Class | Extends | From Alice | On screen |
| --- | --- | --- | --- |
| `Thing` | — | `SThing` | anything |
| `Scene` | `Thing` | `SScene` | scene |
| `Ground` | `Thing` | `SGround` | ground |
| `Turnable` | `Thing` | `STurnable` | anything that turns |
| `Joint` | `Turnable` | `SJoint` | joint |
| `MovableTurnable` | `Turnable` | `SMovableTurnable` | anything that moves |
| `Camera` | `MovableTurnable` | `SCamera` | camera |
| `Marker` | `MovableTurnable` | `SMarker`, `SCameraMarker`, `SThingMarker`, `STarget` | marker |
| `Model` | `MovableTurnable` | `SModel` | model |
| `Billboard` | `Model` | `SBillboard` | billboard |
| `Text` | `Model` | `STextModel` | 3D text |
| `JointedModel` | `Model` | `SJointedModel` | model with joints |
| `Prop` | `JointedModel` | `SProp`, `SShape`, `SBox`, `SSphere`, `SCone`, `SCylinder`, `SDisc`, `STorus`, `SAxes` | prop |
| `Transport` | `JointedModel` | `STransport` | transport |
| `Biped` | `JointedModel` | `SBiped` | biped |
| `Quadruped` | `JointedModel` | `SQuadruped` | quadruped |
| `Flyer` | `JointedModel` | `SFlyer` | flyer |
| `Swimmer` | `JointedModel` | `SSwimmer` | swimmer |
| `Slitherer` | `JointedModel` | `SSlitherer` | slitherer |
<!-- /catalog:classes -->

1. **Names** are Alice's without the `S`, as in WP0.8's `STORY_CLASSES`. `MovableTurnable` and the others keep their Java names here. They never reach the screen: the words are in the last column.
2. **Abstract classes** hold what several classes share. Nothing is made from them directly.
3. **`Text` the class isn't `Text` the type.** `Text` is the type of words (`01-ast.md`), so a variable holding a piece of 3D text has the type `TextModel`. The class keeps its name in `STORY_CLASSES`, in Backstage and in `on`. **S2:** a type reference to one is `{kind: 'story', name: 'TextModel'}`.
4. **A joint turns but doesn't move.** Alice's `SJoint` is movable, but moving a joint stretches the model. Here `Joint` extends `Turnable`, so `turn`, `roll` and `pointAt` work and `move` doesn't. It also has `getWidth`, `getHeight` and `getDepth`.
5. **Shapes are Props.** Alice's box, sphere, cone, cylinder, disc, torus and axes become built-in Props in Backstage, so they can appear on a storyboard (rule 5). **S4:** they need Backstage entries (WP3.4).
6. **Markers** are the camera and object markers of `SceneSetup`. A program can move to them and turn to face them. All of Alice's marker classes and her `STarget` are one `Marker`.
7. **Props and transports** extend `JointedModel` as they do in Alice. They have no joint set of their own, but their moving parts (a propeller, an axle) are the model's own joints (`17-backstage.md`, 2a rule 6).
8. **A learner's own class** extends a concrete class and has all of its blocks (`01-ast.md`).

### Directions

The contract says a model faces +Z, right-handed with Y up. Alice's forward is -Z. A learner's "left" and "forward" must mean the same in both, so some axes change sign from Alice's. **S3 and S4:** use these, not Alice's. `src/catalog/axes.ts` has them as data, and a test checks them against the right-hand rule.

| Block | Direction | Axis, in the object's own space | Alice's axis |
|---|---|---|---|
| `move` | `left` | +X | -X |
| `move` | `right` | -X | +X |
| `move` | `up`, `down` | +Y, -Y | the same |
| `move` | `forward` | +Z | -Z |
| `move` | `backward` | -Z | +Z |
| `turn` | `left`, `right` | +Y, -Y | the same |
| `turn` | `forward` | +X | -X |
| `turn` | `backward` | -X | +X |
| `roll` | `left` | -Z | +Z |
| `roll` | `right` | +Z | -Z |

## 2. Procedures

Alice's procedures, with her names and parameter names. StoryStage's new blocks are in section 7. Section 9 explains the Runs column.

<!-- catalog:procedures -->
| Class | Block | Parameters | Details | On screen | Runs |
| --- | --- | --- | --- | --- | --- |
| `Thing` | `delay` | `duration: Number` (positiveOrZero) | — | wait {duration} seconds | `runtime` |
| `Thing` | `playAudio` | `audioSource: Audio` | — | play {audioSource} | `needs:audio` |
| `Turnable` | `turn` | `direction: TurnDirection`, `amount: Number` | `duration`, `animationStyle`, `asSeenBy` | turn {direction} {amount} | `command:rotate` |
| `Turnable` | `roll` | `direction: RollDirection`, `amount: Number` | `duration`, `animationStyle`, `asSeenBy` | roll {direction} {amount} | `command:rotate` |
| `Turnable` | `turnToFace` | `target: Thing` | `duration`, `animationStyle` | turn to face {target} | `command:turnToFace` |
| `Turnable` | `orientToUpright` | — | `duration`, `animationStyle`, `upAsSeenBy` | turn upright | `needs:orient` |
| `Turnable` | `pointAt` | `target: Thing` | `duration`, `animationStyle`, `upAsSeenBy` | point at {target} | `needs:orient` |
| `Turnable` | `orientTo` | `target: Thing` | `duration`, `animationStyle` | line up with {target} | `needs:orient` |
| `MovableTurnable` | `move` | `direction: MoveDirection`, `amount: Number` | `duration`, `animationStyle`, `asSeenBy` | move {direction} {amount} | `command:translate` |
| `MovableTurnable` | `moveToward` | `target: Thing`, `amount: Number` | `duration`, `animationStyle` | move toward {target} by {amount} | `needs:moveToward` |
| `MovableTurnable` | `moveAwayFrom` | `target: Thing`, `amount: Number` | `duration`, `animationStyle` | move away from {target} by {amount} | `needs:moveToward` |
| `MovableTurnable` | `moveTo` | `target: Thing` | `duration`, `animationStyle`, `pathStyle` | move to {target} | `command:moveTo` |
| `MovableTurnable` | `moveAndOrientTo` | `target: Thing` | `duration`, `animationStyle`, `pathStyle` | move to and line up with {target} | `needs:moveAndOrientTo` |
| `MovableTurnable` | `place` | `spatialRelation: SpatialRelation`, `target: Thing` | `duration`, `animationStyle`, `pathStyle`, `alongAxisOffset` | place {spatialRelation} {target} | `needs:place` |
| `MovableTurnable` | `setVehicle` | `vehicle: Thing` | — | ride on {vehicle} | `command:vehicle` |
| `Scene` | `setAtmosphereColor` | `color: Color` | `duration`, `animationStyle` | change the sky colour to {color} | `needs:sceneLook` |
| `Scene` | `setFromAboveLightColor` | `color: Color` | — | change the light from above to {color} | `needs:sceneLook` |
| `Scene` | `setFromBelowLightColor` | `color: Color` | — | change the light from below to {color} | `needs:sceneLook` |
| `Scene` | `setFogDensity` | `density: Number` (portion) | `duration`, `animationStyle` | change the fog to {density} | `needs:sceneLook` |
| `Ground` | `setPaint` | `paint: Paint` | `duration`, `animationStyle` | paint {paint} | `command:paint` |
| `Ground` | `setOpacity` | `opacity: Number` (portion) | `duration`, `animationStyle` | change opacity to {opacity} | `command:opacity` |
| `Camera` | `moveAndOrientToAGoodVantagePointOf` | `entity: Thing` | `duration`, `animationStyle` | find a good view of {entity} | `needs:moveAndOrientTo` |
| `Camera` | `setVerticalViewingAngle` | `angle: Number` | — | change the viewing angle to {angle} | `needs:cameraLens` |
| `Model` | `setPaint` | `paint: Paint` | `duration`, `animationStyle` | paint {paint} | `command:paint` |
| `Model` | `setOpacity` | `opacity: Number` (portion) | `duration`, `animationStyle` | change opacity to {opacity} | `command:opacity` |
| `Model` | `setWidth` | `width: Number` (positive) | `duration`, `animationStyle`, `policy` | change width to {width} | `needs:size` |
| `Model` | `resizeWidth` | `factor: Number` (positive) | `duration`, `animationStyle`, `isVolumePreserved` | resize width by {factor} | `command:resize` |
| `Model` | `setHeight` | `height: Number` (positive) | `duration`, `animationStyle`, `policy` | change height to {height} | `needs:size` |
| `Model` | `resizeHeight` | `factor: Number` (positive) | `duration`, `animationStyle`, `isVolumePreserved` | resize height by {factor} | `command:resize` |
| `Model` | `setDepth` | `depth: Number` (positive) | `duration`, `animationStyle`, `policy` | change depth to {depth} | `needs:size` |
| `Model` | `resizeDepth` | `factor: Number` (positive) | `duration`, `animationStyle`, `isVolumePreserved` | resize depth by {factor} | `command:resize` |
| `Model` | `resize` | `factor: Number` (positive) | `duration`, `animationStyle` | resize by {factor} | `command:resize` |
| `Model` | `say` | `text: Text` | `duration`, `textScale`, `textStyle`, `fontType`, `fontColor`, `bubbleFillColor`, `bubbleOutlineColor`, `bubblePosition` | say {text} | `command:say` |
| `Model` | `think` | `text: Text` | `duration`, `textScale`, `textStyle`, `fontType`, `fontColor`, `bubbleFillColor`, `bubbleOutlineColor`, `bubblePosition` | think {text} | `command:say` |
| `JointedModel` | `straightenOutJoints` | — | `duration`, `animationStyle` | straighten out joints | `needs:pose` |
| `Billboard` | `setBackPaint` | `paint: Paint` | `duration`, `animationStyle` | paint the back {paint} | `needs:look` |
| `Text` | `setValue` | `text: Text` | — | change the words to {text} | `needs:look` |
| `Flyer` | `foldWings` | — | `duration`, `animationStyle` | fold wings | `needs:pose` |
| `Flyer` | `spreadWings` | — | `duration`, `animationStyle` | spread wings | `needs:pose` |
<!-- /catalog:procedures -->

1. **Units.** Distances and sizes are metres, and turns are whole revolutions: `turn left 0.25` is a quarter turn, as in Alice and in the contract's `rotate`. Durations are seconds; `micros()` turns them into scene time.
2. **Timing.** A procedure takes one second unless `duration` says otherwise, and `duration: 0` is instant. The next statement waits for it to finish, unless it's in "do together".
3. **Relative to what.** `move`, `turn` and `roll` use the object's own axes unless `asSeenBy` says otherwise. `moveToward` and `moveAwayFrom` go in a straight line, worked out when they start.
4. **Limits** are in brackets after a parameter: `portion` is 0 to 1, `positive` is above zero, and `positiveOrZero` is zero or more. The rules are Alice's, and `inRange` checks them. Fog follows the contract's 0 to 1, which Alice doesn't check, and `delay` takes no negative time. A value out of range stops the program with a plain-words error at that block (WP6.3).
5. **`delay`** is on `Thing`, as in Alice, and the runtime handles it without the stage.

## 3. Functions

<!-- catalog:functions -->
| Class | Block | Parameters | Returns | Details | On screen | Runs |
| --- | --- | --- | --- | --- | --- | --- |
| `Thing` | `isCollidingWith` | `other: Thing` | `Boolean` | — | is touching {other} | `query:isColliding` |
| `Thing` | `getVehicle` | — | `Thing` | — | vehicle | `needs:vehicle` |
| `Thing` | `getBooleanFromUser` | `message: Text` | `Boolean` | — | ask yes or no: {message} | `needs:ask` |
| `Thing` | `getStringFromUser` | `message: Text` | `Text` | — | ask for words: {message} | `needs:ask` |
| `Thing` | `getDoubleFromUser` | `message: Text` | `Number` | — | ask for a number: {message} | `needs:ask` |
| `Thing` | `getIntegerFromUser` | `message: Text` | `WholeNumber` | — | ask for a whole number: {message} | `needs:ask` |
| `Turnable` | `isFacing` | `other: Thing` | `Boolean` | — | is facing {other} | `query:transform` |
| `Turnable` | `getDistanceTo` | `other: Thing` | `Number` | — | distance to {other} | `query:distance` |
| `Turnable` | `getDistanceAbove` | `other: Thing` | `Number` | `asSeenBy` | distance above {other} | `query:transform` |
| `Turnable` | `isAbove` | `other: Thing` | `Boolean` | `asSeenBy` | is above {other} | `query:transform` |
| `Turnable` | `getDistanceBelow` | `other: Thing` | `Number` | `asSeenBy` | distance below {other} | `query:transform` |
| `Turnable` | `isBelow` | `other: Thing` | `Boolean` | `asSeenBy` | is below {other} | `query:transform` |
| `Turnable` | `getDistanceToTheRightOf` | `other: Thing` | `Number` | `asSeenBy` | distance to the right of {other} | `query:transform` |
| `Turnable` | `isToTheRightOf` | `other: Thing` | `Boolean` | `asSeenBy` | is to the right of {other} | `query:transform` |
| `Turnable` | `getDistanceToTheLeftOf` | `other: Thing` | `Number` | `asSeenBy` | distance to the left of {other} | `query:transform` |
| `Turnable` | `isToTheLeftOf` | `other: Thing` | `Boolean` | `asSeenBy` | is to the left of {other} | `query:transform` |
| `Turnable` | `getDistanceInFrontOf` | `other: Thing` | `Number` | `asSeenBy` | distance in front of {other} | `query:transform` |
| `Turnable` | `isInFrontOf` | `other: Thing` | `Boolean` | `asSeenBy` | is in front of {other} | `query:transform` |
| `Turnable` | `getDistanceBehind` | `other: Thing` | `Number` | `asSeenBy` | distance behind {other} | `query:transform` |
| `Turnable` | `isBehind` | `other: Thing` | `Boolean` | `asSeenBy` | is behind {other} | `query:transform` |
| `Scene` | `getAtmosphereColor` | — | `Color` | — | sky colour | `needs:sceneLook` |
| `Scene` | `getFromAboveLightColor` | — | `Color` | — | light from above | `needs:sceneLook` |
| `Scene` | `getFromBelowLightColor` | — | `Color` | — | light from below | `needs:sceneLook` |
| `Scene` | `getFogDensity` | — | `Number` | — | how thick the fog is | `needs:sceneLook` |
| `Ground` | `getPaint` | — | `Paint` | — | paint | `needs:look` |
| `Ground` | `getOpacity` | — | `Number` | — | opacity | `needs:look` |
| `Camera` | `getVerticalViewingAngle` | — | `Number` | — | viewing angle | `needs:cameraLens` |
| `Joint` | `getWidth` | — | `Number` | — | width | `needs:size` |
| `Joint` | `getHeight` | — | `Number` | — | height | `needs:size` |
| `Joint` | `getDepth` | — | `Number` | — | depth | `needs:size` |
| `Model` | `getPaint` | — | `Paint` | — | paint | `needs:look` |
| `Model` | `getOpacity` | — | `Number` | — | opacity | `needs:look` |
| `Model` | `getWidth` | — | `Number` | — | width | `needs:size` |
| `Model` | `getHeight` | — | `Number` | — | height | `needs:size` |
| `Model` | `getDepth` | — | `Number` | — | depth | `needs:size` |
| `JointedModel` | `getJoint` | `joint: JointId` | `Joint` | — | {joint} | `runtime` |
| `JointedModel` | `getJointChain` | `chain: JointChain` | `Joint[]` | — | all of the {chain} | `runtime` |
| `Billboard` | `getBackPaint` | — | `Paint` | — | back paint | `needs:look` |
| `Text` | `getValue` | — | `Text` | — | words | `needs:look` |
<!-- /catalog:functions -->

1. **The four "ask" functions** (`getBooleanFromUser` and the others) stop the program and ask the learner while they rehearse. An export has nobody to ask, so in the deterministic mode (WP6.5) they give `false`, empty text or `0`. The Screening room says so before an export of a program that uses them.
2. **`isAbove` and its family** compare positions along an axis of `asSeenBy`, which by default is the object itself. The runtime works them out from `transform` queries, so they need nothing new from the stage.

### 3a. Values

<!-- catalog:values -->
| Type | Values | Origin |
| --- | --- | --- |
| `AnimationStyle` | beginAndEndGently, beginGentlyAndEndAbruptly, beginAbruptlyAndEndGently, beginAndEndAbruptly | Alice |
| `BubblePosition` | automatic, left, center, right | Alice |
| `Color` | black, blue, cyan, darkGray, gray, green, lightGray, magenta, orange, pink, red, white, yellow, lightBlue, darkBlue, purple, brown | Alice |
| `HeldKeyPolicy` | fireMultiple, fireOnceOnPress, fireOnceOnRelease | Alice |
| `MoveDirection` | left, right, up, down, forward, backward | Alice |
| `MultipleEventPolicy` | enqueue, ignore, combine | Alice |
| `PathStyle` | beeLine, smooth | Alice |
| `RollDirection` | left, right | Alice |
| `SetDimensionPolicy` | preserveVolume, preserveAspectRatio, preserveNothing | Alice |
| `SpatialRelation` | leftOf, rightOf, above, below, inFrontOf, behind | Alice |
| `TextFont` | default, serif, sansSerif, monospaced | Alice |
| `TextStyle` | plain, bold, italic | Alice |
| `TurnDirection` | left, right, forward, backward | Alice |
| `Key` | a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z, digit0, digit1, digit2, digit3, digit4, digit5, digit6, digit7, digit8, digit9, left, right, up, down, space, enter, tab, backSpace, escape, shift, control, alt, comma, period, minus, equals, slash, semicolon, quote | Alice |
| `ShotType` | wide, medium, closeUp, overTheShoulder, follow, twoShot | StoryStage |
| `Gesture` | wave, nod, shrug, clap, point | StoryStage |
| `Expression` | happy, sad, angry, surprised, relaxed, blink | StoryStage |
| `SceneEdge` | left, right, back, front | StoryStage |
| `JointChain` | neck, tail | StoryStage |
<!-- /catalog:values -->

- **Names** are Alice's constants in camel case, as `ANIMATION_STYLES` already are: `IN_FRONT_OF` is `inFrontOf`. **S2:** in the AST an `enum` node is `{type: 'MoveDirection', value: 'forward'}`. There's no type called `Direction`, because Alice has three, and they differ.
- **`Paint`** is a `Color`, a `#rrggbb` colour (as the contract's `SceneObjectSetup.paint` allows) or a Backstage surface.
- **`Color` keeps Alice's spelling in its ids.** The words on screen are British: `darkGray` shows as "dark grey".
- **`Key`** keeps the letters, digits, arrows and common keys.

## 4. Details

Details are Alice's optional keyword arguments, the "add detail" of both editors. In the AST they're the `details` of a call (`01-ast.md`).

<!-- catalog:details -->
| Detail | Type | Default | Limit | On screen |
| --- | --- | --- | --- | --- |
| `duration` | `Number` | `1` | positiveOrZero | how long |
| `animationStyle` | `AnimationStyle` | `beginAndEndGently` | — | how it starts and ends |
| `asSeenBy` | `Thing` | the object itself | — | as seen by |
| `pathStyle` | `PathStyle` | `beeLine` | — | path |
| `alongAxisOffset` | `Number` | `0` | — | gap |
| `upAsSeenBy` | `Thing` | the scene | — | which way is up |
| `isVolumePreserved` | `Boolean` | `true` | — | keep the same volume |
| `policy` | `SetDimensionPolicy` | `preserveAspectRatio` | — | keep its shape |
| `textScale` | `Number` | `1` | positive | text size |
| `textStyle` | `TextStyle` | `plain` | — | text style |
| `fontType` | `TextFont` | `default` | — | font |
| `fontColor` | `Color` | `black` | — | text colour |
| `bubbleFillColor` | `Color` | `white` | — | bubble colour |
| `bubbleOutlineColor` | `Color` | `white` | — | bubble outline |
| `bubblePosition` | `BubblePosition` | `automatic` | — | bubble position |
| `heldKeyPolicy` | `HeldKeyPolicy` | `fireMultiple` | — | when the key is held |
| `multipleEventPolicy` | `MultipleEventPolicy` | `ignore` | — | if it happens again while running |
| `setOfVisuals` | `Thing[]` | every object | — | which objects |
<!-- /catalog:details -->

1. **Each block lists its own** in sections 2 and 3, as Alice does. A test checks them against her detail lists, so `say` has no `animationStyle` and `moveToward` no `pathStyle`, for example.
2. **Defaults are Alice's,** read from her source. `upAsSeenBy` and `asSeenBy` have no value, because the default depends on the block.
3. **`setFromAboveLightColor` and `setFromBelowLightColor` have no details.** Alice's `Duration` still lists the older `SetAmbientLightColor`, so these two always take the default one second. They stay that way so imported worlds behave the same.

## 5. Joints

The joints themselves are in the joint map: `packages/backstage/src/joints.ts` and `17-backstage.md`, section 2a. `story-api` can't import it, because `backstage` depends on `story-api`, so this section sets the rules and the map sets the names.

1. **One function, not 136.** Alice has a getter per joint per class (`getLeftElbow`). Here every jointed class has `getJoint(joint)`, whose value is a joint id from the map. In the AST it's a `functionCall` whose `joint` argument is an `enum` node of type `JointId`. Alice's arrays (`getTailArray`, `getNeckArray`) become `getJointChain(chain)`.
2. **Ids are the map's, words are the map's.** `leftLowerArm` shows as "left elbow". The Story API's metadata never lists joints, so a new joint in the map needs no change here.
3. **Which joints a model has depends on the model,** so the type system can't say. The program check asks the manifest (`joints` in `backstage.json`) and refuses a joint the model doesn't have.
4. **The Prompter** writes a joint as `cat.getJoint(leftLowerArm)`. This settles spec 04, section 3's "a joint in the catalog's form".
5. **The `.a3p` import** (WP9.2) turns `getLeftElbow` into its Alice joint name (`LEFT_ELBOW`) and then uses `jointFromAlice` from the map.
6. **A joint can be a target.** `moveTo(cat.getJoint(head))` and `turnToFace` work as in Alice, which the stage contract doesn't allow yet (section 9).

## 6. Events

An event kind is the `event` of a `listener` in the AST.

<!-- catalog:events -->
| Event | Needs | Gives the handler | Details | From | On screen |
| --- | --- | --- | --- | --- | --- |
| `sceneStart` | — | — | — | `runtime` | when the scene starts |
| `clickOnScreen` | — | `x: Number`, `y: Number` | `multipleEventPolicy` | `click` | when the screen is clicked |
| `clickOnObject` | — | `model: Model`, `x: Number`, `y: Number` | `setOfVisuals`, `multipleEventPolicy` | `click` | when an object is clicked |
| `keyPress` | — | `key: Key` | `heldKeyPolicy`, `multipleEventPolicy` | `key` | when a key is pressed |
| `arrowKeyPress` | — | `moveDirection: MoveDirection`, `turnDirection: TurnDirection` | `heldKeyPolicy`, `multipleEventPolicy` | `key` | when an arrow key is pressed |
| `numberKeyPress` | — | `number: WholeNumber` | `heldKeyPolicy`, `multipleEventPolicy` | `key` | when a number key is pressed |
| `moveWithArrowKeys` | `object: MovableTurnable` | — | — | `key` | move {object} with the arrow keys |
| `timer` | `seconds: Number` | `seconds: Number` | `multipleEventPolicy` | `runtime` | every {seconds} seconds |
| `collisionStart` | `setA: Thing[]`, `setB: Thing[]` | `a: Thing`, `b: Thing` | `multipleEventPolicy` | `collisionStart` | when {setA} touches {setB} |
| `collisionEnd` | `setA: Thing[]`, `setB: Thing[]` | `a: Thing`, `b: Thing` | `multipleEventPolicy` | `needs:collisionEnd` | when {setA} stops touching {setB} |
| `proximityEnter` | `setA: Thing[]`, `setB: Thing[]`, `distance: Number` | `a: Thing`, `b: Thing` | `multipleEventPolicy` | `proximityEnter` | when {setA} gets within {distance} of {setB} |
| `proximityExit` | `setA: Thing[]`, `setB: Thing[]`, `distance: Number` | `a: Thing`, `b: Thing` | `multipleEventPolicy` | `needs:proximityExit` | when {setA} gets further than {distance} from {setB} |
<!-- /catalog:events -->

1. **Named values, not an event object.** Alice's handler receives an `event` and calls accessors on it (`event.getModelAtMouseLocation()`). Here the handler receives what it needs by name (`model`), which is the listener's `params` in the AST. It reads better on a tile and needs no event class. The accessors are mapped one for one, and the `.a3p` import uses that mapping.
2. **Needs** is the listener's `args`. A `listener` must have values for these in the AST before it can run.
3. **`timer` always has a number of seconds.** Alice's "as often as possible" can't work with the time-slice budget (WP6.3).
4. **`multipleEventPolicy`** says what happens if the event fires again while its handler is running. The default, as in Alice, is to ignore it.

## 7. New StoryStage blocks

Added by the workplan. S3 builds them (4.4 to 4.6, 4.10), so their parameters may be refined with S3 when the machinery exists. Their names are settled now so that the Prompter's catalog and the editors can rely on them.

<!-- catalog:added -->
| Class | Block | Parameters | Details | Task | On screen | Runs |
| --- | --- | --- | --- | --- | --- | --- |
| `Scene` | `goToScene` | `scene: SceneId` | — | 4.4 | go to {scene} | `needs:sceneChange` |
| `Scene` | `fadeToBlack` | — | `duration` | 4.4 | fade to black | `needs:sceneChange` |
| `Scene` | `crossfade` | `scene: SceneId` | `duration` | 4.4 | crossfade to {scene} | `needs:sceneChange` |
| `Camera` | `frameShot` | `shot: ShotType`, `targets: Thing[]` | `duration`, `animationStyle` | 4.10 | frame a {shot} of {targets} | `command:shot` |
| `Model` | `speakLine` | `text: Text` | — | 4.4 | speak line {text} | `needs:speech` |
| `JointedModel` | `playAnimation` | `clip: AnimationClip` | — | 4.6 | play animation {clip} | `needs:animation` |
| `Biped` | `walkTo` | `target: Thing` | — | 4.5 | walk to {target} | `needs:character` |
| `Biped` | `runTo` | `target: Thing` | — | 4.5 | run to {target} | `needs:character` |
| `Biped` | `sitOn` | `target: Thing` | — | 4.5 | sit on {target} | `needs:character` |
| `Biped` | `standUp` | — | — | 4.5 | stand up | `needs:character` |
| `Biped` | `lieDown` | — | — | 4.5 | lie down | `needs:character` |
| `Biped` | `fall` | — | — | 4.5 | fall | `needs:character` |
| `Biped` | `touch` | `target: Thing` | — | 4.5 | touch {target} | `needs:character` |
| `Biped` | `reachFor` | `target: Thing` | — | 4.5 | reach for {target} | `needs:character` |
| `Biped` | `pickUp` | `target: Thing` | — | 4.5 | pick up {target} | `needs:character` |
| `Biped` | `putDown` | `target: Thing` | — | 4.5 | put down {target} | `needs:character` |
| `Biped` | `enterFrom` | `edge: SceneEdge` | — | 4.5 | enter from {edge} | `needs:character` |
| `Biped` | `exitTo` | `edge: SceneEdge` | — | 4.5 | exit to {edge} | `needs:character` |
| `Biped` | `gesture` | `gesture: Gesture` | — | 4.6 | gesture {gesture} | `needs:animation` |
| `Biped` | `showExpression` | `expression: Expression` | — | 4.6 | look {expression} | `needs:animation` |
| `Biped` | `lookAt` | `target: Thing` | — | 4.6 | look at {target} | `needs:animation` |
<!-- /catalog:added -->

1. **Alice's hidden blocks return.** `walkTo`, `touch` and `reachFor` exist in Alice, hidden and unfinished, and aren't on her palette. They're added here as new blocks, so they aren't listed as Alice's.
2. **`Biped` first.** The character actions need a walk cycle, IK and the shared animation library, which are authored against humanoid bones (4.6). Quadrupeds and others can join later without changing anything here.
3. **`speakLine` takes words,** which come from a script line. The link to a line id belongs to WP14.3 and the production format.

## 8. Dropped from Alice

Everything in Alice's palette that StoryStage 2 doesn't keep. The `.a3p` import (WP9.2) reports each of these in plain words when a world uses one.

<!-- catalog:dropped -->
| Dropped | Why |
| --- | --- |
| `SVRUser.*`, `SVRHeadset.*`, `SCamera.getLeftHand`, `SCamera.getRightHand` | Virtual reality isn’t in the first release. AR is its own work (WP21, WP22). |
| `SCone.*`, `SCylinder.*`, `SDisc.*`, `SSphere.*`, `STorus.*` | Shapes are Props now, so they use width, height and depth like every other model. |
| `SCamera.getFarClippingPlaneDistance`, `SCamera.setFarClippingPlaneDistance`, `SCamera.getNearClippingPlaneDistance`, `SCamera.setNearClippingPlaneDistance`, `SCamera.getHorizontalViewingAngle`, `SCamera.setHorizontalViewingAngle` | Set by the stage for the device, or a second way to do the same thing. Filming uses the vertical viewing angle and shot types. |
| `SGround.setVehicle`, `SSun.setVehicle` | The ground and the sky stay where they are. |
| `SJoint.isPivotVisible`, `SJoint.setPivotVisible`, `SMarker.getColorId`, `SMarker.setColorId`, `SThing.getVantagePoint` | Aids for Alice’s own scene editor, not story blocks. |
| `STextModel.append`, `STextModel.charAt`, `STextModel.delete`, `STextModel.deleteCharAt`, `STextModel.getLength`, `STextModel.indexOf`, `STextModel.insert`, `STextModel.lastIndexOf`, `STextModel.replace`, `STextModel.setCharAt` | Java’s string editing, left over on Alice’s text model. `getValue` and `setValue` stay. |
| `SScene.addDefaultModelManipulation` | Dragging objects while a film plays. Not in WP6.2, and it would change a film between takes. |
| `SScene.addPointOfViewChangeListener`, `SScene.addViewEnterListener`, `SScene.addViewExitListener`, `SScene.addOcclusionStartListener`, `SScene.addOcclusionEndListener`, `PointOfViewEvent.getEntity`, `ViewEvent.getModel`, `OcclusionEvent.getBackgroundModel`, `OcclusionEvent.getForegroundModel` | Not in WP6.2. View and occlusion tests run on every frame and haven’t been measured on the reference devices, so they stay out until a class needs them and they are. |
| `AbstractKeyEvent.isKey`, `KeyEvent.isDigit`, `KeyEvent.isLetter` | A handler gets the key itself, so it can compare it. `numberKeyPress` covers digits. |
| `SMovableTurnable.moveToward.asSeenBy`, `SMovableTurnable.moveAwayFrom.asSeenBy` | Alice’s source accepts these details and then ignores them. |
| `Key` beyond the list in section 3a, `TimerFrequency.ASAP`, `Scale.IDENTITY`, `VantagePoint.IDENTITY` | Function keys, keypads and input-method keys, which many school keyboards and iPads lack; “as often as possible”, which can’t work with the time-slice budget (6.3); and two constants no kept block uses. |
<!-- /catalog:dropped -->

Workplan 6.2 doesn't list `collisionEnd` or `proximityExit`, but they're kept: they're the natural pair of what it does list, and Alice has them.

## 9. What the stage contract needs

Each block's Runs column says what runs it: `command:` and `query:` are in the WP0.8 contract (`stage-commands.ts`), `runtime` is the runtime on its own, and `needs:` isn't in the contract yet. **S3:** these are the additions WP4.3 will want, for a `contract` pull request S6 and S3 review together. The later ones (WP8, WP14, WP5b) can wait for those work packages.

<!-- catalog:stage -->
| Need | What it asks for | Blocks |
| --- | --- | --- |
| `size` | Read and set a width, height or depth in metres, with `SetDimensionPolicy` | `getWidth`, `getHeight`, `getDepth`, `setWidth`, `setHeight`, `setDepth` |
| `look` | Read paint and opacity; set a billboard’s back paint and a text model’s words | `getPaint`, `getOpacity`, `getBackPaint`, `setBackPaint`, `getValue`, `setValue` |
| `sceneLook` | Read and set the atmosphere colour, the two light colours and the fog density | `getAtmosphereColor`, `setAtmosphereColor`, `getFromAboveLightColor`, `setFromAboveLightColor`, `getFromBelowLightColor`, `setFromBelowLightColor`, `getFogDensity`, `setFogDensity` |
| `orient` | Orient to a target or to upright, with `upAsSeenBy` | `orientToUpright`, `pointAt`, `orientTo` |
| `moveToward` | Move a distance towards or away from a target, worked out at the start | `moveToward`, `moveAwayFrom` |
| `moveAndOrientTo` | Take on a target’s position and orientation, and a good viewpoint on it | `moveAndOrientTo`, `moveAndOrientToAGoodVantagePointOf` |
| `place` | Place beside a target, using both bounding boxes and `alongAxisOffset` | `place` |
| `vehicle` | Read an object’s vehicle | `getVehicle` |
| `pose` | Straighten every joint; fold or spread wings | `straightenOutJoints`, `foldWings`, `spreadWings` |
| `audio` | Play a sound at a scene time, for the export to mix | `playAudio` |
| `ask` | Ask the learner for a value while a program runs (the runtime, not the stage) | `getBooleanFromUser`, `getStringFromUser`, `getDoubleFromUser`, `getIntegerFromUser` |
| `cameraLens` | Read and set the camera’s vertical viewing angle | `getVerticalViewingAngle`, `setVerticalViewingAngle` |
| `sceneChange` | Fades and scene changes (WP8) | `goToScene`, `fadeToBlack`, `crossfade` |
| `speech` | Speak a line with visemes (WP14) | `speakLine` |
| `character` | Navigation, posture and hand contact (WP5b) | `walkTo`, `runTo`, `sitOn`, `standUp`, `lieDown`, `fall`, `touch`, `reachFor`, `pickUp`, `putDown`, `enterFrom`, `exitTo` |
| `animation` | Clips, gestures, expressions and head turning (WP5b) | `playAnimation`, `gesture`, `showExpression`, `lookAt` |
| `collisionEnd` | The stage event for two objects no longer touching | `collisionEnd` |
| `proximityExit` | The stage event for two objects moving apart | `proximityExit` |

Changes to commands the contract already has:

- `moveTo`, `turnToFace` and `shot` take a joint or a marker as a target, not only an object
- `paint` animates over its duration, as Alice’s does; the contract says it is instant
- `say` carries the bubble details: position, colours, font, style and scale
- `moveTo` carries `pathStyle`
- `resize` carries `isVolumePreserved`
<!-- /catalog:stage -->

## 10. Crosswalk (WP4.7)

Each entry's equivalent in BML 1.0, where there is one, and its Unreal Engine concept. The text view and teacher notes can show these as "under the hood" names. They come from `10-crosswalk.md`, section 3; as that section says, the Unreal names are from general knowledge and aren't checked line by line.

<!-- catalog:crosswalk -->
| Block | BML 1.0 | Unreal Engine concept |
| --- | --- | --- |
| `Thing.delay` | `wait` | Delay |
| `Thing.playAudio` | — | Play Sound 2D |
| `Thing.isCollidingWith` | — | Is Overlapping Actor |
| `Thing.getVehicle` | — | Get Attach Parent |
| `Thing.getBooleanFromUser` | — | A UI widget that waits for input |
| `Thing.getStringFromUser` | — | A UI widget that waits for input |
| `Thing.getDoubleFromUser` | — | A UI widget that waits for input |
| `Thing.getIntegerFromUser` | — | A UI widget that waits for input |
| `Turnable.turn` | — | Set Actor Location and Rotation, Timeline |
| `Turnable.roll` | — | Set Actor Location and Rotation, Timeline |
| `Turnable.turnToFace` | `gaze` | Find Look at Rotation |
| `Turnable.orientToUpright` | — | Set Actor Location and Rotation, Timeline |
| `Turnable.pointAt` | `pointing` | Find Look at Rotation |
| `Turnable.orientTo` | — | Find Look at Rotation |
| `Turnable.isFacing` | — | Get Dot Product To |
| `Turnable.getDistanceTo` | — | Get Distance To |
| `Turnable.getDistanceAbove` | — | Get Actor Location, compared along an axis |
| `Turnable.isAbove` | — | Get Actor Location, compared along an axis |
| `Turnable.getDistanceBelow` | — | Get Actor Location, compared along an axis |
| `Turnable.isBelow` | — | Get Actor Location, compared along an axis |
| `Turnable.getDistanceToTheRightOf` | — | Get Actor Location, compared along an axis |
| `Turnable.isToTheRightOf` | — | Get Actor Location, compared along an axis |
| `Turnable.getDistanceToTheLeftOf` | — | Get Actor Location, compared along an axis |
| `Turnable.isToTheLeftOf` | — | Get Actor Location, compared along an axis |
| `Turnable.getDistanceInFrontOf` | — | Get Actor Location, compared along an axis |
| `Turnable.isInFrontOf` | — | Get Actor Location, compared along an axis |
| `Turnable.getDistanceBehind` | — | Get Actor Location, compared along an axis |
| `Turnable.isBehind` | — | Get Actor Location, compared along an axis |
| `MovableTurnable.move` | — | Set Actor Location and Rotation, Timeline |
| `MovableTurnable.moveToward` | `locomotion` | Move Component To |
| `MovableTurnable.moveAwayFrom` | — | Move Component To |
| `MovableTurnable.moveTo` | `locomotion` | Move Component To |
| `MovableTurnable.moveAndOrientTo` | — | Move Component To |
| `MovableTurnable.place` | — | Set Actor Location, from the target’s bounds |
| `MovableTurnable.setVehicle` | — | Attach Actor To Actor |
| `Scene.getAtmosphereColor` | — | Sky Atmosphere and Directional Light settings |
| `Scene.setAtmosphereColor` | — | Sky Atmosphere and Directional Light settings |
| `Scene.getFromAboveLightColor` | — | Sky Atmosphere and Directional Light settings |
| `Scene.setFromAboveLightColor` | — | Sky Atmosphere and Directional Light settings |
| `Scene.getFromBelowLightColor` | — | Sky Atmosphere and Directional Light settings |
| `Scene.setFromBelowLightColor` | — | Sky Atmosphere and Directional Light settings |
| `Scene.getFogDensity` | — | Exponential Height Fog |
| `Scene.setFogDensity` | — | Exponential Height Fog |
| `Scene.goToScene` | — | Open Level, or level streaming |
| `Scene.fadeToBlack` | — | Fade track in Sequencer |
| `Scene.crossfade` | — | Shot blend in Sequencer |
| `Ground.getPaint` | — | Dynamic material instance parameter |
| `Ground.setPaint` | — | Dynamic material instance parameter |
| `Ground.getOpacity` | — | Dynamic material instance parameter |
| `Ground.setOpacity` | — | Dynamic material instance parameter |
| `Camera.moveAndOrientToAGoodVantagePointOf` | — | CineCamera with Sequencer camera cuts |
| `Camera.getVerticalViewingAngle` | — | CineCamera field of view |
| `Camera.setVerticalViewingAngle` | — | CineCamera field of view |
| `Camera.frameShot` | — | CineCamera with Sequencer camera cuts |
| `Joint.getWidth` | — | Get Component Bounds |
| `Joint.getHeight` | — | Get Component Bounds |
| `Joint.getDepth` | — | Get Component Bounds |
| `Model.getPaint` | — | Dynamic material instance parameter |
| `Model.setPaint` | — | Dynamic material instance parameter |
| `Model.getOpacity` | — | Dynamic material instance parameter |
| `Model.setOpacity` | — | Dynamic material instance parameter |
| `Model.getWidth` | — | Get Component Bounds |
| `Model.setWidth` | — | Set Actor Scale 3D |
| `Model.resizeWidth` | — | Set Actor Scale 3D |
| `Model.getHeight` | — | Get Component Bounds |
| `Model.setHeight` | — | Set Actor Scale 3D |
| `Model.resizeHeight` | — | Set Actor Scale 3D |
| `Model.getDepth` | — | Get Component Bounds |
| `Model.setDepth` | — | Set Actor Scale 3D |
| `Model.resizeDepth` | — | Set Actor Scale 3D |
| `Model.resize` | — | Set Actor Scale 3D |
| `Model.say` | `speech` | A UI widget; there is no built-in speech bubble |
| `Model.think` | — | A UI widget; there is no built-in speech bubble |
| `Model.speakLine` | `speech` | Audio with lip-sync tools |
| `JointedModel.getJoint` | — | Get Socket Transform |
| `JointedModel.getJointChain` | — | Get Bone Names, filtered |
| `JointedModel.straightenOutJoints` | — | Reset the Control Rig pose |
| `JointedModel.playAnimation` | — | Play Animation or Montage |
| `Billboard.getBackPaint` | — | Dynamic material instance parameter |
| `Billboard.setBackPaint` | — | Dynamic material instance parameter |
| `Text.getValue` | — | Get Text |
| `Text.setValue` | — | Set Text |
| `Flyer.foldWings` | — | Play Montage |
| `Flyer.spreadWings` | — | Play Montage |
| `Biped.walkTo` | `locomotion` | AI MoveTo with a navigation mesh |
| `Biped.runTo` | `locomotion` | AI MoveTo with a navigation mesh |
| `Biped.sitOn` | `posture` | Montage with Attach To Component |
| `Biped.standUp` | `posture` | Play Montage |
| `Biped.lieDown` | `posture` | Play Montage |
| `Biped.fall` | `posture` | Play Montage |
| `Biped.touch` | — | Control Rig IK |
| `Biped.reachFor` | `pointing` | Control Rig IK |
| `Biped.pickUp` | — | Control Rig IK with Attach To Component |
| `Biped.putDown` | — | Detach From Actor |
| `Biped.enterFrom` | — | Spawn Actor |
| `Biped.exitTo` | — | Destroy Actor |
| `Biped.gesture` | `gesture` | Play Montage |
| `Biped.showExpression` | `faceLexeme` | Morph targets or pose assets |
| `Biped.lookAt` | `gaze` | Look At in Control Rig or an Animation Blueprint |
| `sceneStart` | — | Event BeginPlay |
| `clickOnScreen` | — | Input actions |
| `clickOnObject` | — | OnClicked |
| `keyPress` | — | Input actions |
| `arrowKeyPress` | — | Input actions |
| `numberKeyPress` | — | Input actions |
| `moveWithArrowKeys` | — | Input actions with Add Movement Input |
| `timer` | — | Set Timer by Event |
| `collisionStart` | — | Actor overlap and hit events |
| `collisionEnd` | — | Actor overlap and hit events |
| `proximityEnter` | — | Actor overlap and hit events |
| `proximityExit` | — | Actor overlap and hit events |
<!-- /catalog:crosswalk -->

## 11. Tests

How each rule in this spec is tested, and at which level (`09-testing.md`).

| Rule | Test | Level |
|---|---|---|
| The palette: the rule for what counts, parameters past annotations, details through inherited factories, enum constants | `src/alice/inventory.test.ts` | Unit (Vitest) |
| Every palette member, class and value is kept or listed as dropped; nothing is both; nothing named is invented | `src/catalog/catalog.test.ts` | Unit |
| Kept blocks keep Alice's parameter names, details and kind | `src/catalog/catalog.test.ts` | Unit |
| Directions follow the right-hand rule | `src/catalog/catalog.test.ts` | Unit |
| Types, limits, class inheritance, `checkCall` | `src/catalog/catalog.test.ts` | Unit |
| Every entry, parameter, detail and value has words, with a place for each parameter; rule 9's banned words appear nowhere | `src/catalog/catalog.test.ts` | Unit |
| Every `needs:` is explained; every entry has a crosswalk field (4.7) | `src/catalog/catalog.test.ts` | Unit |
| The catalog text stays under the Prompter's budget (spec 04, section 3) | `src/catalog/catalog.test.ts` | Unit |
| This spec's tables match the metadata | `scripts/spec.test.ts` | Unit |
| Every procedure on every model class reaches the expected end state (WP4 done-when) | With WP4.3, against the fake stage | Conformance |

## 12. Open points for other sessions

| Needs | From | For |
|---|---|---|
| Merge the joint map, #57, so section 5 stands on merged work | Owner or S4 | WP4a's dependency, WP3a |
| The whole-program check, on `check(program)` in `01-ast.md` section 4.5, once the program types (#92) merge. `checkCall` is ready for it | S6, after S2 | 4.2 |
| The `contract` pull request for section 9 | S3, S6 | WP4.3 |
| `{name: 'TextModel'}` as a type, and enum types as in section 3a | S2 | Section 1 rule 3, section 3a |
| The warning before exporting a program that asks the learner something | S2 | Section 3 rule 1 |
| Backstage entries for the built-in shapes | S4 | Section 1 rule 5 |
| The manifest lookup for section 5 rule 3 | S4, S6 | The whole-program check |
| Whether the converter (3.2) leaves Alice's models facing +Z, as the contract says | S4 | Section 1, Directions |

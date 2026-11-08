# 02 Story api

- **Covers:** Classes, procedures, functions, details, joints, events, new StoryStage blocks
- **Work package:** WP4.1, 4.2, 4.7
- **Owner:** S6 (spec and types); S3 (procedures)
- **Status:** written 1 Nov 2026. The tables are generated from the metadata in `packages/story-api/src/catalog/`; change them there and run `pnpm --filter @storystage/story-api spec`. A test fails if they differ.

**Published:** the open specification for implementers outside StoryStage is generated from the same metadata into [`docs/story-api/`](../story-api/README.md) (WP4.8, decision 0055).

## 0. Decisions this spec relies on

[0007 3D](../decisions/0007-3d.md), [0008 Models](../decisions/0008-models.md), [0009 Blocks](../decisions/0009-blocks.md), [0010 Language](../decisions/0010-language.md), [0013 Backstage](../decisions/0013-backstage.md), [0030 Age range](../decisions/0030-age-range.md), [0036 Languages](../decisions/0036-languages.md), [0051 Joint moves and optional events](../decisions/0051-joints-and-optional-events.md). `10-crosswalk.md` is the background to sections 7 and 10; `01-ast.md` fixes how a program refers to everything here; `17-backstage.md`, section 2a, is the joint map.

### How this spec was made

The workplan asks for this spec to be generated from Alice's `PRIME_TIME` methods, using StoryStage 1's `ApiCatalog` output. It comes from the same place by a different route, and the difference matters:

- **Read from source, not reflection.** `ApiCatalog` needs a compiled Alice. `packages/story-api/scripts/inventory-cli.ts` reads the Java source of `org.lgna.story`, and writes the result to `src/alice/palette.json`: names, types and values only, so no Alice code comes into this repository. StoryStage 1 and upstream Alice give the same list.
- **Alice's palette rule, not `ApiCatalog`'s.** Alice shows a public method when its visibility is `PRIME_TIME` **or it has no `@MethodTemplate`** (`MemberTabComposite`). `ApiCatalog.isPrimeTime` requires the annotation, and it walks only the classes a learner meets. So it lists 109 of the 309 members and leaves out 200:
    - 183 with no annotation: the 136 joint getters, 17 accessors on event objects, and 30 others, among them `straightenOutJoints`, `isFacing` and Text's `setValue`;
    - 17 on classes outside its roots: the virtual-reality classes and `SJoint`.

    StoryStage 1's catalog is left as it is, by the owner's decision of 1 Nov 2026.
- **Checked against a compiled Alice.** One CI run compiled StoryStage 1's `core/story-api` with its real `ApiCatalog.java`, and `scripts/AliceCatalogDump.java` wrote `src/alice/compiled-alice.json`. Reflection under the palette rule matches `palette.json` on all 292 members of the `S` classes, details included, and `ApiCatalog` matches the 109 annotated members of the classes it walks. The other 17 members are on event objects, which that run doesn't cover.

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
4. **A joint turns but doesn't move** (decision 0051). Alice's `SJoint` is movable, and her scene editor can save a moved joint. Here `Joint` extends `Turnable`, so `turn`, `roll` and `pointAt` work and `move` doesn't, because the shared animations, gestures and the stage's `joint` command all work by rotation. Adding `move` later breaks nothing; removing it after the open specification (4.8) would. The `.a3p` import reports a moved joint, including one in a world's set-up. A joint also has `getWidth`, `getHeight` and `getDepth`.
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
| `Turnable` | `orientToUpright` | — | `duration`, `animationStyle`, `upAsSeenBy` | turn upright | `command:orient` |
| `Turnable` | `pointAt` | `target: Thing` | `duration`, `animationStyle`, `upAsSeenBy` | point at {target} | `command:orient` |
| `Turnable` | `orientTo` | `target: Thing` | `duration`, `animationStyle` | line up with {target} | `command:orient` |
| `MovableTurnable` | `move` | `direction: MoveDirection`, `amount: Number` | `duration`, `animationStyle`, `asSeenBy` | move {direction} {amount} | `command:translate` |
| `MovableTurnable` | `moveToward` | `target: Thing`, `amount: Number` | `duration`, `animationStyle` | move toward {target} by {amount} | `command:moveToward` |
| `MovableTurnable` | `moveAwayFrom` | `target: Thing`, `amount: Number` | `duration`, `animationStyle` | move away from {target} by {amount} | `command:moveToward` |
| `MovableTurnable` | `moveTo` | `target: Thing` | `duration`, `animationStyle`, `pathStyle` | move to {target} | `command:moveTo` |
| `MovableTurnable` | `moveAndOrientTo` | `target: Thing` | `duration`, `animationStyle`, `pathStyle` | move to and line up with {target} | `command:moveAndOrientTo` |
| `MovableTurnable` | `place` | `spatialRelation: SpatialRelation`, `target: Thing` | `duration`, `animationStyle`, `pathStyle`, `alongAxisOffset` | place {spatialRelation} {target} | `command:place` |
| `MovableTurnable` | `setVehicle` | `vehicle: Thing` | — | ride on {vehicle} | `command:vehicle` |
| `Scene` | `setAtmosphereColor` | `color: Color` | `duration`, `animationStyle` | change the sky colour to {color} | `command:atmosphere` |
| `Scene` | `setFromAboveLightColor` | `color: Color` | — | change the light from above to {color} | `command:light` |
| `Scene` | `setFromBelowLightColor` | `color: Color` | — | change the light from below to {color} | `command:light` |
| `Scene` | `setFogDensity` | `density: Number` (portion) | `duration`, `animationStyle` | change the fog to {density} | `command:fog` |
| `Ground` | `setPaint` | `paint: Paint` | `duration`, `animationStyle` | paint {paint} | `command:paint` |
| `Ground` | `setOpacity` | `opacity: Number` (portion) | `duration`, `animationStyle` | change opacity to {opacity} | `command:opacity` |
| `Camera` | `moveAndOrientToAGoodVantagePointOf` | `entity: Thing` | `duration`, `animationStyle` | find a good view of {entity} | `command:moveAndOrientTo` |
| `Camera` | `setVerticalViewingAngle` | `angle: Number` | — | change the viewing angle to {angle} | `command:lens` |
| `Model` | `setPaint` | `paint: Paint` | `duration`, `animationStyle` | paint {paint} | `command:paint` |
| `Model` | `setOpacity` | `opacity: Number` (portion) | `duration`, `animationStyle` | change opacity to {opacity} | `command:opacity` |
| `Model` | `setWidth` | `width: Number` (positive) | `duration`, `animationStyle`, `policy` | change width to {width} | `command:setSize` |
| `Model` | `resizeWidth` | `factor: Number` (positive) | `duration`, `animationStyle`, `isVolumePreserved` | resize width by {factor} | `command:resize` |
| `Model` | `setHeight` | `height: Number` (positive) | `duration`, `animationStyle`, `policy` | change height to {height} | `command:setSize` |
| `Model` | `resizeHeight` | `factor: Number` (positive) | `duration`, `animationStyle`, `isVolumePreserved` | resize height by {factor} | `command:resize` |
| `Model` | `setDepth` | `depth: Number` (positive) | `duration`, `animationStyle`, `policy` | change depth to {depth} | `command:setSize` |
| `Model` | `resizeDepth` | `factor: Number` (positive) | `duration`, `animationStyle`, `isVolumePreserved` | resize depth by {factor} | `command:resize` |
| `Model` | `resize` | `factor: Number` (positive) | `duration`, `animationStyle` | resize by {factor} | `command:resize` |
| `Model` | `say` | `text: Text` | `duration`, `textScale`, `textStyle`, `fontType`, `fontColor`, `bubbleFillColor`, `bubbleOutlineColor`, `bubblePosition` | say {text} | `command:say` |
| `Model` | `think` | `text: Text` | `duration`, `textScale`, `textStyle`, `fontType`, `fontColor`, `bubbleFillColor`, `bubbleOutlineColor`, `bubblePosition` | think {text} | `command:say` |
| `JointedModel` | `straightenOutJoints` | — | `duration`, `animationStyle` | straighten out joints | `command:pose` |
| `Billboard` | `setBackPaint` | `paint: Paint` | `duration`, `animationStyle` | paint the back {paint} | `command:backPaint` |
| `Text` | `setValue` | `text: Text` | — | change the words to {text} | `command:text` |
| `Flyer` | `foldWings` | — | `duration`, `animationStyle` | fold wings | `command:pose` |
| `Flyer` | `spreadWings` | — | `duration`, `animationStyle` | spread wings | `command:pose` |
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
| `Thing` | `getVehicle` | — | `Thing` | — | vehicle | `query:vehicle` |
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
| `Scene` | `getAtmosphereColor` | — | `Color` | — | sky colour | `query:sceneLook` |
| `Scene` | `getFromAboveLightColor` | — | `Color` | — | light from above | `query:sceneLook` |
| `Scene` | `getFromBelowLightColor` | — | `Color` | — | light from below | `query:sceneLook` |
| `Scene` | `getFogDensity` | — | `Number` | — | how thick the fog is | `query:sceneLook` |
| `Ground` | `getPaint` | — | `Paint` | — | paint | `query:look` |
| `Ground` | `getOpacity` | — | `Number` | — | opacity | `query:look` |
| `Camera` | `getVerticalViewingAngle` | — | `Number` | — | viewing angle | `query:lens` |
| `Joint` | `getWidth` | — | `Number` | — | width | `query:size` |
| `Joint` | `getHeight` | — | `Number` | — | height | `query:size` |
| `Joint` | `getDepth` | — | `Number` | — | depth | `query:size` |
| `Model` | `getPaint` | — | `Paint` | — | paint | `query:look` |
| `Model` | `getOpacity` | — | `Number` | — | opacity | `query:look` |
| `Model` | `getWidth` | — | `Number` | — | width | `query:size` |
| `Model` | `getHeight` | — | `Number` | — | height | `query:size` |
| `Model` | `getDepth` | — | `Number` | — | depth | `query:size` |
| `JointedModel` | `getJoint` | `joint: JointId` | `Joint` | — | {joint} | `runtime` |
| `JointedModel` | `getJointChain` | `chain: JointChain` | `Joint[]` | — | all of the {chain} | `runtime` |
| `Billboard` | `getBackPaint` | — | `Paint` | — | back paint | `query:look` |
| `Text` | `getValue` | — | `Text` | — | words | `query:look` |
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
- **In a program,** a `Color` is an `enum` node. `Paint` beyond that, `Audio`, `SceneId` and `AnimationClip` are `text`, because `01-ast.md` keeps `enum` values to plain names, which a colour or a Backstage id isn't. `JointId` is the one reference that's an `enum` node (section 5).
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
| `collisionEnd` | `setA: Thing[]`, `setB: Thing[]` | `a: Thing`, `b: Thing` | `multipleEventPolicy` | `collisionEnd` | when {setA} stops touching {setB} |
| `proximityEnter` | `setA: Thing[]`, `setB: Thing[]`, `distance: Number` | `a: Thing`, `b: Thing` | `multipleEventPolicy` | `proximityEnter` | when {setA} gets within {distance} of {setB} |
| `proximityExit` | `setA: Thing[]`, `setB: Thing[]`, `distance: Number` | `a: Thing`, `b: Thing` | `multipleEventPolicy` | `proximityExit` | when {setA} gets further than {distance} from {setB} |
| `viewEnter` | `set: Model[]` | `model: Model` | `multipleEventPolicy` | `viewEnter` | when {set} comes into shot |
| `viewExit` | `set: Model[]` | `model: Model` | `multipleEventPolicy` | `viewExit` | when {set} leaves shot |
<!-- /catalog:events -->

1. **Named values, not an event object.** Alice's handler receives an `event` and calls accessors on it (`event.getModelAtMouseLocation()`). Here the handler receives what it needs by name (`model`), which is the listener's `params` in the AST. It reads better on a tile and needs no event class. The accessors are mapped one for one, and the `.a3p` import uses that mapping.
2. **Needs** is the listener's `args`. A `listener` must have values for these in the AST before it can run.
3. **`timer` always has a number of seconds.** Alice's "as often as possible" can't work with the time-slice budget (WP6.3).
4. **`multipleEventPolicy`** says what happens if the event fires again while its handler is running. The default, as in Alice, is to ignore it.
5. **`viewEnter` and `viewExit`** fire when a model comes into or leaves the camera's view. They're additions to workplan 6.2 (decision 0051). Like `isVisible`, they use the stage's view test, and their cost isn't measured yet, so rule 6 applies.

## 7. New StoryStage blocks

Added by the workplan. S3 builds them (4.4 to 4.6, 4.10), so their parameters may be refined with S3 when the machinery exists. Their names are settled now so that the Prompter's catalog and the editors can rely on them.

<!-- catalog:added -->
| Class | Block | Parameters | Details | Task | On screen | Runs |
| --- | --- | --- | --- | --- | --- | --- |
| `Scene` | `goToScene` | `scene: SceneId` | — | 4.4 | go to {scene} | `needs:sceneChange` |
| `Scene` | `fadeToBlack` | — | `duration` | 4.4 | fade to black | `command:fade` |
| `Scene` | `crossfade` | `scene: SceneId` | `duration` | 4.4 | crossfade to {scene} | `needs:sceneChange` |
| `Camera` | `frameShot` | `shot: ShotType`, `targets: Thing[]` | `duration`, `animationStyle` | 4.10 | frame a {shot} of {targets} | `command:shot` |
| `Model` | `speakLine` | `text: Text` | — | 4.4 | speak line {text} | `needs:speech` |
| `JointedModel` | `playAnimation` | `clip: AnimationClip` | — | 4.6 | play animation {clip} | `command:clip` |
| `Biped` | `walkTo` | `target: Thing` | — | 4.5 | walk to {target} | `command:walk` |
| `Biped` | `runTo` | `target: Thing` | — | 4.5 | run to {target} | `command:walk` |
| `Biped` | `sitOn` | `target: Thing` | — | 4.5 | sit on {target} | `command:posture` |
| `Biped` | `standUp` | — | — | 4.5 | stand up | `command:posture` |
| `Biped` | `lieDown` | — | — | 4.5 | lie down | `command:posture` |
| `Biped` | `fall` | — | — | 4.5 | fall | `command:posture` |
| `Biped` | `touch` | `target: Thing` | — | 4.5 | touch {target} | `command:reach` |
| `Biped` | `reachFor` | `target: Thing` | — | 4.5 | reach for {target} | `command:reach` |
| `Biped` | `pickUp` | `target: Thing` | — | 4.5 | pick up {target} | `command:pickUp` |
| `Biped` | `putDown` | `target: Thing` | — | 4.5 | put down {target} | `command:putDown` |
| `Biped` | `enterFrom` | `edge: SceneEdge` | — | 4.5 | enter from {edge} | `command:enter` |
| `Biped` | `exitTo` | `edge: SceneEdge` | — | 4.5 | exit to {edge} | `command:walk` |
| `Biped` | `gesture` | `gesture: Gesture` | — | 4.6 | gesture {gesture} | `command:gesture` |
| `Biped` | `showExpression` | `expression: Expression` | — | 4.6 | look {expression} | `command:expression` |
| `Biped` | `lookAt` | `target: Thing` | — | 4.6 | look at {target} | `command:lookAt` |
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
| `SScene.addDefaultModelManipulation` | Dragging objects while a film plays. It would share the screen with the scene view’s drag handles (7.1) and the Rehearse controls, and it’s pointer-only (decision 0051). |
| `SScene.addPointOfViewChangeListener`, `PointOfViewEvent.getEntity` | It fires on every frame while an object moves, which is hard for a young programmer to reason about. Proximity, collision, timers and the `follow` shot cover most uses (decision 0051). |
| `SScene.addOcclusionStartListener`, `SScene.addOcclusionEndListener`, `OcclusionEvent.getBackgroundModel`, `OcclusionEvent.getForegroundModel` | Waiting for a measurement. Each pair of objects is tested from the camera on every frame. S3 measures that on the reference devices, then the owner decides (decision 0051). |
| `AbstractKeyEvent.isKey`, `KeyEvent.isDigit`, `KeyEvent.isLetter` | A handler gets the key itself, so it can compare it. `numberKeyPress` covers digits. |
| `SMovableTurnable.moveToward.asSeenBy`, `SMovableTurnable.moveAwayFrom.asSeenBy` | Alice’s source accepts these details and then ignores them. |
| `Key` beyond the list in section 3a, `TimerFrequency.ASAP`, `Scale.IDENTITY`, `VantagePoint.IDENTITY` | Function keys, keypads and input-method keys, which many school keyboards and iPads lack; “as often as possible”, which can’t work with the time-slice budget (6.3); and two constants no kept block uses. |
<!-- /catalog:dropped -->

Workplan 6.2 doesn't list `collisionEnd` or `proximityExit`, but they're kept: they're the natural pair of what it does list, and Alice has them.

The owner reviewed the joint and event choices on 1 Nov 2026 (decision 0051). Occlusion is the one still open: it stays out until it's measured.

## 9. What the stage contract needs

Each block's Runs column says what runs it: `command:` and `query:` are in the WP0.8 contract (`stage-commands.ts`), `runtime` is the runtime on its own, and `needs:` isn't in the contract yet. WP4.3's needs are in the contract now: a joint or a marker as a target, sizes, looks, the sky, light and fog, orienting, moving toward, placing, poses, the camera's lens, bubble details, path styles, and the events below with `Stage.watch`. So is 4.4's fade to black (`fade`). So are 4.5's character actions and 4.6's faces (WP4c): `walk`, `enter`, `posture`, `reach`, `pickUp`, `putDown`, `clip`, `gesture`, `expression` and `lookAt`. What's left waits for its own work package: going to another scene and crossfading to one are the production's playback (WP8.3), not the stage's.

1. **Not the stage's sums.** `isVolumePreserved` is the Story API's: it sends `resize` the factors that keep the volume. The `ask` functions belong to the runtime.
2. **Click positions** are fractions of the picture, from its left and bottom edges, as Alice's `getScreenDistanceFromLeft` and `getScreenDistanceFromBottom` are. Viewing angles are in turns, as Alice's are.
3. **Watching.** The stage reports collisions and keys by itself. It fires `proximityEnter`, `proximityExit`, `viewEnter` and `viewExit` only for what `Stage.watch` asks: the distances come from the listeners, and view tests cost something on every frame (decision 0051). **S2:** the runtime sends its listeners' watches with a message of its own.
4. **Actions take their own time.** A character action has no `duration` detail. The block asks the stage `naturalDuration` (a walk by the length of its way, a clip by its length on that model), sends the command with that duration, and waits for it.
5. **Walking goes round things** where they are when the walk starts, with a navigation mesh (WP5.8). Walking to a thing stops in front of it, facing it; walking to an edge ends out of the picture, as the camera sees it when the walk starts.
6. **Faces are the model's own.** `expression` uses a VRM model's presets (VRM 0.x and 1.0). A model without that face shows no change, by the owner's decision of 8 Nov 2026.

<!-- catalog:stage -->
| Need | What it asks for | Blocks |
| --- | --- | --- |
| `audio` | Play a sound at a scene time, for the export to mix (with WP11) | `playAudio` |
| `ask` | Ask the learner for a value while a program runs (the runtime, not the stage) | `getBooleanFromUser`, `getStringFromUser`, `getDoubleFromUser`, `getIntegerFromUser` |
| `sceneChange` | Going to another scene, and crossfading to one: the production’s playback (WP8.3) | `goToScene`, `crossfade` |
| `speech` | Speak a line with visemes (WP14) | `speakLine` |
<!-- /catalog:stage -->

## 9a. The program check

`checkProgram` is the Story API's `check` for `validateProgram` and the edit session (`01-ast.md`, section 4.5), from `@storystage/story-api/program-check`. It runs after S2's rules, so structure is settled and it looks only at meaning:

1. **Blocks.** A block exists on its target's class or a parent. A procedure stands as a statement and a function gives a value. A learner's own procedure is called on an object that has it.
2. **Values.** Every parameter is given, nothing extra is, and each value and detail fits its type, for story blocks, learners' own procedures and what an event needs.
3. **Statements and sums.** Conditions are true or false, `count` takes a whole number, loops take a list of the right things, and assignments, locals, returns, defaults, list members, sums and logic fit. A sum of whole numbers is whole, except a division. `equal` and `notEqual` compare anything, and `join` joins anything.
4. **Names.** Types, event kinds and `enum` values exist. A learner's class extends a concrete class, written `TextModel` for 3D text.
5. **Handlers.** A listener's `params` are values the event gives, by name. A handler may narrow a type, because `setOfVisuals` can promise only bipeds.
6. **Joints.** The program doesn't say which model a field holds, so the caller passes `jointExists`, which asks the scene and the manifest (section 5, rule 3). Without it, joints aren't checked.

**A wrong refusal stops a learner working,** so anything whose type can't be known passes. An empty slot (`none`) never refuses. Whether a text reference exists is for the production's check, and limits (section 2, rule 4) are for the runtime, because a number can come from a sum. Every problem is `outside`, with a `reason` from `check.*` in the strings file.

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
| `viewEnter` | — | A test against the camera’s view |
| `viewExit` | — | A test against the camera’s view |
<!-- /catalog:crosswalk -->

## 11. Tests

How each rule in this spec is tested, and at which level (`09-testing.md`).

| Rule | Test | Level |
|---|---|---|
| The palette: the rule for what counts, parameters past annotations, details through inherited factories, enum constants | `src/alice/inventory.test.ts` | Unit (Vitest) |
| `palette.json` matches a compiled Alice: reflection under the palette rule, and the real `ApiCatalog` | `src/alice/inventory.test.ts`, against `compiled-alice.json` from one CI run | Unit |
| Every palette member, class and value is kept or listed as dropped; nothing is both; nothing named is invented | `src/catalog/catalog.test.ts` | Unit |
| Kept blocks keep Alice's parameter names, details and kind | `src/catalog/catalog.test.ts` | Unit |
| Directions follow the right-hand rule | `src/catalog/catalog.test.ts` | Unit |
| Types, limits, class inheritance, `checkCall` | `src/catalog/catalog.test.ts` | Unit |
| Each rule of section 9a, against programs that have passed `validateProgram` | `src/catalog/program-check.test.ts` | Unit |
| Every entry, parameter, detail and value has words, with a place for each parameter; rule 9's banned words appear nowhere | `src/catalog/catalog.test.ts` | Unit |
| Every `needs:` is explained; every entry has a crosswalk field (4.7) | `src/catalog/catalog.test.ts` | Unit |
| The catalog text stays under the Prompter's budget (spec 04, section 3) | `src/catalog/catalog.test.ts` | Unit |
| This spec's tables match the metadata | `scripts/spec.test.ts` | Unit |
| Every procedure on every model class reaches the expected end state (WP4 done-when) | With WP4.3, against the fake stage | Conformance |

## 12. Open points for other sessions

| Needs | From | For |
|---|---|---|
| The `contract` pull request for section 9 | S3, S6 | WP4.3 |
| `{name: 'TextModel'}` as a type | S2 | Section 1 rule 3 |
| Measure occlusion on the reference devices once the stage exists, so the owner can decide | S3 | Decision 0051 |
| Measure `viewEnter` and `viewExit` on the reference devices | S3 | Rule 6, section 6 rule 5 |
| The warning before exporting a program that asks the learner something | S2 | Section 3 rule 1 |
| Backstage entries for the built-in shapes | S4 | Section 1 rule 5 |
| `jointExists`, from the scene's set-up and the manifest, wherever the session is made | S2, S4 | Section 9a rule 6 |
| Pass `checkProgram` as `check` wherever a session is made | S2, S5 | Section 9a |
| `sampleProgram` has two type slips: `double` returns text, and `eachTogether` loops over a non-list | S2 | Harmless today; `checkProgram` would refuse them |
| Whether the converter (3.2) leaves Alice's models facing +Z, as the contract says | S4 | Section 1, Directions |

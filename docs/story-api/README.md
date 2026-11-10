# The StoryStage Story API

<!-- reference:version -->
**Version 0.10.0, a draft for comment.** 99 blocks, 14 events, 19 details and 19 value types.
<!-- /reference:version -->

The Story API is the vocabulary young people use to make 3D animated films in code: the characters and things in a scene, what they can do ("move forward 1", "say Hello", "walk to the tree"), what can be asked about them, and the events a film can react to. It keeps the vocabulary of [Alice 3](https://www.alice.org/), made at Carnegie Mellon University, and adds what film-making needs. StoryStage 2 implements it; anyone may implement it too.

This is a **draft for comment**. Until version 1.0, which comes with StoryStage 2's release candidate, anything here may change. Each change is listed in the [changelog](CHANGELOG.md).

| File | What it is | Licence |
|---|---|---|
| This reference | The rules, and every class, block and event | CC BY 4.0 |
| [`crosswalk.md`](crosswalk.md) | Annex A: each block beside Alice, BML 1.0 and Unreal Engine | CC BY 4.0 |
| [`story-api.json`](story-api.json) | The whole vocabulary as data, with its words in English (UK) | Apache-2.0 |
| [`story-api.schema.json`](story-api.schema.json) | The JSON Schema (2020-12) for `story-api.json` | Apache-2.0 |
| [`program.schema.json`](program.schema.json) | The JSON Schema for a program written with the Story API | Apache-2.0 |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed in each version | CC BY 4.0 |

The tables below and the JSON files are generated from the same source, so where this text and `story-api.json` seem to differ, the JSON is right and the text has a fault: please report it (section 11).

## 1. How to read it

- **A class** has its own blocks and those of the classes it extends. A learner's own class extends a concrete class and has all its blocks.
- **A block** is a procedure, which does something and takes time, or a function, which gives a value. It has **parameters**, which are always given, and **details**, which are optional and have defaults (Alice's keyword arguments, "add detail" in an editor).
- **Limits** after a parameter: `portion` is 0 to 1, `positive` is above zero, `positiveOrZero` is zero or more. A value out of range stops the program at that block with an explanation.
- **Words** are what a learner sees, in English (UK). `{amount}` stands for the value given. Names in code never reach the screen.
- **Timing.** A procedure takes one second unless its `duration` says otherwise, and `duration: 0` is instant. The next statement waits for it, unless they are in "do together".
- **Origin.** `alice` is a block Alice 3 has, with Alice's name and parameter names. `storystage` is one this specification adds.

## 2. Space

<!-- reference:space -->
glTF: right-handed, Y up, and a model faces +Z. Each direction is in the object’s own axes. Units: metres, seconds and whole turns (0.25 is a quarter turn).

| Block | Direction | Axis |
| --- | --- | --- |
| `move` | `left` | +X |
| `move` | `right` | -X |
| `move` | `up` | +Y |
| `move` | `down` | -Y |
| `move` | `forward` | +Z |
| `move` | `backward` | -Z |
| `turn` | `left` | +Y |
| `turn` | `right` | -Y |
| `turn` | `forward` | +X |
| `turn` | `backward` | -X |
| `roll` | `left` | -Z |
| `roll` | `right` | +Z |
<!-- /reference:space -->

Alice's forward is -Z, but a glTF model faces +Z, so some of these axes have the opposite sign to Alice's. The words mean the same in both: "move left" goes to the object's own left.

## 3. Classes

<!-- reference:classes -->
| Class | Extends | Kind | Words | From Alice |
| --- | --- | --- | --- | --- |
| `Thing` | — | abstract | anything | `SThing` |
| `Scene` | `Thing` | concrete | scene | `SScene` |
| `Ground` | `Thing` | concrete | ground | `SGround` |
| `Turnable` | `Thing` | abstract | anything that turns | `STurnable` |
| `Joint` | `Turnable` | concrete | joint | `SJoint` |
| `MovableTurnable` | `Turnable` | abstract | anything that moves | `SMovableTurnable` |
| `Camera` | `MovableTurnable` | concrete | camera | `SCamera` |
| `Marker` | `MovableTurnable` | concrete | marker | `SMarker`, `SCameraMarker`, `SThingMarker`, `STarget` |
| `Model` | `MovableTurnable` | abstract | model | `SModel` |
| `Billboard` | `Model` | concrete | billboard | `SBillboard` |
| `Text` | `Model` | concrete | 3D text | `STextModel` |
| `JointedModel` | `Model` | abstract | model with joints | `SJointedModel` |
| `Prop` | `JointedModel` | concrete | prop | `SProp`, `SShape`, `SBox`, `SSphere`, `SCone`, `SCylinder`, `SDisc`, `STorus`, `SAxes` |
| `Transport` | `JointedModel` | concrete | transport | `STransport` |
| `Biped` | `JointedModel` | concrete | biped | `SBiped` |
| `Quadruped` | `JointedModel` | concrete | quadruped | `SQuadruped` |
| `Flyer` | `JointedModel` | concrete | flyer | `SFlyer` |
| `Swimmer` | `JointedModel` | concrete | swimmer | `SSwimmer` |
| `Slitherer` | `JointedModel` | concrete | slitherer | `SSlitherer` |
<!-- /reference:classes -->

Alice's shapes (box, sphere, cone and the others) are Props here. A joint can turn but not move.

## 4. Types and values

<!-- reference:types -->
- **Basic:** `Number`, `WholeNumber`, `Text`, `Boolean`.
- **References** to something outside a program: `Paint`, `Audio`, `JointId`, `SceneId`, `AnimationClip`, `LineId`. A program writes `Paint`, `Audio`, `SceneId`, `AnimationClip`, `LineId` as text, and a joint as a value of `JointId` (section 6.3).
- **Classes** as types: each class in section 3, except that the `Text` class's type is `TextModel`, because `Text` is words. A list of anything is written with `[]`: `Biped[]`.

| Value type | Values | Origin |
| --- | --- | --- |
| `AnimationStyle` | `beginAndEndGently`, `beginGentlyAndEndAbruptly`, `beginAbruptlyAndEndGently`, `beginAndEndAbruptly` | alice |
| `BubblePosition` | `automatic`, `left`, `center`, `right` | alice |
| `Color` | `black`, `blue`, `cyan`, `darkGray`, `gray`, `green`, `lightGray`, `magenta`, `orange`, `pink`, `red`, `white`, `yellow`, `lightBlue`, `darkBlue`, `purple`, `brown` | alice |
| `HeldKeyPolicy` | `fireMultiple`, `fireOnceOnPress`, `fireOnceOnRelease` | alice |
| `MoveDirection` | `left`, `right`, `up`, `down`, `forward`, `backward` | alice |
| `MultipleEventPolicy` | `enqueue`, `ignore`, `combine` | alice |
| `PathStyle` | `beeLine`, `smooth` | alice |
| `RollDirection` | `left`, `right` | alice |
| `SetDimensionPolicy` | `preserveVolume`, `preserveAspectRatio`, `preserveNothing` | alice |
| `SpatialRelation` | `leftOf`, `rightOf`, `above`, `below`, `inFrontOf`, `behind` | alice |
| `TextFont` | `default`, `serif`, `sansSerif`, `monospaced` | alice |
| `TextStyle` | `plain`, `bold`, `italic` | alice |
| `TurnDirection` | `left`, `right`, `forward`, `backward` | alice |
| `Key` | `a`, `b`, `c`, `d`, `e`, `f`, `g`, `h`, `i`, `j`, `k`, `l`, `m`, `n`, `o`, `p`, `q`, `r`, `s`, `t`, `u`, `v`, `w`, `x`, `y`, `z`, `digit0`, `digit1`, `digit2`, `digit3`, `digit4`, `digit5`, `digit6`, `digit7`, `digit8`, `digit9`, `left`, `right`, `up`, `down`, `space`, `enter`, `tab`, `backSpace`, `escape`, `shift`, `control`, `alt`, `comma`, `period`, `minus`, `equals`, `slash`, `semicolon`, `quote` | alice |
| `ShotType` | `wide`, `medium`, `closeUp`, `overTheShoulder`, `follow`, `twoShot` | storystage |
| `Gesture` | `wave`, `nod`, `shrug`, `clap`, `point` | storystage |
| `Expression` | `neutral`, `happy`, `sad`, `angry`, `surprised`, `relaxed`, `blink` | storystage |
| `SceneEdge` | `left`, `right`, `back`, `front` | storystage |
| `JointChain` | `neck`, `tail` | storystage |
<!-- /reference:types -->

A whole number fits where a number is wanted, a colour where paint is, and a class where any of its parents is.

## 5. Details

<!-- reference:details -->
| Detail | Type | Default | Limit | Words |
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
| `line` | `LineId` | words the script doesn’t have | — | script line |
<!-- /reference:details -->

## 6. Blocks

### 6.1 From Alice

<!-- reference:alice-blocks -->
| Class | Block | Kind | Parameters | Returns | Details | Words |
| --- | --- | --- | --- | --- | --- | --- |
| `Thing` | `delay` | procedure | `duration: Number` (positiveOrZero) | — | — | wait {duration} seconds |
| `Thing` | `playAudio` | procedure | `audioSource: Audio` | — | — | play {audioSource} |
| `Thing` | `isCollidingWith` | function | `other: Thing` | `Boolean` | — | is touching {other} |
| `Thing` | `getVehicle` | function | — | `Thing` | — | vehicle |
| `Thing` | `getBooleanFromUser` | function | `message: Text` | `Boolean` | — | ask yes or no: {message} |
| `Thing` | `getStringFromUser` | function | `message: Text` | `Text` | — | ask for words: {message} |
| `Thing` | `getDoubleFromUser` | function | `message: Text` | `Number` | — | ask for a number: {message} |
| `Thing` | `getIntegerFromUser` | function | `message: Text` | `WholeNumber` | — | ask for a whole number: {message} |
| `Turnable` | `turn` | procedure | `direction: TurnDirection`, `amount: Number` | — | `duration`, `animationStyle`, `asSeenBy` | turn {direction} {amount} |
| `Turnable` | `roll` | procedure | `direction: RollDirection`, `amount: Number` | — | `duration`, `animationStyle`, `asSeenBy` | roll {direction} {amount} |
| `Turnable` | `turnToFace` | procedure | `target: Thing` | — | `duration`, `animationStyle` | turn to face {target} |
| `Turnable` | `orientToUpright` | procedure | — | — | `duration`, `animationStyle`, `upAsSeenBy` | turn upright |
| `Turnable` | `pointAt` | procedure | `target: Thing` | — | `duration`, `animationStyle`, `upAsSeenBy` | point at {target} |
| `Turnable` | `orientTo` | procedure | `target: Thing` | — | `duration`, `animationStyle` | line up with {target} |
| `Turnable` | `isFacing` | function | `other: Thing` | `Boolean` | — | is facing {other} |
| `Turnable` | `getDistanceTo` | function | `other: Thing` | `Number` | — | distance to {other} |
| `Turnable` | `getDistanceAbove` | function | `other: Thing` | `Number` | `asSeenBy` | distance above {other} |
| `Turnable` | `isAbove` | function | `other: Thing` | `Boolean` | `asSeenBy` | is above {other} |
| `Turnable` | `getDistanceBelow` | function | `other: Thing` | `Number` | `asSeenBy` | distance below {other} |
| `Turnable` | `isBelow` | function | `other: Thing` | `Boolean` | `asSeenBy` | is below {other} |
| `Turnable` | `getDistanceToTheRightOf` | function | `other: Thing` | `Number` | `asSeenBy` | distance to the right of {other} |
| `Turnable` | `isToTheRightOf` | function | `other: Thing` | `Boolean` | `asSeenBy` | is to the right of {other} |
| `Turnable` | `getDistanceToTheLeftOf` | function | `other: Thing` | `Number` | `asSeenBy` | distance to the left of {other} |
| `Turnable` | `isToTheLeftOf` | function | `other: Thing` | `Boolean` | `asSeenBy` | is to the left of {other} |
| `Turnable` | `getDistanceInFrontOf` | function | `other: Thing` | `Number` | `asSeenBy` | distance in front of {other} |
| `Turnable` | `isInFrontOf` | function | `other: Thing` | `Boolean` | `asSeenBy` | is in front of {other} |
| `Turnable` | `getDistanceBehind` | function | `other: Thing` | `Number` | `asSeenBy` | distance behind {other} |
| `Turnable` | `isBehind` | function | `other: Thing` | `Boolean` | `asSeenBy` | is behind {other} |
| `MovableTurnable` | `move` | procedure | `direction: MoveDirection`, `amount: Number` | — | `duration`, `animationStyle`, `asSeenBy` | move {direction} {amount} |
| `MovableTurnable` | `moveToward` | procedure | `target: Thing`, `amount: Number` | — | `duration`, `animationStyle` | move toward {target} by {amount} |
| `MovableTurnable` | `moveAwayFrom` | procedure | `target: Thing`, `amount: Number` | — | `duration`, `animationStyle` | move away from {target} by {amount} |
| `MovableTurnable` | `moveTo` | procedure | `target: Thing` | — | `duration`, `animationStyle`, `pathStyle` | move to {target} |
| `MovableTurnable` | `moveAndOrientTo` | procedure | `target: Thing` | — | `duration`, `animationStyle`, `pathStyle` | move to and line up with {target} |
| `MovableTurnable` | `place` | procedure | `spatialRelation: SpatialRelation`, `target: Thing` | — | `duration`, `animationStyle`, `pathStyle`, `alongAxisOffset` | place {spatialRelation} {target} |
| `MovableTurnable` | `setVehicle` | procedure | `vehicle: Thing` | — | — | ride on {vehicle} |
| `Scene` | `getAtmosphereColor` | function | — | `Color` | — | sky colour |
| `Scene` | `setAtmosphereColor` | procedure | `color: Color` | — | `duration`, `animationStyle` | change the sky colour to {color} |
| `Scene` | `getFromAboveLightColor` | function | — | `Color` | — | light from above |
| `Scene` | `setFromAboveLightColor` | procedure | `color: Color` | — | — | change the light from above to {color} |
| `Scene` | `getFromBelowLightColor` | function | — | `Color` | — | light from below |
| `Scene` | `setFromBelowLightColor` | procedure | `color: Color` | — | — | change the light from below to {color} |
| `Scene` | `getFogDensity` | function | — | `Number` | — | how thick the fog is |
| `Scene` | `setFogDensity` | procedure | `density: Number` (portion) | — | `duration`, `animationStyle` | change the fog to {density} |
| `Ground` | `getPaint` | function | — | `Paint` | — | paint |
| `Ground` | `setPaint` | procedure | `paint: Paint` | — | `duration`, `animationStyle` | paint {paint} |
| `Ground` | `getOpacity` | function | — | `Number` | — | opacity |
| `Ground` | `setOpacity` | procedure | `opacity: Number` (portion) | — | `duration`, `animationStyle` | change opacity to {opacity} |
| `Camera` | `moveAndOrientToAGoodVantagePointOf` | procedure | `entity: Thing` | — | `duration`, `animationStyle` | find a good view of {entity} |
| `Camera` | `getVerticalViewingAngle` | function | — | `Number` | — | viewing angle |
| `Camera` | `setVerticalViewingAngle` | procedure | `angle: Number` | — | — | change the viewing angle to {angle} |
| `Joint` | `getWidth` | function | — | `Number` | — | width |
| `Joint` | `getHeight` | function | — | `Number` | — | height |
| `Joint` | `getDepth` | function | — | `Number` | — | depth |
| `Model` | `getPaint` | function | — | `Paint` | — | paint |
| `Model` | `setPaint` | procedure | `paint: Paint` | — | `duration`, `animationStyle` | paint {paint} |
| `Model` | `getOpacity` | function | — | `Number` | — | opacity |
| `Model` | `setOpacity` | procedure | `opacity: Number` (portion) | — | `duration`, `animationStyle` | change opacity to {opacity} |
| `Model` | `getWidth` | function | — | `Number` | — | width |
| `Model` | `setWidth` | procedure | `width: Number` (positive) | — | `duration`, `animationStyle`, `policy` | change width to {width} |
| `Model` | `resizeWidth` | procedure | `factor: Number` (positive) | — | `duration`, `animationStyle`, `isVolumePreserved` | resize width by {factor} |
| `Model` | `getHeight` | function | — | `Number` | — | height |
| `Model` | `setHeight` | procedure | `height: Number` (positive) | — | `duration`, `animationStyle`, `policy` | change height to {height} |
| `Model` | `resizeHeight` | procedure | `factor: Number` (positive) | — | `duration`, `animationStyle`, `isVolumePreserved` | resize height by {factor} |
| `Model` | `getDepth` | function | — | `Number` | — | depth |
| `Model` | `setDepth` | procedure | `depth: Number` (positive) | — | `duration`, `animationStyle`, `policy` | change depth to {depth} |
| `Model` | `resizeDepth` | procedure | `factor: Number` (positive) | — | `duration`, `animationStyle`, `isVolumePreserved` | resize depth by {factor} |
| `Model` | `resize` | procedure | `factor: Number` (positive) | — | `duration`, `animationStyle` | resize by {factor} |
| `Model` | `say` | procedure | `text: Text` | — | `duration`, `textScale`, `textStyle`, `fontType`, `fontColor`, `bubbleFillColor`, `bubbleOutlineColor`, `bubblePosition` | say {text} |
| `Model` | `think` | procedure | `text: Text` | — | `duration`, `textScale`, `textStyle`, `fontType`, `fontColor`, `bubbleFillColor`, `bubbleOutlineColor`, `bubblePosition` | think {text} |
| `JointedModel` | `getJoint` | function | `joint: JointId` | `Joint` | — | {joint} |
| `JointedModel` | `getJointChain` | function | `chain: JointChain` | `Joint[]` | — | all of the {chain} |
| `JointedModel` | `straightenOutJoints` | procedure | — | — | `duration`, `animationStyle` | straighten out joints |
| `Billboard` | `getBackPaint` | function | — | `Paint` | — | back paint |
| `Billboard` | `setBackPaint` | procedure | `paint: Paint` | — | `duration`, `animationStyle` | paint the back {paint} |
| `Text` | `getValue` | function | — | `Text` | — | words |
| `Text` | `setValue` | procedure | `text: Text` | — | — | change the words to {text} |
| `Flyer` | `foldWings` | procedure | — | — | `duration`, `animationStyle` | fold wings |
| `Flyer` | `spreadWings` | procedure | — | — | `duration`, `animationStyle` | spread wings |
<!-- /reference:alice-blocks -->

### 6.2 Added by StoryStage

<!-- reference:new-blocks -->
| Class | Block | Kind | Parameters | Returns | Details | Words |
| --- | --- | --- | --- | --- | --- | --- |
| `Scene` | `goToScene` | procedure | `scene: SceneId` | — | — | go to {scene} |
| `Scene` | `fadeToBlack` | procedure | — | — | `duration` | fade to black |
| `Scene` | `crossfade` | procedure | `scene: SceneId` | — | `duration` | crossfade to {scene} |
| `Camera` | `frameShot` | procedure | `shot: ShotType`, `targets: Thing[]` | — | `duration`, `animationStyle` | frame a {shot} of {targets} |
| `Model` | `speakLine` | procedure | `text: Text` | — | `duration`, `line` | speak line {text} |
| `JointedModel` | `playAnimation` | procedure | `clip: AnimationClip` | — | — | play animation {clip} |
| `Biped` | `walkTo` | procedure | `target: Thing` | — | — | walk to {target} |
| `Biped` | `runTo` | procedure | `target: Thing` | — | — | run to {target} |
| `Biped` | `sitOn` | procedure | `target: Thing` | — | — | sit on {target} |
| `Biped` | `standUp` | procedure | — | — | — | stand up |
| `Biped` | `lieDown` | procedure | — | — | — | lie down |
| `Biped` | `fall` | procedure | — | — | — | fall |
| `Biped` | `touch` | procedure | `target: Thing` | — | — | touch {target} |
| `Biped` | `reachFor` | procedure | `target: Thing` | — | — | reach for {target} |
| `Biped` | `pickUp` | procedure | `target: Thing` | — | — | pick up {target} |
| `Biped` | `putDown` | procedure | `target: Thing` | — | — | put down {target} |
| `Biped` | `enterFrom` | procedure | `edge: SceneEdge` | — | — | enter from {edge} |
| `Biped` | `exitTo` | procedure | `edge: SceneEdge` | — | — | exit to {edge} |
| `Biped` | `gesture` | procedure | `gesture: Gesture` | — | — | gesture {gesture} |
| `Biped` | `showExpression` | procedure | `expression: Expression` | — | — | look {expression} |
| `Biped` | `lookAt` | procedure | `target: Thing` | — | — | look at {target} |
<!-- /reference:new-blocks -->

### 6.3 Joints

A jointed model's parts are reached with `getJoint(joint)`, which replaces Alice's getter per joint (`getLeftElbow` is `getJoint(leftLowerArm)`), and `getJointChain(chain)` for a neck or tail.

Joint names are those of the StoryStage joint map. Humanoids use the VRM 1.0 bone names (`leftLowerArm`), each with its H-Anim 2.0 joint, and show Alice's words ("left elbow"). Animals use Alice's joint sets in camel case (`backLeftHock`). The map is `packages/backstage/src/joints.ts` in the StoryStage repository, described in `docs/spec/17-backstage.md`, section 2a. Which joints a model has depends on the model.

## 7. Events

<!-- reference:events -->
| Event | Needs | Gives the handler | Details | Words |
| --- | --- | --- | --- | --- |
| `sceneStart` | — | — | — | when the scene starts |
| `clickOnScreen` | — | `x: Number`, `y: Number` | `multipleEventPolicy` | when the screen is clicked |
| `clickOnObject` | — | `model: Model`, `x: Number`, `y: Number` | `setOfVisuals`, `multipleEventPolicy` | when an object is clicked |
| `keyPress` | — | `key: Key` | `heldKeyPolicy`, `multipleEventPolicy` | when a key is pressed |
| `arrowKeyPress` | — | `moveDirection: MoveDirection`, `turnDirection: TurnDirection` | `heldKeyPolicy`, `multipleEventPolicy` | when an arrow key is pressed |
| `numberKeyPress` | — | `number: WholeNumber` | `heldKeyPolicy`, `multipleEventPolicy` | when a number key is pressed |
| `moveWithArrowKeys` | `object: MovableTurnable` | — | — | move {object} with the arrow keys |
| `timer` | `seconds: Number` | `seconds: Number` | `multipleEventPolicy` | every {seconds} seconds |
| `collisionStart` | `setA: Thing[]`, `setB: Thing[]` | `a: Thing`, `b: Thing` | `multipleEventPolicy` | when {setA} touches {setB} |
| `collisionEnd` | `setA: Thing[]`, `setB: Thing[]` | `a: Thing`, `b: Thing` | `multipleEventPolicy` | when {setA} stops touching {setB} |
| `proximityEnter` | `setA: Thing[]`, `setB: Thing[]`, `distance: Number` | `a: Thing`, `b: Thing` | `multipleEventPolicy` | when {setA} gets within {distance} of {setB} |
| `proximityExit` | `setA: Thing[]`, `setB: Thing[]`, `distance: Number` | `a: Thing`, `b: Thing` | `multipleEventPolicy` | when {setA} gets further than {distance} from {setB} |
| `viewEnter` | `set: Model[]` | `model: Model` | `multipleEventPolicy` | when {set} comes into shot |
| `viewExit` | `set: Model[]` | `model: Model` | `multipleEventPolicy` | when {set} leaves shot |
<!-- /reference:events -->

A handler receives what the event gives by name, rather than an event object. `timer` always has a number of seconds. `multipleEventPolicy` says what happens if the event fires again while its handler is running; the default is to ignore it.

## 8. Programs

A program is JSON, described by [`program.schema.json`](program.schema.json). It names the Story API by plain strings, so it doesn't change when the vocabulary grows:

- a call to a block is `{kind: 'call', callee: {kind: 'story', name: 'move'}, args: {direction, amount}, details: {duration}}`, with arguments by parameter name;
- a value from a value type is `{kind: 'enum', type: 'MoveDirection', value: 'forward'}`; a joint is `{kind: 'enum', type: 'JointId', value: 'leftLowerArm'}`;
- `Paint` beyond a colour, `Audio`, `SceneId` and `AnimationClip` are text;
- a type is `{kind: 'story', name: 'Biped'}`, and 3D text is `TextModel`;
- an event handler is a `listener` whose `event` is an event's name, `args` what it needs and `params` what it gives.

A program is valid for the Story API when every block exists on its target's class, every parameter is given, nothing extra is, and every value fits its type. An implementation should never refuse a program for a value whose type it can't know, such as an empty slot. The program format has its own version (`schemaVersion`), separate from this specification's.

## 9. Left out from Alice

<!-- reference:dropped -->
| Left out | Why |
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
| `Key.*` | Only the keys listed under `Key` are kept: function keys, keypads and input-method keys are left out, because many school keyboards and iPads lack them. |
| `TimerFrequency.ASAP` | “As often as possible” can’t work with a time-slice budget, so a timer always has a number of seconds. |
| `Scale.IDENTITY` | No block that is kept uses it. |
| `VantagePoint.IDENTITY` | No block that is kept uses it. |
<!-- /reference:dropped -->

An implementation that imports Alice worlds should report each of these in plain words when a world uses one.

## 10. Versions

From version 1.0, the Story API keeps the same promise as the StoryStage program format:

- **Semantic versions.** A patch changes words or explanation, never meaning. A minor version adds something (a block, detail, event or value) and changes nothing a program already uses. A major version renames, removes or changes the meaning of something.
- **Nothing disappears suddenly.** A block, detail, event or value deprecated in one major version is still read, by translating it to its replacement, for two more major versions.
- **Every change is in the [changelog](CHANGELOG.md),** with its reason.

Before 1.0 (now), any version may change anything, and the changelog says what did.

## 11. Proposing a change

The StoryStage project maintains the Story API, and its owner edits it and decides every change.

Anyone may propose a change: teachers, the Alice community, other implementers and learners. Open an issue at [github.com/storystage/storystage2](https://github.com/storystage/storystage2/issues) whose title starts "Story API:", or, without a GitHub account, use the contact details on storystage.org once the site is live. A good proposal says:

- what a learner or teacher wants to do and can't, with an example scene;
- the block, detail, event or value it would add or change, and its words;
- what Alice, BML or an engine calls the same thing, if anything does;
- what it would do to programs already written.

The owner decides when ready, with no fixed period for comment. Each accepted change is recorded in the changelog with its reason, and each declined proposal gets its reason on its issue.

## 12. Licence

- **The text** of this specification (this reference, the crosswalk and the changelog) is licensed under the [Creative Commons Attribution 4.0 International licence (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). Credit: "From the StoryStage Story API (storystage.org), CC BY 4.0".
- **The JSON files** (`story-api.json`, `story-api.schema.json`, `program.schema.json`) are licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0), like StoryStage's code, which includes a patent grant to everyone who implements them.
- The StoryStage name and logo aren't covered by either licence.

The vocabulary follows Alice 3's. StoryStage contains no Alice code. Alice is a trademark of Carnegie Mellon University.

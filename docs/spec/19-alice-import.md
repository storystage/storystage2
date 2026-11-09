# 19 Alice import

- **Covers:** Reading Alice 3 worlds (`.a3p`) and turning them into one-scene StoryStage productions: classes, objects and their set-up, methods, statements, values and events, and the report of everything that can't come across
- **Work package:** WP9 (9.1 reading, 9.2 mapping, 9.3 marking)
- **Owner:** S6
- **Status:** written by S6, 8 Nov 2026, before the code, from a survey of Alice's 34 starter projects, and built: section 1 is `readA3p` (#238), section 2 `decodeAlice` (#267), sections 3 and 4 `importSetUp` (#269), sections 5 and 6 `buildProgram` (#275), and sections 7 and 8 `importAliceWorld`. All 34 starter projects import, save and open again, with every gap reported, and stand-ins carry their Alice size (`StandIn.size`, #291). That is WP9's done-when: the owner dropped the TR1 evaluation worlds on 9 Nov 2026, since no Alice copies of them exist and the starters cover them.

## 0. Decisions this spec relies on

- [0069](../decisions/0069-importing-alice-worlds.md): gallery classes go unless the learner made them their own; a missing block leaves a note in its place; a model not in Backstage gets a labelled stand-in; a world's start goes into the scene's set-up.
- `02-story-api.md`: the Story API's classes, blocks, details, values and events, each with the Alice members it replaces (`alice`), and what was left out (`dropped.ts`, with reasons). Directions in glTF's axes rather than Alice's (section 1).
- `03-production-format.md`: scenes (section 2), `SceneSetup`, and `manifest.origin: 'alice'` for an imported world.
- `15-security.md`, section 3: imported files. `17-backstage.md`: Backstage ids are Alice's gallery paths where there is one.

## 1. Reading the file (9.1)

`readA3p` (`@storystage/a3p-import`) reads an `.a3p` through the one archive reader, with its own strict XML reader, and gives the version, the program's XML tree, the resources and the thumbnail (`packages/a3p-import/README.md`). Everything below works on what it gives.

## 2. Alice's XML

Alice writes its AST as one tree of `<node type="org.lgna.project.ast.…" key="…">`. Each node's fields are `<property name="…">` holding a `<value type="…">` (a string, number, boolean or enum, or `isNull`), a `<collection>`, or another `<node>`.

1. **A node is written in full once,** where it's first met, with its `key`. Later uses are `<node key="…"/>` with nothing inside. `decodeAlice` resolves them into a graph, so a method called in ten places is one method. A use of a key never defined is refused as damaged.
2. **Alice's own classes, methods and fields** are `JavaType`, `JavaMethod`, `JavaField`, `JavaConstructor` and their parameters, named rather than written out: `<method name="move"><declaringClass name="org.lgna.story.SMovableTurnable"/>…`. They're matched to the Story API by those names (section 5).
3. **Only node types in the table below are expected.** Any other is reported (section 7) with its place, and the rest of the world still imports.

| Alice node | Becomes |
|---|---|
| `NamedUserType` | A class, or nothing (section 3) |
| `UserField` | A field, or a scene object (section 4) |
| `UserMethod`, `UserParameter` | A method and its parameters (procedure or function by `returnType`) |
| `BlockStatement` | A list of statements |
| `ExpressionStatement` of a `MethodInvocation` | A call (section 5) |
| `LocalDeclarationStatement`, `UserLocal` | A local variable |
| `ConditionalStatement`, `BooleanExpressionBodyPair` | `if`, with `else if` as an `if` in the `else` |
| `CountLoop`, `WhileLoop`, `ForEachInArrayLoop`, `DoTogether`, `EachInArrayTogether`, `DoInOrder` | `count`, `while`, `for each in`, `do together`, `each in together`, `do in order` |
| `ReturnStatement` | `return` |
| `Comment` | A note |
| `isEnabled` false on any statement | The statement switched off |
| `ThisExpression`, `FieldAccess`, `ParameterAccess`, `LocalAccess` | `this`, a field, a parameter, a local |
| `DoubleLiteral`, `IntegerLiteral`, `StringLiteral`, `BooleanLiteral` | Number, whole number, words, true or false |
| `ArithmeticInfixExpression`, `RelationalInfixExpression`, `ConditionalInfixExpression`, `LogicalComplement`, `StringConcatenation` | The program's arithmetic, comparison, logic and join |
| `JavaField` of an enum (`MoveDirection.FORWARD`) | The Story API value of the same meaning (section 5.3) |
| `LambdaExpression` in `initializeEventListeners` | An event listener (section 6) |
| `ResourceExpression` | A picture or sound the world carries |

## 3. Classes

An Alice world is a `Program` type holding a `Scene` type, and a type for each gallery object.

1. **`Program` goes.** It only starts the scene (`main`, `initializeInFrame`, `setActiveScene`), which StoryStage's player does. Nothing in it is reported.
2. **The scene's type becomes the scene's class,** extending `Scene`, named as in Alice ("Scene"). Its `myFirstMethod` becomes the scene's script method (`Scene.method`, `03-production-format.md` section 2).
3. **Alice's scene plumbing goes:** `performGeneratedSetUp` becomes the set-up (section 4); `handleActiveChanged`, `preserveStateAndEventListeners` and `restoreStateAndEventListeners` go without a report; `initializeEventListeners` becomes listeners (section 6). `performCustomSetup`, where a learner may write set-up code, becomes statements at the start of the script method, if it has any.
4. **A gallery class goes unless the learner made it their own** (0069). Alice marks what it generated (`managementLevel` other than `NONE`): the resource constructor, `set…Resource` and joint getters such as `getLeftGate`. A class with nothing else goes, and its object's field has the Story API class of its Alice superclass (`SBiped` is `Biped`, `02-story-api.md` section 1). A class with a method or field of the learner's is kept, extending that Story API class, with only the learner's members.
5. **Other learner-made classes** are kept as they are.

## 4. Objects and the set-up

0069: a world's start goes into the scene's set-up (`scenes/<id>.json`, `SceneSetup`).

1. **A scene field created from the gallery is a scene object:** `new Alice(AliceResource.DEFAULT)` gives an object whose id is the field's name, whose class is the field's Story API class, and whose field has `initial: null`, as `checkReferences` asks.
2. **Its model:** the resource class names the Alice gallery model: `org.lgna.story.resources.prop.MangoTreeResource` is `Prop/MangoTree`, the key in the licence audit's appendix A. The import asks Backstage for the item whose id ends in that key, ignoring the theme folder Backstage ids add (`Quadruped/Cat/AbyssinianCat` matches `Quadruped/AbyssinianCat`). If Backstage has it, that's the model. If not, the object gets a **labelled stand-in** with the model's name in words ("Mango tree"), and the report says so once per model (0069). A Sims 2 model (appendix A's other 95) gets a stand-in too, and the report says StoryStage will never have it.
3. **The variant** (`DEFAULT`, `SHORT_BROWN`) picks Backstage's variant of that model where it has one, else the model, and is named in the report.
4. **`performGeneratedSetUp`'s calls become the set-up,** object by object:

    | Alice | Set-up |
    |---|---|
    | `setVehicle` | `vehicle`: the scene (`null`) or another object |
    | `setPositionRelativeToVehicle` | `transform.position`, in the vehicle's space |
    | `setOrientationRelativeToVehicle` | `transform.rotation`, in the vehicle's space |
    | `setSize` | `transform.scale`: the size over the model's own size from Backstage. For a stand-in, the size itself (see "Needs") |
    | `setPaint` (a `Color`) | `paint`: the colour's name in the Story API's list, else `#rrggbb` |
    | `setOpacity` | `opacity` |
    | `setName` | Nothing: the field's name is the object's id |
    | The camera's vehicle, position and orientation | `camera.transform` |
    | `SGround.setPaint` (a `SurfaceAppearance`) | `backdrop.ground`, if Backstage has a ground for it; else the default ground, reported |
    | `SGround.setOpacity`, `SGround.setVehicle` | Nothing, at their defaults; reported otherwise |
    | `SScene.setAtmosphereColor`, `setFromAboveLightColor`, `setFromBelowLightColor`, `setFogDensity` | Statements at the start of the script method, using the Story API's blocks (`setAtmosphereColor` and the rest), since the backdrop names Backstage items rather than colours. Not reported: nothing is lost |
    | `SMarker.setVehicle`, its position and orientation, `setColorId` | A marker in `markers`, named as the field |
    | Any other call | Kept as a statement at the start of the script method, and reported (0069) |

5. **Axes.** Alice's forward is -Z and StoryStage's is +Z (`02-story-api.md` section 1). The whole world turns half a turn about Y: a position `(x, y, z)` becomes `(-x, y, -z)`, and an orientation `q` becomes `h q h⁻¹`, where `h` is the half turn. Each model is already turned to face +Z (`17-backstage.md`, rule 3), so an object that faced the camera in Alice faces it in StoryStage. A test checks it with a known world.

## 5. Code

### 5.1 Calls

1. **A call of one of Alice's methods** is matched to the Story API entry whose `alice` list names it (`SMovableTurnable.move` is `move`), on the object's class. Its arguments become the entry's parameters in order (Alice's `requiredArguments`), and its keyed arguments become details by name (`duration`, `animationStyle`, `asSeenBy` and the rest).
2. **A call of a learner's method** is a call of that method.
3. **A member Alice has and the Story API left out** (`dropped.ts`) leaves a **note in its place** (0069): "In Alice: cat move toward chair. StoryStage leaves this out: (the reason from `dropped.ts`)". The note keeps the statement's switched-off state. The report lists it with its method and position.
4. **A member neither has nor left out** (newer Alice, or an Alice extension) leaves the same kind of note, with "StoryStage doesn't know this Alice block", and is reported.
5. **An argument a block doesn't take,** or a value of the wrong kind, keeps the block and drops the argument, and is reported.

### 5.2 Joints

`getJoint` with Alice's `JointId` (`LEFT_SHOULDER`) becomes `getJoint` with the joint map's id, through `jointFromAlice` (`@storystage/backstage`). `getJointArray` becomes `getJointChain` where Alice's array is a chain the Story API has (`neck`, `tail`), else a note. Alice's generated joint getters (`getLeftGate`) become `getJoint` with the model's own joint, named from its Alice name (`17-backstage.md` rule 6).

### 5.3 Values

1. **Alice's enum values** become the Story API value of the same meaning, by the table in `src/values.ts` (`MoveDirection.FORWARD` is `forward`, `TurnDirection.LEFT` is `left`). Alice's names never reach the program. Directions keep their meaning, not their axis: Alice's forward is StoryStage's forward.
2. **Colours:** `Color.RED` is `red`; a colour made from numbers is `#rrggbb`.
3. **A value Alice has and the Story API left out** (`DROPPED_VALUES`) becomes the nearest the report names, or the block's default, and is reported.

## 6. Events

`initializeEventListeners`'s `add…Listener` calls become listeners on the scene: `addSceneActivationListener` is `sceneStart`, and every other is matched through the Story API's events' `alice` lists. The lambda's body becomes the listener's body. Alice's starter worlds have exactly one, `sceneStart` calling `myFirstMethod`; since the script method already runs when the scene starts, that listener goes, unreported, when it does nothing else.

## 7. The report

`importAliceWorld` returns the production and a report: each gap with what it was in Alice (in words, from the Story API's and the gallery's names), where it was (class, method, and the statement's place), and why it couldn't come across. Every message is in plain words and never quotes the file's text beyond names the import has already shown. An import with no gaps has an empty report. WP9's done-when holds the starter projects to that: no errors, or every gap reported.

The report is a list the studio shows after an import, grouped by kind (models, blocks, set-up), with the count of each.

## 8. Marking (9.3)

`manifest.origin` is `alice` (`03-production-format.md`), so a teacher can relax the storyboard rule for the production (WP10.8). The production's title is the file's name without `.a3p`; it has one scene, named after the world's scene type, with no storyboard frames.

## Needs from other sessions

- **`StandIn.size`** (agreed with S4, 9 Nov 2026): a stand-in has no size of its own, so Alice's `setSize` has nowhere to go for a model not in Backstage. `StandIn` gains `size?: Vec3`, in metres, for its box (the contract, in `@storystage/story-api`). Then S4's production format 1.2.0 accepts it, and S3's stage draws and sizes the box from it. Both are in (#287, #288), so the import fills it in, each side clamped to at least 1 cm (Alice gives flat terrain a height of 0) and at most `STAND_IN_SIZE_MAX`.
- **S4 (Backstage):** ground appearances (`SurfaceAppearance.MOON`) as backdrop items, so a world keeps its ground. Until then, the default ground, reported.

## 9. Tests

| What | Where | Kind |
|---|---|---|
| Section 2: keys resolved, a dangling key refused, every expected node type | `packages/a3p-import/src/decode.test.ts` | Unit |
| Sections 3 and 4: classes kept or gone; objects, models, stand-ins and the set-up; axes, with a world whose object faces the camera | `packages/a3p-import/src/world.test.ts` | Unit |
| Sections 5 and 6: calls, details, joints, values, notes for what's missing, events | `packages/a3p-import/src/code.test.ts` | Unit |
| Every result passes `checkProgram` and `checkReferences` | Each of the above | Unit |
| WP9's done-when: Alice's 34 starter projects import, with every gap reported | `packages/a3p-import/src/starters.test.ts`, with `ALICE_STARTERS` | Unit, fetched in CI |
| For other packages' tests: `encodeAlice` (the inverse of `decodeAlice`) and `smallAliceWorld`, a real `.a3p` that imports with a stand-in, a mixed colour and a block left out, and saves and opens again (`@storystage/a3p-import/testing`) | `packages/a3p-import/src/testing.test.ts` | Unit |

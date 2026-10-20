# StoryStage 2: vocabulary crosswalk

How Alice 3, Looking Glass and the open standards (VRM, H-Anim, BML, X3D) and Unreal Engine describe characters' bodies and what characters can do. Use it to:
- set StoryStage 2's joint names (workplan WP3.3);
- design the Story API (WP4);
- find what Alice is missing.

- **Prepared:** 18 Oct 2026.
- **Alice facts** come from the StoryStage 1 repository (Alice 3.9.1 source): `BipedResource`, `QuadrupedResource` and `FlyerResource`, and the `org.lgna.story` classes.
- **Standards facts** come from the VRM 1.0 humanoid specification and the HAnim 2.0 architecture (ISO/IEC 19774), with BML 1.0 and X3D (ISO/IEC 19775) as cited in sources.
- **Unreal Engine names** are given from general knowledge of the UE5 mannequin and Blueprint nodes, and are not checked line by line.

## 1. Who's who

| Name | What it is | Status |
|---|---|---|
| **Alice 3** | CMU's block-based 3D programming environment. Its vocabulary is Java classes in `org.lgna.story` | Open source (CMU EULA); its own formats |
| **Looking Glass** | Washington University's research spin-off of Alice for ages 10+ (Caitlin Kelleher). It added remixing, tutorials and character-level actions. Its *Walk and Touch API* was contributed back into Alice 3 | Research project; Alice 3 keeps traces of it |
| **VRM 1.0** | Humanoid avatar format built on glTF: standard bone names, expressions (facial presets), look-at | Industry specification (VRM Consortium) |
| **H-Anim 2.0** | Humanoid animation: standard joint names at five levels of detail (LOA 0–4), plus motion data | International standard, ISO/IEC 19774 |
| **BML 1.0** | Behavior Markup Language: what a virtual character *does*. It covers speech, gaze, gesture, pointing, posture, locomotion and face, with timing sync points | Research-community standard (XML) |
| **X3D** | Interactive 3D scenes with sensors, timers and events. Includes H-Anim | International standard, ISO/IEC 19775 |
| **Unreal Engine 5** | Epic's game engine. Behaviour through Blueprints (visual scripting), animation montages, AI navigation and Sequencer (cinematics) | Proprietary, source-available; free under $1M revenue |

**How they relate.** Alice and Looking Glass predate or ignore the standards: their joint names and verbs are their own. H-Anim and VRM name **body parts**; BML names **behaviours**; X3D supplies **events and timing**; Unreal supplies **engine machinery** rather than a vocabulary for storytellers. StoryStage 2 sits between them. It keeps Alice's learner-friendly words on the blocks, and maps each one to a standard name underneath.

## 2. Body crosswalk: biped joints

StoryStage 2 proposal: use **VRM bone names as the internal id** (so any VRM, MakeHuman or commissioned character fits), map to **H-Anim** for the standard, and show **Alice's friendly words** on the blocks.

| Block word (Alice) | Alice 3 `BipedResource` | VRM 1.0 bone (req = required) | H-Anim 2.0 joint (lowest LOA) | UE5 mannequin bone | Notes |
|---|---|---|---|---|---|
| (whole body) | `ROOT` | — (hips is the root bone) | `humanoid_root` (LOA-0) | `root` | |
| pelvis | `PELVIS_LOWER_BODY` | `hips` (req) | `sacroiliac` (LOA-1) | `pelvis` | |
| spine base | `SPINE_BASE` | `spine` (req) | `vl5` (LOA-1) | `spine_01` | |
| spine middle | `SPINE_MIDDLE` | `chest` | a thoracic `vt` joint (LOA-2+) | `spine_03` | Spine joint counts differ between standards |
| spine upper | `SPINE_UPPER` | `upperChest` | `vt1` (LOA-2+) | `spine_05` | |
| neck | `NECK` | `neck` | a cervical `vc` joint (LOA-2+) | `neck_01` | |
| head | `HEAD` | `head` (req) | `skullbase` (LOA-1) | `head` | |
| mouth | `MOUTH` | `jaw` | `temporomandibular` (LOA-3+) | — (face rigs vary) | Needed for lip sync |
| left eye | `LEFT_EYE` | `leftEye` | `l_eyeball_joint` (LOA-3+) | — | VRM also has a look-at definition |
| left eyelid | `LEFT_EYELID` | — (VRM uses the *blink* expression) | eyelid joint (LOA-3+) | — | Better as an expression than a joint |
| left collarbone | `LEFT_CLAVICLE` | `leftShoulder` | `l_sternoclavicular` (LOA-2+) | `clavicle_l` | Naming trap: Alice "shoulder" is VRM "upper arm" |
| left shoulder | `LEFT_SHOULDER` | `leftUpperArm` (req) | `l_shoulder` (LOA-1) | `upperarm_l` | |
| left elbow | `LEFT_ELBOW` | `leftLowerArm` (req) | `l_elbow` (LOA-1) | `lowerarm_l` | |
| left wrist | `LEFT_WRIST` | `leftHand` (req) | `l_radiocarpal` (LOA-1) | `hand_l` | |
| left hand | `LEFT_HAND` | — (part of `leftHand`) | — | — | Alice has wrist **and** hand joints; standards have one |
| left thumb (3) | `LEFT_THUMB`, `_KNUCKLE`, `_TIP` | `leftThumbMetacarpal`, `Proximal`, `Distal` | thumb joints (LOA-2+) | `thumb_01–03_l` | |
| left index (3) | `LEFT_INDEX_FINGER`, `_KNUCKLE`, `_TIP` | `leftIndexProximal`, `Intermediate`, `Distal` | (LOA-2+) | `index_01–03_l` | |
| left middle (3) | `LEFT_MIDDLE_FINGER`… | `leftMiddle…` | (LOA-2+) | `middle_01–03_l` | |
| left ring | **none** | `leftRing…` | (LOA-2+) | `ring_01–03_l` | **Gap:** Alice bipeds have no ring finger |
| left little (3) | `LEFT_PINKY_FINGER`… | `leftLittle…` | (LOA-2+) | `pinky_01–03_l` | |
| left hip | `LEFT_HIP` | `leftUpperLeg` (req) | `l_hip` (LOA-1) | `thigh_l` | |
| left knee | `LEFT_KNEE` | `leftLowerLeg` (req) | `l_knee` (LOA-1) | `calf_l` | |
| left ankle | `LEFT_ANKLE` | `leftFoot` (req) | `l_talocrural` (LOA-1) | `foot_l` | |
| left foot | `LEFT_FOOT` | — (part of `leftFoot`) | — | — | Alice has ankle **and** foot joints; standards have one |
| left toes | `LEFT_TOES` | `leftToes` | `l_metatarsophalangeal_2` (LOA-1) | `ball_l` | |
| (right side) | `RIGHT_…` | `right…` | `r_…` | `…_r` | Mirrors the left |

**Unity.** Unity's own humanoid bone names (`HumanBodyBones`: `Hips`, `Spine`, `Chest`, `UpperChest`, `Neck`, `Head`, `Jaw`, `LeftShoulder`, `LeftUpperArm`, `LeftLowerArm`, `LeftHand`, `LeftUpperLeg`, `LeftLowerLeg`, `LeftFoot`, `LeftToes` and the fingers) match the VRM column almost name for name, with a capital first letter. VRM's reference tool, UniVRM, is a Unity package. So using VRM names gives Unity compatibility at no extra cost. This is from comparing the names; I haven't found an official statement that one derives from the other.

**Animals and birds.** Alice defines quadruped joints (for example `FRONT_LEFT_KNEE`, `BACK_LEFT_HOCK`, `LEFT_EAR`) and flyer joints (`LEFT_WING_SHOULDER` to `LEFT_WING_TIP`, `LOWER_LIP`). VRM, H-Anim and the UE5 mannequin define **no** animal skeletons; H-Anim only says non-human figures may use joints in a similar way. **Proposal:** StoryStage 2 publishes Alice's quadruped, flyer, swimmer and slitherer joint sets as its own open extension. They're the best-developed child-friendly animal vocabulary available.

## 3. Behaviour crosswalk: what characters can do

Key:
- **Alice:** **shown** = on the block palette; **hidden** = in Alice's code but tucked away or unfinished.
- **LG** = Looking Glass / Storytelling Alice.

| What the learner wants | Alice 3 | LG | BML 1.0 | X3D | Unreal Engine 5 | StoryStage 2 proposal |
|---|---|---|---|---|---|---|
| Move or turn by an amount | `move`, `turn`, `roll` (shown) | — | (no primitive; `locomotion` is whole-body) | Position/OrientationInterpolator + TimeSensor + ROUTE | Set Actor Location/Rotation, Timeline | Keep |
| Go to a place or object (glide) | `moveTo`, `moveToward`, `moveAwayFrom`, `place` (shown) | — | `locomotion` with a target | Interpolators | Move Component To | Keep |
| **Walk** to something, legs moving | `walkTo` — hidden, implementation commented out | **Walk and Touch: walk** | `locomotion` (walk manner) | (HAnim motion data) | AI MoveTo + navigation mesh + locomotion animation | **Add** (`walk to`, `run to`) with a walk cycle |
| Face or point at something | `turnToFace`, `pointAt`, `orientTo` (shown) | — | `gaze` (body/head/eyes), `pointing` (arm) | (Script) | Find Look at Rotation | Keep, and add `point at` with the arm |
| **Look at** while doing something else | none (turn the head joint by hand) | LookDirection (Walk and Touch) | `gaze`, `gazeShift`, `head` | — | Look At in Control Rig or Animation Blueprint | **Add** `look at` (head and eyes, VRM look-at) |
| Speech bubble | `say`, `think` (shown) | talk, think (Storytelling Alice) | `speech` (text) | Text node | (widget; no built-in) | Keep |
| **Speak aloud with lip sync** | none (`sayOutLoud` commented out) | — | `speech` + lip sync | Sound / AudioClip | Audio + lip-sync tools | **Add** `speak line` (WP14) with visemes |
| **Facial expression** | none (only mouth and eyelid joints) | — | `faceLexeme` (smile, frown…), `faceFacs` | (HAnim displacers) | Morph targets / pose assets | **Add** `show expression` using VRM presets (happy, angry, sad, relaxed, surprised, blink) |
| **Gesture** (wave, nod, shrug, clap) | none built-in; build from joint turns | body positions (Storytelling Alice) | `gesture` (lexemes) | HAnim motion data | Play Montage | **Add** `gesture` from a shared animation library |
| **Pose or posture** (sit, lie down, stand) | `strikePose` — hidden | **SitDirection, FallDirection** (Walk and Touch) | `posture`, `postureShift` | — | Montages + attach | **Add** `sit on`, `stand up`, `lie down`, `fall` |
| **Touch, reach, pick up** | `touch`, `reachFor` — hidden, not implemented | **Walk and Touch: touch** | (`pointing` only) | — | IK (Control Rig) + attach to socket | **Add** `touch`, `reach for`, `pick up`, `put down` (attach to hand) |
| Enter or leave the scene | none | ExitDirection (Walk and Touch) | — | — | Spawn / destroy | **Add** `enter from`, `exit to` |
| **Play an animation clip** | none (Alice animates joints procedurally) | — | (behaviour lexicon) | HAnim motion (ISO/IEC 19774-2) | Play Animation / Montage | **Add** `play animation` for glTF clips (idle, walk, wave) |
| Do in order / together | do in order, do together, each in together (shown) | same | BML blocks run together; `wait` | ROUTE chains | Sequence node; Sequencer tracks | Keep |
| **Sync to a moment** ("wave when she says hello") | durations only | — | **sync points** (start, ready, stroke, end) | TimeSensor events | Anim notifies; Sequencer | **Add** later: start-when blocks |
| Camera | camera markers, `moveAndOrientToAGoodVantagePointOf` | — | — | Viewpoint | CineCamera + Sequencer camera cuts | Keep, and add shot types (close-up, wide) |
| Events | when the scene starts, mouse click, key press, timer, proximity, collision | same | — | TouchSensor, KeySensor, TimeSensor, ProximitySensor, Collision | OnClicked, input actions, timers, overlap, hit | Keep |
| Several scenes | `setActiveScene` exists, not in the IDE | — | — | Inline / load URL | Level streaming; Sequencer shots | Add (WP8, already planned) |

## 3a. Programming concepts: Alice blocks and Unreal Blueprints

Blueprints are Unreal's visual scripting language: nodes joined by wires, used for all game logic. This table shows how Alice's concepts carry over, and what a learner would meet for the first time in Unreal.

| Concept | Alice 3 / StoryStage 2 | Unreal Blueprints | Gap or note |
|---|---|---|---|
| Start | when the scene starts → `myFirstMethod` | Event BeginPlay | Same idea |
| One after another | do in order | Execution wires (left to right); Sequence node | Same idea |
| At the same time | **do together** | No direct node; separate timelines, montages or latent nodes overlap | **Alice is simpler and clearer** here |
| Repeat | count, while, for each | For Loop, While Loop, For Each Loop | Same idea |
| Do the same to every item at once | each in together | None (Blueprint loops run in turn) | Alice-only |
| Choose | if / else | Branch, Switch | Add **switch** later |
| Variables and lists | variables, arrays | variables with types; arrays, maps, sets | **Gap:** maps and sets |
| Own data types | none | structs, enums, data tables | **Gap:** simple records ("a costume has a colour and a size") |
| Procedures and functions | procedures, functions with parameters and returns | functions, macros, custom events | Same idea |
| Classes | custom classes based on gallery classes (Backstage in StoryStage 2) | Blueprint classes based on Actor or Character | Same idea |
| Events | click, key, timer, proximity, collision | OnClicked, input actions, Set Timer by Event, overlap, hit | Same idea |
| Objects talking to each other | call another object's procedure | **event dispatchers**, interfaces, casting | **Gap:** a "broadcast a message / when I receive" pair (as Scratch has) |
| Timing and easing | duration; animation style | Delay, **Timeline** with editable curves | **Gap:** a visual easing-curve editor (later) |
| Finding bugs | Rehearse, fast-forward, disable a block | breakpoints, watch values, Print String | **Gap:** breakpoints and watching a value |
| Text form of the code | Java on the side (Alice); Python-like view (StoryStage 2) | none (Blueprints are visual only); C++ alongside | The step to C++ is large; the text view is a bridge |

## 3b. Engine machinery: Unreal and Babylon.js

Unreal's character tools have open equivalents in Babylon.js. StoryStage 2 can hide them behind simple blocks while teaching the same ideas a learner would meet later in Unreal.

| Unreal Engine 5 | What it does | Babylon.js equivalent | StoryStage 2 block |
|---|---|---|---|
| **Animation Sequence / Montage** | Plays recorded clips. A montage strings clips together in named sections, on slots (for example upper body only), with notifies that fire events at chosen frames | AnimationGroups with weights and blending; frame events | `play animation`, `gesture` |
| **Animation Blueprint, state machine, Blend Space** | Blends idle, walk and run by speed and direction | AnimationGroups blended by speed (StoryStage code) | walking and running animate automatically |
| **Navigation mesh + AI MoveTo** | Works out a walkable area and a path round obstacles. Unreal's navigation is built on the open-source **Recast/Detour** library | Babylon's navigation plugin, built on the **same Recast/Detour library** | `walk to` (goes round the tree, not through it) |
| **Behavior Tree / State Tree** | Decision-making for non-player characters | none built in | later: an advanced "character brain" topic |
| **Control Rig** (with IK and look-at) | Rigging in the engine: posing, inverse kinematics (hand to target), look-at; animate with keys in Sequencer, or procedurally | BoneIKController, BoneLookController | `reach for`, `touch`, `look at` |
| **Sequencer** | Film timeline: tracks for characters, cameras and audio, with camera cuts | none built in | the Screening room timeline |
| **MetaHuman** | Highly detailed digital humans | — | stretch character source (section 5) |

## 3c. Unity: what to learn and what to map

| Unity feature | What it does | StoryStage 2 |
|---|---|---|
| **Mecanim Humanoid (Avatar)** | Maps any humanoid model onto a standard bone set, so one animation plays on every character (retargeting) | Same approach through VRM names: one gesture and walk library for all humanoids (workplan WP4.6) |
| **Animator Controller** (state machine) | Blends idle, walk and run; switches states | Automatic walk and run blending (WP4.6) |
| **NavMesh** (AI Navigation package) | Walkable areas and paths, also based on Recast | `walk to` round obstacles (WP4.5) |
| **Animation Rigging package** | IK, look-at and other runtime constraints | `reach for`, `look at` (WP4.5, 4.6) |
| **Timeline** | A film timeline of animation, audio and camera tracks | The Screening room timeline |
| **Cinemachine** | "Smart" virtual cameras that follow, frame or track a target automatically | **Shot types** on storyboard frames and camera blocks: close-up, wide, follow, over-the-shoulder (WP4.10, WP10.6) |
| **Prefabs** | Reusable object templates, edited in one place | Cast members reused across scenes with consistent costume and props |
| **Visual Scripting** and **C#** | Node graphs similar to Blueprints; C# as the main language | C# is a gentler step from the text view than Unreal's C++ |
| **glTFast** (Unity's glTF package, Apache-2.0) | Imports and exports glTF | Models move between StoryStage 2 and Unity |
| **Web export** | Unity can still build for the browser | An export target Unreal no longer offers |
| **AR Foundation** | One AR interface over ARKit (Apple) and ARCore (Android) | Shows the native route for an iPad AR mode (WP21) |

Licence: Unity Personal is free under US$200,000 in annual revenue and funding. Unity cancelled its per-install Runtime Fee in September 2024.

## 3d. AR: formats and viewers

How a StoryStage production maps onto each AR route (workplan WP21, WP22).

| StoryStage 2 | WebXR (Babylon.js) | Google Scene Viewer (GLB) | Apple AR Quick Look (USDZ) | Unity | Unreal |
|---|---|---|---|---|---|
| Place the set on a table | `immersive-ar` session, hit-test, anchors | Automatic placement on a surface | Automatic placement on a surface | AR Foundation plane detection and anchors | ARKit/ARCore through Unreal's AR plugins |
| Cast animation (code-driven) | Runs live: the interpreter drives the stage | Baked to glTF animation clips; **only the first animation plays**, looping | Baked to USD skeletal or transform animation, looping | Animator and Timeline | Sequencer and montages |
| Faces (expressions, visemes) | Live | Morph targets not supported: bake to bones or drop | Check in the USDZ spike (WP22.3) | Blend shapes | Morph targets |
| Sound and speech | Live, with captions | One looping sound through the `sound` parameter, synced to the first animation | Embedded audio | Audio sources | Sound cues |
| Taps and branching | Yes (events) | No | No | Yes (scripts) | Yes (Blueprints) |
| Several scenes | Set changes in one session | One GLB per scene, chosen from a web page | One USDZ per scene | Scenes or Timeline | Levels or Sequencer |
| Size | Device budgets (WP3.9) | About 10 MB and 100,000 triangles recommended | Kept small for sharing | Project-specific | Project-specific |

**What this teaches.** Interactive AR needs a running program (StoryStage, Unity or Unreal). The open viewers only play baked animation. That is the same split as between a game engine and a video file, and it is a useful idea for learners on the pathway.

## 3e. Code editors: Alice's tiles, option B and option C

What each code editor keeps of Alice 3's editor (checked against the StoryStage 1 code: `AliceFormatter` and `JavaFormatter`, the "Java code on the side" option, and about 170 cascading-menu classes).

| Alice 3 editor feature | Option B: Blockly, Alice-style | Option C: tile editor in React |
|---|---|---|
| Statements as text-like rows | Custom renderer | Native |
| Do in order, do together containers | Statement blocks with inputs | Native |
| Arguments asked for on drop (cascading menus) | Prompt on drop, then default values in slots | Native |
| No invalid or loose code | Loose blocks disabled automatically; typed connections | Native |
| "Add detail" for optional arguments | Mutator or an "add detail" field | Native |
| One method per tab | One workspace per method | Native |
| Switch a statement off | Block disable | Native |
| Alice or Java wording (two formatters) | Text view wording switch | Text view wording switch, and optionally on the tiles |
| Java code on the side | Read-only text view | Read-only text view |
| Keyboard and screen reader | Blockly keyboard plugin; screen-reader support planned by the Raspberry Pi Foundation | Built from scratch (WP7.8) |

Both editors are views over the same program (the AST) and use the same edit operations, so they can be switched at any time. A pilot study chooses between them (workplan WP7.11–7.13, WP19.5–19.8).

## 3f. Projection mapping: StoryStage to Pixera

| StoryStage 2 | Pixera | Notes |
|---|---|---|
| Projection stage surface (template or built) | Screen object imported into Screens (OBJ, FBX or glTF) | Triangles, even vertices, one material per projectable surface, UVs 0–1, metres |
| Virtual projector (position, aim, throw ratio, resolution) | Projector in Mapping mode, from its projector and lens database | Placed manually by the operator; positions are in StoryStage's show file |
| Scene running order and transitions | Timeline, layers, clips and cues | Clips and cues built by the API script; the timeline itself is created by hand |
| Surface bake (production in the surface's UV layout) | Media on a layer mapped to the screen | PNG sequence or VP9; HAP from the desktop app if the check passes |
| Soundtrack | Audio clip (WAV) | |
| Classroom warp (corner pin, mesh) | Warping, soft-edge blending and calibration (marker, VIOSO) | Pixera adds multi-projector blending and calibration |

The same split as in AR: StoryStage is where content is made and planned; the professional tool runs, blends and calibrates the show.

## 4. Gaps where Alice needs extending

In order of value to storytelling:
1. **Character-level actions.** `walkTo`, `touch` and `reachFor` are in Alice's code but hidden and unimplemented, a leftover of Looking Glass's Walk and Touch API. StoryStage 2 should finish the job:
    - walk or run to;
    - sit, stand, lie down, fall;
    - touch, reach for, pick up and put down;
    - enter and exit.

    Storytelling Alice found these are what learners' stories need most.
2. **Animation clips.** Alice can't play a recorded animation; everything is joint turns. glTF characters (MakeHuman, Kenney, commissioned) bring clips such as idle, walk and wave. A `play animation` block, and a shared gesture library, unlock natural movement.
3. **Faces.** Alice has only mouth and eyelid joints. Add VRM-style expressions (happy, sad, angry, surprised, relaxed, blink) and visemes for lip sync.
4. **Gaze separate from body.** `look at` that turns the head and eyes, while the body does something else.
5. **Speaking aloud.** `speak line` with on-device voices, captions and lip sync (BML `speech`).
6. **Timing by moments.** BML-style sync points, so actions line up with words, not only with durations.
7. **Skeleton details.** Add the ring finger. Resolve Alice's extra wrist/hand and ankle/foot joints by mapping both to the single standard bone.
8. **Animals.** No standard exists. Publish Alice's animal joint sets as StoryStage's open extension.
9. **Walking round obstacles.** Use a navigation mesh (Recast/Detour) so `walk to` finds a path.
10. **Programming concepts on the way to Blueprints** (later, for older learners):
    - broadcast messages between objects;
    - simple records (own data types);
    - maps;
    - switch;
    - breakpoints and watching values;
    - an easing-curve editor.

## 5. Unreal Engine

- **Its "language" for actions:**
    - **Blueprints**, a general-purpose visual scripting system for the whole engine;
    - **Animation Blueprints** and **montages** for character motion;
    - **AI MoveTo** with a navigation mesh for walking;
    - **Control Rig** for look-at and inverse kinematics;
    - **Sequencer**, a film-style timeline, for cinematics.

  There is no storyteller's vocabulary such as "walk to the tree". Making a character walk to an object needs an AI controller, a navigation mesh and a locomotion Animation Blueprint.
- **More or less intuitive?** Far more powerful, and much less intuitive for 10–14-year-olds. Alice's "cat walk to tree" is one block; Unreal needs a configured project and many nodes. Sequencer is intuitive for film-making, but it is a timeline, not code. It's worth borrowing as the model for the Screening room's timing view.
- **glTF:** Unreal imports glTF (Epic documents glTF import for UE 5.8 through its Interchange framework) and has a glTF exporter plugin. So assets can move between StoryStage 2 and Unreal.
- **Licence:**
    - free under US$1M annual revenue, and free for schools and educators;
    - games pay 5% royalty above US$1M;
    - non-game commercial users above US$1M pay US$1,850 per seat a year.

  Since June 2025, MetaHuman characters are under the Unreal EULA and may be used in other engines.
- **Should StoryStage 2 use Unreal? No, as its engine.**
    - **No web build:** Unreal's HTML5/WebGL export was dropped after UE 4.24, so it breaks the browser version and the one-codebase plan.
    - **Too heavy:** packaged apps are large and demanding, unsuitable for 4 GB Chromebooks.
    - **Streaming needs servers:** Unreal's pixel streaming would contradict "no StoryStage server".
    - **Different language:** C++ and Blueprints, not TypeScript.
- **Simplifying MetaHumans.**
    - MetaHumans come with several built-in levels of detail (LODs). A third-party guide quotes about 260,000 triangles at the most detailed level, falling to about 30,000 and then 5,000 at the lower levels.
    - The lower LODs, exported and cleaned up, are the realistic starting point.
    - Open tools can reduce further: meshoptimizer and glTF-Transform's `simplify` (both MIT), and Blender's Decimate modifier. Unreal also has its own mesh-reduction tools.
    - Simplygon is the professional option, now a paid product.
    - The hard parts are the hair (strand grooms must become simple cards or textures) and the face rig, which is far more complex than a jaw and eyelids.
    - So: possible for a few hero characters, after a trial, not for the whole of Backstage.
- **Where Unreal could fit later:**
    - **A graduation path:** export a StoryStage production (glTF plus a scene and timing description) for older students to open in Unreal, as Alice offered Java for those moving on.
    - **MetaHumans as a source of characters:** licence now allows other engines. They would need heavy simplification for Chromebooks, so this is a stretch option, not core.

## 6. StoryStage 2 as a pathway to industry tools

The crosswalk shows that StoryStage 2 can teach, in simple form, the same ideas a learner meets in Unreal:
- events, loops and functions (Blueprints);
- animation clips and montages;
- navigation meshes;
- look-at and reaching (Control Rig);
- a film timeline (Sequencer);
- glTF assets.

That makes it a natural first step on a pathway:

1. **StoryStage 2 blocks.**
2. **The text view and the "under the hood" names.** For example, `walk to` shows that it uses a navigation mesh.
3. **Export to Unreal** (glTF plus a scene description) or to another engine.
4. **Unreal Blueprints, then C++.**

Two principles for the pathway:
- Keep it **engine-neutral at the core**, with Unreal as the flagship destination. Unity (C#, also strong in education and AR) and Godot (MIT, open source) are other destinations, through the same glTF-plus-scene-description export.
- Name the concepts the way industry does, in the text view and teacher notes.

## 7. Proposed workplan changes

- **WP3.3:** the joint map uses VRM bone names as internal ids, with an H-Anim crosswalk. Alice's words are display names, and Alice's animal joint sets become a published StoryStage extension.
- **WP4:** add the character-level actions, `play animation`, `show expression`, `look at`, `gesture` and `speak line` from section 4. Each block entry records its BML equivalent where one exists.
- **WP4.1:** publish the Story API as an open specification (JSON Schema plus reference) with this crosswalk as an annex.
- **Later:** BML-style sync points; an "Export to Unreal" route.
- **Unity (added 18 Oct 2026):**
    - retargeting through VRM names (WP4.6);
    - smart-camera shot types (WP4.10, WP10.6);
    - export to Unity (WP20.6).
- **AR design mode (added 18 Oct 2026):** a new WP21, with an early trial (WP1.9).
- **AR for audiences and distribution (added 18 Oct 2026):** a new WP22: the player's AR mode, a baker, AR packs (GLB for Scene Viewer, USDZ for Quick Look, a model-viewer page and QR codes) and mixed-reality films. **AR trails** are on the roadmap for release 2 (workplan section 6b).
- **Code editors (added 18 Oct 2026):** two editors in the first release, Blockly made Alice-like (option B) and a rebuilt Alice-style tile editor (option C), with a switch and a pilot study to choose (WP7, WP7c, WP19.5–19.8).
- **Projection mapping (added 18 Oct 2026):** a new WP23: Projection stage, classroom projection, and Export for projection including Export to Pixera.
- **After the board reviews (18 Oct 2026):** one scene-exchange format (`16-scene-exchange.md`), produced by the AR baker and consumed by the Unreal, Unity and Godot exports and Export for projection; the pathway's first rung is the text view to Python (KS3 and GCSE), before Unreal and Unity; WP20 to WP23 start after the release candidate.

## Sources

- StoryStage 1 repository (Alice 3.9.1 source): `core/story-api` (`SBiped.walkTo`, `touch`, `reachFor` marked `TUCKED_AWAY`; `walkTo` body commented out; `SFlyer.walkTo` shows "todo"), `core/models` resource classes, and `AliceFormatter` (Walk and Touch API enum names)
- [VRM 1.0 humanoid specification](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/humanoid.md)
- [HAnim 2.0 architecture concepts (ISO/IEC 19774)](https://web3d.org/documents/specifications/19774/V2.0/Architecture/concepts.html)
- [Web3D: HAnim, glTF and VRM comparison](https://www.web3d.org/blog/anitahavele/hanim-gltf-and-vrm-comparison)
- [BML 1.0 standard](https://projects.cs.ru.is/projects/behavior-markup-language/wiki)
- [ISO/IEC 19775-1:2023 (X3D)](https://webstore.iec.ch/publication/90755)
- [Looking Glass publications](https://lookingglass.wustl.edu/help/publications)
- [Unreal Engine: importing glTF files](https://dev.epicgames.com/documentation/unreal-engine/importing-gltf-files-into-unreal-engine)
- [Unreal Engine licence](https://www.unrealengine.com/en-US/license)
- [CG Channel: MetaHumans usable in other engines (June 2025)](https://www.cgchannel.com/2025/06/you-can-now-sell-metahumans-or-use-them-in-unity-or-godot/)
- [Unreal forums: HTML5 support removed after 4.24](https://forums.unrealengine.com/t/html5-support/1362189)
- [Unity: Runtime Fee cancelled; Unity Personal threshold (Sept 2024)](https://unity.com/blog/unity-is-canceling-the-runtime-fee)
- [Unity glTFast (Apache-2.0)](https://github.com/Unity-Technologies/com.unity.cloud.gltfast)
- [Unity HumanBone documentation](https://docs.unity3d.com/460/Documentation/ScriptReference/HumanBone.html)
- [UniVRM / VRM development](https://vrm.dev/en/vrm/vrm_development/)
- [WebXR browser support (May 2026)](https://www.testmuai.com/learning-hub/webxr-compatible-browsers/)
- [Google: Scene Viewer for 3D models in AR](https://developers.google.com/ar/develop/java/scene-viewer)
- [Google: model-viewer for WebXR AR](https://developers.google.cn/ar/develop/webxr/model-viewer)
- [Apple: AR Quick Look](https://developer.apple.com/augmented-reality/quick-look/)
- [Netguru: AR Quick Look and USDZ](https://netguru.com/blog/ar-quick-look-and-usdz)
- [three.js USDZExporter](https://threejs.org/docs/pages/USDZExporter.html)
- [Pixera: supported file formats](https://pixera.helpjuice.com/supported-file-formats)
- [Pixera: 3D workflows](https://pixera.helpjuice.com/screens-/3d-workflows)
- [Pixera: API commands](https://pixera.helpjuice.com/api-commands)
- [Pixera: licences](https://pixera.helpjuice.com/pixera-licences-)
- [Pixera: system requirements](https://pixera.helpjuice.com/project-management/pixera-system-requirements)
- [MapMap (GPL-3.0)](https://github.com/mapmapteam/mapmap)
- [Mediated Transfer: Alice 3 to Java (Dann et al., SIGCSE 2012)](https://www.alice.org/wp-content/uploads/2017/04/MediatedTransfer.pdf)
- [Raspberry Pi Foundation: the new home for Blockly](https://www.raspberrypi.org/blog/new-home-for-blockly/)
- [Unreal Engine: Animation Montage](https://dev.epicgames.com/documentation/unreal-engine/animation-montage-in-unreal-engine)
- [Unreal Engine: animating with Control Rig](https://dev.epicgames.com/documentation/unreal-engine/animating-with-control-rig-in-unreal-engine)
- [Unreal Engine: Behavior Tree MoveTo task](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/AIModule/UBTTask_MoveTo)
- [glTF-Transform simplify (meshoptimizer)](https://gltf-transform.dev/modules/functions/functions/simplify)
- [MetaHuman best practices (third-party guide; LOD figures)](https://aischool.lillytechsystems.com/metahuman-unreal/best-practices.html)
- [TechRaptor: Simplygon free tier ended](https://techraptor.net/gaming/news/simplygon-free-tier-abolished)

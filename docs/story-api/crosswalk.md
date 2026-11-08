# Annex A: crosswalk

Part of [the StoryStage Story API](README.md). CC BY 4.0.

Each block and event beside Alice 3's own, the Behavior Markup Language (BML) 1.0 behaviour where there is one, and the Unreal Engine concept that does the same job. A teacher can show these as the names "under the hood", and a learner moving on to an engine can see where an idea goes next.

The Unreal names are from general knowledge of Unreal Engine 5, not checked line by line against its documentation. Corrections are welcome (section 11 of the reference).

<!-- reference:crosswalk -->
| Block or event | From Alice | BML 1.0 | Unreal Engine concept |
| --- | --- | --- | --- |
| `Thing.delay` | `SThing.delay` | `wait` | Delay |
| `Thing.playAudio` | `SThing.playAudio` | — | Play Sound 2D |
| `Thing.isCollidingWith` | `SThing.isCollidingWith` | — | Is Overlapping Actor |
| `Thing.getVehicle` | `SThing.getVehicle` | — | Get Attach Parent |
| `Thing.getBooleanFromUser` | `SThing.getBooleanFromUser` | — | A UI widget that waits for input |
| `Thing.getStringFromUser` | `SThing.getStringFromUser` | — | A UI widget that waits for input |
| `Thing.getDoubleFromUser` | `SThing.getDoubleFromUser` | — | A UI widget that waits for input |
| `Thing.getIntegerFromUser` | `SThing.getIntegerFromUser` | — | A UI widget that waits for input |
| `Turnable.turn` | `STurnable.turn` | — | Set Actor Location and Rotation, Timeline |
| `Turnable.roll` | `STurnable.roll` | — | Set Actor Location and Rotation, Timeline |
| `Turnable.turnToFace` | `STurnable.turnToFace` | `gaze` | Find Look at Rotation |
| `Turnable.orientToUpright` | `STurnable.orientToUpright` | — | Set Actor Location and Rotation, Timeline |
| `Turnable.pointAt` | `STurnable.pointAt` | `pointing` | Find Look at Rotation |
| `Turnable.orientTo` | `STurnable.orientTo` | — | Find Look at Rotation |
| `Turnable.isFacing` | `STurnable.isFacing` | — | Get Dot Product To |
| `Turnable.getDistanceTo` | `STurnable.getDistanceTo` | — | Get Distance To |
| `Turnable.getDistanceAbove` | `STurnable.getDistanceAbove` | — | Get Actor Location, compared along an axis |
| `Turnable.isAbove` | `STurnable.isAbove` | — | Get Actor Location, compared along an axis |
| `Turnable.getDistanceBelow` | `STurnable.getDistanceBelow` | — | Get Actor Location, compared along an axis |
| `Turnable.isBelow` | `STurnable.isBelow` | — | Get Actor Location, compared along an axis |
| `Turnable.getDistanceToTheRightOf` | `STurnable.getDistanceToTheRightOf` | — | Get Actor Location, compared along an axis |
| `Turnable.isToTheRightOf` | `STurnable.isToTheRightOf` | — | Get Actor Location, compared along an axis |
| `Turnable.getDistanceToTheLeftOf` | `STurnable.getDistanceToTheLeftOf` | — | Get Actor Location, compared along an axis |
| `Turnable.isToTheLeftOf` | `STurnable.isToTheLeftOf` | — | Get Actor Location, compared along an axis |
| `Turnable.getDistanceInFrontOf` | `STurnable.getDistanceInFrontOf` | — | Get Actor Location, compared along an axis |
| `Turnable.isInFrontOf` | `STurnable.isInFrontOf` | — | Get Actor Location, compared along an axis |
| `Turnable.getDistanceBehind` | `STurnable.getDistanceBehind` | — | Get Actor Location, compared along an axis |
| `Turnable.isBehind` | `STurnable.isBehind` | — | Get Actor Location, compared along an axis |
| `MovableTurnable.move` | `SMovableTurnable.move` | — | Set Actor Location and Rotation, Timeline |
| `MovableTurnable.moveToward` | `SMovableTurnable.moveToward` | `locomotion` | Move Component To |
| `MovableTurnable.moveAwayFrom` | `SMovableTurnable.moveAwayFrom` | — | Move Component To |
| `MovableTurnable.moveTo` | `SMovableTurnable.moveTo` | `locomotion` | Move Component To |
| `MovableTurnable.moveAndOrientTo` | `SMovableTurnable.moveAndOrientTo` | — | Move Component To |
| `MovableTurnable.place` | `SMovableTurnable.place` | — | Set Actor Location, from the target’s bounds |
| `MovableTurnable.setVehicle` | `SModel.setVehicle`, `SCamera.setVehicle`, `SMarker.setVehicle` | — | Attach Actor To Actor |
| `Scene.getAtmosphereColor` | `SScene.getAtmosphereColor` | — | Sky Atmosphere and Directional Light settings |
| `Scene.setAtmosphereColor` | `SScene.setAtmosphereColor` | — | Sky Atmosphere and Directional Light settings |
| `Scene.getFromAboveLightColor` | `SScene.getFromAboveLightColor` | — | Sky Atmosphere and Directional Light settings |
| `Scene.setFromAboveLightColor` | `SScene.setFromAboveLightColor` | — | Sky Atmosphere and Directional Light settings |
| `Scene.getFromBelowLightColor` | `SScene.getFromBelowLightColor` | — | Sky Atmosphere and Directional Light settings |
| `Scene.setFromBelowLightColor` | `SScene.setFromBelowLightColor` | — | Sky Atmosphere and Directional Light settings |
| `Scene.getFogDensity` | `SScene.getFogDensity` | — | Exponential Height Fog |
| `Scene.setFogDensity` | `SScene.setFogDensity` | — | Exponential Height Fog |
| `Scene.goToScene` | — | — | Open Level, or level streaming |
| `Scene.fadeToBlack` | — | — | Fade track in Sequencer |
| `Scene.crossfade` | — | — | Shot blend in Sequencer |
| `Ground.getPaint` | `SGround.getPaint` | — | Dynamic material instance parameter |
| `Ground.setPaint` | `SGround.setPaint` | — | Dynamic material instance parameter |
| `Ground.getOpacity` | `SGround.getOpacity` | — | Dynamic material instance parameter |
| `Ground.setOpacity` | `SGround.setOpacity` | — | Dynamic material instance parameter |
| `Camera.moveAndOrientToAGoodVantagePointOf` | `SCamera.moveAndOrientToAGoodVantagePointOf` | — | CineCamera with Sequencer camera cuts |
| `Camera.getVerticalViewingAngle` | `SCamera.getVerticalViewingAngle` | — | CineCamera field of view |
| `Camera.setVerticalViewingAngle` | `SCamera.setVerticalViewingAngle` | — | CineCamera field of view |
| `Camera.frameShot` | — | — | CineCamera with Sequencer camera cuts |
| `Joint.getWidth` | `SJoint.getWidth` | — | Get Component Bounds |
| `Joint.getHeight` | `SJoint.getHeight` | — | Get Component Bounds |
| `Joint.getDepth` | `SJoint.getDepth` | — | Get Component Bounds |
| `Model.getPaint` | `SModel.getPaint` | — | Dynamic material instance parameter |
| `Model.setPaint` | `SModel.setPaint`, `SBillboard.setPaint` | — | Dynamic material instance parameter |
| `Model.getOpacity` | `SModel.getOpacity` | — | Dynamic material instance parameter |
| `Model.setOpacity` | `SModel.setOpacity` | — | Dynamic material instance parameter |
| `Model.getWidth` | `SModel.getWidth` | — | Get Component Bounds |
| `Model.setWidth` | `SModel.setWidth` | — | Set Actor Scale 3D |
| `Model.resizeWidth` | `SModel.resizeWidth` | — | Set Actor Scale 3D |
| `Model.getHeight` | `SModel.getHeight` | — | Get Component Bounds |
| `Model.setHeight` | `SModel.setHeight` | — | Set Actor Scale 3D |
| `Model.resizeHeight` | `SModel.resizeHeight` | — | Set Actor Scale 3D |
| `Model.getDepth` | `SModel.getDepth` | — | Get Component Bounds |
| `Model.setDepth` | `SModel.setDepth` | — | Set Actor Scale 3D |
| `Model.resizeDepth` | `SModel.resizeDepth` | — | Set Actor Scale 3D |
| `Model.resize` | `SModel.resize` | — | Set Actor Scale 3D |
| `Model.say` | `SModel.say` | `speech` | A UI widget; there is no built-in speech bubble |
| `Model.think` | `SModel.think` | — | A UI widget; there is no built-in speech bubble |
| `Model.speakLine` | — | `speech` | Audio with lip-sync tools |
| `JointedModel.getJoint` | — | — | Get Socket Transform |
| `JointedModel.getJointChain` | — | — | Get Bone Names, filtered |
| `JointedModel.straightenOutJoints` | `SJointedModel.straightenOutJoints` | — | Reset the Control Rig pose |
| `JointedModel.playAnimation` | — | — | Play Animation or Montage |
| `Billboard.getBackPaint` | `SBillboard.getBackPaint` | — | Dynamic material instance parameter |
| `Billboard.setBackPaint` | `SBillboard.setBackPaint` | — | Dynamic material instance parameter |
| `Text.getValue` | `STextModel.getValue` | — | Get Text |
| `Text.setValue` | `STextModel.setValue` | — | Set Text |
| `Flyer.foldWings` | `SFlyer.foldWings` | — | Play Montage |
| `Flyer.spreadWings` | `SFlyer.spreadWings` | — | Play Montage |
| `Biped.walkTo` | — | `locomotion` | AI MoveTo with a navigation mesh |
| `Biped.runTo` | — | `locomotion` | AI MoveTo with a navigation mesh |
| `Biped.sitOn` | — | `posture` | Montage with Attach To Component |
| `Biped.standUp` | — | `posture` | Play Montage |
| `Biped.lieDown` | — | `posture` | Play Montage |
| `Biped.fall` | — | `posture` | Play Montage |
| `Biped.touch` | — | — | Control Rig IK |
| `Biped.reachFor` | — | `pointing` | Control Rig IK |
| `Biped.pickUp` | — | — | Control Rig IK with Attach To Component |
| `Biped.putDown` | — | — | Detach From Actor |
| `Biped.enterFrom` | — | — | Spawn Actor |
| `Biped.exitTo` | — | — | Destroy Actor |
| `Biped.gesture` | — | `gesture` | Play Montage |
| `Biped.showExpression` | — | `faceLexeme` | Morph targets or pose assets |
| `Biped.lookAt` | — | `gaze` | Look At in Control Rig or an Animation Blueprint |
| `sceneStart` | `SScene.addSceneActivationListener`, `SScene.handleActiveChanged` | — | Event BeginPlay |
| `clickOnScreen` | `SScene.addMouseClickOnScreenListener` | — | Input actions |
| `clickOnObject` | `SScene.addMouseClickOnObjectListener` | — | OnClicked |
| `keyPress` | `SScene.addKeyPressListener` | — | Input actions |
| `arrowKeyPress` | `SScene.addArrowKeyPressListener` | — | Input actions |
| `numberKeyPress` | `SScene.addNumberKeyPressListener` | — | Input actions |
| `moveWithArrowKeys` | `SScene.addObjectMoverFor` | — | Input actions with Add Movement Input |
| `timer` | `SScene.addTimeListener` | — | Set Timer by Event |
| `collisionStart` | `SScene.addCollisionStartListener` | — | Actor overlap and hit events |
| `collisionEnd` | `SScene.addCollisionEndListener` | — | Actor overlap and hit events |
| `proximityEnter` | `SScene.addProximityEnterListener` | — | Actor overlap and hit events |
| `proximityExit` | `SScene.addProximityExitListener` | — | Actor overlap and hit events |
| `viewEnter` | `SScene.addViewEnterListener` | — | A test against the camera’s view |
| `viewExit` | `SScene.addViewExitListener` | — | A test against the camera’s view |
<!-- /reference:crosswalk -->

## Bodies

How joints line up across Alice 3, VRM 1.0, H-Anim 2.0 (ISO/IEC 19774) and the Unreal and Unity humanoid skeletons is in the StoryStage repository's `docs/spec/10-crosswalk.md`, section 2, and the joint map in `docs/spec/17-backstage.md`, section 2a.

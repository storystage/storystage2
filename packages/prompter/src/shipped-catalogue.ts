/**
 * The shipped Backstage catalogue: `prompter-catalogue.txt` from storystage/backstage-assets
 * at the commit `backstage.lock.json` pins. Made by `pnpm prompter:pins --fetch`; don't edit it
 * by hand.
 */
export const SHIPPED_CATALOGUE_COMMIT = '48d996880321626637fd6fca17635e16e669e346';

export const SHIPPED_CATALOGUE = `Every model shipped in Backstage, by section and class. Add one with its id exactly as written.
Each line: id: name, what it looks like [themes] height at scale 1, and its joints.
A model with no joints can move and turn, but not walk or gesture. Use only the joints in its set.

Joint sets
  J1: hips, spine, chest, head, leftUpperArm, leftLowerArm, leftHand, rightUpperArm, rightLowerArm, rightHand, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J2: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbMetacarpal, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftRingProximal, leftRingIntermediate, leftRingDistal, leftLittleProximal, leftLittleIntermediate, leftLittleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbMetacarpal, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightRingProximal, rightRingIntermediate, rightRingDistal, rightLittleProximal, rightLittleIntermediate, rightLittleDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J3: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftRingProximal, leftRingIntermediate, leftRingDistal, leftLittleProximal, leftLittleIntermediate, leftLittleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightRingProximal, rightRingIntermediate, rightRingDistal, rightLittleProximal, rightLittleIntermediate, rightLittleDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J4: hips, spine, chest, upperChest, neck, head, leftEye, rightEye, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J5: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftRingProximal, leftRingIntermediate, leftRingDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightRingProximal, rightRingIntermediate, rightRingDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J6: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J7: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J8: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftLittleProximal, leftLittleIntermediate, leftLittleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightLittleProximal, rightLittleIntermediate, rightLittleDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J9: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, rightShoulder, rightUpperArm, rightLowerArm, rightHand, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J10: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J11: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftRingProximal, leftRingIntermediate, leftRingDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightRingProximal, rightRingIntermediate, rightRingDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J12: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftRingProximal, leftRingIntermediate, leftRingDistal, leftLittleProximal, leftLittleIntermediate, leftLittleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightRingProximal, rightRingIntermediate, rightRingDistal, rightLittleProximal, rightLittleIntermediate, rightLittleDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes, tongue2, tongue3
  J13: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot
  J14: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftIndexProximal, leftIndexIntermediate, leftMiddleProximal, leftMiddleIntermediate, leftRingProximal, leftRingIntermediate, leftLittleProximal, leftLittleIntermediate, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightIndexProximal, rightIndexIntermediate, rightMiddleProximal, rightMiddleIntermediate, rightRingProximal, rightRingIntermediate, rightLittleProximal, rightLittleIntermediate, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J15: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftMiddleProximal, leftMiddleIntermediate, leftRingProximal, leftRingIntermediate, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightMiddleProximal, rightMiddleIntermediate, rightRingProximal, rightRingIntermediate, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J16: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftRingProximal, leftRingIntermediate, leftRingDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightRingProximal, rightRingIntermediate, rightRingDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes, tail2, tail3
  J17: hips, spine, chest, upperChest, neck, head, leftEye, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftRingProximal, leftRingIntermediate, leftRingDistal, leftLittleProximal, leftLittleIntermediate, leftLittleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightRingProximal, rightRingIntermediate, rightRingDistal, rightLittleProximal, rightLittleIntermediate, rightLittleDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J18: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftIndexProximal, leftIndexIntermediate, leftMiddleProximal, leftMiddleIntermediate, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightIndexProximal, rightIndexIntermediate, rightMiddleProximal, rightMiddleIntermediate, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J19: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftIndexProximal, leftIndexIntermediate, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightIndexProximal, rightIndexIntermediate, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J20: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftRingProximal, leftRingIntermediate, leftRingDistal, leftLittleProximal, leftLittleIntermediate, leftLittleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightRingProximal, rightRingIntermediate, rightRingDistal, rightLittleProximal, rightLittleIntermediate, rightLittleDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J21: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J22: hips, spine, chest, upperChest, neck, head, rightEye, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftLittleProximal, leftLittleIntermediate, leftLittleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightLittleProximal, rightLittleIntermediate, rightLittleDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J23: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes, tail2, tail3, tail4, tail5, tail6
  J24: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftRingProximal, leftRingIntermediate, leftRingDistal, leftLittleProximal, leftLittleIntermediate, leftLittleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightRingProximal, rightRingIntermediate, rightRingDistal, rightLittleProximal, rightLittleIntermediate, rightLittleDistal, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot
  J25: hips, spine, chest, upperChest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftIndexProximal, leftMiddleProximal, leftRingProximal, leftLittleProximal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightIndexProximal, rightMiddleProximal, rightRingProximal, rightLittleProximal, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J26: hips, spine, chest, upperChest, neck, head, leftEye, rightEye, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftRingProximal, leftRingIntermediate, leftRingDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightRingProximal, rightRingIntermediate, rightRingDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J27: hips, spine, chest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, rightShoulder, rightUpperArm, rightLowerArm, rightHand, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot
  J28: hips, spine, chest, neck, head, leftShoulder, leftUpperArm, leftLowerArm, leftHand, leftThumbMetacarpal, leftThumbProximal, leftThumbDistal, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, leftRingProximal, leftRingIntermediate, leftRingDistal, leftLittleProximal, leftLittleIntermediate, leftLittleDistal, rightShoulder, rightUpperArm, rightLowerArm, rightHand, rightThumbMetacarpal, rightThumbProximal, rightThumbDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, rightMiddleProximal, rightMiddleIntermediate, rightMiddleDistal, rightRingProximal, rightRingIntermediate, rightRingDistal, rightLittleProximal, rightLittleIntermediate, rightLittleDistal, leftUpperLeg, leftLowerLeg, leftFoot, leftToes, rightUpperLeg, rightLowerLeg, rightFoot, rightToes
  J29: spineBase, spineMiddle, spineUpper, neck, head, leftEye, leftEyelid, rightEye, rightEyelid, leftWingShoulder, leftWingElbow, leftWingWrist, rightWingShoulder, rightWingElbow, rightWingWrist, pelvis, tail, leftHip, leftKnee, leftAnkle, leftFoot, rightHip, rightKnee, rightAnkle, rightFoot
  J30: spineBase, spineMiddle, neck, head, jaw, leftWingShoulder, leftWingElbow, leftWingWrist, rightWingShoulder, rightWingElbow, rightWingWrist, pelvis, leftHip, leftKnee, leftAnkle, leftFoot, rightHip, rightKnee, rightAnkle, rightFoot
  J31: spineBase, spineMiddle, neck, head, jaw, leftEye, rightEye, leftWingShoulder, leftWingElbow, rightWingShoulder, rightWingElbow, pelvis, tail, tail2, leftHip, leftFoot, rightHip, rightFoot
  J32: spineBase, spineMiddle, head, leftWingShoulder, leftWingTip, rightWingShoulder, rightWingTip
  J33: spineBase, neck, head, jaw, leftWingShoulder, rightWingShoulder, tail, leftHip, leftFoot, rightHip, rightFoot
  J34: spineBase, spineMiddle, spineUpper, neck, head, leftEar, rightEar, frontLeftClavicle, frontLeftShoulder, frontLeftKnee, frontLeftAnkle, frontRightClavicle, frontRightShoulder, frontRightKnee, frontRightAnkle, pelvis, tail, tail2, tail3, tail4, backLeftHip, backLeftKnee, backLeftHock, backLeftAnkle, backRightHip, backRightKnee, backRightHock, backRightAnkle
  J35: spineBase, spineUpper, head, frontLeftShoulder, frontLeftKnee, frontRightShoulder, frontRightKnee, tail, tail2, backLeftHip, backLeftKnee, backRightHip, backRightKnee
  J36: spineBase, spineUpper, neck, head, leftEar, rightEar, frontLeftClavicle, frontLeftShoulder, frontLeftKnee, frontLeftAnkle, frontLeftFoot, frontRightClavicle, frontRightShoulder, frontRightKnee, frontRightAnkle, frontRightFoot, backLeftHip, backLeftKnee, backLeftHock, backLeftAnkle, backRightHip, backRightKnee, backRightHock, backRightAnkle, leftEarTip, rightEarTip
  J37: spineBase, spineUpper, neck, head, leftEar, rightEar, frontLeftShoulder, frontLeftKnee, frontRightShoulder, frontRightKnee, tail, tail2, tail3, tail4, backLeftHip, backLeftKnee, backRightHip, backRightKnee, trunk, trunk2, trunk3
  J38: spineBase, spineMiddle, spineUpper, neck, head, jaw, leftEar, rightEar, frontLeftClavicle, frontLeftShoulder, frontLeftKnee, frontLeftAnkle, frontLeftToe, frontRightClavicle, frontRightShoulder, frontRightKnee, frontRightAnkle, frontRightToe, pelvis, tail, tail2, tail3, tail4, backLeftHip, backLeftKnee, backLeftHock, backLeftToe, backRightHip, backRightKnee, backRightHock, backRightToe, leftEarTip, rightEarTip
  J39: spineBase, spineMiddle, spineUpper, neck, head, frontLeftShoulder, frontLeftKnee, frontRightShoulder, frontRightKnee, tail, tail2, tail3, backLeftHip, backLeftKnee, backRightHip, backRightKnee
  J40: spineBase, spineMiddle, spineUpper, neck, head, frontLeftClavicle, frontLeftShoulder, frontLeftKnee, frontLeftAnkle, frontLeftToe, frontRightClavicle, frontRightShoulder, frontRightKnee, frontRightAnkle, frontRightToe, pelvis, tail, tail2, tail3, tail4, backLeftHip, backLeftKnee, backLeftHock, backLeftToe, backRightHip, backRightKnee, backRightHock, backRightToe
  J41: spineBase, spineUpper, head, leftEar, rightEar, frontLeftShoulder, frontLeftKnee, frontLeftFoot, frontRightShoulder, frontRightKnee, frontRightFoot, pelvis, backLeftHip, backLeftKnee, backLeftFoot, backRightHip, backRightKnee, backRightFoot, leftEarTip, rightEarTip
  J42: spineBase, spineMiddle, spineUpper, neck, head, frontLeftClavicle, frontLeftShoulder, frontLeftKnee, frontRightClavicle, frontRightShoulder, frontRightKnee, tail, tail2, backLeftHip, backLeftKnee, backLeftHock, backRightHip, backRightKnee, backRightHock
  J43: spineBase, spineUpper, head, jaw, leftEar, rightEar, frontLeftClavicle, frontLeftShoulder, frontLeftKnee, frontLeftFoot, frontRightClavicle, frontRightShoulder, frontRightKnee, frontRightFoot, pelvis, tail, tail2, backLeftHip, backLeftKnee, backLeftHock, backLeftFoot, backRightHip, backRightKnee, backRightHock, backRightFoot
  J44: spineBase, spineMiddle, spineUpper, neck, head, frontLeftClavicle, frontLeftShoulder, frontLeftKnee, frontLeftAnkle, frontRightClavicle, frontRightShoulder, frontRightKnee, frontRightAnkle, tail, tail2, tail3, tail4, backLeftHip, backLeftKnee, backLeftHock, backRightHip, backRightKnee, backRightHock
  J45: spineBase, spineMiddle, spineUpper, neck, head, leftEye, rightEye, leftEar, rightEar, frontLeftClavicle, frontLeftShoulder, frontLeftKnee, frontLeftAnkle, frontLeftToe, frontRightClavicle, frontRightShoulder, frontRightKnee, frontRightAnkle, frontRightToe, pelvis, tail, tail2, tail3, backLeftHip, backLeftKnee, backLeftHock, backLeftToe, backRightHip, backRightKnee, backRightHock, backRightToe, leftEarTip, rightEarTip, tailTip
  J46: spineBase, spineMiddle, spineUpper, head, leftEar, rightEar, frontLeftClavicle, frontLeftShoulder, frontLeftKnee, frontLeftFoot, frontRightClavicle, frontRightShoulder, frontRightKnee, frontRightFoot, tail, tail2, tail3, backLeftHip, backLeftKnee, backLeftHock, backLeftFoot, backRightHip, backRightKnee, backRightHock, backRightFoot
  J47: spineBase, spineUpper, neck, head, frontLeftShoulder, frontLeftKnee, frontRightShoulder, frontRightKnee, tail, tail2, tail3, backLeftHip, backLeftKnee, backRightHip, backRightKnee
  J48: spineBase, spineUpper, neck, head, jaw, leftEar, rightEar, frontLeftShoulder, frontLeftKnee, frontRightShoulder, frontRightKnee, tail, tail2, backLeftHip, backLeftKnee, backRightHip, backRightKnee
  J49: head, jaw, frontLeftFin, frontRightFin, spineBase, spineMiddle, tail, tail2, tail3, tail4, frontLeftFinTip, backLeftFin, frontRightFinTip, backRightFin
  J50: head, spineBase, spineMiddle, tail
  J51: head, jaw, frontLeftFin, frontRightFin, spineBase, spineMiddle, tail, jawTip, tail2, tail3, tail4, frontLeftFinTip, backLeftFin, frontRightFinTip, backRightFin
  J52: head, frontLeftFin, frontRightFin, spineBase, spineMiddle, tail, tail2, tail3, tail4, tail5, tail6, frontLeftFinTip, backLeftFin, frontRightFinTip, backRightFin
  J53: neck, head, jaw, spineBase, spineMiddle, tail, tail2, tail3

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
    makehuman/Biped/p01: Alfie, a boy of 6 with short brown hair, in blue dungarees and a yellow T-shirt [everyday, children] 1 m, joints J2
    makehuman/Biped/p02: Amara, a girl of 7 with short curly black hair, in a yellow blouse and yellow skirt [everyday, children] 1.07 m, joints J2
    makehuman/Biped/p03: Kai, a child of 8 with a brown side fringe and red glasses, in a teal shirt and grey trousers [everyday, children] 1.1 m, joints J2
    makehuman/Biped/p04: Aisha, a girl of 9 with short black hair, in a purple checked shirt and jeans [everyday, children] 1.16 m, joints J2
    makehuman/Biped/p05: Rhys, a boy of 10 with short dark hair, in an orange checked shirt and navy trousers [everyday, children] 1.27 m, joints J2
    makehuman/Biped/p06: Niamh, a tall girl of 11 with short light brown hair, in a green jacket and jeans [everyday, children] 1.53 m, joints J2
    makehuman/Biped/p07: Zain, a boy of 12 with short black hair, in a teal jacket and black trousers [everyday, children] 1.44 m, joints J2
    makehuman/Biped/p08: Mei, a girl of 6 with a black bob and a long fringe, in a coral checked blouse and skirt [everyday, children] 0.92 m, joints J2
    makehuman/Biped/p09: Kofi, a boy of 11 with short black hair, in blue dungarees and a white T-shirt [everyday, children] 1.44 m, joints J2
    makehuman/Biped/p10: Isla, a girl of 9 with long brown hair, in a green striped blouse and green skirt [everyday, children] 1.17 m, joints J2
    makehuman/Biped/p11: Jayden, a tall boy of 14 with short brown hair, in a coral jacket and black trousers [everyday, teenagers] 1.68 m, joints J2
    makehuman/Biped/p12: Priya, a girl of 15 with long brown hair, in a purple jacket and jeans [everyday, teenagers] 1.36 m, joints J2
    makehuman/Biped/p13: Oskar, a boy of 13 with short dark hair and black glasses, in a blue shirt and grey jeans [everyday, teenagers] 1.4 m, joints J2
    makehuman/Biped/p14: Leah, a girl of 16 with short brown hair, in a pink flowered shirt and jeans [everyday, teenagers] 1.44 m, joints J2
    makehuman/Biped/p15: Hamza, a boy of 17 with short brown hair, in an orange jacket and khaki trousers [everyday, teenagers] 1.6 m, joints J2
    makehuman/Biped/p16: Sam, a teenager of 15 with short black hair, in a yellow spotted shirt and jeans [everyday, teenagers] 1.41 m, joints J2
    makehuman/Biped/p17: Grace, a woman of 28 with short curly black hair, in a teal spotted blouse and skirt, and white socks [everyday, adults] 1.79 m, joints J2
    makehuman/Biped/p18: Tom, a tall man of 32 with short brown hair, in blue dungarees and a white T-shirt [everyday, adults] 2.1 m, joints J2
    makehuman/Biped/p19: Yusuf, a man of 40 with short black hair, in a navy suit and striped tie [everyday, adults] 1.7 m, joints J2
    makehuman/Biped/p20: Hannah, a woman of 36 with a black bob and rimless glasses, in a teal shirt and jeans [everyday, adults] 1.64 m, joints J2
    makehuman/Biped/p21: Chen, a man of 45 with a brown side fringe and thin metal glasses, in a green checked shirt and grey trousers [everyday, adults] 1.6 m, joints J2
    makehuman/Biped/p22: Tunde, a bald man of 50, in a khaki jacket and navy trousers [everyday, adults] 1.89 m, joints J2
    makehuman/Biped/p23: Fatima, a woman of 30 with a short black bob, in a purple blouse and purple skirt [everyday, adults] 1.58 m, joints J2
    makehuman/Biped/p24: Morgan, an adult of 26 with short dark hair, in a purple flecked shirt and jeans [everyday, adults] 1.76 m, joints J2
    makehuman/Biped/p25: Siân, a woman of 55 with a silver-blonde bob, in a dark red striped blouse and grey skirt [everyday, adults] 1.59 m, joints J2
    makehuman/Biped/p26: Margaret, an older woman of 72 with a grey bob and glasses, in a pink flowered blouse and long skirt [everyday, older people] 1.58 m, joints J2
    makehuman/Biped/p27: Winston, an older man of 78 in a grey hat, dark suit and striped tie [everyday, older people] 1.86 m, joints J2
    makehuman/Biped/p28: Lin, an older woman of 68 with a grey bob, in a teal flecked blouse and skirt [everyday, older people] 1.44 m, joints J2
    makehuman/Biped/p29: Ravi, an older man of 70 with short grey hair, in an orange shirt and navy trousers [everyday, older people] 1.68 m, joints J2
    makehuman/Biped/p30: Eileen, an older woman of 85 with white hair tied back, in a green checked blouse and long green skirt [everyday, older people] 1.5 m, joints J2
    makehuman/Biped/p31: Maryam, a girl of 10 in a navy hijab, a teal jacket and jeans [everyday, children] 1.28 m, joints J2
    makehuman/Biped/p32: Samira, a woman of 45 in a maroon hijab, a green striped blouse and long green skirt [everyday, adults] 1.59 m, joints J2
    makehuman/Biped/p33: Arjan, a boy of 11 in a navy patka, a yellow striped shirt and navy trousers [everyday, children] 1.37 m, joints J2
    makehuman/Biped/p34: Gurdeep, a man of 38 in an orange turban, a green jacket and jeans [everyday, adults] 1.84 m, joints J2
    makehuman/Biped/p35: Eli, a boy of 8 with short dark hair and a navy kippah, in a green shirt and khaki trousers [everyday, children] 1.14 m, joints J2
    makehuman/Biped/p36: Poppy, a girl of 7 with a brown ponytail and purple hearing aids, in a coral jacket and jeans [everyday, children] 1.03 m, joints J2
    makehuman/Biped/p37: George, an older man of 80 with short white hair and hearing aids, in a brown suit and striped tie [everyday, older people] 1.74 m, joints J2
    osa/Biped/agnes: Agnes, a skeleton in a pink jumper with a yellow sun on it [fantasy, spooky] 1.73 m, joints J3
    osa/Biped/ajo-majo: Ajo Majo, a pink axolotl in a purple hoodie [fantasy, animals] 0.88 m, joints J4
    osa/Biped/alien-teen: Alien Teen, an alien teenager with one big eye, in an orange and black top and shorts [fantasy, space] 1.34 m, joints J3
    osa/Biped/anna: Anna, a young woman with short pink hair, in a black top and red trousers [fantasy, everyday] 1.59 m, joints J3
    osa/Biped/astro-nacho: Astro Nacho, an astronaut in a yellow and black spacesuit and a round helmet [fantasy, space] 1.77 m, joints J3
    osa/Biped/astronaut: Astronaut, an astronaut in a yellow spacesuit and a round orange helmet with an aerial [everyday, space] 1.36 m, joints J3
    osa/Biped/bad-bot: Bad Bot, a thin black robot with a white face and long legs [fantasy, robots] 2.09 m, joints J5
    osa/Biped/bao-samurai: Bao Samurai, a steamed bun samurai with horns, in brown armour [fantasy, food] 1.63 m, joints J6
    osa/Biped/bat-pot: Bat Pot, a bat sitting in a black cooking pot [fantasy, animals] 1.13 m, joints J7
    osa/Biped/beach-king: Beach King, a king in a gold crown, a teal top and pink swim shorts [fantasy, beach] 1.78 m, joints J3
    osa/Biped/bean-king: Bean King, a big red bean with a crown, on a green stalk body [fantasy, food] 1.28 m, joints J3
    osa/Biped/blob: Blob, a young man in a purple cap, a white T-shirt and jeans [fantasy, everyday] 1.69 m, joints J5
    osa/Biped/blue-pixie: Blue Pixie, a blue pixie with big ears and fins like wings [fantasy, fairy tale] 1.79 m, joints J8
    osa/Biped/bot-bunny: Bot Bunny, a robot with rabbit ears, in a red jacket [fantasy, robots] 1.7 m, joints J3
    osa/Biped/buffedwolf: Buffedwolf, a big grey wolf-man with long arms [fantasy, spooky] 2.26 m, joints J5
    osa/Biped/cat-eye: Cat Eye, a cat-eared creature with one big eye, in a pink jumper [fantasy, animals] 1.21 m, joints J9
    osa/Biped/cat-moth: Cat Moth, a fluffy cream moth with big wings and a cat-like face [fantasy, animals] 1.48 m, joints J7
    osa/Biped/cherry-bros: Cherry Bros, two red cherries joined at the stalk, with thin legs [fantasy, food] 2.06 m, joints J3
    osa/Biped/chester: Chester, a grey rabbit wizard in a blue pointed hat and cape [fantasy, fairy tale] 1.02 m, joints J4
    osa/Biped/cool-bee: Cool Bee, a round fluffy bee with yellow and black stripes [fantasy, animals] 0.5 m, joints J9
    osa/Biped/cool-bomb: Cool Bomb, a round blue bomb with a fuse and a big grin [fantasy, toys] 1.47 m, joints J10
    osa/Biped/cool-croissant: Cool Croissant, a croissant with arms and legs and a cross face [fantasy, food] 1.05 m, joints J11
    osa/Biped/cool-cyclops: Cool Cyclops, a big blue one-eyed monster in a grey skirt [fantasy, myth] 2.05 m, joints J3
    osa/Biped/cool-heart: Cool Heart, a red heart with big eyes, arms and legs [fantasy, toys] 1.01 m, joints J3
    osa/Biped/cool-pawn: Cool Pawn, a black chess pawn on thin legs [fantasy, toys] 1.44 m, joints J3
    osa/Biped/cool-pineapple: Cool Pineapple, a pineapple in sunglasses, a red flowery shirt and green trousers [fantasy, food] 1.52 m, joints J3
    osa/Biped/cool-pyramid: Cool Pyramid, a golden pyramid with one eye and sunglasses, on thin legs [fantasy, history] 1.2 m, joints J3
    osa/Biped/cool-radish: Cool Radish, a white radish with leaves on top, in blue striped dungarees [fantasy, food] 2.08 m, joints J8
    osa/Biped/cool-snake: Cool Snake, a red and white striped snake in a brown cowboy hat [fantasy, animals] 1.81 m, joints J12
    osa/Biped/cool-spaguetti: Cool Spaguetti, a plate of spaghetti with a meatball face and noodle legs [fantasy, food] 1.81 m, joints J13
    osa/Biped/cool-sushi: Cool Sushi, a roll of sushi rice with a cross face and orange trainers [fantasy, food] 1.33 m, joints J5
    osa/Biped/cool-tiger: Cool Tiger, a striped tiger in black trousers [fantasy, animals] 1.78 m, joints J14
    osa/Biped/cool-tiki: Cool Tiki, a tiki mask with a green crest, on a black body [fantasy, myth] 1.34 m, joints J15
    osa/Biped/cool-toaster: Cool Toaster, a grey toaster with a slice of toast in it, on thin legs [fantasy, kitchen] 1.7 m, joints J10
    osa/Biped/cool-udon: Cool Udon, a bowl of udon noodles with chopsticks, on thin legs [fantasy, food] 1.57 m, joints J3
    osa/Biped/cool-waffle: Cool Waffle, a round waffle with a smiling face, on thin legs [fantasy, food] 1.31 m, joints J3
    osa/Biped/cosmic-bot: Cosmic Bot, a tall purple robot with pointed ears [fantasy, robots] 1.98 m, joints J3
    osa/Biped/crowley: Crowley, a figure in a yellow hoodie and a black fox mask [fantasy, mystery] 1.84 m, joints J16
    osa/Biped/cute-moth: Cute Moth, a pink fluffy moth with big eyes and purple wings [fantasy, animals] 0.89 m, joints J10
    osa/Biped/cute-saurus: Cute Saurus, a little dinosaur in a green knitted jumper [fantasy, dinosaurs] 1.5 m, joints J15
    osa/Biped/cyberpal: Cyberpal, a boy with spiky green hair and goggles, in grey and black clothes [fantasy, everyday] 1.74 m, joints J3
    osa/Biped/david: David, a garden gnome with a red pointed hat and a white beard, in a blue shirt [everyday] 1.58 m, joints J3
    osa/Biped/dino-kid: Dino kid, a child in a green dinosaur costume [everyday, dinosaurs] 1.24 m, joints J3
    osa/Biped/dogo-burger: Dogo Burger, a burger with a dog's face and paws [fantasy, food] 1.18 m, joints J10
    osa/Biped/dream-fighter: Dream Fighter, a fighter in a green cap and top and baggy pink trousers [fantasy, adventure] 1.74 m, joints J3
    osa/Biped/erika: Erika, a woman with long lilac hair and sunglasses, in a green top and grey trousers [everyday] 1.66 m, joints J3
    osa/Biped/eugenia: Eugenia, an older woman with grey hair in a bun, in a teal cardigan and a yellow skirt [fantasy, older people] 1.42 m, joints J3
    osa/Biped/evil-book: Evil Book, a grumpy old book with legs and blue ribbons for arms [fantasy, library] 1.36 m, joints J5
    osa/Biped/fire-eye: Fire Eye, a tall figure with one eye and a flame for a head, in a blue wrap [fantasy, myth] 3.34 m, joints J3
    osa/Biped/frog-enjoyer: Frog Enjoyer, a child in a green frog hat, a pink top and red shorts [fantasy, children] 1.63 m, joints J17
    osa/Biped/ghost-pumpking: Ghost Pumpking, a ghost in a white sheet with a pumpkin for a head [fantasy, spooky] 1.74 m, joints J3
    osa/Biped/goat-ghost: Goat Ghost, a ghost with goat horns, in a brown cloak [fantasy, spooky] 1.3 m, joints J18
    osa/Biped/good-knight: Good Knight, a knight in a dark helmet and a green tunic [fantasy, history] 1.89 m, joints J3
    osa/Biped/jenny: Jenny, a young woman with long teal hair, in a grey top and dark trousers [fantasy, everyday] 1.66 m, joints J3
    osa/Biped/joker-dude: Joker Dude, a jester in a red and green hat with bells and a white collar [fantasy, fairy tale] 1.56 m, joints J5
    osa/Biped/juanita: Juanita, a girl with pink hair in buns, in a green jacket and black shorts [fantasy, children] 0.96 m, joints J19
    osa/Biped/kiba: Kiba, a white llama standing up, in a green waistcoat [fantasy, animals] 1.82 m, joints J7
    osa/Biped/kyle: Kyle, a man with a red quiff, in a navy T-shirt and blue trousers [everyday] 1.67 m, joints J3
    osa/Biped/lady-fawn: Lady Fawn, a deer woman with antlers, in a green dress [fantasy, fairy tale] 1.81 m, joints J3
    osa/Biped/lady-koi: Lady Koi, a koi fish woman with orange and white fins for hair [fantasy, sea] 1.64 m, joints J20
    osa/Biped/leaf-boy: Leaf Boy, a boy with green hair and headphones, in a teal shirt and shorts [fantasy, children] 1.12 m, joints J21
    osa/Biped/lil-ram: Lil Ram, a little ram with curly horns, in red dungarees [fantasy, animals] 1.14 m, joints J6
    osa/Biped/lil-shark: Lil Shark, a grinning shark in a yellow rubber ring [fantasy, sea] 0.78 m, joints J22
    osa/Biped/lil-teddy: Lil Teddy, a teddy bear in a flowery bucket hat, with a coin necklace [fantasy, toys] 1.08 m, joints J9
    osa/Biped/lord-piggington: Lord Piggington, a pig in a green coat and a white cravat [fantasy, animals] 1.88 m, joints J6
    osa/Biped/math-book: Math Book, a blue maths book with arms and legs [fantasy, school] 0.96 m, joints J5
    osa/Biped/mega-angel: Mega Angel, a white angel with big blue wings [fantasy, myth] 1.34 m, joints J5
    osa/Biped/megan-the-fox: Megan The Fox, a pink fox in a purple hoodie and boots [fantasy, animals] 1.59 m, joints J23
    osa/Biped/mr: Mr, a white robot with a cartoon face and a square code on its chest [fantasy, robots] 1.64 m, joints J5
    osa/Biped/mr-bush: Mr Bush, a leafy green bush with legs [fantasy, garden] 1.81 m, joints J3
    osa/Biped/mr-squirrel: Mr Squirrel, a round brown squirrel in a small top hat [fantasy, animals] 0.68 m, joints J6
    osa/Biped/mushroom-fairy: Mushroom Fairy, a fairy with a mushroom for a hat and leafy arms [fantasy, fairy tale] 2.04 m, joints J24
    osa/Biped/nut-bot: Nut Bot, a white and purple robot with cat ears [fantasy, robots] 1.58 m, joints J5
    osa/Biped/olivia: Olivia, a woman in a gold hood and a black and gold costume [everyday] 1.67 m, joints J3
    osa/Biped/petal-dude: Petal Dude, a tall figure with a flower for a head, in orange, pink and purple [fantasy, garden] 2.04 m, joints J3
    osa/Biped/pirate-bot: Pirate Bot, a grey robot pirate in a pirate hat [fantasy, robots] 1.79 m, joints J6
    osa/Biped/pitcher-dude: Pitcher Dude, a tall green pitcher plant with a red top [fantasy, garden] 3 m, joints J5
    osa/Biped/polybot: Polybot, a green robot with a boxy head [everyday, robots] 1.06 m, joints J25
    osa/Biped/psichonaut: Psichonaut, a grey alien with a planet for a head, in purple shorts [fantasy, space] 1.89 m, joints J3
    osa/Biped/ranchu: Ranchu, a woman in a goldfish costume with orange fins [fantasy, sea] 2.05 m, joints J3
    osa/Biped/robert: Robert, a man with a pink beard, in a dark green T-shirt and turquoise trousers [everyday] 1.61 m, joints J3
    osa/Biped/rose: Rose, a pirate in a black three-cornered hat, a striped top, red shorts and tall boots [everyday] 1.66 m, joints J3
    osa/Biped/snail-kid: Snail Kid, a child with a snail shell on their back and antennae, in a grey top and blue shorts [fantasy, children] 1.55 m, joints J26
    osa/Biped/snake-bot: Snake Bot, a white and grey robot with a snake's head [fantasy, robots] 1.44 m, joints J5
    osa/Biped/sport-mecha: Sport Mecha, an orange robot with long arms [fantasy, robots] 1.78 m, joints J3
    osa/Biped/sport-tv: Sport TV, a figure with a TV for a head, in a teal and purple hoodie [fantasy, sport] 2.02 m, joints J3
    osa/Biped/stingcake: Stingcake, a frog in sunglasses, a dark suit and a blue tie [fantasy, animals] 1.28 m, joints J9
    osa/Biped/strawberry-princess: Strawberry Princess, a strawberry with a crown and big eyes, on leafy legs [fantasy, food] 1.37 m, joints J3
    osa/Biped/teddy: Teddy, a brown teddy bear [everyday, toys] 1.65 m, joints J3
    osa/Biped/toxic-guy: Toxic Guy, a figure with a glass jar for a head, in a brown jacket [fantasy, science] 2.04 m, joints J5
    osa/Biped/two-tails: Two-Tails, a cat in a green and red patterned coat [fantasy, animals] 1.31 m, joints J9
    osa/Biped/urban-tv: Urban TV, a figure with an old TV for a head, in an orange jacket and jeans [fantasy, town] 1.85 m, joints J5
    osa/Biped/vladi: Vladi, a little vampire in a purple cloak [fantasy, spooky] 1.06 m, joints J5
    osa/Biped/weird-cat: Weird Cat, a cat with big round blue goggles and a brown waistcoat [fantasy, animals] 1.22 m, joints J6
    osa/Biped/yeti-dude: Yeti Dude, a white furry yeti with a long beard [fantasy, myth] 1.63 m, joints J5
    sketchfab/Biped/grandmother: Grandmother, an old village grandmother with grey hair, in a long orange dress [storybook, fairy tale, people] 1.55 m, joints J27
    sketchfab/Biped/red-riding-hood: Little Red Riding Hood, Little Red Riding Hood, a small girl in a long red hooded cloak [storybook, fairy tale] 1.2 m, joints J27
    storybook/Biped/anansi: Anansi, Anansi the Akan trickster: a man in orange and purple, with a striped headwrap and eight striped spider legs [storybook, folk tale, West African] 2.24 m, joints J1
    storybook/Biped/beowulf: Beowulf, Beowulf the hero, bearded, in a bear hood and furs [storybook, legend, myth, history] 2.4 m, joints J1
    storybook/Biped/branwen: Branwen, Branwen of the Mabinogion, a young woman with long dark hair, in a long blue dress and cloak, with a gold circlet [storybook, legend, myth, Welsh] 2.19 m, joints J1
    storybook/Biped/doctor-watson: Dr Watson, Dr Watson, Sherlock Holmes's friend, with a grey beard and moustache, in a black bowler hat and a green coat [storybook, mystery, Victorian] 2.25 m, joints J1
    storybook/Biped/fionn-mac-cumhaill: Fionn mac Cumhaill, Fionn mac Cumhaill, the Irish and Scottish giant, bearded, in furs [storybook, legend, myth] 4.99 m, joints J1
    storybook/Biped/king-arthur: King Arthur, King Arthur, fair-haired and bareheaded, in armour and a red cape [storybook, legend, myth, history] 2.31 m, joints J1
    storybook/Biped/maid-marian: Maid Marian, Maid Marian, a young woman with long brown hair, in a long crimson dress and cloak, with a gold circlet [storybook, legend, folk tale] 2.19 m, joints J1
    storybook/Biped/medusa: Medusa, Medusa of the Greek myths, a young woman in a long white dress, with green snakes for hair [storybook, myth, Greek] 2.44 m, joints J1
    storybook/Biped/merlin: Merlin, Merlin the wizard, young, with black hair, in a tall purple pointed hat and robe [storybook, legend, myth, fantasy] 2.72 m, joints J1
    storybook/Biped/robin-hood: Robin Hood, Robin Hood, the outlaw of Sherwood Forest, in a green hood and cloak [storybook, legend, history] 2.25 m, joints J1
    storybook/Biped/selkie: Selkie, a selkie, a seal-woman of Scottish and Irish tales, in a silver-grey hooded sealskin cloak [storybook, folk tale, myth, sea] 2.25 m, joints J1
    storybook/Biped/sherlock-holmes: Sherlock Holmes, Sherlock Holmes the detective, with black hair, in a tweed deerstalker and a brown cape coat, holding a magnifying glass [storybook, mystery, Victorian] 2.2 m, joints J1
    vrmc/Biped/seed-san: Seed-san, a young woman with short dark hair, in a white and blue jumpsuit, with a robot arm on her back [everyday, space] 1.58 m, joints J28
  Flyer
    sketchfab/Flyer/african-penguin: African penguin, a black and white penguin with a black stripe across its chest [animals, sea] 0.6 m, joints J29
    sketchfab/Flyer/bee: Bee, a smiling round bee with yellow and black stripes [animals, minibeasts, garden] 0.08 m, no joints
    sketchfab/Flyer/chick: Chick, a fluffy golden-brown chick with orange feet [animals, farm] 0.15 m, joints J30
    sketchfab/Flyer/penguin: Penguin, a round cartoon penguin, black and white with orange flippers, beak and feet [animals, polar, sea] 0.7 m, joints J31
    styloo/Flyer/butterfly: Butterfly, an orange and black butterfly with white spots, its wings open [animals, minibeasts, garden] 0.6 m, joints J32
    styloo/Flyer/chicken: Chicken, a brown hen with a red comb [animals, farm] 0.45 m, no joints
    styloo/Flyer/ladybird: Ladybird, a red ladybird with a black head and six legs [animals, minibeasts, garden] 0.06 m, no joints
    vuena/Flyer/owl: Owl, a chunky toy-style brown owl with big round eyes [animals, woodland] 0.4 m, joints J33
  Quadruped
    blender-studio/Quadruped/autumn: Autumn, a small black dog with big ears and a red scarf [animals, pets, storybook] 0.41 m, joints J34
    sketchfab/Quadruped/buffalo: Buffalo, a blocky dark grey buffalo with big white curved horns [animals, savanna] 1.5 m, joints J35
    sketchfab/Quadruped/deer: Deer, a brown deer grazing, with a white tail [animals, woodland] 1.3 m, joints J36
    sketchfab/Quadruped/elephant: Elephant, a blocky grey elephant with big square ears, tusks and a trunk [animals, savanna] 3 m, joints J37
    sketchfab/Quadruped/frog: Frog, a fat green frog with a pale belly, sitting down [animals, pond, garden] 0.12 m, no joints
    sketchfab/Quadruped/german-shepherd: German shepherd, a tan German shepherd dog with a black face and back, and tall ears [animals, pets] 0.6 m, joints J38
    sketchfab/Quadruped/giraffe: Giraffe, a blocky giraffe with orange-brown patches and a long neck [animals, savanna] 4.5 m, joints J39
    sketchfab/Quadruped/horse: Horse, a brown horse with a saddle, stirrups and reins [animals, farm, wild west] 1.9 m, joints J40
    sketchfab/Quadruped/rabbit: Rabbit, a brown rabbit with a white chest and long ears [animals, pets, woodland] 0.4 m, joints J41
    sketchfab/Quadruped/sheep: Sheep, a woolly cream sheep with a pale face [animals, farm] 0.9 m, joints J42
    sketchfab/Quadruped/snake-wolf: Snake-wolf, a made-up beast with a green scaly back, shaggy blue-green legs, claws and yellow eyes [animals, fantasy, monsters] 1 m, joints J43
    sketchfab/Quadruped/stripe-the-cat: Stripe the cat, a grey cat with big green eyes and a red collar [animals, pets] 0.3 m, joints J44
    sketchfab/Quadruped/tuxedo-cat: Tuxedo cat, a black and white cat with green eyes and a blue collar [animals, pets] 0.3 m, joints J45
    sketchfab/Quadruped/wolf: Wolf, a grey wolf with a pale face and a bushy tail [animals, woodland, fairy tale] 0.85 m, joints J46
    sketchfab/Quadruped/zebra: Zebra, a blocky black and white striped zebra [animals, savanna] 1.6 m, joints J47
    styloo/Quadruped/cat: Cat, a cream cat with light brown legs, ears and face, and blue eyes [animals, pets] 0.3 m, joints J40
    styloo/Quadruped/cow: Cow, a black and white cow with a pink nose [animals, farm] 1.6 m, joints J40
    styloo/Quadruped/dog: Dog, a grey dog with a black and white head and floppy ears [animals, pets] 0.65 m, joints J40
    styloo/Quadruped/giraffe: Giraffe, a tall giraffe with orange-brown patches and a long neck [animals, savanna] 4.99 m, joints J40
    vuena/Quadruped/cat: Cat, a chunky toy-style ginger cat with a white chest and big green eyes [animals, pets] 0.35 m, joints J48
    vuena/Quadruped/fox: Fox, a chunky toy-style orange fox with a white face and dark paws [animals, woodland] 0.45 m, joints J48
  Swimmer
    sketchfab/Swimmer/dolphin: Dolphin, a dark grey dolphin with an orange stripe and a white belly [animals, sea] 0.35 m, joints J49
    sketchfab/Swimmer/fish: Fish, a small silver fish [animals, sea, pond] 0.1 m, joints J50
    sketchfab/Swimmer/humpback-whale: Humpback whale, a dark humpback whale with very long flippers and a striped pale throat [animals, sea] 1.2 m, joints J51
    sketchfab/Swimmer/koi: Koi carp, a cartoon koi, grey and black with yellow fins, long whiskers and big yellow eyes [animals, pond, garden] 0.2 m, joints J52
    sketchfab/Swimmer/narwhal: Narwhal, a deep blue narwhal speckled with stars, with a long tusk [animals, sea, fantasy] 0.7 m, joints J49
    sketchfab/Swimmer/shark: Shark, a grey cartoon shark with a big toothy grin [animals, sea] 0.8 m, joints J53

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
    scottishmaritime/Prop/locomotive-headlamp: Locomotive headlamp, a steam train's old metal headlamp [trains, engines, history] 0.37 m, no joints
    scottishmaritime/Prop/safety-lamp: Miner's safety lamp, a brass miner's safety lamp with a glass cylinder [inventions, history, mining] 0.28 m, no joints
    scottishmaritime/Prop/snow-goggles: Captain Scott's snow goggles, wooden snow goggles with thin eye slits, from a polar expedition [exploration, history, polar] 0.09 m, no joints
    smithsonian/Prop/lincoln-patent-model: Lincoln's patent model, Abraham Lincoln's wooden model of a boat with floats to lift it over shallow water [inventions, history] 0.25 m, no joints
    smithsonian/Prop/morse-telegraph-key: Morse telegraph key, an early telegraph key on a wooden base, for sending Morse code [inventions, history] 0.08 m, no joints
  Transport
    polypizza/Transport/aeroplane: Aeroplane, a white passenger aeroplane [transport] 11.83 m, no joints
    polypizza/Transport/bicycle: Bicycle, an orange bicycle [transport] 1 m, no joints
    polypizza/Transport/bus: Bus, a white and blue coach [transport, town] 3.2 m, no joints
    polypizza/Transport/car: Car, a small blue car [transport, town] 1.5 m, no joints
    polypizza/Transport/rocket: Rocket, a white rocket with red fins and a round window [space] 11.95 m, no joints
    polypizza/Transport/rowing-boat: Rowing boat, a small white rowing boat [transport, sea] 0.6 m, no joints
    polypizza/Transport/steam-train: Steam train, a small steam engine with its coal wagon [transport, history] 4 m, no joints
    scottishmaritime/Transport/mary-chalmers: Rowing boat, a small red wooden rowing boat [sea, boats, history] 0.41 m, no joints
    scottishmaritime/Transport/venus: Shetland rowing boat, a wooden Shetland rowing boat on a wooden stand [sea, boats, history] 1.62 m, no joints

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
    scottishmaritime/Prop/steam-hammer: Steam hammer, a tall iron steam hammer from a shipyard [engines, inventions, history] 3.45 m, no joints
    smithsonian/Prop/triceratops: Triceratops skeleton, a Triceratops fossil skeleton, lying on its side, with three horns and a bony frill [fossils, dinosaurs, museum] 1.65 m, no joints
    smithsonian/Prop/woolly-mammoth: Woolly mammoth skeleton, a woolly mammoth's skeleton, with long curved tusks [fossils, museum, science] 3.4 m, no joints
  Transport
    scottishmaritime/Transport/mv-spartan: Wrecked puffer ship, the wreck of a small old cargo ship, its hull broken and rusted [sea, boats, history] 9.14 m, no joints
    scottishmaritime/Transport/rnlb-jane-anne: Lifeboat, an old wooden lifeboat with a dark hull [sea, boats, history] 2.74 m, no joints
    smithsonian/Transport/apollo-11-command-module: Apollo 11 command module, the cone-shaped Apollo 11 spacecraft that brought three astronauts home from the Moon [space, history] 3.2 m, no joints
    smithsonian/Transport/bell-x-1: Bell X-1, the orange rocket plane that first flew faster than sound [flight, history] 3.2 m, no joints
    smithsonian/Transport/space-shuttle-discovery: Space Shuttle Discovery, the white Space Shuttle Discovery, with black tiles underneath [space, history] 15.8 m, no joints

Backdrops
  A scene's ground or sky: set it as the scene's backdrop, never add it as a model.
  Ground
    storystage/Ground/brick: Brick, red bricks [town, home]
    storystage/Ground/brownSavannaGrass: Brown savanna grass, short dry brown grass [savanna, nature]
    storystage/Ground/darkForestFloor: Dark forest floor, dark fallen leaves on the ground [forest, night]
    storystage/Ground/darkGrass: Dark grass, dark green grass [nature, fantasy]
    storystage/Ground/desert: Desert, pale cream sand [desert]
    storystage/Ground/dirt: Dirt, bare brown earth [nature, countryside]
    storystage/Ground/dryGrass: Dry grass, dry yellow grass [nature, countryside]
    storystage/Ground/forestFloor: Forest floor, brown earth with fallen leaves [forest, nature]
    storystage/Ground/grass: Grass, short green grass [nature, countryside]
    storystage/Ground/greenSavannaGrass: Green savanna grass, short yellow-green grass [savanna, nature]
    storystage/Ground/ice: Ice, pale blue cracked ice [winter]
    storystage/Ground/jungle: Jungle, mossy green forest ground [jungle, forest]
    storystage/Ground/mars: Mars, orange-red gravel [space]
    storystage/Ground/moon: Moon, fine, dusty grey ground [space]
    storystage/Ground/oceanFloor: Sea floor, pale sand on the sea floor [sea, nature]
    storystage/Ground/poisonSwamp: Poison swamp, bright green moss [swamp, fantasy]
    storystage/Ground/redForestFloor: Red forest floor, red fallen leaves on the ground [forest, autumn]
    storystage/Ground/rockyBrown: Rocky brown, brown earth with small stones [nature, countryside]
    storystage/Ground/rockyRed: Rocky red, red earth with small stones [desert, space]
    storystage/Ground/rockySand: Rocky sand, pale sand with small stones and grass [nature, beach]
    storystage/Ground/room: Room, a wooden plank floor, for a room [home, school]
    storystage/Ground/sand: Sand, smooth yellow sand [beach, nature]
    storystage/Ground/sandyDesert: Sandy desert, golden sand in small ripples [desert]
    storystage/Ground/snow: Snow, smooth white snow [winter, nature]
    storystage/Ground/swamp: Swamp, muddy green ground with twigs [swamp, nature]
    storystage/Ground/swampWater: Swamp water, murky green water over mud [swamp, nature]
    storystage/Ground/wood: Wood, wooden planks [home, pirates]
  Scene
    storystage/Sky/clearDay: Clear day, a clear blue sky with the sun high [day]
    storystage/Sky/cloudy: Cloudy, a blue sky with white clouds [day]
    storystage/Sky/night: Night, a dark moonlit night sky [night]
    storystage/Sky/sunset: Sunset, a sunset with the sun low on the horizon [evening]
`;

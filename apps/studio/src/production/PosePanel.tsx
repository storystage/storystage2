/**
 * Pose (`07-ux.md` section 7.2; WP7.1): a character's joints, from its class's joint map, each
 * turned by three fields in turns: heading, tilt and roll, in the joint's own axes. Typing in a
 * field poses the character on the stage, as one undo step for each run of typing ("Pose
 * penguin's head"); Straighten puts the joint back at rest.
 *
 * Pose on the stage (7.16, decision 0073; S3's WP5d): the stage shows the character's hands and
 * feet, and dragging one bends its arm or leg so it follows. One drag is one undo step ("Pose
 * penguin's left hand"), and Esc puts a drag back (the scene view's). A tap on a hand chooses
 * its joint here. Hands and feet has a button for each, whose keys move it as a drag would.
 */
import type { SceneId } from '@storystage/production';
import type { EditableStage, PoseHandle } from '@storystage/stage';
import type { ObjectId, SceneObjectSetup } from '@storystage/story-api';
import { Button, Icon, Toggle, useThemeStyle } from '@storystage/ui';
import { useEffect, useId, useRef, useState } from 'react';
import {
  Button as AriaButton,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  NumberField,
  Popover,
  Select,
  SelectValue,
} from 'react-aria-components';
import { words } from '../strings.ts';
import type { Studio } from '../studio.ts';
import {
  AXES,
  POSE_LIMITS,
  POSE_STEP,
  REST,
  jointTurn,
  jointTurns,
  sameTurn,
  turnOfJoint,
  withJoint,
  withPose,
  type JointTurns,
  type PoseJoint,
} from './pose.ts';
import { nudgePlace } from './setup.ts';

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const handWord = (handle: PoseHandle) => words.t(`production.pose.${handle}`);
const toCentimetre = (n: number) => Math.round(n * 100) / 100 + 0;

/**
 * The hands and feet the stage can pose an object by: none without a stage, for a prop, or for
 * one it hasn't loaded yet. `loads` is the stage's count of set-ups shown, so a load asks again.
 */
function handlesOf(
  stage: EditableStage | null,
  object: ObjectId,
  loads: number,
): readonly PoseHandle[] {
  try {
    if (loads === 0) return [];
    return stage ? stage.poseHandles(object) : [];
  } catch {
    return [];
  }
}

export function PosePanel({
  studio,
  scene,
  object,
  joints,
  stage = null,
  shown: loads = 0,
  onAnnounce = () => {},
}: {
  studio: Studio;
  scene: SceneId;
  object: SceneObjectSetup;
  /** The joints it can be posed by (`poseJoints`): at least one. */
  joints: readonly PoseJoint[];
  /** The scene view's stage, once it shows the set-up: Pose on the stage needs it. */
  stage?: EditableStage | null;
  /**
   * How many times the stage has shown the set-up: what it can pose is asked again after each,
   * so a character it was still loading gets Pose on the stage once it has it (S3's review).
   */
  shown?: number;
  /** Says where a hand moved by keys went. */
  onAnnounce?: (words: string) => void;
}) {
  const themeStyle = useThemeStyle();
  const hintId = useId();
  const readOnly = studio.readOnly !== null;
  const [chosen, setChosen] = useState<string>(joints[0]!.id);
  const joint = joints.find((j) => j.id === chosen) ?? joints[0]!;
  const turn = turnOfJoint(object.joints, joint.id);
  // What was typed, shown for as long as it is still the joint's turn: near a quarter-turn tilt
  // the same turn reads back as other numbers (S3).
  const [typed, setTyped] = useState<{ key: string; turns: JointTurns } | null>(null);
  const key = `${object.id}:${joint.id}`;
  const shown =
    typed && typed.key === key && sameTurn(jointTurn(typed.turns), turn)
      ? typed.turns
      : jointTurns(turn);
  const atRest = sameTurn(turn, REST);

  // Pose on the stage: the hands and feet, while it's on, on a film that can be changed.
  const handles = readOnly ? [] : handlesOf(stage, object.id, loads);
  const [onStage, setOnStage] = useState(false);
  const posing = onStage && handles.length > 0;

  // What the stage's listeners write with: the film and the panel as they are now.
  const latest = useRef({ studio, scene, object, joints });
  useEffect(() => {
    latest.current = { studio, scene, object, joints };
  });

  useEffect(() => {
    if (!stage || !posing) return;
    const id = object.id;
    try {
      stage.showPoseHandles(id);
    } catch {
      // Not on the stage yet: asked again when the next set-up shows (`loads`).
      return;
    }
    // A drag is written when it's let go, as one undo step.
    const offPose = stage.onPose((e) => {
      if (!e.final || e.object !== id) return;
      const now = latest.current;
      now.studio.commit(
        words.t('production.pose.step', { name: id, joint: handWord(e.handle) }),
        withPose(now.studio.production, now.scene, id, e.joints),
      );
    });
    // A tap on a hand or foot chooses its joint, so its fields are a tap away.
    const offTap = stage.onTap((picked) => {
      const target = picked.target;
      if (!picked.pose || !target || !('object' in target) || target.object !== id) return;
      try {
        const end = stage.poseHandleJoints(id, picked.pose)[2];
        if (end && latest.current.joints.some((j) => j.id === end)) setChosen(end);
      } catch {
        // Not a hand it can be posed by any more.
      }
    });
    return () => {
      offPose();
      offTap();
      try {
        stage.showPoseHandles(null);
      } catch {
        // The stage has gone.
      }
    };
    // Again after each load, since a request the stage refused isn't kept (S3's review).
  }, [stage, posing, object.id, loads]);

  const pose = (turns: JointTurns, axis: string) => {
    setTyped({ key, turns });
    studio.commit(
      words.t('production.pose.step', { name: object.id, joint: joint.word }),
      withJoint(studio.production, scene, object.id, joint.id, jointTurn(turns)),
      `pose:${scene}:${key}:${axis}`,
    );
  };

  /** A key on a hand's button: moved as a drag would move it, one undo step a run of keys. */
  const moveHand = (handle: PoseHandle, k: { key: string; shiftKey: boolean }) => {
    if (!stage) return false;
    try {
      const at = nudgePlace(
        stage.handlePlace(object.id, handle),
        k.key,
        k.shiftKey,
        stage.viewTransform(),
      );
      if (!at) return false;
      const posed = stage.posedReaching(object.id, handle, at);
      // The stage follows at once, so the next key steps from here.
      stage.setObject(object.id, { joints: posed });
      studio.commit(
        words.t('production.pose.step', { name: object.id, joint: handWord(handle) }),
        withPose(studio.production, scene, object.id, posed),
        `hand:${scene}:${object.id}:${handle}`,
      );
      const now = stage.handlePlace(object.id, handle);
      onAnnounce(
        words.t('production.pose.handAt', {
          hand: capital(handWord(handle)),
          x: toCentimetre(now.x),
          y: toCentimetre(now.y),
          z: toCentimetre(now.z),
        }),
      );
      return true;
    } catch {
      // Not a hand it can be posed by any more.
      return false;
    }
  };

  /** A hand's button pressed: its joint, chosen. */
  const chooseHand = (handle: PoseHandle) => {
    try {
      const end = stage?.poseHandleJoints(object.id, handle)[2];
      if (end && joints.some((j) => j.id === end)) setChosen(end);
    } catch {
      // Not a hand it can be posed by any more.
    }
  };

  return (
    <div className="pr-pose" role="group" aria-labelledby="pr-pose-title">
      <h3 id="pr-pose-title" className="pr-pose-title">
        {words.t('production.pose.title', { name: object.id })}
      </h3>
      {handles.length > 0 && (
        <div className="pr-pose-stage">
          <Toggle isSelected={onStage} onChange={setOnStage}>
            {words.t('production.pose.onStage')}
          </Toggle>
          {posing && <p className="pr-pose-hint">{words.t('production.pose.onStageHint')}</p>}
        </div>
      )}
      <Select
        className="pr-picker"
        selectedKey={joint.id}
        onSelectionChange={(k) => k !== null && setChosen(String(k))}
      >
        <Label className="pr-picker-label">{words.t('production.pose.joint')}</Label>
        <AriaButton className="pr-picker-button">
          <SelectValue />
          <Icon name="arrow_drop_down" />
        </AriaButton>
        <Popover className="ss-root sb-popover" style={themeStyle}>
          <ListBox className="sb-menu" items={joints}>
            {(j) => (
              <ListBoxItem id={j.id} className="sb-menu-item" textValue={capital(j.word)}>
                {capital(j.word)}
                {object.joints?.[j.id] && !sameTurn(object.joints[j.id]!, REST) && (
                  <span className="pr-pose-posed">{words.t('production.pose.posed')}</span>
                )}
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </Select>
      <div className="pr-pose-fields">
        {AXES.map((axis) => (
          <NumberField
            key={`${key}-${axis}`}
            className="pr-number"
            value={shown[axis]}
            minValue={-POSE_LIMITS[axis]}
            maxValue={POSE_LIMITS[axis]}
            step={POSE_STEP}
            isDisabled={readOnly}
            formatOptions={{ maximumFractionDigits: 3 }}
            onChange={(value) => {
              if (!Number.isFinite(value)) return;
              pose({ ...shown, [axis]: value }, axis);
            }}
            onBlur={() => studio.seal()}
          >
            <Label className="pr-number-label">{words.t(`production.pose.${axis}`)}</Label>
            <Input className="ss-input pr-number-input" />
          </NumberField>
        ))}
        {!readOnly && (
          <Button
            variant="quiet"
            icon="undo"
            isDisabled={atRest}
            aria-label={words.t('production.pose.straightenNamed', { joint: joint.word })}
            onPress={() => {
              setTyped(null);
              studio.commit(
                words.t('production.pose.straightenStep', { name: object.id, joint: joint.word }),
                withJoint(studio.production, scene, object.id, joint.id, null),
              );
            }}
          >
            {words.t('production.pose.straighten')}
          </Button>
        )}
      </div>
      {posing && (
        <div className="pr-pose-hands" role="group" aria-label={words.t('production.pose.hands')}>
          <p id={hintId} className="pr-pose-hint">
            {words.t('production.pose.handsHint')}
          </p>
          {handles.map((handle) => (
            <Button
              key={handle}
              variant="secondary"
              aria-describedby={hintId}
              onPress={() => chooseHand(handle)}
              onKeyDown={(k) => {
                if (moveHand(handle, k)) k.preventDefault();
                else k.continuePropagation();
              }}
              onBlur={() => studio.seal()}
            >
              {capital(handWord(handle))}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

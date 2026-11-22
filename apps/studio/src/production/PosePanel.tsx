/**
 * Pose (`07-ux.md` section 7.2; WP7.1): a character's joints, from its class's joint map, each
 * turned by three fields in turns: heading, tilt and roll, in the joint's own axes. Typing in a
 * field poses the character on the stage, as one undo step for each run of typing ("Pose
 * penguin's head"); Straighten puts the joint back at rest. Handles on the stage are for later.
 */
import type { SceneId } from '@storystage/production';
import type { SceneObjectSetup } from '@storystage/story-api';
import { Button, Icon, useThemeStyle } from '@storystage/ui';
import { useState } from 'react';
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
  type JointTurns,
  type PoseJoint,
} from './pose.ts';

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function PosePanel({
  studio,
  scene,
  object,
  joints,
}: {
  studio: Studio;
  scene: SceneId;
  object: SceneObjectSetup;
  /** The joints it can be posed by (`poseJoints`): at least one. */
  joints: readonly PoseJoint[];
}) {
  const themeStyle = useThemeStyle();
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

  const pose = (turns: JointTurns, axis: string) => {
    setTyped({ key, turns });
    studio.commit(
      words.t('production.pose.step', { name: object.id, joint: joint.word }),
      withJoint(studio.production, scene, object.id, joint.id, jointTurn(turns)),
      `pose:${scene}:${key}:${axis}`,
    );
  };

  return (
    <div className="pr-pose" role="group" aria-labelledby="pr-pose-title">
      <h3 id="pr-pose-title" className="pr-pose-title">
        {words.t('production.pose.title', { name: object.id })}
      </h3>
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
    </div>
  );
}

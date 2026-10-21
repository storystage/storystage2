/**
 * Spike 1.5, option B: Blockly made to look and behave like Alice's tiles.
 * - An "alice" renderer: flat joins instead of puzzle notches, rounded tiles.
 * - Typed inputs: the move block takes an object and a number; Blockly's connection checks
 *   refuse anything else.
 * - Everything lives under one "when the scene starts" block. A block dropped anywhere else is
 *   refused (removed), as Alice refuses it, instead of being left loose on the workspace.
 * - Dropping a new move block asks for its arguments with the same cascade as option C.
 * - Keyboard navigation from Blockly's core (on by default in v13).
 */
import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';
import { useEffect, useRef, useState } from 'react';
import { Cascade, type CascadeResult } from './Cascade.tsx';
import { installHooks } from './frames.ts';
import { DIRECTIONS, OBJECTS, newId, toText, type Statement, type Value } from './model.ts';

Blockly.setLocale(En as unknown as Record<string, string>);

class AliceConstants extends Blockly.blockRendering.ConstantProvider {
  constructor() {
    super();
    this.CORNER_RADIUS = 6;
    this.NOTCH_WIDTH = 0;
    this.NOTCH_HEIGHT = 0;
    this.TAB_WIDTH = 4;
  }
  protected override makeNotch() {
    // Alice's tiles stack flush: no notch.
    return { type: this.SHAPES['NOTCH']!, width: 0, height: 0, pathLeft: '', pathRight: '' };
  }
  protected override makePuzzleTab() {
    // A slot is a flat-sided pocket, not a jigsaw tab.
    const h = this.TAB_HEIGHT;
    return {
      type: this.SHAPES['PUZZLE']!,
      width: 4,
      height: h,
      pathDown: `l 0 ${h}`,
      pathUp: `l 0 ${-h}`,
    };
  }
}
class AliceRenderer extends Blockly.thrasos.Renderer {
  constructor(name: string) {
    super(name);
  }
  protected override makeConstants_(): Blockly.blockRendering.ConstantProvider {
    return new AliceConstants();
  }
}
let registered = false;
function register() {
  if (registered) return;
  registered = true;
  Blockly.blockRendering.register('alice', AliceRenderer);
  // Keyboard navigation is registered by Blockly 13 itself (registering it again throws).
  Blockly.common.defineBlocksWithJsonArray([
    {
      type: 'ss_main',
      message0: 'when the scene starts %1 %2',
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: 45,
      deletable: false,
      movable: false,
    },
    {
      type: 'ss_move',
      message0: '%1 move %2 %3',
      args0: [
        { type: 'input_value', name: 'TARGET', check: 'Object' },
        { type: 'field_dropdown', name: 'DIRECTION', options: DIRECTIONS.map((d) => [d, d]) },
        { type: 'input_value', name: 'AMOUNT', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: 'Statement',
      nextStatement: 'Statement',
      colour: 200,
    },
    {
      type: 'ss_do_together',
      message0: 'do together %1 %2',
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO', check: 'Statement' }],
      previousStatement: 'Statement',
      nextStatement: 'Statement',
      colour: 120,
    },
    {
      type: 'ss_do_in_order',
      message0: 'do in order %1 %2',
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO', check: 'Statement' }],
      previousStatement: 'Statement',
      nextStatement: 'Statement',
      colour: 120,
    },
    {
      type: 'ss_object',
      message0: 'the %1',
      args0: [{ type: 'field_dropdown', name: 'NAME', options: OBJECTS.map((o) => [o, o]) }],
      output: 'Object',
      colour: 30,
    },
    {
      type: 'ss_number',
      message0: '%1',
      args0: [{ type: 'field_number', name: 'VALUE', value: 1, min: 0 }],
      output: 'Number',
      colour: 260,
    },
  ]);
}

const TOOLBOX = {
  kind: 'flyoutToolbox',
  contents: [
    { kind: 'block', type: 'ss_move' },
    { kind: 'block', type: 'ss_do_together' },
    { kind: 'block', type: 'ss_do_in_order' },
    ...OBJECTS.map((name) => ({ kind: 'block', type: 'ss_object', fields: { NAME: name } })),
    { kind: 'block', type: 'ss_number' },
  ],
};

/** Reads the workspace into the shared model, for the parity check with option C. */
function toModel(main: Blockly.Block): Statement[] {
  const value = (b: Blockly.Block | null): Value | null =>
    !b
      ? null
      : b.type === 'ss_object'
        ? { id: b.id, kind: 'object', name: b.getFieldValue('NAME') }
        : { id: b.id, kind: 'number', value: Number(b.getFieldValue('VALUE')) };
  const list = (first: Blockly.Block | null): Statement[] => {
    const out: Statement[] = [];
    for (let b = first; b; b = b.getNextBlock()) {
      if (b.type === 'ss_move')
        out.push({
          id: b.id,
          kind: 'move',
          target: value(b.getInputTargetBlock('TARGET')),
          direction: b.getFieldValue('DIRECTION'),
          amount: value(b.getInputTargetBlock('AMOUNT')),
        });
      else
        out.push({
          id: b.id,
          kind: b.type === 'ss_do_together' ? 'doTogether' : 'doInOrder',
          body: list(b.getInputTargetBlock('DO')),
        });
    }
    return out;
  };
  return list(main.getInputTargetBlock('DO'));
}

export function BlocklyEditor() {
  const host = useRef<HTMLDivElement>(null);
  const [cascade, setCascade] = useState<{ id: string; x: number; y: number } | null>(null);
  const [announce, setAnnounce] = useState('');
  const ws = useRef<Blockly.WorkspaceSvg | null>(null);

  useEffect(() => {
    register();
    const workspace = Blockly.inject(host.current!, {
      renderer: 'alice',
      toolbox: TOOLBOX,
      trashcan: false,
      move: { scrollbars: true, drag: true, wheel: true },
    });
    ws.current = workspace;
    const main = workspace.newBlock('ss_main');
    main.initSvg();
    main.render();
    main.moveBy(20, 20);
    installHooks(() => toText(toModel(main)));
    // For the Playwright run: where a connection is on screen, and what has keyboard focus.
    const toScreen = (c: Blockly.Connection) => {
      const p = Blockly.utils.svgMath.wsToScreenCoordinates(
        workspace,
        new Blockly.utils.Coordinate(c.x, c.y),
      );
      return { x: p.x, y: p.y };
    };
    (window as unknown as { spikeBlockly: unknown }).spikeBlockly = {
      mainDo: () => toScreen(main.getInput('DO')!.connection!),
      firstMoveTarget: () => {
        const move = workspace
          .getBlocksByType('ss_move', false)
          .find((b) => b.getRootBlock() === main);
        return move ? toScreen(move.getInput('TARGET')!.connection!) : null;
      },
      blockCount: () => workspace.getAllBlocks(false).length,
      focused: () => {
        const el = document.activeElement as HTMLElement | null;
        return el ? `${el.tagName}.${el.getAttribute('class') ?? ''}#${el.id}` : null;
      },
    };

    const created = new Set<string>();
    const listener = (e: Blockly.Events.Abstract) => {
      if (e.type === Blockly.Events.BLOCK_CREATE) {
        const ce = e as Blockly.Events.BlockCreate;
        if (ce.blockId && ce.blockId !== main.id) created.add(ce.blockId);
      }
      if (e.type !== Blockly.Events.BLOCK_DRAG) return;
      const de = e as Blockly.Events.BlockDrag;
      if (de.isStart) return;
      const block = de.blockId ? workspace.getBlockById(de.blockId) : null;
      if (!block) return;
      // Refuse a drop that didn't land in the program (Alice never leaves tiles loose).
      if (block.getRootBlock() !== main) {
        block.dispose(false);
        setAnnounce("That can't go there");
        return;
      }
      if (block.type === 'ss_move' && created.has(block.id)) {
        created.delete(block.id);
        const r = (block as Blockly.BlockSvg).getSvgRoot().getBoundingClientRect();
        setCascade({ id: block.id, x: r.left, y: r.bottom + 4 });
      } else created.delete(block.id);
    };
    workspace.addChangeListener(listener);
    return () => workspace.dispose();
  }, []);

  const finish = (r: CascadeResult) => {
    const workspace = ws.current!;
    const block = workspace.getBlockById(cascade!.id)!;
    Blockly.Events.setGroup(true);
    block.setFieldValue(r.direction, 'DIRECTION');
    const target = workspace.newBlock('ss_object', newId()) as Blockly.BlockSvg;
    target.setFieldValue(r.target, 'NAME');
    target.initSvg();
    target.render();
    block.getInput('TARGET')!.connection!.connect(target.outputConnection!);
    const amount = workspace.newBlock('ss_number', newId()) as Blockly.BlockSvg;
    amount.setFieldValue(String(r.amount), 'VALUE');
    amount.initSvg();
    amount.render();
    block.getInput('AMOUNT')!.connection!.connect(amount.outputConnection!);
    Blockly.Events.setGroup(false);
    setCascade(null);
    setAnnounce(`${r.target} moves ${r.direction} ${r.amount} metres`);
  };
  const cancel = () => {
    ws.current?.getBlockById(cascade!.id)?.dispose(true);
    setCascade(null);
    setAnnounce('Cancelled');
  };

  return (
    <div className="editor blockly">
      <div ref={host} className="blockly-host" />
      {cascade && <Cascade x={cascade.x} y={cascade.y} onDone={finish} onCancel={cancel} />}
      <div className="live" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

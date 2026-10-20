/**
 * The Alice-style cascade that asks for a procedure's arguments as its tile lands: who, which
 * way, how far. Keyboard: arrows to choose, Enter to pick, Escape to cancel the drop.
 */
import { useEffect, useRef, useState } from 'react';
import { AMOUNTS, DIRECTIONS, OBJECTS, type Direction } from './model.ts';

export interface CascadeResult {
  target: string;
  direction: Direction;
  amount: number;
}

const STEPS = [
  {
    key: 'target',
    question: 'Who moves?',
    options: OBJECTS.map((o) => ({ label: `the ${o}`, value: o })),
  },
  {
    key: 'direction',
    question: 'Which way?',
    options: DIRECTIONS.map((d) => ({ label: d, value: d })),
  },
  {
    key: 'amount',
    question: 'How far?',
    options: AMOUNTS.map((a) => ({ label: `${a} m`, value: a })),
  },
] as const;

export function Cascade(props: {
  x: number;
  y: number;
  onDone: (r: CascadeResult) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<Record<string, unknown>>({});
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const current = STEPS[step]!;

  useEffect(() => items.current[active]?.focus(), [step, active]);

  const pick = (i: number) => {
    const next = { ...chosen, [current.key]: current.options[i]!.value };
    if (step === STEPS.length - 1) props.onDone(next as unknown as CascadeResult);
    else {
      setChosen(next);
      setStep(step + 1);
      setActive(0);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    const n = current.options.length;
    if (e.key === 'ArrowDown') setActive((active + 1) % n);
    else if (e.key === 'ArrowUp') setActive((active + n - 1) % n);
    else if (e.key === 'Enter' || e.key === ' ') pick(active);
    else if (e.key === 'Escape') props.onCancel();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="cascade" style={{ left: props.x, top: props.y }} onKeyDown={onKey}>
      <div className="cascade-question" id="cascade-q">
        {current.question}
      </div>
      <ul role="menu" aria-labelledby="cascade-q">
        {current.options.map((o, i) => (
          <li
            key={String(o.value)}
            role="menuitem"
            tabIndex={i === active ? 0 : -1}
            ref={(el) => {
              items.current[i] = el;
            }}
            className={i === active ? 'active' : ''}
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(i)}
          >
            {o.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

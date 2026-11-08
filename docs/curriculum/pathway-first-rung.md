# The pathway's first rung: from blocks to Python (WP16.8)

- **Workplan:** 16.8, "map the text view to KS3 text programming and GCSE computer science (commonly Python), so the pathway guide (20.4) starts there, before Unreal and Unity."
- **Why it matters:** the curriculum mapping found StoryStage's weakest fit is KS3 computing, which asks for "two or more programming languages, at least one of which is textual" (`EN-CO-KS3-3`, partial; `mapping.md` theme 14). StoryStage's read-only **text view** (WP2.5) is the bridge. This page says what it carries over, what it doesn't, and how a teacher uses it to take learners aged 11 to 13 on to Python.
- **Written:** 8 November 2026, against the text view as built (`packages/ast/src/text.ts`; spec 01 §6) and the curricula in force.
- **Licence:** CC BY 4.0 (decision 0041).

## 1. What the text view shows

The text view prints the learner's program as read-only, Python-like text, and lights up each line as it runs. Spec 01 §6's example:

```
class Scene1(Scene):
    cat: Quadruped  # set in the scene
    score: WholeNumber = 0

    def myFirstMethod(self):
        self.cat.say(text="Hello")
        do_together:
            self.cat.move(amount=1, direction=MoveDirection.forward, duration=2)
        for _ in range(3):
            self.score = self.score + 1

    when clickOnObject(setOfVisuals=[self.cat]):
        self.cat.say(text="Ouch")
```

## 2. What carries over to Python, and what doesn't

| Idea | In the text view | In Python | Carries over? | Teaching point |
|---|---|---|---|---|
| Sequence | One statement per line, in order | The same | **Yes** | Order matters, as in the storyboard |
| Calling an action | `self.cat.say(text="Hello")` | The same: a method call with a keyword argument | **Yes** | An object (the cat) does an action (say), with details (`text=`) |
| Variables and types | `score: WholeNumber = 0` | `score: int = 0` (the type is optional in Python) | **Mostly** | StoryStage's type names (`WholeNumber`, `Number`) become Python's (`int`, `float`, `str`, `bool`) |
| Assignment | `self.score = self.score + 1` | The same | **Yes** | `=` means "becomes", not "equals" |
| Arithmetic | `+ - * / %` | The same | **Yes** | In Python, `/` always gives a decimal: `7 / 2` is `3.5`; `//` gives a whole number |
| Comparisons and logic | `== != < <= > >=`, `and`, `or`, `not`, `True`, `False` | The same | **Yes** | Boolean logic (KS3; GCSE) |
| Joining text | `"Score: " + self.score` | **Not valid** when `score` is a number: Python needs `"Score: " + str(self.score)` | **No, a trap** | Python won't join text and a number without `str()`; an early, common error. (A suggestion for S2 is in section 6) |
| Choosing | `if …:` and `else:` | The same; Python also has `elif` | **Yes** | Indentation shows what's inside, as in Tiles |
| Repeating a number of times | `for _ in range(3):` | The same | **Yes** | Count-controlled iteration |
| Repeating while true | `while …:` | The same | **Yes** | Condition-controlled iteration |
| Going through a list | `for item in items:` | The same | **Yes** | |
| Lists | `[a, b]`, `items[i]`, `len(items)` | The same | **Yes** | Python counts list positions from 0. **To verify:** StoryStage's list positions, against the runtime (S2) |
| Your own actions and questions | `def …(self):`, `return …` | The same | **Yes** | Subroutines: procedures and functions |
| Classes | `class Scene1(Scene):`, `self` | The same | **Yes, but later** | Objects and classes are beyond GCSE; it's enough that `self` means "this scene" |
| Comments | `# …` | The same | **Yes** | Readable code, with meaningful names (N5; GCSE) |
| Doing things at the same time | `do_together:`, `each_together …:` | **Not Python** | **No** | StoryStage's own. Python needs threads or `asyncio`, beyond GCSE. Explain it as "two characters acting at once" |
| Events | `when clickOnObject(…):` | **Not Python syntax** | **The idea, not the words** | Event-driven programming exists in Python (for example a button's click handler in `tkinter`), written as a function that's called back |
| Input and output | Characters `say` things; keys and clicks are events | `print()` and `input()` | **Partly** | GCSE asks for text input and output, which StoryStage doesn't teach |

**In short:** sequence, variables, assignment, arithmetic, Boolean logic, selection, both kinds of iteration, lists and subroutines all read almost exactly as Python. Doing things together and events don't. The text view is a bridge to Python, not a replacement: learners **read** it in StoryStage, then **write** Python somewhere else.

## 3. Where it meets the curricula (ages 11 to 13, and the next step)

| Id | Curriculum statement (paraphrased) | Source | What the text view gives | Fit |
|---|---|---|---|---|
| `EN-CO-KS3-3` | Use two or more programming languages, at least one textual; use procedures or functions | England, computing KS3 | A second, textual form of the same program, with procedures and functions | Partial: read-only; the bridge activity (section 4) adds writing |
| `EN-CO-KS3-4` | Simple Boolean logic and its uses | England, computing KS3 | `and`, `or`, `not`, comparisons, in conditions | Strong |
| `EN-GCSE-PROG` | Solve problems with sequence, selection and iteration; data types (integer, real, Boolean, character, string); 1-D arrays; Boolean logic; design, write, test and refine programs in a high-level language; structure programs into modules | England, [GCSE subject content for computer science](https://www.gov.uk/government/publications/gcse-computer-science/gcse-subject-content-for-computer-science) (DfE, updated 31 March 2025) | Every construct except text input and output, and records and 2-D arrays | Partial: a foundation for GCSE, read rather than written |
| `SC-TCH-3-14` | Understand language constructs for structured information; read and explain code extracts with variables and data structures | Scotland, `TCH 3-14a` and its benchmark | Code extracts of the learner's own program, with variables and lists | Strong |
| `SC-TCH-4-14` | Understand constructs and data structures in a textual programming language | Scotland, `TCH 4-14a` (Fourth level, beyond StoryStage's ages) | As above | Partial: the start of it |
| `SC-N5-SDD` | Expressions, arithmetic, concatenation, simple and complex conditions with logical operators, fixed and conditional loops, predefined functions; string, character, numeric and Boolean variables; 1-D arrays; readable code | Scotland, [SQA National 5 Computing Science](https://www.sqa.org.uk/sqa/56919.html), Software design and development (check the current specification, C816 75, from 2023) | All but predefined text functions; note SQA's own reference language joins with `&` | Partial: a foundation for S4 |
| `WA-ST-CO-4` | Decompose problems and choose constructs to express solutions in a variety of environments; data structures; test strategies | Wales, Science and Technology, "Computation", step 4 | A second environment for the same solution | Strong |
| `WA-ST-CO-5` | Choose constructs and express solutions in a variety of environments; file handling; test, evaluate and improve a solution in software | Wales, step 5 (about 14 to 16) | As above, without files | Partial |
| `NI-GCSE-DT` | Programming, in CCEA's GCSE Digital Technology (the programming route), usually taught in C# | Northern Ireland, CCEA | The text view's **Java-like** wording (S6, WP7.6) is closer to C# than its Python-like one | Partial |

**For the age range (decision 0039):** this rung is for learners aged 11 to 13, at KS3, S1 to S3, step 4, or Years 8 to 10. Younger learners use the text view to see their blocks as words, which is enough.

## 4. The bridge activity: "From tiles to text"

Three lessons for ages 11 to 13, after learners have made at least one scene in StoryStage (for example use case 2, "Make it match the storyboard"). It's written as a use case, in the same form as `use-cases/`.

| | |
|---|---|
| **Ages** | 11–13 (England Years 7–8, Scotland S1–S2, Wales step 4, Northern Ireland Years 8–9) |
| **Needs** | StoryStage (any version), and Python on the device or in a browser-based Python the school already uses. Python's own `turtle` module draws by moving and turning, which maps directly onto StoryStage's `move` and `turn` |
| **Curriculum** | `EN-CO-KS3-3`, `EN-CO-KS3-4`; `SC-TCH-3-14`; `WA-ST-CO-4` |
| **Prompter** | Off: learners write every line |

**Lesson 1: read your own code.** Open the text view on a scene you made. Rehearse it and watch the lines light up. Learners annotate a printout: which line is the loop, which is the choice, which is the variable? Which lines are StoryStage's own (`do_together`, `when`)?

**Lesson 2: the same idea in Python.** Rewrite the three hops (use case task T3) with `turtle`: a `for _ in range(3):` loop with `forward()` and `left()`, then `print("Rabbit: I made it!")` for `say`. Predict, run, compare with the StoryStage version. Then a variable that counts hops, and an `if` that prints something different on the last one.

**Lesson 3: the traps, and what's next.** The three differences learners will meet first:
- joining text and a number needs `str()`;
- typing mistakes are now possible (StoryStage's editors don't allow them), so learn to read an error message;
- there's no `do_together`.

Finish with a short program of their own design, and a note on where Python leads: GCSE or National 5, and, on the pathway (WP20), the industry tools.

**What to look for:** the learner can point to the same idea in both forms; writes a loop and a condition in Python that runs; and explains one thing StoryStage does that Python doesn't, and why.

## 5. For the pathway guide (WP20.4)

The guide (after the release candidate) starts here and climbs:

1. **Blocks or Tiles** in StoryStage: sequence, together, loops, events.
2. **The text view:** the same program as words (this page).
3. **Python:** writing it, for KS3 and GCSE or National 5 (section 4).
4. **Industry tools:** Unreal Blueprints and C++, Unity C#, Godot, through the pathway exports (WP20), with the "under the hood" notes (20.1) linking each block to the industry idea it stands for.

## 6. Suggestions for other sessions (not changes to their packages)

| For | Suggestion | Why |
|---|---|---|
| **S2** (`packages/ast/src/text.ts`) | When `join` joins text and a number, print `str(…)` around the number, so the Python-like text is valid Python | Learners copying the text into Python otherwise meet a `TypeError` they didn't make |
| **S2** | State in spec 01 whether list positions count from 0 or 1, and keep the text view consistent with Python | Section 2's list row |
| **S6** (`packages/text-view`) | A short "Not in Python" note on hover for `do_together`, `each_together` and `when` | So the text view doesn't teach syntax that doesn't exist |
| **S6** | Keep the Java-like wording close to C# conventions | Northern Ireland's GCSE programming route is commonly taught in C# |

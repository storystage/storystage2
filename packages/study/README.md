# @storystage/study

Study mode: the pseudonymous study log kept on the device, its session codes, the study tasks and the export file.

- **Owner:** S6
- **Workplan:** 7.13 (study build), 24.6 (the export)
- **Spec:** `docs/spec/14-editors.md`, section 6; the draft protocol, `docs/study/protocol.md` section 12

| Use | Gives |
|---|---|
| `new StudySession({ store, context })` | One session (6.3): a new random `code`, and `openTask`, `switched`, `edited`, `undone`, `redone`, `help`, `checked`, `endTask`, `answer` and `close` for the studio to call. Outside a task only switches count; nothing is written until the first task or switch |
| `new StudyStore(files)` | The study's store over the host's `FileStore` (6.7): a file per session, the teacher's ticks for who takes part, the class code and age band |
| `exportLogs(store)` | The export file (6.8): `{ name, bytes, codes }`, every session kept on the device under a new random export id; delete `codes` once it's saved |
| `readExport(bytes)` | Reads an export back, refusing anything that isn't exactly one |
| `isStudyEvent(value)` | True only for one of the log's events with exactly its fields (6.6) |
| `STUDY_TASKS`, `studyTask(task)` | The five tasks (6.4): title, instruction, hint, `holdsEditor` (T1 to T3), the `events` Check my step plays in (T4's click), and `film()`, a fresh copy of the prepared film |
| `checkTask(task, run)` | Check my step's outcome for a run from `@storystage/check`'s `traceScene`: `success`, `notYet` or `error` |
| `TASK_LIMIT_MS` | 15 minutes: the task card ends a task still open as time up |
| `t(key)` | The study's words: the tasks, Check my step's results, the questions, the bar and the notes |
| `newCode()`, `showCode(code)` | A session's code, "K7P3QX2M", shown "K7P3-QX2M" |

There is no network code here, and a test keeps it that way.

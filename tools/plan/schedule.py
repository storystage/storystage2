"""StoryStage 2: dependency model and earliest-start schedule.
Durations are rough planning assumptions in weeks of elapsed time for one lane."""
import json

# id, label, weeks, deps, lane, who
ITEMS = [
    # Start now: no dependencies
    ('WP0',   'Repo, CI, specs, interface contracts (0.1–0.8)', 1.5, [], 'Foundations', 'C'),
    ('WP1.1', 'Choose reference devices (1.1)', 1, [], 'Spikes', 'U'),
    ('WP1g',  'Classroom ground truth: TR1 lessons, school IT managers (1.11)', 2, [], 'Spikes', 'U'),
    ('WP3a',  'Licence audit and joint map (3.1, 3.3)', 1.5, [], 'Backstage', 'C+U'),
    ('WP12a', 'Interface mock-ups (12.1)', 2, [], 'Interface', 'C+U'),
    ('WP16a', 'Curriculum mapping, four nations (16.1–16.5)', 5, [], 'Curriculum and legal', 'C'),
    ('WP17a', 'CMU/EA letters, rights checks, contract (17.1, 17.5–17.9)', 3, [], 'Curriculum and legal', 'C+U'),
    # After WP0
    ('WP1',   'Spikes 1.2–1.9, go/no-go per spike (1.10)', 3, ['WP0', 'WP1.1'], 'Spikes', 'C+U'),
    ('WP0s',  'Threat model and security spec (0.9)', 1.5, ['WP0'], 'Foundations', 'C'),
    ('WP2',   'AST and edit operations', 3, ['WP0'], 'Language', 'C'),
    ('WP4a',  'Story API spec, types, crosswalk fields (4.1, 4.2, 4.7)', 2, ['WP0', 'WP3a'], 'Language', 'C'),
    ('WP3b',  'Model pipelines: Alice converter, MakeHuman, Kenney, museum (3.2, 3.5, 3.7)', 4, ['WP0', 'WP3a'], 'Backstage', 'C'),
    ('WP10s', 'Sketch library tool (10.5)', 2, ['WP0', 'WP3a'], 'Backstage', 'C'),
    ('WP9a',  '.a3p reader (9.1)', 1, ['WP0', 'WP0s'], 'Productions', 'C'),
    ('WP12b', 'Design system and components (12.2–12.5)', 3, ['WP0', 'WP12a'], 'Interface', 'C'),
    ('WP13a', 'Prompter spec, fake Claude, system prompt, eval set (13.1, 13.7, 13.8)', 3, ['WP0'], 'Prompter and speech', 'C'),
    ('WP15a', 'Tauri targets, policy, release channels (15.1, 15.3, 15.7)', 2, ['WP0'], 'Apps', 'C'),
    ('WP18a', 'Test harness, fake stage, self-test skeleton (18.1, 18.4)', 2, ['WP0'], 'Foundations', 'C'),
    ('WP19a', 'Website and teacher guide drafts (19.1, 19.2)', 3, ['WP12a'], 'Curriculum and legal', 'C+U'),
    ('WP16b', 'Curriculum templates and use cases (16.6)', 3, ['WP16a'], 'Curriculum and legal', 'C+U'),
    ('WP3d',  'Storybook cast commissioned and delivered (3.6)', 10, ['WP16a', 'WP17a'], 'Backstage', 'U'),
    ('WP4d',  'Publish Story API open specification (4.8)', 1, ['WP4a'], 'Language', 'C+U'),
    # After spikes / AST
    ('WP8f',  'Production format spec and data model (8.1)', 1.5, ['WP2'], 'Productions', 'C'),
    ('WP5a',  'Stage core: scene, models, camera, picking, offscreen (5.1–5.5)', 3, ['WP0', 'WP1'], 'Stage', 'C'),
    ('WP5b',  'Stage extras: WebGPU, quality, scene picture, character machinery (5.6–5.8)', 2, ['WP5a'], 'Stage', 'C'),
    ('WP6',   'Runtime interpreter', 4, ['WP2', 'WP4a', 'WP1'], 'Language', 'C'),
    ('WP3c',  'Manifest, budgets, lazy loading (3.4, 3.9)', 2, ['WP1', 'WP3b'], 'Backstage', 'C'),
    ('WP3i',  'Import into Backstage, in-app sketches, licence capture (3.11, 3.12)', 3, ['WP3c', 'WP10s', 'WP8'], 'Backstage', 'C'),
    ('WP11a', 'MP4 encoder module (11.3, 11.5)', 2, ['WP1'], 'Screening room', 'C'),
    ('WP14a', 'Speech engines: whisper WASM, voices (14.1, 14.2)', 3, ['WP1'], 'Prompter and speech', 'C'),
    ('WP15k', 'Key store, transport and policy enforcement point (15.2)', 3, ['WP15a', 'WP1', 'WP0s'], 'Apps', 'C'),
    ('WP15b', 'Signing, stores, browser hosting (15.4–15.6)', 3, ['WP15a'], 'Apps', 'C+U'),
    ('WP9b',  'Map Alice worlds onto the AST (9.2, 9.3)', 2, ['WP9a', 'WP2', 'WP4a', 'WP3c'], 'Productions', 'C'),
    # Core build
    ('WP4b',  'Story API procedures, new blocks, shot types (4.3, 4.4, 4.10)', 3, ['WP4a', 'WP5a'], 'Language', 'C'),
    ('WP8',   'Scenes, running order, save and open (8.2–8.5)', 3, ['WP8f', 'WP5a', 'WP6', 'WP0s'], 'Productions', 'C'),
    ('WP10a', 'Storyboard: script, arcs, cards, frame canvas, PDF', 4, ['WP8f', 'WP12b', 'WP10s'], 'Interface', 'C'),
    ('WP13b', 'Prompter core: transport, context, AST tools, modes, plan before change, wizard', 4.5, ['WP13a', 'WP2', 'WP4a', 'WP15k'], 'Prompter and speech', 'C'),
    ('WP4c',  'Character actions, animation, faces (4.5, 4.6)', 4, ['WP4b', 'WP5b', 'WP3c'], 'Stage', 'C'),
    ('WP7c',  'Alice-style tile editor, full (option C)', 7, ['WP2', 'WP4a', 'WP12b'], 'Tile editor', 'C'),
    ('WP7t',  'Editor switch, parity tests, study build (7.11–7.13)', 1.5, ['WP7', 'WP7c'], 'Tile editor', 'C'),
    ('WP7',   'Production stage and Code editor, Blockly option B', 4, ['WP5a', 'WP6', 'WP12b', 'WP4b'], 'Interface', 'C'),
    ('WP11b', 'Screening room: rough cut, compare, titles, credits, captions', 3, ['WP8', 'WP11a', 'WP12b'], 'Screening room', 'C'),
    ('WP11c', 'Automatic check against the storyboard (11.6)', 2, ['WP10b', 'WP11b'], 'Screening room', 'C'),
    ('WP17b', 'DPIA and privacy notice (17.3, 17.4)', 3, ['WP13b', 'WP14a'], 'Curriculum and legal', 'C+U'),
    # Joining up
    ('WP10b', 'Frames to code links, storyboard rule', 2, ['WP10a', 'WP7', 'WP8'], 'Interface', 'C'),
    ('WP10c', 'Backstage from the Storyboard, set the stage from the storyboard (10.9, 10.10)', 1.5, ['WP10a', 'WP3i', 'WP8', 'WP5b'], 'Interface', 'C'),
    ('WP13c', 'Prompter panel, storyboard tools, story coach, live eval', 2, ['WP13b', 'WP10a', 'WP7'], 'Prompter and speech', 'C+U'),
    ('WP14b', 'Speak line and narration (14.3)', 1, ['WP14a', 'WP13b', 'WP4b'], 'Prompter and speech', 'C'),
    ('WP24a', 'Teacher journey, Prompter access model, relay spike (24.1–24.3)', 2, ['WP1g', 'WP15a', 'WP8f'], 'Apps', 'C+U'),
    ('WP24b', 'Class set-up: pupil folders, class caps, log export (24.4–24.7)', 3, ['WP24a', 'WP8', 'WP15k', 'WP13b'], 'Apps', 'C'),
    # Release candidate and pilot
    ('WP18b', 'Milestone gate tests and device runs (18.2, 18.3)', 2, ['WP7', 'WP7t', 'WP8', 'WP9b', 'WP10b', 'WP11b', 'WP13c', 'WP14b', 'WP4c', 'WP5b', 'WP15k', 'WP15b', 'WP24b'], 'Foundations', 'C+U'),
    ('RC',    'Release candidate (first release)', 0, ['WP18b', 'WP11c', 'WP3i', 'WP10c'], 'Foundations', '—'),
    ('WP19',  'Pilot in schools (19.3, 19.4)', 6, ['RC', 'WP16b', 'WP17b', 'WP19a'], 'Curriculum and legal', 'U'),
    # Beyond the first release (start as soon as dependencies allow)
    ('WP20',  'Pathway: Unreal, Unity, Godot export; guide; MetaHuman trial', 6, ['WP4a', 'WP8', 'RC'], 'Beyond', 'C+U'),
    ('WP21',  'AR design mode', 6, ['WP1', 'WP5a', 'WP8', 'WP15a', 'RC'], 'AR', 'C+U'),
    ('WP22a', 'AR baker and AR pack export: GLB, USDZ, page, QR (22.1–22.4)', 4, ['WP6', 'WP8', 'WP11a', 'RC'], 'AR', 'C'),
    ('WP22b', 'AR player, AR staging, Export for AR (22.5–22.7)', 3, ['WP22a', 'WP21', 'WP11b', 'WP10a'], 'AR', 'C'),
    ('WP22c', 'Mixed-reality film and safeguards (22.8, 22.9)', 2, ['WP22b'], 'AR', 'C+U'),
    ('WP23a', 'Projection spike: surface bake renderer, Pixera build script (23.1, 23.2)', 2, ['WP5a', 'WP6'], 'Projection', 'C+U'),
    ('WP23b', 'Projection stage: surfaces, virtual projectors, preview (23.3, 23.4)', 3, ['WP23a', 'WP8', 'WP12b', 'RC'], 'Projection', 'C'),
    ('WP23c', 'Classroom projection: full-screen warped output (23.5)', 1.5, ['WP23b', 'WP15a'], 'Projection', 'C'),
    ('WP23d', 'Export for projection and Export to Pixera, flash check, guide (23.6–23.9)', 3, ['WP23b', 'WP11a', 'WP11b'], 'Projection', 'C+U'),
]
BEYOND = {'Beyond', 'AR', 'Projection'}

ids = [i[0] for i in ITEMS]
by = {i[0]: dict(id=i[0], label=i[1], dur=i[2], deps=i[3], lane=i[4], who=i[5]) for i in ITEMS}
for it in by.values():
    for d in it['deps']:
        assert d in by, (it['id'], d)

# forward pass (ITEMS listed in a valid topological order is not assumed)
done = {}
def es(i):
    if i in done:
        return done[i]
    it = by[i]
    s = max([es(d) + by[d]['dur'] for d in it['deps']], default=0)
    done[i] = s
    return s
for i in ids:
    by[i]['es'] = es(i)
    by[i]['ef'] = by[i]['es'] + by[i]['dur']
end = max(it['ef'] for it in by.values())
proj_end_rc = by['WP19']['ef']

# Two backward passes: first-release items against the pilot finish (ignoring later strands);
# later strands (AR, pathway, projection) against the overall end.
succ = {i: [] for i in ids}
for it in by.values():
    for d in it['deps']:
        succ[d].append(it['id'])
def backward(members, finish):
    lf = {}
    def LF(i):
        if i in lf:
            return lf[i]
        ss = [x for x in succ[i] if x in members]
        v = min([LF(x) - by[x]['dur'] for x in ss], default=finish)
        lf[i] = v
        return v
    for i in members:
        LF(i)
    return lf
release = {i for i in ids if by[i]['lane'] not in BEYOND}
lf1 = backward(release, proj_end_rc)
lf2 = backward(set(ids), end)
for i in ids:
    by[i]['lf'] = lf1[i] if i in release else lf2[i]
    by[i]['float'] = round(by[i]['lf'] - by[i]['ef'], 2)
    by[i]['beyond'] = i not in release
cp = [i for i in ids if i in release and by[i]['float'] == 0]

# waves: by earliest start
if __name__ == '__main__':
    for i in sorted(ids, key=lambda x: (by[x]['es'], x)):
        it = by[i]
        print(f"{it['es']:5.1f} {it['ef']:5.1f} fl={it['float']:4.1f} {i:6} {it['lane']:22} {it['label']}")
    print('end', end, 'pilot end', proj_end_rc, 'RC', by['RC']['es'])
    print('critical', cp)
    # max concurrency
    for w in range(0, int(end) + 1):
        act = [i for i in ids if by[i]['es'] <= w + 0.01 < by[i]['ef']]
        print(w, len(act), ' '.join(act))
    json.dump(by, open('schedule.json', 'w'), indent=1)

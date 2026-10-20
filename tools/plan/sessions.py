"""StoryStage 2: the session roster.
Each Claude Code session owns an area (see handover/README.md) and works its items one at a time.
Simulates the schedule with that constraint and prints each session's sequence.
Run from tools/plan: python3 sessions.py"""
import schedule as S
by, ids = S.by, S.ids

SESS = {
 'S1': ('Platform and quality', ['WP0','WP1','WP18a','WP11a','WP23a','WP14b','WP18b'], ['WP21','WP22b','WP22c']),
 'S2': ('Language, runtime and Screening room', ['WP2','WP8f','WP6','WP11b','WP11c'], ['WP20']),
 'S3': ('Stage and Story API procedures', ['WP5a','WP4b','WP5b','WP4c'], ['WP23b','WP23d']),
 'S4': ('Backstage and Productions', ['WP3a','WP10s','WP3b','WP3c','WP8','WP3i'], ['WP22a']),
 'S5': ('Studio interface', ['WP12a','WP12b','WP10a','WP7','WP10b','WP10c'], ['WP23c']),
 'S6': ('Story API spec, Tile editor and Alice import', ['WP4a','WP4d','WP7c','WP9a','WP9b','WP7t'], []),
 'S7': ('Prompter and speech', ['WP13a','WP14a','WP13b','WP13c'], []),
 'S8': ('Apps, security and class set-up', ['WP15a','WP0s','WP15k','WP24a','WP15b','WP24b'], []),
 'D':  ('Documents: curriculum, legal, privacy, website', ['WP17a','WP16a','WP16b','WP19a','WP17b'], []),
}

def sim(groups, ordered=True):
    g_of = {i:g for g,l in groups.items() for i in l}
    pos = {i:k for g,l in groups.items() for k,i in enumerate(l)}
    start, fin, t = {}, {}, 0.0
    busy = {g:None for g in groups}
    while len(fin) < len(ids):
        for g,i in busy.items():
            if i and start[i]+by[i]['dur'] <= t+1e-9: fin[i]=start[i]+by[i]['dur']; busy[g]=None
        changed=True
        while changed:
            changed=False
            ready=[i for i in ids if i not in start and all(d in fin for d in by[i]['deps'])]
            ready.sort(key=lambda i:(by[i]['beyond'], pos.get(i,0) if ordered else 0, by[i]['float']))
            for i in ready:
                g=g_of.get(i)
                if g is None:  # owner-only or milestone: not a session
                    start[i]=t
                    if by[i]['dur']==0: fin[i]=t
                    else: busy.setdefault('_'+i,i)
                    changed=True; continue
                if busy[g] is None:
                    start[i]=t; busy[g]=i; changed=True
                    if by[i]['dur']==0: fin[i]=t; busy[g]=None
        t+=0.5
        if t>100: print('stuck', [i for i in ids if i not in fin]); break
    return start, fin

if __name__ == '__main__':
    groups = {k: v[1] + v[2] for k, v in SESS.items()}
    st, fi = sim(groups)
    print('release candidate wk', fi['RC'], '| pilot ends wk', fi['WP19'], '| all done wk', max(fi.values()))
    for k, l in groups.items():
        print(k, SESS[k][0] + ':', ' -> '.join(f"{i} ({st[i]:g}-{fi[i]:g})" for i in sorted(l, key=lambda i: st[i])))

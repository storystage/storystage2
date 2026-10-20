import schedule as S
by=S.by; ids=S.ids
def sim(cap):
    start={};fin={};t=0.0;running=[]
    while len(fin)<len(ids):
        # finish
        for i in list(running):
            if start[i]+by[i]['dur']<=t+1e-9: fin[i]=start[i]+by[i]['dur']; running.remove(i)
        changed=True
        while changed:  # repeat so work after a zero-length milestone can start at the same time
            changed=False
            ready=[i for i in ids if i not in start and all(d in fin for d in by[i]['deps'])]
            ready.sort(key=lambda i:(by[i]['beyond'], by[i]['float']))
            for i in ready:
                usesC = 'C' in by[i]['who'] and by[i]['dur']>0
                nC=sum(1 for r in running if 'C' in by[r]['who'])
                if not usesC or nC<cap:
                    start[i]=t; running.append(i); changed=True
                    if by[i]['dur']==0: fin[i]=t; running.remove(i)
        t+=0.5
        if t>200: break
    return fin['RC'], fin['WP19'], max(fin.values())
for cap in [3,4,5,6,8,10,99]:
    print(cap, sim(cap))

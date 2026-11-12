import openpyxl, glob, re, random, datetime, json
src=glob.glob('/mnt/user-data/uploads/a064d9e0-*.xlsx')[0]
wb=openpyxl.load_workbook(src)
ws=wb.active
tpl={c:ws[f'{c}9'].value for c in 'IJK'}
random.seed(7)
base=datetime.date(1990,1,1)
cases=[]
# 경계 사례 집중: 월말/월초/윤년 2월/31일 시작
def rnd():
    r=random.random()
    if r<0.5:
        s=base+datetime.timedelta(days=random.randint(0,13000))
    else:
        y=random.choice([2000,2004,2019,2020,2023,2024,2025,2026]); m=random.randint(1,12)
        d=random.choice([1,2,15,28,29,30,31]);
        try: s=datetime.date(y,m,d)
        except: s=datetime.date(y,m,28)
    L=random.choice([0,1,2,27,28,29,30,31,32,58,59,60,61,89,90,364,365,366,random.randint(0,4000)])
    e=s+datetime.timedelta(days=L)
    return s,e
N=6000
for _ in range(N): cases.append(rnd())
# 사용자 예시
cases += [(datetime.date(2026,1,1),datetime.date(2026,3,30)),(datetime.date(2026,2,1),datetime.date(2026,3,30)),(datetime.date(2026,3,1),datetime.date(2026,4,1))]
ws.delete_rows(9, 40)
for i,(s,e) in enumerate(cases):
    r=9+i
    ws[f'D{r}']=datetime.datetime(s.year,s.month,s.day); ws[f'E{r}']=datetime.datetime(e.year,e.month,e.day)
    for c in 'IJK':
        ws[f'{c}{r}']=re.sub(r'\b([DE])9\b', lambda m:f'{m.group(1)}{r}', tpl[c])
wb.save('test.xlsx')
json.dump([[s.isoformat(),e.isoformat()] for s,e in cases],open('cases.json','w'))
print(len(cases))

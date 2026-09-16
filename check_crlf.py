import os

files = [
    'frontend/src/components/TooSmallForExam.tsx',
    'frontend/src/components/exam/AutoSubmitNotice.tsx',
    'frontend/src/components/limon/LimonHelp.tsx',
    'frontend/src/lib/examIntegrity.spec.ts',
]
root = r'C:\KSR\Lemon Ideas\Bharat_innovation_olympiad'
for f in files:
    p = os.path.join(root, f)
    with open(p, 'rb') as fp:
        d = fp.read()
    print(f, 'CRLF', d.count(b'\r\n'), 'LF', d.count(b'\n') - d.count(b'\r\n'))

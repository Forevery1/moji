#!/usr/bin/env python3
"""Build/package signed app bundles as DMGs with PRD and changelog snapshots.
Usage: python3 script/release.py --build  (requires Node, Rust targets, Xcode)
       python3 script/release.py          (package already-built matching apps)
No running Moji process is stopped. No GitHub credentials are embedded.
"""
from pathlib import Path
import argparse,hashlib,json,os,platform,plistlib,shutil,subprocess,tempfile,uuid
ROOT=Path(__file__).resolve().parents[1]
def run(*args,**kwargs):
    return subprocess.run([str(a) for a in args],check=True,cwd=ROOT,**kwargs)
def capture(*args):return subprocess.check_output([str(a) for a in args],cwd=ROOT,text=True).strip()
def verify(app,version,arch):
    info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
    if info.get('CFBundleShortVersionString')!=version or info.get('CFBundleIdentifier')!='com.fuhanshen.moji':raise RuntimeError('App version/identifier mismatch: '+str(app))
    binary=app/'Contents/MacOS/moji'
    if capture('lipo','-archs',binary)!=arch:raise RuntimeError('Architecture mismatch')
    if b'com.fuhanshen.moji.verification' in binary.read_bytes():raise RuntimeError('Verification build cannot be published')
    libraries=capture('otool','-L',binary).splitlines()[1:]
    if not all(line.strip().startswith(('/System/Library/','/usr/lib/')) for line in libraries):raise RuntimeError('Non-system runtime library dependency')
    run('codesign','--verify','--deep','--strict',app)
    return info

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--build',action='store_true');args=parser.parse_args()
    os.environ['PATH']=str(Path.home()/'.cargo/bin')+os.pathsep+os.environ.get('PATH','')
    version=json.loads((ROOT/'package.json').read_text())['version']
    for path in [ROOT/'docs/PRD.md',ROOT/'CHANGELOG.md']:
        if version not in path.read_text():raise RuntimeError('Update version documentation before release: '+str(path))
    work=ROOT/'.analysis';work.mkdir(exist_ok=True)
    host='aarch64-apple-darwin' if platform.machine()=='arm64' else 'x86_64-apple-darwin'
    targets=[('aarch64-apple-darwin','arm64','Apple-Silicon'),('x86_64-apple-darwin','x86_64','Intel')]
    config=work/'release-no-ui.json';config.write_text('{"build":{"beforeBuildCommand":""}}')
    if args.build:
        run('npm','run','build')
        for target,_,_ in targets:
            cmd=['npm','run','tauri','--','build','--bundles','app','--config',str(config)]
            if target!=host:cmd+=['--target',target]
            run(*cmd)
    release=ROOT/'release/macos';release.mkdir(parents=True,exist_ok=True)
    prd=release/f'Moji-{version}-PRD.md';change=release/f'Moji-{version}-CHANGELOG.md'
    shutil.copy2(ROOT/'docs/PRD.md',prd);shutil.copy2(ROOT/'CHANGELOG.md',change)
    results=[]
    for target,arch,label in targets:
        base=ROOT/'src-tauri/target'
        if target!=host:base/=target
        source=base/'release/bundle/macos/墨记.app';info=verify(source,version,arch)
        with tempfile.TemporaryDirectory(prefix='moji-dmg-',dir=work) as temp:
            temp=Path(temp);folder=temp/'volume';folder.mkdir();app=folder/'墨记.app'
            run('ditto',source,app);(folder/'Applications').symlink_to('/Applications',target_is_directory=True)
            shutil.copy2(prd,folder/'产品需求文档-PRD.md');shutil.copy2(change,folder/'更新日志.md')
            (folder/'安装说明.txt').write_text(f'墨记 {version} · {label}\n\n将「墨记.app」拖到「Applications」安装。\n更新前正常退出旧墨记，再替换应用。\n文档和对话保存在本机应用数据目录，替换应用不删除该目录。\n当前为本地签名，未进行 Apple 公证。\n\nhttps://github.com/fuhanshen/moji\n')
            dmg=release/f'Moji-{version}-{label}.dmg'
            run('hdiutil','create','-volname',f'Moji {version} {label}','-srcfolder',folder,'-fs','HFS+','-format','UDZO','-ov',dmg,stdout=subprocess.DEVNULL)
            run('hdiutil','verify',dmg,stdout=subprocess.DEVNULL)
            mount=temp/'mounted';mount.mkdir()
            try:
                run('hdiutil','attach','-readonly','-nobrowse','-mountpoint',mount,dmg,stdout=subprocess.DEVNULL)
                verify(mount/'墨记.app',version,arch)
                if (mount/'产品需求文档-PRD.md').read_bytes()!=prd.read_bytes():raise RuntimeError('PRD snapshot mismatch')
                if (mount/'更新日志.md').read_bytes()!=change.read_bytes():raise RuntimeError('Changelog snapshot mismatch')
                if os.readlink(mount/'Applications')!='/Applications':raise RuntimeError('Missing Applications shortcut')
            finally:
                if os.path.ismount(mount):run('hdiutil','detach',mount,stdout=subprocess.DEVNULL)
        destination=release/('intel' if arch=='x86_64' else '')/'墨记.app';destination.parent.mkdir(exist_ok=True)
        if destination.exists():
            old=plistlib.loads((destination/'Contents/Info.plist').read_bytes());old_version=old.get('CFBundleShortVersionString','unknown')
            if old_version==version:
                # Preserve prior copies of the same version as well.
                backup=work/('previous-'+arch+'-'+uuid.uuid4().hex+'.app')
            else:
                backup=release/'archive'/f'墨记-{old_version}{"-Intel" if arch=="x86_64" else ""}.app';backup.parent.mkdir(exist_ok=True)
                if backup.exists():backup=work/('previous-'+arch+'-'+uuid.uuid4().hex+'.app')
            destination.rename(backup)
        run('ditto',source,destination);verify(destination,version,arch)
        results.append({'version':version,'architecture':arch,'file':dmg.name,'bytes':dmg.stat().st_size,'sha256':hashlib.sha256(dmg.read_bytes()).hexdigest(),'identifier':info['CFBundleIdentifier'],'signature':'ad-hoc','notarized':False})
    (release/f'Moji-{version}-build.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
    body=(ROOT/'CHANGELOG.md').read_text();marker='## '+version+' ·';start=body.find(marker)
    if start>=0:
        body=body[start:];end=body.find('\n## ',3)
        if end>=0:body=body[:end]
    manifest={'schemaVersion':1,'tag_name':'v'+version,'draft':False,'prerelease':False,'body':body,'assets':[{'name':item['file'],'browser_download_url':f'https://github.com/fuhanshen/moji/releases/download/v{version}/'+item['file'],'sha256':item['sha256']} for item in results]}
    (release/'latest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    checks=release/f'Moji-{version}-SHA256SUMS.txt';checks.write_text(''.join(f'{item["sha256"]}  {item["file"]}\n' for item in results))
    print(json.dumps(results,ensure_ascii=False,indent=2))
if __name__=='__main__':main()

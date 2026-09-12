"""Original low-poly cave equipment library. Run with Blender --background --python.
Coordinates below are game metres (Y up, torch points -Z); glTF export is Y up.
No external models, textures or add-ons. Materials and named parts remain editable.
"""
import bpy, math, random
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/models'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
random.seed(7137)
def vec(v): return (v[0],-v[2],v[1])
def mat(name,color,rough=.8,metal=0,emit=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal
    b.inputs['Emission Color'].default_value=(*color,1);b.inputs['Emission Strength'].default_value=emit
    return m
cloth=mat('worn ochre canvas',(.22,.13,.065));rubber=mat('rubber',(.028,.032,.03));metal=mat('scratched anodized metal',(.10,.12,.115),.38,.65)
edge=mat('exposed alloy',(.36,.38,.33),.45,.7);bone=mat('aged bone',(.59,.51,.37));dark=mat('recess',(.018,.013,.008));lens=mat('torch lens',(.95,.69,.28),.2,0,2)
skin=mat('olm skin',(.54,.37,.32),.6);batmat=mat('bat membrane',(.065,.039,.027));fur=mat('crosser hide',(.055,.045,.029));red=mat('red canvas',(.27,.038,.021));glow=mat('phosphor',(.18,.85,.33),.25,0,1.5);pale=mat('cloth label',(.6,.57,.43))
roots=[];parent=None
def group(name):
    global parent
    parent=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(parent);roots.append(parent);return parent
def mesh(name,verts,faces,material):
    d=bpy.data.meshes.new(name);d.from_pydata([vec(v) for v in verts],[],faces);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.parent=parent;o.data.materials.append(material);return o
def box(name,p,s,m,bevel=0):
    x,y,z=p;a,b,c=[v/2 for v in s]
    o=mesh(name,[(x+i*a,y+j*b,z+k*c) for i,j,k in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(1,2,6,5),(0,4,7,3)],m)
    if bevel:
        mod=o.modifiers.new('worn edges','BEVEL');mod.width=bevel;mod.segments=1
        bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
    return o
def ell(name,p,s,m,n=10,rings=5):
    vs=[]
    for j in range(rings+1):
        a=math.pi*j/rings
        for i in range(n):
            t=math.tau*i/n;vs.append((p[0]+s[0]*math.sin(a)*math.cos(t),p[1]+s[1]*math.cos(a),p[2]+s[2]*math.sin(a)*math.sin(t)))
    fs=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(rings) for i in range(n)]
    return mesh(name,vs,fs,m)
def rod(name,a,b,r,m,n=8,r2=None):
    a,b=Vector(a),Vector(b);axis=(b-a).normalized();cross=axis.cross(Vector((1,0,0)) if abs(axis.x)<.9 else Vector((0,1,0))).normalized();other=axis.cross(cross)
    vs=[tuple(p+(cross*math.cos(i*math.tau/n)+other*math.sin(i*math.tau/n))*rad) for p,rad in [(a,r),(b,r if r2 is None else r2)] for i in range(n)]
    fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vs,fs,m)
group('torch')
rod('barrel',(0,0,.105),(0,0,-.085),.024,metal,12)
rod('reflector housing',(0,0,-.07),(0,0,-.135),.027,metal,12,.042)
rod('lens',(0,0,-.136),(0,0,-.141),.034,lens,12)
for i in range(7):rod('grip ring '+str(i),(0,0,i*.012-.015),(0,0,i*.012-.009),.026,rubber,12)
rod('bezel',(0,0,-.132),(0,0,-.138),.043,edge,12)
box('switch',(0,.027,-.052),(.016,.008,.022),rubber,.002)
box('clip',(.029,.006,.035),(.006,.014,.09),edge,.002)
group('glove')
box('palm',(0,-.018,.034),(.070,.07,.088),cloth,.014)
for i in range(4):
    z=-.004+i*.020
    rod('finger '+str(i),(.032,-.04,z),(.035,.022,z),.012,cloth,6)
    rod('curled tip '+str(i),(.035,.022,z),(.007,.033,z-.004),.011,rubber,6)
rod('thumb',(-.036,-.024,.06),(-.04,.025,.012),.015,cloth,7)
rod('thumb tip',(-.04,.025,.012),(-.024,.023,-.012),.013,rubber,7)
rod('wrist',(0,-.06,.09),(.02,-.115,.16),.039,rubber,9,.044)
rod('sleeve',(.02,-.115,.16),(.09,-.24,.40),.047,cloth,9,.063)
box('wrist strap',(.006,-.082,.121),(.087,.023,.038),rubber,.004)
box('buckle',(-.039,-.078,.128),(.012,.028,.027),edge,.002)
for x in [-.025,0,.025]:rod('seam',(x,-.05,.08),(x,-.049,.009),.0015,pale,4)
group('skull')
ell('cranium',(0,.021,.006),(.090,.092,.110),bone,12,7)
ell('left socket',(-.039,.005,-.092),(.027,.029,.021),dark,8,4);ell('right socket',(.039,.005,-.092),(.027,.029,.021),dark,8,4)
mesh('nasal cavity',[(-.012,-.013,-.109),(.012,-.013,-.109),(0,-.043,-.113)],[(0,1,2)],dark)
box('jaw',(0,-.052,-.061),(.104,.027,.082),bone,.012)
for i in range(8):box('tooth',(i*.010-.035,-.033,-.104),(.008,.016,.009),pale,.002)
group('longbone');rod('shaft',(0,-.17,0),(0,.17,0),.023,bone,7)
for y in [-.18,.18]:
    for x in [-.02,.02]:ell('joint',(x,y,0),(.028,.027,.030),bone,7,4)
group('rib')
for i in range(10):
    a=i*math.pi/10;b=(i+1)*math.pi/10;rod('rib arc',(math.cos(a)*.16,math.sin(a)*.15,0),(math.cos(b)*.16,math.sin(b)*.15,0),.013,bone,5)
group('pack')
box('rucksack',(0,.12,0),(.29,.24,.18),cloth,.028);box('flap',(0,.225,-.035),(.29,.055,.16),rubber,.014)
for x in [-.09,.09]:
    box('strap',(x,.13,-.097),(.025,.20,.009),rubber,.003);box('buckle',(x,.10,-.106),(.035,.027,.009),edge,.003)
box('front pocket',(0,.085,-.108),(.12,.09,.035),cloth,.008)
for x in [-.165,.165]:box('side pocket',(x,.09,0),(.06,.13,.12),cloth,.01)
for kind in ['battery','cells','kit','sticks','rope']:
    group(kind)
    if kind in ['battery','cells']:
        for x in [-.035,.035]:
            rod('cell',(x,.018,-.07),(x,.018,.07),.027,metal,10);rod('terminal',(x,.018,-.077),(x,.018,-.071),.012,edge,8)
        box('wrap',(0,.05,0),(.10,.009,.07),pale,.003)
    elif kind=='kit':
        box('medical pouch',(0,.065,0),(.20,.13,.12),red,.018)
        box('cross horizontal',(0,.066,-.065),(.085,.022,.003),pale)
        box('cross vertical',(0,.066,-.067),(.023,.078,.003),pale)
    elif kind=='sticks':
        for x in [-.026,0,.026]:rod('glowstick',(x,.018,-.08),(x,.018,.08),.009,glow,8)
        box('band',(0,.018,0),(.075,.028,.025),rubber,.002)
    else:
        for k in range(5):
            for i in range(20):
                a=i*math.tau/20;b=(i+1)*math.tau/20;r=.055+k*.009
                rod('coiled rope',(math.cos(a)*r,.012,math.sin(a)*r*1.4),(math.cos(b)*r,.012,math.sin(b)*r*1.4),.004,cloth,5)
group('anchor')
box('bolt plate',(0,0,0),(.06,.09,.007),metal,.007);rod('bolt',(0,.02,0),(0,.02,.025),.012,edge,6)
for i in range(12):
    a=i*math.tau/12;b=(i+1)*math.tau/12;rod('carabiner',(math.sin(a)*.022,math.cos(a)*.035-.035,.024),(math.sin(b)*.022,math.cos(b)*.035-.035,.024),.004,edge,6)
for i in range(4):rod('knot',(-.018+i*.010,-.065,.01),(-.01+i*.010,-.086,.035),.006,cloth,6)
group('bat')
ell('body',(0,0,0),(.03,.025,.07),batmat,8,4);ell('head',(0,.004,-.062),(.035,.03,.028),fur,8,4)
for sign in [-1,1]:
    v=[(sign*.018,0,-.043),(sign*.08,.025,-.065),(sign*.23,.008,-.015),(sign*.17,-.005,.018),(sign*.14,-.003,.007),(sign*.105,-.01,.042),(sign*.075,-.005,.025),(sign*.03,0,.068)]
    mesh('wing',v,[(0,i,i+1) for i in range(1,len(v)-1)],batmat)
    for i in [2,3,5,7]:rod('wing spar',v[1],v[i],.0025,fur,5)
    mesh('ear',[(sign*.013,.02,-.075),(sign*.026,.065,-.067),(sign*.033,.013,-.050)],[(0,1,2)],fur)
group('olm')
ell('body',(0,0,0),(.115,.022,.024),skin,12,5);ell('head',(-.108,0,0),(.036,.020,.023),skin,8,4)
rod('tail',(.075,0,0),(.23,0,0),.020,skin,8,.002)
for x in [-.060,.055]:
    for sign in [-1,1]:
        rod('leg',(x,0,sign*.018),(x+.018,-.012,sign*.057),.004,skin,6)
        for j in [-1,0,1]:rod('toe',(x+.018,-.012,sign*.057),(x+.032+j*.008,-.012,sign*.067),.002,skin,4)
for sign in [-1,1]:
    for i in range(3):rod('gill',(-.092,.004,sign*.02),(-.074+i*.013,.012,sign*.050),.003,red,5)
group('crosser')
ell('body',(0,.45,0),(.44,.18,.16),fur,12,6);ell('shoulders',(.28,.43,0),(.20,.20,.18),fur,10,5)
ell('head',(.51,.36,0),(.17,.105,.11),fur,10,5);ell('muzzle',(.64,.32,0),(.09,.055,.075),dark,8,4)
for x in [-.29,.28]:
    for z in [-.12,.12]:
        o=rod('leg',(x,.40,z),(x-.035,.045,z),.042,fur,7,.025)
        # Pivot in game-space at the hip for the runtime gait and reusable named joints.
        pivot=Vector(vec((x,.40,z)))
        for v in o.data.vertices:v.co-=pivot
        o.location=pivot
        box('paw',(x-.02,.035,z),(.13,.065,.07),dark,.009)
rod('tail',(-.38,.45,0),(-.77,.36,0),.055,fur,8,.013)
for sign in [-1,1]:
    mesh('ear',[(.43,.43,sign*.09),(.40,.60,sign*.13),(.55,.44,sign*.09)],[(0,1,2)],fur)
    ell('eye',(.60,.385,sign*.078),(.014,.014,.014),lens,6,4)
group('crystal')
for x,z,h,r in [(0,0,1,1),(.8,.3,.60,.7),(-.6,.45,.72,.65),(.35,-.75,.42,.8)]:
    rod('quartz',(x,-.5,z),(x,h-.65,z),r,pale,6,r*.92)
    rod('fractured tip',(x,h-.65,z),(x,h-.5,z),r*.92,pale,6,.12 if h>.5 else r*.75)
for o in bpy.data.objects:
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=False
# Each root is exported independently, retaining named pieces and shared materials.
for root in roots:
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for o in root.children_recursive:o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(OUT/(root.name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'claustrophobia-library.blend'))
print('ART_LIBRARY_COMPLETE',len(roots))

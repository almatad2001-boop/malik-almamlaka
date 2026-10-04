const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const path=require('path');
const app=express();
const server=http.createServer(app);const io=new Server(server);
app.use(express.static(path.join(__dirname,'public')));

const rooms=new Map();
const COLORS=['#c79a45','#5e9d83','#8c6fb1','#bd675d','#4e83a8','#a77b4f','#6f9b58','#ad6f98','#6d8d9c','#9b7f58','#8d8f4d','#7b6d9f'];
const REGION_NAMES=['الشمال','وادي الثلج','مرتفعات النور','ساحل الغرب','غابة السرو','المروج','القلعة البيضاء','السهل الذهبي','مدينة النهر','الميناء','وادي النحاس','الهضاب','الحدود الشرقية','جبال الصقر','صحراء الشمس','واحة الملك','ساحل الجنوب','الغابة السوداء','السهول الحمراء','ميناء اللؤلؤ','وادي العقيق','قلعة الرمال','الساحل الشرقي','العاصمة القديمة'];
const ADJ={0:[1,3,2],1:[0,2,6,5],2:[0,1,6,7],3:[0,4,5,9],4:[3,5,10,11],5:[1,3,4,6,7,10],6:[1,2,5,7,12],7:[2,5,6,8,12,13],8:[5,7,9,13,14],9:[3,8,10,14,16],10:[4,5,9,11,14,17],11:[4,10,12,17,18],12:[6,7,11,13,18,22],13:[7,8,12,14,19,22],14:[8,9,10,13,15,19,20],15:[14,16,20,21],16:[9,15,17,20,21],17:[10,11,16,18,20,21],18:[11,12,17,19,21,23],19:[13,14,16,18,22,23],20:[14,15,16,17,21,23],21:[15,17,18,20,23],22:[12,13,19,23],23:[18,19,20,21,22]};
const EVENTS=[
 {name:'موسم الحصاد 🌾',desc:'+25 ذهب لكل إقليم تملكه.',goldPerLand:25},
 {name:'ازدهار تجاري 💰',desc:'دخل الاقتصاد يتضاعف هذا الدور.',income2:true},
 {name:'موسم التجنيد 🪖',desc:'+20 جيش لكل لاعب.',army:20},
 {name:'ضباب الحرب 🌫️',desc:'الهجوم أغلى بـ20 ذهب.',attackCost:20},
 {name:'هدنة كبرى 🕊️',desc:'لا يمكن مهاجمة لاعب آخر هذا الدور.',noAttack:true},
 {name:'حصون مشددة 🏰',desc:'+10 دفاع لكل إقليم.',defense:10},
 {name:'قافلة ملكية 👑',desc:'كل لاعب يحصل على 60 ذهب.',globalGold:60}
];
const CARDS=['treasury','march','fort','spy','fire','heal'];
const CARD_NAMES={treasury:'💰 خزينة',march:'⚔️ مسيرة',fort:'🛡️ حصن',spy:'👁️ جاسوس',fire:'🔥 حريق',heal:'❤️ إمداد'};
const REGION_TYPES=['عاصمة','مزرعة','منجم','سوق','حصن'];
function rid(){return Math.random().toString(36).slice(2,8).toUpperCase()}
function clean(n){return String(n||'ملك').trim().slice(0,18)||'ملك'}
function freshRegions(){return REGION_NAMES.map((name,i)=>({id:i,name,owner:null,army:35+(i%4)*8,level:1,type:REGION_TYPES[i%REGION_TYPES.length],income:15+(i%5)*4,defense:10+(i%3)*5}))}
function player(socket,name){return {id:socket.id,name:clean(name),gold:500,army:0,score:0,alive:true,color:null,cards:['treasury','march','fort'],allies:[],leader:'الملك الحازم',leaderBonus:0,stats:{wins:0,attacks:0},territories:[]}}
function regionCount(r,pid){return r.regions.filter(x=>x.owner===pid).length}
function syncPlayer(r,p){p.territories=r.regions.filter(x=>x.owner===p.id).map(x=>x.id);p.army=p.territories.reduce((s,i)=>s+r.regions[i].army,0);p.score=regionCount(r,p.id)*120+p.gold+p.army*0.7+r.regions.filter(x=>x.owner===p.id).reduce((s,x)=>s+x.level*30,0)}
function pub(r){r.players.forEach(p=>syncPlayer(r,p));return {code:r.code,host:r.host,started:r.started,phase:r.phase,round:r.round,maxRounds:r.maxRounds,turnPlayer:r.players[r.turn]?.id||null,event:r.event?.name||'',eventDesc:r.event?.desc||'',regions:r.regions,players:r.players.map(p=>({id:p.id,name:p.name,gold:p.gold,army:p.army,score:Math.round(p.score),alive:p.alive,color:p.color,cards:p.cards,allies:p.allies,leader:p.leader,territories:p.territories})),log:r.log.slice(-30),winner:r.winner||null}}
function send(r){io.to(r.code).emit('state',pub(r))}
function log(r,s){r.log.push(s);if(r.log.length>80)r.log.shift()}
function current(r){return r.players[r.turn]}
function alivePlayers(r){return r.players.filter(p=>p.alive)}
function nextTurn(r){for(let n=1;n<=r.players.length;n++){let i=(r.turn+n)%r.players.length;if(r.players[i]?.alive){r.turn=i;return}}}
function assign(r){let order=[23,8,14,5,1,20,11,19,3,17,6,22];r.players.forEach((p,idx)=>{p.color=COLORS[idx%COLORS.length];let a=order[idx*2%order.length],b=order[(idx*2+1)%order.length];[a,b].forEach(id=>{if(r.regions[id].owner===null){r.regions[id].owner=p.id;p.territories.push(id);r.regions[id].army=70}});p.gold=500})}
function start(r){r.started=true;r.phase='playing';r.round=1;r.turn=0;assign(r);r.event=EVENTS[Math.floor(Math.random()*EVENTS.length)];applyEvent(r);log(r,`👑 بدأت المملكة. الدور الأول: ${r.players[0].name}`);send(r)}
function applyEvent(r){let e=r.event;if(e.goldPerLand)r.players.filter(p=>p.alive).forEach(p=>p.gold+=regionCount(r,p.id)*e.goldPerLand);if(e.income2)r.players.filter(p=>p.alive).forEach(p=>p.gold+=regionCount(r,p.id)*30);if(e.army)r.players.filter(p=>p.alive).forEach(p=>{let own=r.regions.filter(x=>x.owner===p.id);if(own[0])own[0].army+=e.army});if(e.defense)r.regions.forEach(x=>x.owner&& (x.defense+=e.defense));if(e.globalGold)r.players.filter(p=>p.alive).forEach(p=>p.gold+=e.globalGold)}
function beginTurn(r){r.event=EVENTS[Math.floor(Math.random()*EVENTS.length)];applyEvent(r);let p=current(r);if(!p)return; r.regions.filter(x=>x.owner===p.id).forEach(x=>p.gold+=x.income*(r.event?.income2?2:1));log(r,`🎲 ${r.event.name}: ${r.event.desc}`);send(r)}
function endTurn(r){nextTurn(r);if(r.turn===0)r.round++;if(r.round>r.maxRounds){finish(r);return}beginTurn(r)}
function finish(r){r.phase='finished';r.started=false;r.players.forEach(p=>syncPlayer(r,p));r.players.sort((a,b)=>b.score-a.score);r.winner=r.players[0]?.id;log(r,`👑 انتهت الحرب. ملك المملكة: ${r.players[0]?.name||'—'}`);send(r)}
function validTurn(r,socketId){return r.started&&current(r)?.id===socketId}
function attack(r,p,targetId){let t=r.regions[targetId];if(!t)return 'الإقليم غير موجود';if(!(t.owner===null||t.owner!==p.id))return 'لا يمكنك مهاجمة إقليمك';if(!r.regions.some(x=>x.owner===p.id&&ADJ[x.id].includes(t.id)))return 'يجب أن يكون الإقليم مجاوراً لأحد أقاليمك';let cost=80+(r.event?.attackCost||0);if(p.gold<cost)return `تحتاج ${cost} ذهب للهجوم`;let source=r.regions.find(x=>x.owner===p.id&&ADJ[x.id].includes(t.id)&&x.army>25);if(!source)return 'تحتاج إقليماً مجاوراً فيه أكثر من 25 جندياً';p.gold-=cost;p.stats.attacks++;let power=source.army*0.72+source.level*12+Math.random()*30;let defense=t.army*0.62+t.defense+t.level*12+Math.random()*30;if(power>defense){let loss=Math.max(10,Math.floor(source.army*.25));source.army-=loss;t.owner=p.id;t.army=Math.max(25,Math.floor(source.army*.5));t.level=1;t.defense=10;log(r,`⚔️ ${p.name} احتل ${t.name}`);return `🏆 انتصار! سيطرت على ${t.name}`}source.army=Math.max(10,source.army-Math.floor(source.army*.22));t.army=Math.max(5,t.army-Math.floor(t.army*.08));return `🛡️ تم صد هجومك على ${t.name}`}
function action(r,p,type,targetId){if(type==='collect'){let income=r.regions.filter(x=>x.owner===p.id).reduce((s,x)=>s+x.income,0);if(r.event?.income2)income*=2;p.gold+=income;return `💰 جُمعت ضرائب المملكة: +${income}`}
if(type==='recruit'){let cost=50;if(p.gold<cost)return 'تحتاج 50 ذهب';let own=r.regions.find(x=>x.owner===p.id);if(!own)return 'لا تملك إقليماً';p.gold-=cost;own.army+=35;return `🪖 أضفت 35 جندي إلى ${own.name}`}
if(type==='build'){let t=r.regions[targetId];if(!t||t.owner!==p.id)return 'اختر إقليماً تملكه';let cost=90+t.level*45;if(p.gold<cost)return `تحتاج ${cost} ذهب`;if(t.level>=5)return 'هذا الإقليم في أعلى مستوى';p.gold-=cost;t.level++;t.income+=8;t.defense+=8;return `🏗️ طورت ${t.name} إلى المستوى ${t.level}`}
if(type==='fortify'){let t=r.regions[targetId];if(!t||t.owner!==p.id)return 'اختر إقليماً تملكه';let cost=55;if(p.gold<cost)return 'تحتاج 55 ذهب';p.gold-=cost;t.defense+=20;return `🛡️ عززت دفاع ${t.name}`}
if(type==='attack')return attack(r,p,targetId);
if(type==='scout'){let t=r.regions[targetId];if(!t||t.owner===p.id)return 'اختر إقليماً للمعاينة';return `🔭 ${t.name}: جيش ${t.army} | دفاع ${t.defense} | مستوى ${t.level}`}
if(type==='ally'){let d=r.players.find(x=>x.id===targetId&&x.alive&&x.id!==p.id);if(!d)return 'اختر لاعباً';if(!p.allies.includes(d.id)){p.allies.push(d.id);d.allies.push(p.id)}return `🤝 تم إنشاء تحالف مع ${d.name}`}
if(type==='break'){p.allies=p.allies.filter(x=>x!==targetId);let d=r.players.find(x=>x.id===targetId);if(d)d.allies=d.allies.filter(x=>x!==p.id);return '⚡ انتهى التحالف'}
if(type==='card'){let parts=String(targetId||'').split('|');let card=parts[0],tid=parts[1];let i=p.cards.indexOf(card);if(i<0)return 'لا تملك هذه البطاقة';if((card==='spy'||card==='fire')&&!tid)return 'اختر هدفاً';p.cards.splice(i,1);if(card==='treasury'){p.gold+=160;return '💰 خزينة: +160 ذهب'}if(card==='march'){let t=r.regions.find(x=>x.owner===p.id);if(t)t.army+=60;return '⚔️ مسيرة: +60 جيش'}if(card==='fort'){let t=r.regions.find(x=>x.owner===p.id);if(t)t.defense+=45;return '🛡️ حصن: +45 دفاع'}if(card==='heal'){let t=r.regions.find(x=>x.owner===p.id);if(t){t.army+=30;t.defense+=20}return '❤️ إمداد: +30 جيش +20 دفاع'}let d=r.players.find(x=>x.id===tid);if(!d){p.cards.push(card);return 'الهدف غير صحيح'}if(card==='spy')return `👁️ ${d.name}: ${regionCount(r,d.id)} أقاليم • ${d.gold} ذهب • ${d.army} جيش`;let reg=r.regions.find(x=>x.owner===d.id);if(reg)reg.defense=Math.max(0,reg.defense-35);return `🔥 حريق: -35 دفاع من ${d.name}`}
if(type==='end'){endTurn(r);return null}return 'أمر غير معروف'}

io.on('connection',socket=>{
 socket.on('createRoom',({name,maxRounds=20},cb)=>{let code=rid();while(rooms.has(code))code=rid();let r={code,host:socket.id,players:[],regions:freshRegions(),started:false,phase:'lobby',round:0,maxRounds:Math.max(5,Math.min(50,+maxRounds||20)),turn:0,event:null,log:[],winner:null};rooms.set(code,r);r.players.push(player(socket,name));socket.join(code);cb?.({ok:true,code});send(r)});
 socket.on('joinRoom',({code,name},cb)=>{let r=rooms.get(String(code||'').toUpperCase());if(!r)return cb?.({ok:false,error:'الغرفة غير موجودة'});if(r.started)return cb?.({ok:false,error:'اللعبة بدأت'});if(r.players.length>=12)return cb?.({ok:false,error:'الغرفة مكتملة'});r.players.push(player(socket,name));socket.join(r.code);log(r,`👤 انضم ${r.players.at(-1).name}`);cb?.({ok:true,code:r.code});send(r)});
 socket.on('start',({code},cb)=>{let r=rooms.get(code);if(!r||r.host!==socket.id)return cb?.({ok:false,error:'المضيف فقط'});if(r.players.length<4)return cb?.({ok:false,error:'تحتاج 4 لاعبين على الأقل'});start(r);cb?.({ok:true})});
 socket.on('action',({code,type,targetId},cb)=>{let r=rooms.get(code);if(!validTurn(r,socket.id))return cb?.({ok:false,error:'ليس دورك'});let p=current(r);let result=action(r,p,type,targetId);if(result)log(r,`${p.name}: ${result}`);send(r);cb?.({ok:true,message:result})});
 socket.on('disconnect',()=>{for(const r of rooms.values()){let p=r.players.find(x=>x.id===socket.id);if(!p)continue;if(!r.started){r.players=r.players.filter(x=>x.id!==socket.id);if(r.host===socket.id)r.host=r.players[0]?.id||null;if(!r.players.length)rooms.delete(r.code);else send(r)}else{p.alive=false;log(r,`🚪 غادر ${p.name}`);if(current(r)?.id===p.id)endTurn(r);else send(r)}}});
});
app.get('/health',(req,res)=>res.json({ok:true,rooms:rooms.size}));
const PORT=process.env.PORT||3000;server.listen(PORT,()=>console.log('Malik Al Mamlaka Pro live on '+PORT));

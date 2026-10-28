import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Telegraf, Markup } from 'telegraf';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.BOT_TOKEN;
const MY_CHANNEL = process.env.CHANNEL || '@freeearningofusdt';
const BOT_USERNAME = process.env.BOT_USERNAME || 'Realads01_bot';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://ads-payout-1.onrender.com';
const ADMIN_ID = process.env.ADMIN_ID || '8323896060'; // YOUR ID
const ADMIN_IDS = ADMIN_ID.split(',').map(x=>String(x).trim());

let bot;
if(BOT_TOKEN){
  bot = new Telegraf(BOT_TOKEN);
  bot.telegram.deleteWebhook({drop_pending_updates: true}).then(()=>console.log('Old webhook deleted')).catch(()=>{});
  
  const isAdmin = (id) => ADMIN_IDS.includes(String(id));

  bot.start((ctx)=>{
    const refId = ctx.startPayload;
    const tgUser = ctx.from;
    const tgUsername = tgUser.username ? '@'+tgUser.username : '';
    const tgFirstName = tgUser.first_name || '';
    try{
      if(!fs.existsSync('./data.json')) fs.writeFileSync('./data.json','{}');
      let tempUsers = JSON.parse(fs.readFileSync('./data.json'));
      const uid = String(tgUser.id);
      if(!tempUsers[uid]) {
        tempUsers[uid] = {
          balance:0.05,tasksCompleted:[],referralCount:0,
          ad1Count:0,ad1Date:'',ad2Count:0,ad2Date:'',ad3Count:0,ad3Date:'',
          checkinCount:0,checkinDate:'',lastCheckinDate:'',streak:0,
          referrals:[],referralEarnings:0,referredBy:refId||'',completedDays:[],
          username:tgUsername, firstName:tgFirstName, telegramId:uid,
          referralLink:`https://t.me/${BOT_USERNAME}?start=${uid}`
        };
      } else {
        tempUsers[uid].username = tgUsername || tempUsers[uid].username;
        tempUsers[uid].firstName = tgFirstName || tempUsers[uid].firstName;
        tempUsers[uid].telegramId = uid;
        tempUsers[uid].referralLink = `https://t.me/${BOT_USERNAME}?start=${uid}`;
        if(!tempUsers[uid].referredBy && refId && refId!==uid){
          tempUsers[uid].referredBy = refId;
        }
        if(tempUsers[uid].checkinCount===undefined){ tempUsers[uid].checkinCount=0; tempUsers[uid].checkinDate=''; tempUsers[uid].streak=0; }
        if(tempUsers[uid].balance===undefined) tempUsers[uid].balance=0.05;
      }
      if(refId && refId!==uid){
        if(!tempUsers[refId]) tempUsers[refId] = {
          balance:0.05,tasksCompleted:[],referralCount:0,ad1Count:0,ad1Date:'',ad2Count:0,ad2Date:'',ad3Count:0,ad3Date:'',checkinCount:0,checkinDate:'',streak:0,referrals:[],referralEarnings:0,completedDays:[],
          referralLink:`https://t.me/${BOT_USERNAME}?start=${refId}`
        };
        if(!tempUsers[refId].referrals) tempUsers[refId].referrals=[];
        if(!tempUsers[refId].referrals.find(r=>r.id===uid)){
          tempUsers[refId].referrals.push({
            id:uid, username:tgUsername || tgUser.first_name || '', 
            firstName:tgFirstName,
            day1Complete:false, day1Date:'', day2Complete:false, day2Date:'', valid:false, 
            date:new Date().toISOString()
          });
        }
      }
      fs.writeFileSync('./data.json', JSON.stringify(tempUsers));
    }catch(e){console.log(e)}
    const txt=`💎 ADS PAYOUT - INSTANT PAYOUTS

Many bots promise to pay, but they don't.
We are different.

⚡ Withdrawals arrive in MINUTES.
💰 Real USDT - TRC20 / BEP20
✅ No delays

Minimum: $5 USDT (20% fee)
You withdraw $5 → Get $4 in 1 minute!

Referral: $0.025 per valid referral
Valid = ALL ads (20+15+5) for 2 days

Check-in: 10/day = $0.10/day max
Your link: https://t.me/${BOT_USERNAME}?start=${tgUser.id}
Username: ${tgUsername || tgFirstName}

Please:
🙏 No fake referrals
🙏 Stay active ${MY_CHANNEL}

Real users = Fast payments. Always`;
    ctx.reply(txt, Markup.inlineKeyboard([
      [Markup.button.webApp('🚀 Launch Ads Payout', MINI_APP_URL)], 
      [Markup.button.url('📢 Join Channel', `https://t.me/${MY_CHANNEL.replace('@','')}`)]
    ]));
  });

  // ===== TELEGRAM ADMIN PANEL =====
  bot.command('admin', (ctx)=>{
    if(!isAdmin(ctx.from.id)) return ctx.reply('❌ Not admin');
    ctx.reply(`👑 ADMIN PANEL\nID: ${ctx.from.id}\n\nChoose:`, Markup.inlineKeyboard([
      [Markup.button.callback('👥 Users Stats', 'adm_users'), Markup.button.callback('💸 Withdraws', 'adm_with')],
      [Markup.button.callback('➕ Add Task Info', 'adm_addtask'), Markup.button.callback('📋 Task List', 'adm_tasks')],
      [Markup.button.callback('📢 Broadcast Info', 'adm_broad')]
    ]));
  });

  bot.action('adm_users', (ctx)=>{
    if(!isAdmin(ctx.from.id)) return;
    try{
      let users = JSON.parse(fs.readFileSync('./data.json'));
      let count = Object.keys(users).length;
      let totalBal = Object.values(users).reduce((s,u)=>s+(u.balance||0),0);
      let pending = fs.existsSync('./withdraws.json') ? JSON.parse(fs.readFileSync('./withdraws.json')).filter(w=>w.status==='Pending').length : 0;
      ctx.reply(`👥 USERS: ${count}\n💰 Total Bal: $${totalBal.toFixed(2)}\n💸 Pending Withdraw: ${pending}\n\nCommands:\n/users - top 10\n/addtask Title | Reward | Link\n/broadcast message`);
    }catch(e){ctx.reply('Error reading data')}
  });

  bot.action('adm_with', (ctx)=>{
    if(!isAdmin(ctx.from.id)) return;
    try{
      let w = fs.existsSync('./withdraws.json') ? JSON.parse(fs.readFileSync('./withdraws.json')) : [];
      let pending = w.filter(x=>x.status==='Pending').slice(-8);
      if(pending.length===0) return ctx.reply('✅ No pending withdrawals');
      pending.forEach(req=>{
        ctx.reply(`💸 #${req.id}\nUser: ${req.userId}\nAmount: $${req.amount} -> $${req.receive}\nWallet: ${req.wallet}\nNet: ${req.network}`, Markup.inlineKeyboard([[Markup.button.callback('✅ Approve', `app_${req.id}`), Markup.button.callback('❌ Reject', `rej_${req.id}`)]]));
      });
    }catch(e){ctx.reply('Error')}
  });

  bot.action(/app_(.*)/, async (ctx)=>{
    if(!isAdmin(ctx.from.id)) return;
    const id = ctx.match[1];
    try{
      let w = JSON.parse(fs.readFileSync('./withdraws.json'));
      let item = w.find(x=>String(x.id)===String(id));
      if(item){ item.status='Approved'; fs.writeFileSync('./withdraws.json', JSON.stringify(w)); await ctx.editMessageText(`✅ APPROVED #${id}\nUser ${item.userId}\n$${item.receive} to ${item.wallet}`); bot.telegram.sendMessage(item.userId, `✅ Withdraw $${item.amount} Approved!\nYou receive $${item.receive} on ${item.network}`).catch(()=>{}); }
    }catch(e){ctx.reply('Error approve')}
  });

  bot.action(/rej_(.*)/, async (ctx)=>{
    if(!isAdmin(ctx.from.id)) return;
    const id = ctx.match[1];
    try{
      let w = JSON.parse(fs.readFileSync('./withdraws.json'));
      let users = JSON.parse(fs.readFileSync('./data.json'));
      let item = w.find(x=>String(x.id)===String(id));
      if(item){ item.status='Rejected'; if(users[item.userId]) users[item.userId].balance+=item.amount; fs.writeFileSync('./withdraws.json', JSON.stringify(w)); fs.writeFileSync('./data.json', JSON.stringify(users)); await ctx.editMessageText(`❌ REJECTED #${id} Refunded $${item.amount} to ${item.userId}`); bot.telegram.sendMessage(item.userId, `❌ Withdraw $${item.amount} Rejected, refunded.`).catch(()=>{}); }
    }catch(e){ctx.reply('Error reject')}
  });

  bot.action('adm_addtask', (ctx)=>{ if(!isAdmin(ctx.from.id)) return; ctx.reply('To add task:\n/addtask Title | Reward | Link\nEx: /addtask JOIN MY CHANNEL | 0.01 | https://t.me/xxx'); });
  bot.action('adm_tasks', (ctx)=>{ if(!isAdmin(ctx.from.id)) return; try{ let tasks = JSON.parse(fs.readFileSync('./tasks.json')); ctx.reply(`📋 TASKS:\n${tasks.map(t=>`#${t.id} ${t.title} - $${t.reward}`).join('\n')}\n\n/deltask ID`);}catch(e){ctx.reply('No tasks')} });
  bot.action('adm_broad', (ctx)=>{ if(!isAdmin(ctx.from.id)) return; ctx.reply('To broadcast:\n/broadcast Your message to all users'); });

  bot.command('addtask', (ctx)=>{
    if(!isAdmin(ctx.from.id)) return;
    const text = ctx.message.text.replace('/addtask','').trim(); const parts = text.split('|');
    if(parts.length<3) return ctx.reply('Use: /addtask Title | Reward | Link');
    try{ let tasks = fs.existsSync('./tasks.json') ? JSON.parse(fs.readFileSync('./tasks.json')) : []; tasks.push({id: Date.now(), title: parts[0].trim(), reward: parts[1].trim(), link: parts[2].trim()}); fs.writeFileSync('./tasks.json', JSON.stringify(tasks)); ctx.reply(`✅ Task added: ${parts[0]}`); }catch(e){ctx.reply('Failed')}
  });
  bot.command('deltask', (ctx)=>{ if(!isAdmin(ctx.from.id)) return; const id = ctx.message.text.split(' ')[1]; try{ let tasks = JSON.parse(fs.readFileSync('./tasks.json')); tasks = tasks.filter(t=>String(t.id)!==String(id)); fs.writeFileSync('./tasks.json', JSON.stringify(tasks)); ctx.reply(`Deleted ${id}`);}catch(e){} });
  bot.command('users', (ctx)=>{ if(!isAdmin(ctx.from.id)) return; try{ let users = JSON.parse(fs.readFileSync('./data.json')); let top = Object.values(users).sort((a,b)=>b.balance-a.balance).slice(0,10); ctx.reply(`Top 10:\n${top.map(u=>`${u.firstName||u.username||u.telegramId} - $${(u.balance||0).toFixed(3)} - ${u.telegramId}`).join('\n')}`);}catch(e){} });
  bot.command('broadcast', (ctx)=>{ if(!isAdmin(ctx.from.id)) return; const msg = ctx.message.text.replace('/broadcast','').trim(); if(!msg) return ctx.reply('Use: /broadcast msg'); try{ let users = JSON.parse(fs.readFileSync('./data.json')); Object.keys(users).forEach(uid=>{ bot.telegram.sendMessage(uid, `📢 ADMIN:\n${msg}`).catch(()=>{}); }); ctx.reply(`Sent to ${Object.keys(users).length}`);}catch(e){} });

  bot.launch().then(()=>console.log('Bot running @'+BOT_USERNAME+' ADMIN='+ADMIN_ID)).catch(e=>console.log(e));
}

// PERSISTENT STORAGE - FIXED (YOUR CODE)
let users = {};
let tasks = [];
let withdraws = [];
try{ if(fs.existsSync('./data.json')) users = JSON.parse(fs.readFileSync('./data.json')); }catch(e){ users = {}; }
try{ if(fs.existsSync('./tasks.json')) tasks = JSON.parse(fs.readFileSync('./tasks.json')); }catch(e){ tasks = []; }
try{ if(fs.existsSync('./withdraws.json')) withdraws = JSON.parse(fs.readFileSync('./withdraws.json')); }catch(e){ withdraws = []; }
if(tasks.length===0){
  tasks=[
    {id:1, title:"WATCH AD #1", reward:"0.005", link:"ad1"},
    {id:2, title:"WATCH AD #2", reward:"0.005", link:"ad2"},
    {id:3, title:`JOIN ${MY_CHANNEL}`, reward:"0.01", link:`https://t.me/${MY_CHANNEL.replace('@','')}`}
  ];
}
const save = ()=>{ try{fs.writeFileSync('./data.json', JSON.stringify(users));}catch(e){console.log("Save error",e)} };
const saveTasks = ()=>fs.writeFileSync('./tasks.json', JSON.stringify(tasks));
const saveWithdraws = ()=>fs.writeFileSync('./withdraws.json', JSON.stringify(withdraws));
function getToday(){ return new Date().toDateString(); }
function checkAllAdsComplete(u){ return (u.ad1Count>=20 && u.ad2Count>=15 && u.ad3Count>=5); }
async function isUserInChannel(userId){
  if(!BOT_TOKEN) return true;
  try{
    const chatId = MY_CHANNEL.startsWith('@') ? MY_CHANNEL : '@'+MY_CHANNEL;
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${chatId}&user_id=${userId}`);
    const data = await resp.json();
    if(!data.ok) return true;
    const status = data.result?.status;
    if(['left','kicked','banned'].includes(status)) return false;
    return true;
  }catch(e){ return true; }
}
function getSmartAIReply(userMsg, userData){
  const msg = userMsg.toLowerCase();
  const bal = userData?.balance || 0;
  const refs = userData?.referrals || [];
  const valid = refs.filter(r=>r.valid).length;
  const pending = refs.length - valid;
  const total = refs.length;
  const ad1 = userData?.ad1Count || 0;
  const ad2 = userData?.ad2Count || 0;
  const ad3 = userData?.ad3Count || 0;
  const checkin = userData?.checkinCount || 0;
  const username = userData?.username || userData?.firstName || 'boss';
  if(msg.match(/checkin|check-in|daily/)){
    return `Daily Check-in: 10/day = $0.10 max\nYou did ${checkin}/10 today ${checkin>=10?'✅ Done - come tomorrow':'⏳ '+(10-checkin)+' left'}\nReward 0.01 each\nStreak: ${userData?.streak||0}`;
  }
  if(msg.match(/hello|hi|hey|good morning|good evening/)){
    return `Hello ${username}! 👋 I'm your smart AI for @${BOT_USERNAME}.\n\nBalance: $${bal.toFixed(4)}\nCheck-in: ${checkin}/10\nReferrals: ${total} (${valid} valid)\nToday: AD1 ${ad1}/20, AD2 ${ad2}/15, SPECIAL ${ad3}/5`;
  }
  if(msg.match(/balance|my money|how much.*have|check.*balance/)){
    const need = (5 - bal).toFixed(4);
    if(bal >= 5) return `${username}, balance $${bal.toFixed(4)} USDT ✅ You CAN withdraw now!`;
    return `${username}, balance $${bal.toFixed(4)}. Need $${need} more to reach $5.\nAD1: ${20-ad1} left\nAD2: ${15-ad2} left\nSPECIAL: ${5-ad3} left\nCheck-in: ${10-checkin} left`;
  }
  if(msg.match(/withdraw|bep20|trc20|payout|payment/)){
    return `Withdraw info @${BOT_USERNAME}:\n• BEP20 & TRC20\n• Min: $5\n• Fee: 20%\n• Balance: $${bal.toFixed(4)}`;
  }
  if(msg.match(/refer|invite|friend|link/)){
    return `Referral link:\nhttps://t.me/${BOT_USERNAME}?start=${userData?.telegramId||'YOURID'}\n• $0.025 per valid\n• Valid = 2 days ALL ads (20+15+5)\n• Your: ${valid} valid, ${pending} pending`;
  }
  if(msg.match(/earn|ad.*1|ad.*2|special|task/)){
    return `Earn today ${username}:\nAD1: ${ad1}/20\nAD2: ${ad2}/15\nSPECIAL: ${ad3}/5\nCheck-in: ${checkin}/10`;
  }
  return `You said: "${userMsg}"\nBalance $${bal.toFixed(4)} Ads: ${ad1}/20, ${ad2}/15, ${ad3}/5 Check-in ${checkin}/10`;
}
app.get('/api/user',(req,res)=>{
  const id=req.query.userId;
  const username = req.query.username ? decodeURIComponent(req.query.username) : '';
  const firstName = req.query.firstName ? decodeURIComponent(req.query.firstName) : '';
  if(!users[id]){ 
    users[id]={
      balance:0.05,tasksCompleted:[],referralCount:0,ad1Count:0,ad1Date:'',ad2Count:0,ad2Date:'',ad3Count:0,ad3Date:'',checkinCount:0,checkinDate:'',lastCheckinDate:'',streak:0,referrals:[],referralEarnings:0,referredBy:'',completedDays:[],username:username||'',firstName:firstName||'',telegramId:id,referralLink:`https://t.me/${BOT_USERNAME}?start=${id}`,botUsername:BOT_USERNAME
    }; save(); 
  }
  if(username) users[id].username = username;
  if(firstName) users[id].firstName = firstName;
  if(!users[id].telegramId) users[id].telegramId = id;
  if(users[id].checkinCount===undefined){ users[id].checkinCount=0; users[id].checkinDate=''; users[id].lastCheckinDate=''; users[id].streak=0; }
  if(users[id].balance===undefined) users[id].balance=0.05;
  users[id].referralLink = `https://t.me/${BOT_USERNAME}?start=${id}`;
  users[id].botUsername = BOT_USERNAME;
  if(users[id].ad3Count===undefined){ users[id].ad3Count=0; users[id].ad3Date=''; }
  if(!users[id].referrals) users[id].referrals=[];
  const today=getToday();
  if(users[id].ad1Date!==today){ users[id].ad1Count=0; users[id].ad1Date=today; }
  if(users[id].ad2Date!==today){ users[id].ad2Count=0; users[id].ad2Date=today; }
  if(users[id].ad3Date!==today){ users[id].ad3Count=0; users[id].ad3Date=today; }
  if(users[id].checkinDate!==today){ users[id].checkinCount=0; users[id].checkinDate=today; }
  save(); res.json(users[id]);
});
app.get('/api/check-join', async (req,res)=>{
  const userId = req.query.userId;
  if(!userId) return res.json({joined:true});
  const joined = await isUserInChannel(userId);
  res.json({joined: joined, channel: MY_CHANNEL});
});
app.get('/api/tasks',(req,res)=>res.json(tasks));
app.post('/api/earn', async (req,res)=>{
  const {userId, amount, adType, username, firstName}=req.body;
  const joined = await isUserInChannel(userId);
  if(!joined) return res.json({ok:false, msg:`❌ You must JOIN ${MY_CHANNEL} to earn!`, needJoin:true});
  if(!users[userId]) users[userId]={balance:0.05,tasksCompleted:[],referralCount:0,ad1Count:0,ad1Date:'',ad2Count:0,ad2Date:'',ad3Count:0,ad3Date:'',checkinCount:0,checkinDate:'',lastCheckinDate:'',streak:0,referrals:[],referralEarnings:0,completedDays:[]};
  if(username) users[userId].username = username;
  if(firstName) users[userId].firstName = firstName;
  const today=getToday();
  if(users[userId].ad1Date!==today){ users[userId].ad1Count=0; users[userId].ad1Date=today; }
  if(users[userId].ad2Date!==today){ users[userId].ad2Count=0; users[userId].ad2Date=today; }
  if(users[userId].ad3Date!==today){ users[userId].ad3Count=0; users[userId].ad3Date=today; }
  if(users[userId].checkinDate!==today){ users[userId].checkinCount=0; users[userId].checkinDate=today; }
  if(adType==='checkin' || adType==='check-in' || adType==='daily'){
    if(users[userId].checkinCount>=10){ return res.json({ok:false, msg:"❌ Daily Check-in limit 10/day reached!"}); }
    users[userId].checkinCount++; users[userId].lastCheckinDate = today;
    if(users[userId].checkinCount===1){ users[userId].streak = (users[userId].streak||0)+1; }
  } else { return res.json({ok:false, msg:"Use Ads Galaxy button"}); }
  if(amount) users[userId].balance+=parseFloat(amount);
  if(checkAllAdsComplete(users[userId])){
    if(!users[userId].completedDays.includes(today)){
      users[userId].completedDays.push(today);
      let refBy = users[userId].referredBy;
      if(refBy && users[refBy]){
        if(!users[refBy].referrals) users[refBy].referrals=[];
        let refEntry = users[refBy].referrals.find(r=>r.id===userId);
        if(!refEntry){
          refEntry={id:userId, username:users[userId].username||users[userId].firstName||'', day1Complete:true, day1Date:today, day2Complete:false, day2Date:'', valid:false, date:new Date().toISOString()};
          users[refBy].referrals.push(refEntry);
        } else if(!refEntry.valid){
          if(!refEntry.day1Complete){ refEntry.day1Complete=true; refEntry.day1Date=today; }
          else if(refEntry.day1Date!==today && !refEntry.day2Complete){ refEntry.day2Complete=true; refEntry.day2Date=today; refEntry.valid=true; users[refBy].balance+=0.025; users[refBy].referralEarnings=(users[refBy].referralEarnings||0)+0.025; users[refBy].referralCount=(users[refBy].referralCount||0)+1; }
        }
      }
    }
  }
  save();
  res.json({ok:true, balance:users[userId].balance, ad1Count:users[userId].ad1Count, ad2Count:users[userId].ad2Count, ad3Count:users[userId].ad3Count, checkinCount:users[userId].checkinCount, streak:users[userId].streak});
});
const adGalaxyUsed = new Set();
app.post('/api/adsgalaxy-confirm', async (req,res)=>{
  const {userId, request_id, event_id, adType} = req.body;
  const joined = await isUserInChannel(userId);
  if(!joined){ return res.json({ok:false, msg:`❌ You left ${MY_CHANNEL}! Join channel to earn!`, needJoin:true, channel:MY_CHANNEL}); }
  const id = event_id || request_id;
  if(!id) return res.json({ok:false, msg:"No request_id"});
  if(adGalaxyUsed.has(id)) return res.json({ok:false, msg:"Already credited"});
  if(!users[userId]) return res.json({ok:false, msg:"User not found"});
  const today=getToday();
  if(users[userId].ad1Date!==today){ users[userId].ad1Count=0; users[userId].ad1Date=today; }
  if(users[userId].ad2Date!==today){ users[userId].ad2Count=0; users[userId].ad2Date=today; }
  if(users[userId].ad3Date!==today){ users[userId].ad3Count=0; users[userId].ad3Date=today; }
  let reward=0;
  if(adType==='ad1'){ if(users[userId].ad1Count>=20) return res.json({ok:false, msg:"❌ AD1 limit 20/day reached!"}); users[userId].ad1Count++; reward=0.005; }
  else if(adType==='ad2'){ if(users[userId].ad2Count>=15) return res.json({ok:false, msg:"❌ AD2 limit 15/day reached!"}); users[userId].ad2Count++; reward=0.005; }
  else if(adType==='ad3'){ if(users[userId].ad3Count>=5) return res.json({ok:false, msg:"❌ SPECIAL limit 5/day reached! 5/5 done"}); users[userId].ad3Count++; reward=0.01; }
  else { return res.json({ok:false, msg:"Invalid adType"}); }
  users[userId].balance+=reward; adGalaxyUsed.add(id);
  if(checkAllAdsComplete(users[userId])){
    if(!users[userId].completedDays.includes(today)){
      users[userId].completedDays.push(today);
      let refBy = users[userId].referredBy;
      if(refBy && users[refBy]){
        if(!users[refBy].referrals) users[refBy].referrals=[];
        let refEntry = users[refBy].referrals.find(r=>r.id===userId);
        if(!refEntry){
          refEntry={id:userId, username:users[userId].username||users[userId].firstName||'', day1Complete:true, day1Date:today, day2Complete:false, day2Date:'', valid:false, date:new Date().toISOString()};
          users[refBy].referrals.push(refEntry);
        } else if(!refEntry.valid){
          if(!refEntry.day1Complete){ refEntry.day1Complete=true; refEntry.day1Date=today; }
          else if(refEntry.day1Date!==today && !refEntry.day2Complete){ refEntry.day2Complete=true; refEntry.day2Date=today; refEntry.valid=true; users[refBy].balance+=0.025; users[refBy].referralEarnings=(users[refBy].referralEarnings||0)+0.025; users[refBy].referralCount=(users[refBy].referralCount||0)+1; }
        }
      }
    }
  }
  save();
  const left = adType==='ad1' ? 20-users[userId].ad1Count : adType==='ad2' ? 15-users[userId].ad2Count : 5-users[userId].ad3Count;
  res.json({ok:true, reward:reward, balance:users[userId].balance, left:left});
});
app.post('/api/adsgalaxy-webhook', (req,res)=>{
  console.log("AdsGalaxy Webhook:", req.body);
  const {mini_app_id, status} = req.body;
  if(mini_app_id && parseInt(mini_app_id)!==139) return res.json({ok:false, msg:"Wrong mini_app_id"});
  if(status!=='completed') return res.json({ok:false});
  res.json({ok:true});
});
app.post('/api/referral-join',(req,res)=>{
  const {userId, referredBy, username, firstName}=req.body;
  if(!userId || !referredBy || userId===referredBy) return res.json({ok:false});
  if(!users[userId]) users[userId]={balance:0.05,tasksCompleted:[],referralCount:0,ad1Count:0,ad1Date:'',ad2Count:0,ad2Date:'',ad3Count:0,ad3Date:'',checkinCount:0,checkinDate:'',referrals:[],referralEarnings:0,completedDays:[],referredBy:'', username:username||'', firstName:firstName||''};
  if(!users[referredBy]) users[referredBy]={balance:0.05,tasksCompleted:[],referralCount:0,ad1Count:0,ad1Date:'',ad2Count:0,ad2Date:'',ad3Count:0,ad3Date:'',checkinCount:0,checkinDate:'',referrals:[],referralEarnings:0,completedDays:[],referralLink:`https://t.me/${BOT_USERNAME}?start=${referredBy}`};
  if(username) users[userId].username = username;
  if(firstName) users[userId].firstName = firstName;
  if(!users[userId].referredBy){ users[userId].referredBy=referredBy; }
  if(!users[referredBy].referrals) users[referredBy].referrals=[];
  if(!users[referredBy].referrals.find(r=>r.id===userId)){ users[referredBy].referrals.push({id:userId, username:username||'', firstName:firstName||'', day1Complete:false, day1Date:'', day2Complete:false, day2Date:'', valid:false, date:new Date().toISOString()}); }
  save(); res.json({ok:true});
});
app.post('/api/ai-chat',(req,res)=>{
  const {userId, message} = req.body;
  if(!message) return res.json({ok:false, msg:"No message"});
  const userData = users[userId] || {balance:0, referrals:[], ad1Count:0, ad2Count:0, ad3Count:0, checkinCount:0};
  const reply = getSmartAIReply(message, userData);
  res.json({ok:true, reply});
});
app.post('/api/withdraw', async (req,res)=>{
  const {userId, wallet, address, cryptoType, network, amount}=req.body;
  const joined = await isUserInChannel(userId);
  if(!joined){ return res.json({ok:false, msg:`❌ You left ${MY_CHANNEL}! You must re-join channel to withdraw.`, needJoin:true, channel:MY_CHANNEL}); }
  const finalWallet = wallet || address;
  const finalNetwork = network || cryptoType || 'BEP20';
  const withdrawAmount = amount ? parseFloat(amount) : users[userId]?.balance;
  if(!users[userId]) return res.json({ok:false, msg:"User not found"});
  if(users[userId].balance<5) return res.json({ok:false, msg:"❌ Minimum $5.00 USDT required!"});
  if(!finalWallet) return res.json({ok:false, msg:"Enter wallet address"});
  if(withdrawAmount < 5) return res.json({ok:false, msg:"❌ Minimum $5 required"});
  if(withdrawAmount > users[userId].balance) return res.json({ok:false, msg:"Insufficient balance"});
  const totalAmount=withdrawAmount;
  const fee=totalAmount*0.20;
  const receiveAmount=totalAmount*0.80;
  const record={ id:Date.now(),userId,amount:totalAmount,fee:fee,receive:receiveAmount, wallet:finalWallet,cryptoType:finalNetwork,network:finalNetwork, status:"Pending",date:new Date().toLocaleDateString() };
  withdraws.push(record); saveWithdraws();
  users[userId].balance-=totalAmount; 
  users[userId].lastNetwork = finalNetwork;
  save();
  // NOTIFY YOU IN TELEGRAM
  try{ if(bot){ ADMIN_IDS.forEach(aid=>{ bot.telegram.sendMessage(aid, `💸 NEW WITHDRAW\n#${record.id}\nUser: ${userId}\n$${totalAmount} -> $${receiveAmount}\n${finalWallet}\n${finalNetwork}`, Markup.inlineKeyboard([[Markup.button.callback('✅ Approve', `app_${record.id}`), Markup.button.callback('❌ Reject', `rej_${record.id}`)]])).catch(()=>{}); }); } }catch(e){}
  res.json({ok:true, msg:`✅ Withdraw $${totalAmount.toFixed(4)} requested! Admin will approve.`, receive:receiveAmount, total:totalAmount});
});
app.get('/api/withdraws',(req,res)=>{ const id=req.query.userId; res.json(withdraws.filter(w=>w.userId==id).reverse()); });
app.get('/admin',(req,res)=>res.send(`Admin moved to Telegram! Go to @${BOT_USERNAME} and send /admin . Your ID ${ADMIN_ID} is admin.`));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(process.env.PORT||3000,()=>console.log('Running @'+BOT_USERNAME+' + TELEGRAM ADMIN '+ADMIN_ID));

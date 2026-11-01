import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Telegraf, Markup } from 'telegraf';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.BOT_TOKEN;
const MY_CHANNEL = process.env.CHANNEL || '@freeearningofusdt';
const BOT_USERNAME = process.env.BOT_USERNAME || 'Realads01_bot';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://ads-payout-1.onrender.com';
const ADMIN_ID = process.env.ADMIN_ID || '8323896060';
const ADMIN_IDS = ADMIN_ID.split(',').map(x=>String(x).trim());
const MONGODB_URI = process.env.MONGODB_URI;

if(MONGODB_URI){
  mongoose.connect(MONGODB_URI).then(()=>console.log('✅ MongoDB Connected - Earnings PERMANENT!')).catch(e=>console.log('Mongo Error', e.message));
} else {
  console.log('❌ Add MONGODB_URI in Render Environment!');
}

const UserSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true },
  balance: { type: Number, default: 0.05 },
  ad1Count: { type: Number, default: 0 }, ad1Date: String,
  ad2Count: { type: Number, default: 0 }, ad2Date: String,
  ad3Count: { type: Number, default: 0 }, ad3Date: String,
  checkinCount: { type: Number, default: 0 }, checkinDate: String, lastCheckinDate: String, streak: { type: Number, default: 0 },
  referrals: { type: Array, default: [] },
  referralEarnings: { type: Number, default: 0 },
  referralCount: { type: Number, default: 0 },
  referredBy: String,
  completedDays: { type: Array, default: [] },
  username: String, firstName: String,
  referralLink: String,
  completedTasks: { type: Array, default: [] },
  taskDailyCount: { type: Object, default: {} },
  isBoosted: { type: Boolean, default: false }, // ✅ BOOST SYSTEM ADDED - FREE
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const WithdrawSchema = new mongoose.Schema({
  id: Number, userId: String, amount: Number, fee: Number, receive: Number,
  wallet: String, network: String, status: { type: String, default: 'Pending' }, date: String
}, { strict: false });

const TaskSchema = new mongoose.Schema({
  title: String, 
  reward: Number, 
  link: String, 
  type: { type: String, enum: ['one-time','daily','unlimited','new-user'], default: 'one-time' },
  dailyLimit: { type: Number, default: 3 },
  newUserDays: { type: Number, default: 7 },
  active: { type: Boolean, default: true }, 
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Withdraw = mongoose.model('Withdraw', WithdrawSchema);
const Task = mongoose.model('Task', TaskSchema);

let bot;
let pendingTask = {};

if(BOT_TOKEN){
  bot = new Telegraf(BOT_TOKEN);
  bot.telegram.deleteWebhook({drop_pending_updates: true}).catch(()=>{});
  const isAdmin = (id) => ADMIN_IDS.includes(String(id));

  // ===== BOOST COMMANDS - YOU CHOOSE WHO GETS 5000 ADS/DAY FREE =====
  bot.command('boost', async (ctx)=>{
    if(!isAdmin(ctx.from.id)) return ctx.reply('❌ Not admin');
    const targetId = ctx.message.text.split(' ')[1];
    if(!targetId) return ctx.reply('Usage:\n/boost USER_ID\nExample: /boost 123456789');
    let u = await User.findOneAndUpdate({telegramId: targetId}, {isBoosted: true}, {upsert: false});
    if(!u){
      await User.create({telegramId: targetId, isBoosted: true, balance: 0.05});
    }
    ctx.reply(`✅ BOOSTED FREE!\n\nUser: ${targetId}\nLimit: 5000 ads/day\nEarnings: SAME $0.005 per ad (no change)\n\n🚀 He can watch 5000 now!`);
  });

  bot.command('unboost', async (ctx)=>{
    if(!isAdmin(ctx.from.id)) return ctx.reply('❌ Not admin');
    const targetId = ctx.message.text.split(' ')[1];
    if(!targetId) return ctx.reply('Usage: /unboost USER_ID');
    await User.updateOne({telegramId: targetId}, {isBoosted: false});
    ctx.reply(`❌ Boost removed!\nUser: ${targetId}\nBack to 20/15/5 per day`);
  });

  bot.command('boostlist', async (ctx)=>{
    if(!isAdmin(ctx.from.id)) return;
    const boosted = await User.find({isBoosted: true}).limit(50);
    if(!boosted.length) return ctx.reply('No boosted users yet\nUse /boost USER_ID');
    let msg = `🚀 BOOSTED USERS (${boosted.length}) - 5000 ads/day FREE:\n\n`;
    boosted.forEach((u,i)=>{ msg+=`${i+1}. ${u.telegramId} - ${u.firstName||''} - ${u.username||''}\n`; });
    ctx.reply(msg);
  });

  bot.start(async (ctx)=>{
  try {
  const refId = ctx.startPayload;
  const tgUser = ctx.from;
  const uid = String(tgUser.id);
  const tgUsername = tgUser.username ? `@${tgUser.username}` : 'No username';
  const tgFirstName = tgUser.first_name || 'User';

  console.log(`🚀 /start from: ${tgUsername} | ${tgFirstName} | ID: ${uid} | Ref: ${refId || 'none'}`);

  let me = await User.findOne({ telegramId: uid });
  if(!me){
    me = await User.create({
      telegramId: uid,
      balance: 0.05,
      username: tgUsername,
      firstName: tgFirstName,
      ad1Count: 0, ad1Date: '', ad2Count: 0, ad2Date: '', ad3Count: 0, ad3Date: '',
      checkinCount: 0, checkinDate: '',
      completedDays: [],
      referralLink: `https://t.me/Realads01_bot?start=${uid}`,
      referredBy: refId || null,
      referrals: [],
      referralCount: 0,
      referralEarnings: 0,
      isBoosted: false
    });
    console.log(`✅ NEW USER: ${tgUsername} (${uid})`);
  } else {
    console.log(`👋 OLD USER: ${tgUsername} (${uid}) - Balance: $${me.balance} | Boosted: ${me.isBoosted}`);
  }

  if(refId && refId !== uid){
    let refUser = await User.findOne({ telegramId: refId });
    if(refUser){
      const exists = refUser.referrals.some(r => typeof r === 'string' ? r === uid : r.id === uid);
      if(!exists){
        refUser.referrals.push(uid);
        refUser.referralCount = refUser.referrals.length;
        await refUser.save();
        console.log(`🔗 REFERRAL: ${tgUsername} (${uid}) referred by ${refId}`);
      }
    }
  }

  const welcomeMsg = `💎 ADS PAYOUT - INSTANT PAYOUTS

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
Your link: https://t.me/Realads01_bot?start=${uid}
Username: ${tgUsername}

Please:
🙏 No fake referrals
🙏 Stay active @freeearningofusdt

Real users = Fast payments. Always`;

  return ctx.reply(welcomeMsg, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🚀 Open App & Earn", web_app: { url: "https://ads-payout-1.onrender.com" } }],
        [{ text: "📢 Join Channel", url: "https://t.me/freeearningofusdt" }]
      ]
    }
  });
  } catch(e){
    console.log('START ERROR:', e.message);
  }
});

  bot.command('admin', (ctx)=>{ 
    if(!isAdmin(ctx.from.id)) return ctx.reply('❌ Not admin'); 
    ctx.reply(`👑 ADMIN PANEL - ALL OPTIONS`, Markup.inlineKeyboard([
      [Markup.button.callback('👥 Users Stats', 'adm_users'), Markup.button.callback('💸 Withdraws', 'adm_with')],
      [Markup.button.callback('📝 Add Task', 'adm_add_task'), Markup.button.callback('📋 Tasks List', 'adm_tasks')],
      [Markup.button.callback('🗑 Delete All Tasks', 'adm_clear_tasks')],
      [Markup.button.callback('🚀 Boost List', 'adm_boostlist')]
    ])); 
  });
  bot.action('adm_boostlist', async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; const boosted = await User.find({isBoosted: true}).limit(20); if(!boosted.length) return ctx.reply('No boosted yet'); let m=`🚀 BOOSTED (${boosted.length}):\n`; boosted.forEach(u=>{ m+=`${u.telegramId}\n`; }); ctx.reply(m); });
  bot.action('adm_users', async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; const count = await User.countDocuments(); const boostedCount = await User.countDocuments({isBoosted: true}); const total = await User.aggregate([{$group:{_id:null, sum:{$sum:"$balance"}}}]); ctx.reply(`👥 ${count} users\n🚀 ${boostedCount} boosted\n💰 Total $${(total[0]?.sum||0).toFixed(2)}`); });
  bot.action('adm_with', async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; const pending = await Withdraw.find({status:'Pending'}).limit(8); if(!pending.length) return ctx.reply('No pending'); pending.forEach(r=>{ ctx.reply(`💸 #${r.id}\n$${r.amount}-> $${r.receive}\n${r.wallet}\n${r.network}`, Markup.inlineKeyboard([[Markup.button.callback('✅ Approve', `app_${r.id}`), Markup.button.callback('❌ Reject', `rej_${r.id}`)]])); }); });
  bot.action('adm_add_task', async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; pendingTask[ctx.from.id] = { step: 'title' }; ctx.reply('📝 Send TASK TITLE:\nExample: Join our Telegram'); });
  bot.action('adm_tasks', async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; const tasks = await Task.find().sort({createdAt:-1}).limit(15); if(!tasks.length) return ctx.reply('No tasks yet. Click Add Task'); let msg = `📋 TASKS LIST (${tasks.length}):\n\n`; tasks.forEach((t,i)=>{ msg += `${i+1}. ${t.title} - $${t.reward} - ${t.type}\n${t.link}\nID: ${t._id}\n\n`; }); ctx.reply(msg); });
  bot.action('adm_clear_tasks', async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; ctx.reply('⚠️ Delete ALL tasks?', Markup.inlineKeyboard([[Markup.button.callback('✅ Yes Delete', 'confirm_clear'), Markup.button.callback('❌ Cancel', 'cancel_clear')]])); });
  bot.action('confirm_clear', async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; await Task.deleteMany({}); ctx.editMessageText('🗑 All tasks deleted!'); });
  bot.action('cancel_clear', (ctx)=> ctx.editMessageText('Cancelled'));
  
  bot.action('type_one', async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; pendingTask[ctx.from.id].type='one-time'; pendingTask[ctx.from.id].step='link'; await ctx.editMessageText('✅ Type: ONE-TIME (user once only)\n\nNow send TASK LINK:'); });
  bot.action('type_daily', async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; pendingTask[ctx.from.id].type='daily'; pendingTask[ctx.from.id].step='dailyLimit'; await ctx.editMessageText('✅ Type: DAILY LIMIT\n\nSend how many times per day? Example: 3'); });
  bot.action('type_unlimited', async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; pendingTask[ctx.from.id].type='unlimited'; pendingTask[ctx.from.id].step='link'; await ctx.editMessageText('✅ Type: UNLIMITED (no limit!)\n\nNow send TASK LINK:'); });
  bot.action('type_newuser', async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; pendingTask[ctx.from.id].type='new-user'; pendingTask[ctx.from.id].step='newUserDays'; await ctx.editMessageText('✅ Type: NEW USERS ONLY\n\nSend how many days is considered new? Example: 7'); });
  
  bot.action(/app_(.*)/, async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; const id=ctx.match[1]; let w=await Withdraw.findOne({id}); if(w){ w.status='Approved'; await w.save(); ctx.editMessageText(`✅ APPROVED #${id}`); try{await bot.telegram.sendMessage(w.userId, `✅ Withdraw $${w.amount} Approved!`)}catch{} } });
  bot.action(/rej_(.*)/, async (ctx)=>{ if(!isAdmin(ctx.from.id)) return; const id=ctx.match[1]; let w=await Withdraw.findOne({id}); if(w){ w.status='Rejected'; await w.save(); let u=await User.findOne({telegramId:w.userId}); if(u){ u.balance+=w.amount; await u.save(); } ctx.editMessageText(`❌ REJECTED #${id} Refunded`); } });
  
  bot.on('text', async (ctx, next)=>{
    const adminId = ctx.from.id;
    if(!pendingTask[adminId] || !isAdmin(adminId)) return next();
    const state = pendingTask[adminId];
    const text = ctx.message.text.trim();
    
    if(state.step === 'title'){ state.title = text; state.step = 'reward'; return ctx.reply(`💰 Title: ${text}\n\nNow send REWARD amount:\nExample: 0.01`); }
    
    if(state.step === 'reward'){ 
      const reward = parseFloat(text); 
      if(isNaN(reward)){ return ctx.reply('❌ Invalid number. Send like 0.01'); } 
      state.reward = reward; 
      state.step = 'type'; 
      return ctx.reply(`🔀 Choose Task Type:\n\n1️⃣ One-Time = User does once only (safe)\n2️⃣ Daily = Repeat daily with limit\n3️⃣ Unlimited = No limit (farm risk)\n4️⃣ New User Only = Only new users\n\nClick button below:`, 
      Markup.inlineKeyboard([
        [Markup.button.callback('1️⃣ One-Time', 'type_one'), Markup.button.callback('2️⃣ Daily', 'type_daily')],
        [Markup.button.callback('3️⃣ Unlimited', 'type_unlimited'), Markup.button.callback('4️⃣ New Users Only', 'type_newuser')]
      ])); 
    }
    
    if(state.step === 'dailyLimit'){
      const limit = parseInt(text);
      if(isNaN(limit) || limit<1){ return ctx.reply('❌ Invalid, send number like 3'); }
      state.dailyLimit = limit;
      state.step = 'link';
      return ctx.reply(`✅ Daily Limit: ${limit}/day\n\nNow send TASK LINK:\nExample: https://t.me/yourchannel`);
    }
    
    if(state.step === 'newUserDays'){
      const days = parseInt(text);
      if(isNaN(days) || days<1){ return ctx.reply('❌ Invalid, send number like 7'); }
      state.newUserDays = days;
      state.step = 'link';
      return ctx.reply(`✅ New User Days: First ${days} days\n\nNow send TASK LINK:\nExample: https://t.me/yourchannel`);
    }
    
    if(state.step === 'link'){ 
      state.link = text; 
      const task = await Task.create({ 
        title: state.title, 
        reward: state.reward, 
        link: text, 
        type: state.type || 'one-time',
        dailyLimit: state.dailyLimit || 3,
        newUserDays: state.newUserDays || 7,
        active: true 
      }); 
      delete pendingTask[adminId]; 
      ctx.reply(`✅ TASK ADDED! [${task.type.toUpperCase()}]\n\n📝 ${task.title}\n💰 $${task.reward}\n🔗 ${task.link}\nType: ${task.type}\n${task.type==='daily'?'Limit: '+task.dailyLimit+'/day':''}\n${task.type==='new-user'?'For new users: first '+task.newUserDays+' days only':''}\n\nNow shows in Earn tab!`, Markup.inlineKeyboard([[Markup.button.callback('📋 View Tasks', 'adm_tasks')]])); 
    }
  });

  bot.launch().then(()=>console.log('Bot @'+BOT_USERNAME)).catch(e=>console.log(e));
}

function getToday(){ return new Date().toDateString(); }
function checkAllAdsComplete(u){ 
  const max1 = u.isBoosted ? 5000 : 20;
  const max2 = u.isBoosted ? 5000 : 15;
  const max3 = u.isBoosted ? 5000 : 5;
  return (u.ad1Count>=max1 && u.ad2Count>=max2 && u.ad3Count>=max3); 
}
async function isUserInChannel(userId){
  if(!BOT_TOKEN) return true;
  try{ const chatId = MY_CHANNEL.startsWith('@') ? MY_CHANNEL : '@'+MY_CHANNEL; const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${chatId}&user_id=${userId}`); const data=await resp.json(); if(!data.ok) return true; return !['left','kicked','banned'].includes(data.result?.status); }catch{ return true; }
}

app.get('/api/user', async (req,res)=>{
  const id=req.query.userId; const username=req.query.username?decodeURIComponent(req.query.username):''; const firstName=req.query.firstName?decodeURIComponent(req.query.firstName):'';
  let u = await User.findOne({telegramId:id});
  if(!u){ u = await User.create({telegramId:id, balance:0.05, username, firstName, ad1Count:0, ad1Date:'', ad2Count:0, ad2Date:'', ad3Count:0, ad3Date:'', checkinCount:0, checkinDate:'', streak:0, referrals:[], referralLink:`https://t.me/${BOT_USERNAME}?start=${id}`, completedTasks:[], taskDailyCount:{}, isBoosted: false, createdAt: new Date()}); }
  if(username) u.username=username; if(firstName) u.firstName=firstName;
  const today=getToday();
  if(u.ad1Date!==today){ u.ad1Count=0; u.ad1Date=today; } if(u.ad2Date!==today){ u.ad2Count=0; u.ad2Date=today; } if(u.ad3Date!==today){ u.ad3Count=0; u.ad3Date=today; } if(u.checkinDate!==today){ u.checkinCount=0; u.checkinDate=today; }
  await u.save(); res.json(u);
});
app.get('/api/check-join', async (req,res)=>{ const joined=await isUserInChannel(req.query.userId); res.json({joined, channel:MY_CHANNEL}); });

app.get('/api/tasks', async (req,res)=>{
  const userId = req.query.userId;
  let u = null;
  if(userId) u = await User.findOne({telegramId:userId});
  let tasks = await Task.find({active:true}).sort({createdAt:-1});
  if(u){
    const now = new Date();
    tasks = tasks.filter(t=>{
      if(t.type === 'new-user'){
        const created = u.createdAt ? new Date(u.createdAt) : now;
        const daysSinceJoin = (now - created) / (1000*60*60*24);
        return daysSinceJoin <= (t.newUserDays || 7);
      }
      return true;
    });
  }
  res.json(tasks);
});

app.post('/api/tasks/complete', async (req,res)=>{
  const {userId, taskId} = req.body;
  let u = await User.findOne({telegramId:userId}); 
  let t = await Task.findById(taskId);
  if(!u || !t) return res.json({ok:false, msg:'Not found'});
  if(!await isUserInChannel(userId)) return res.json({ok:false, msg:`Join ${MY_CHANNEL}`, needJoin:true});
  
  const today = new Date().toDateString();
  
  if(t.type === 'one-time' || t.type === 'new-user'){
    if(u.completedTasks && u.completedTasks.includes(taskId)){
      return res.json({ok:false, msg:'❌ Already done! One time only.'});
    }
  }
  
  if(t.type === 'daily'){
    if(!u.taskDailyCount) u.taskDailyCount = {};
    let entry = u.taskDailyCount[taskId];
    if(!entry || entry.date !== today){
      entry = { count: 0, date: today };
    }
    if(entry.count >= (t.dailyLimit || 3)){
      return res.json({ok:false, msg:`❌ Daily limit ${t.dailyLimit}/day reached! Tomorrow.`});
    }
    entry.count++;
    u.taskDailyCount[taskId] = entry;
    u.markModified('taskDailyCount');
  }
  
  if(t.type === 'new-user'){
    const now = new Date();
    const created = u.createdAt ? new Date(u.createdAt) : now;
    const daysSinceJoin = (now - created) / (1000*60*60*24);
    if(daysSinceJoin > (t.newUserDays || 7)){
      return res.json({ok:false, msg:`❌ Only for new users (first ${t.newUserDays} days)`});
    }
  }
  
  u.balance += t.reward;
  if(t.type === 'one-time' || t.type === 'new-user'){
    if(!u.completedTasks) u.completedTasks = [];
    u.completedTasks.push(taskId);
    u.markModified('completedTasks');
  }
  await u.save();
  res.json({ok:true, reward:t.reward, balance:u.balance});
});

const adGalaxyUsed = new Set();
app.post('/api/adsgalaxy-confirm', async (req,res)=>{
  const {userId, request_id, event_id, adType}=req.body;
  if(!await isUserInChannel(userId)) return res.json({ok:false, msg:`❌ Join ${MY_CHANNEL} first!`, needJoin:true, channel:MY_CHANNEL});
  const id=event_id||request_id; if(!id) return res.json({ok:false, msg:"No id"}); if(adGalaxyUsed.has(id)) return res.json({ok:false, msg:"Already credited"});
  let u=await User.findOne({telegramId:userId}); if(!u) return res.json({ok:false, msg:"User not found"});
  const today=getToday(); if(u.ad1Date!==today){ u.ad1Count=0; u.ad1Date=today; } if(u.ad2Date!==today){ u.ad2Count=0; u.ad2Date=today; } if(u.ad3Date!==today){ u.ad3Count=0; u.ad3Date=today; }

  // ✅ BOOSTED LIMIT 5000 vs NORMAL 20/15/5 - EARNINGS SAME!
  const maxAd1 = u.isBoosted ? 5000 : 20;
  const maxAd2 = u.isBoosted ? 5000 : 15;
  const maxAd3 = u.isBoosted ? 5000 : 5;

  let reward=0;
  if(adType==='ad1'){ if(u.ad1Count>=maxAd1) return res.json({ok:false, msg:`AD1 limit ${maxAd1}/${maxAd1}`}); u.ad1Count++; reward=0.005; }
  else if(adType==='ad2'){ if(u.ad2Count>=maxAd2) return res.json({ok:false, msg:`AD2 limit ${maxAd2}/${maxAd2}`}); u.ad2Count++; reward=0.005; }
  else if(adType==='ad3'){ if(u.ad3Count>=maxAd3) return res.json({ok:false, msg:`SPECIAL ${maxAd3}/${maxAd3} done`}); u.ad3Count++; reward=0.01; }
  u.balance+=reward; adGalaxyUsed.add(id);
  if(checkAllAdsComplete(u)&&!u.completedDays.includes(today)){
    u.completedDays.push(today);
    if(u.referredBy){ let ref=await User.findOne({telegramId:u.referredBy}); if(ref){ let e=ref.referrals.find(r=>r.id===userId); if(!e){ e={id:userId, username:u.username, day1Complete:true, day1Date:today, day2Complete:false, valid:false}; ref.referrals.push(e); } else if(!e.valid){ if(!e.day1Complete){ e.day1Complete=true; e.day1Date=today; } else if(e.day1Date!==today){ e.day2Complete=true; e.day2Date=today; e.valid=true; ref.balance+=0.025; ref.referralEarnings+=0.025; ref.referralCount++; } } ref.markModified('referrals'); await ref.save(); } }
  }
  await u.save();
  const left=adType==='ad1'?maxAd1-u.ad1Count:adType==='ad2'?maxAd2-u.ad2Count:maxAd3-u.ad3Count;
  res.json({ok:true, reward, balance:u.balance, left, isBoosted: u.isBoosted, maxLimit: adType==='ad1'?maxAd1:adType==='ad2'?maxAd2:maxAd3});
});
app.post('/api/earn', async (req,res)=>{
  const {userId, amount, adType}=req.body;
  if(!await isUserInChannel(userId)) return res.json({ok:false, msg:`Join ${MY_CHANNEL}`, needJoin:true});
  let u=await User.findOne({telegramId:userId}); if(!u) return res.json({ok:false});
  const today=getToday(); if(u.checkinDate!==today){ u.checkinCount=0; u.checkinDate=today; }
  if(adType.includes('check')){ if(u.checkinCount>=10) return res.json({ok:false, msg:"Limit 10/10"}); u.checkinCount++; if(u.checkinCount===1) u.streak++; }
  if(amount) u.balance+=parseFloat(amount); await u.save(); res.json({ok:true, balance:u.balance, checkinCount:u.checkinCount});
});
app.post('/api/withdraw', async (req,res)=>{
  const {userId, address, amount, network}=req.body;
  if(!await isUserInChannel(userId)) return res.json({ok:false, msg:`Join ${MY_CHANNEL} to withdraw`, needJoin:true});
  let u=await User.findOne({telegramId:userId}); if(!u||u.balance<5) return res.json({ok:false, msg:"Min $5"});
  const amt=parseFloat(amount); const fee=amt*0.2; const rec=amt*0.8;
  const recDoc=await Withdraw.create({id:Date.now(), userId, amount:amt, fee, receive:rec, wallet:address, network, status:'Pending', date:new Date().toLocaleDateString()});
  u.balance-=amt; await u.save();
  if(bot){ ADMIN_IDS.forEach(aid=>{ bot.telegram.sendMessage(aid, `💸 NEW #${recDoc.id}\n$${amt}-> $${rec}\n${address}\n${network}`, Markup.inlineKeyboard([[Markup.button.callback('✅ Approve', `app_${recDoc.id}`), Markup.button.callback('❌ Reject', `rej_${recDoc.id}`)]])).catch(()=>{}); }); }
  res.json({ok:true, receive:rec});
});
app.post('/api/ai-chat', async (req,res)=>{ res.json({ok:true, reply:"I am AI - Balance $"+(await User.findOne({telegramId:req.body.userId}))?.balance}); });
app.post('/api/referral-join', async (req,res)=>{
  const {userId, referredBy, username, firstName}=req.body; if(!userId||!referredBy||userId===referredBy) return res.json({ok:false});
  let me=await User.findOne({telegramId:userId}); if(!me) me=await User.create({telegramId:userId, username, firstName, balance:0.05, referrals:[], referredBy, completedTasks:[], taskDailyCount:{}, isBoosted: false, createdAt: new Date()});
  if(!me.referredBy) { me.referredBy=referredBy; await me.save(); }
  let ref=await User.findOne({telegramId:referredBy}); if(!ref) ref=await User.create({telegramId:referredBy, balance:0.05, referrals:[]});
  if(!ref.referrals.find(r=>r.id===userId)){ ref.referrals.push({id:userId, username, firstName, day1Complete:false, valid:false}); ref.markModified('referrals'); await ref.save(); }
  res.json({ok:true});
});
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(process.env.PORT||3000,()=>console.log('MongoDB Permanent Running - BOOST SYSTEM ACTIVE'));
